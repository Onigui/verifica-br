import { FakeProvider, type LLMProvider } from "@verifica-br/ai";
import { sampleAuditorOutput, sampleInvestigatorOutput } from "@verifica-br/ai/testing";
import type { Actor, PageFetcher } from "@verifica-br/core";
import { createClaim, enqueueJob, getClaim, latestVersion, recordReview, updateSettings, type Sql } from "@verifica-br/db";
import { createTestDatabase, TEST_DATABASE_URL } from "@verifica-br/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ConfigError, investigateClaim, type InvestigateDeps } from "../src/investigate.ts";
import { runWorker } from "../src/worker.ts";

const editor: Actor = { type: "human", id: "editor-1" };
const reviewer: Actor = { type: "human", id: "revisora-1" };

const PAGE = `<html><body><p>No trimestre, a taxa de desocupação foi estimada em <b>7,1%</b>, segundo a pesquisa.</p></body></html>`;
const fetchPage: PageFetcher = async (url) => {
  if (url === "https://exemplo.gov.br/nota") return { status: 200, contentType: "text/html", body: PAGE, finalUrl: url };
  throw new Error("ECONNREFUSED");
};

const claimInput = {
  originalText: "A taxa de desocupação chegou a 12% no último trimestre.",
  attributedTo: "Pessoa fictícia",
  originalSourceUrl: "https://exemplo.com/post/1",
};

describe.skipIf(!TEST_DATABASE_URL)("worker de investigação", () => {
  let sql: Sql;
  let drop: () => Promise<void>;
  beforeAll(async () => {
    ({ sql, drop } = await createTestDatabase());
  });
  afterAll(async () => drop?.());
  beforeEach(async () => {
    await sql`DELETE FROM jobs`;
    await updateSettings(sql, editor, { killSwitch: false, maxCostPerInvestigationUsd: 0, monthlyBudgetUsd: 0 });
  });

  const deps = (provider: LLMProvider): InvestigateDeps => ({ sql, provider, pricing: {}, fetchPage });
  const script = (inv = sampleInvestigatorOutput(), aud = sampleAuditorOutput()) => new FakeProvider([JSON.stringify(inv), JSON.stringify(aud)]);

  it("fluxo completo: fila → investigador → citações → auditor → aguardando revisão humana", async () => {
    const claim = await createClaim(sql, editor, claimInput);
    await enqueueJob(sql, "investigate", { claimId: claim.id });
    const provider = script();
    const report = await runWorker(sql, { investigate: (job) => investigateClaim(deps(provider), job.payload.claimId as string) }, 5);

    expect(report).toMatchObject({ processed: 1, succeeded: 1, failed: 0 });
    expect((await getClaim(sql, claim.id))?.status).toBe("awaiting_review");

    const runs = await sql<{ role: string; promptVersion: string; costEstimateUsd: string; status: string }[]>`
      SELECT role, prompt_version, cost_estimate_usd, status FROM agent_runs ORDER BY created_at`;
    expect(runs.map((r) => [r.role, r.promptVersion, Number(r.costEstimateUsd), r.status])).toEqual([
      ["investigator", "investigator.v1", 0, "succeeded"],
      ["auditor", "auditor.v1", 0, "succeeded"],
    ]);

    const [ev] = await sql`SELECT citation_check, added_by_type FROM evidence WHERE claim_id = ${claim.id}`;
    expect(ev).toMatchObject({ citationCheck: "ok", addedByType: "agent" });

    const v = await latestVersion(sql, claim.id);
    expect(v).toMatchObject({ version: 1, verdict: "false", robustness: "intermediate" });

    // O worker nunca aprova: a decisão é humana.
    await recordReview(sql, reviewer, { claimId: claim.id, verdictVersionId: v!.id, decision: "approve" });
    expect((await getClaim(sql, claim.id))?.status).toBe("approved");

    const actors = await sql<{ actorType: string; to: string }[]>`
      SELECT actor_type, metadata->>'to' AS to FROM audit_logs WHERE entity_id = ${claim.id} AND action = 'claim.status_changed' ORDER BY id`;
    expect(actors.map((a) => `${a.actorType}:${a.to}`)).toEqual([
      "system:investigating", "system:auditing", "system:awaiting_review", "human:approved",
    ]);
  });

  it("citação inventada é marcada como falha, fica fora da versão e eleva o risco", async () => {
    const claim = await createClaim(sql, editor, claimInput);
    const inv = sampleInvestigatorOutput();
    inv.evidence = [{ ...inv.evidence[0]!, excerpt: "a taxa de desocupação foi estimada em 12,0% segundo a pesquisa" }];
    const out = await investigateClaim(deps(script(inv)), claim.id);
    expect(out).toMatchObject({ status: "awaiting_review", citations: { ok: 0, failed: 1 } });

    const v = await sql`SELECT robustness, evidence_ids, limitations FROM verdict_versions WHERE claim_id = ${claim.id}`;
    expect(v[0]).toMatchObject({ robustness: "insufficient", evidenceIds: [] });
    expect(v[0]?.limitations.join(" ")).toMatch(/Nenhuma citação foi confirmada/);
    expect((await getClaim(sql, claim.id))?.riskLevel).toBe("high");
  });

  it("discordância do auditor vira risco alto e fica registrada nas limitações", async () => {
    const claim = await createClaim(sql, editor, claimInput);
    const aud = sampleAuditorOutput({ agrees_with_verdict: false, suggested_verdict: "unverifiable", summary: "Período da alegação é outro." });
    const out = await investigateClaim(deps(script(undefined, aud)), claim.id);
    expect(out).toMatchObject({ status: "awaiting_review", auditorAgrees: false });
    expect((await getClaim(sql, claim.id))?.riskLevel).toBe("high");
    const [v] = await sql`SELECT limitations FROM verdict_versions WHERE claim_id = ${claim.id}`;
    expect(v?.limitations.join(" ")).toMatch(/Auditoria contestou/);
  });

  it("kill switch pausa sem perder dados: job continua na fila e nenhuma IA é chamada", async () => {
    const claim = await createClaim(sql, editor, claimInput);
    const jobId = await enqueueJob(sql, "investigate", { claimId: claim.id });
    await updateSettings(sql, editor, { killSwitch: true });
    const provider = script();
    const report = await runWorker(sql, { investigate: (job) => investigateClaim(deps(provider), job.payload.claimId as string) }, 5);
    expect(report).toMatchObject({ processed: 0, stoppedBecause: "paused" });
    expect(provider.calls).toHaveLength(0);
    const [job] = await sql`SELECT status, attempts FROM jobs WHERE id = ${jobId}`;
    expect(job).toMatchObject({ status: "queued", attempts: 0 });
    expect((await getClaim(sql, claim.id))?.status).toBe("draft");
  });

  it("orçamento zero impede chamada a provedor real (custo > 0)", async () => {
    const claim = await createClaim(sql, editor, claimInput);
    let called = 0;
    const real: LLMProvider = {
      name: "pago", model: "modelo-pago", isFake: false,
      complete: async () => { called++; throw new Error("não deveria ser chamado"); },
    };
    const out = await investigateClaim({ sql, provider: real, pricing: { "modelo-pago": { inputPerMTok: 1, outputPerMTok: 1 } }, fetchPage }, claim.id);
    expect(out).toMatchObject({ status: "aborted", reason: expect.stringMatching(/limite de custo/) });
    expect(called).toBe(0);
    const runs = await sql`SELECT ar.status FROM agent_runs ar JOIN investigations i ON i.id = ar.investigation_id WHERE i.claim_id = ${claim.id}`;
    expect(runs.map((r) => r.status)).toEqual(["skipped_budget"]);
    expect((await getClaim(sql, claim.id))?.status).toBe("draft");
  });

  it("saída inválida da IA devolve a alegação a rascunho e o job é tentado de novo", async () => {
    const claim = await createClaim(sql, editor, claimInput);
    const jobId = await enqueueJob(sql, "investigate", { claimId: claim.id });
    const provider = new FakeProvider(["isto não é json"]);
    const report = await runWorker(sql, { investigate: (job) => investigateClaim(deps(provider), job.payload.claimId as string) }, 1);
    expect(report).toMatchObject({ processed: 1, requeued: 1 });
    expect((await getClaim(sql, claim.id))?.status).toBe("draft");
    const [job] = await sql`SELECT status, last_error FROM jobs WHERE id = ${jobId}`;
    expect(job?.status).toBe("queued");
    expect(job?.lastError).toMatch(/investigador/);
  });

  it("limite de investigações automáticas por alegação evita gasto repetido", async () => {
    const claim = await createClaim(sql, editor, claimInput);
    await expect(investigateClaim(deps(new FakeProvider(["x"])), claim.id)).rejects.toThrow();
    await expect(investigateClaim(deps(new FakeProvider(["x"])), claim.id)).rejects.toThrow();
    await expect(investigateClaim(deps(new FakeProvider(["x"])), claim.id)).rejects.toThrow(/limite de 2 investigações/);
  });

  it("provedor não configurado: worker para com erro e o job volta intacto para a fila", async () => {
    const claim = await createClaim(sql, editor, claimInput);
    const jobId = await enqueueJob(sql, "investigate", { claimId: claim.id }, 1);
    const report = await runWorker(sql, { investigate: async () => { throw new ConfigError("sem provedor"); } }, 5);
    expect(report).toMatchObject({ processed: 1, requeued: 1, stoppedBecause: "config_error", error: "sem provedor" });
    const [job] = await sql`SELECT status, attempts FROM jobs WHERE id = ${jobId}`;
    expect(job).toMatchObject({ status: "queued", attempts: 0 });
  });

  it("alegação fora de rascunho não é reinvestigada (falha definitiva)", async () => {
    const claim = await createClaim(sql, editor, claimInput);
    await investigateClaim(deps(script()), claim.id);
    const jobId = await enqueueJob(sql, "investigate", { claimId: claim.id });
    const report = await runWorker(sql, { investigate: (job) => investigateClaim(deps(script()), job.payload.claimId as string) }, 1);
    expect(report).toMatchObject({ failed: 1 });
    const [job] = await sql`SELECT status FROM jobs WHERE id = ${jobId}`;
    expect(job?.status).toBe("failed");
  });
});
