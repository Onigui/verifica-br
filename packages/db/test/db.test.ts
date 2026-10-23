import type { Actor } from "@verifica-br/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addEvidence,
  addVerdictVersion,
  claimNextJob,
  completeJob,
  createClaim,
  enqueueJob,
  failJob,
  getClaim,
  getSettings,
  latestVersion,
  proposeCorrection,
  recordManualPublication,
  recordReview,
  requeueStale,
  transition,
  TransitionError,
  updateSettings,
  withActor,
  type Sql,
} from "../src/index.ts";
import { migrate } from "../src/migrate.ts";
import { createTestDatabase, TEST_DATABASE_URL } from "../src/testing.ts";

const human: Actor = { type: "human", id: "revisora-1" };
const editor: Actor = { type: "human", id: "editor-1" };
const system: Actor = { type: "system", id: "worker" };

const baseClaim = {
  originalText: "A taxa de desocupação chegou a 12% no último trimestre.",
  attributedTo: "Pessoa fictícia",
  originalSourceUrl: "https://exemplo.com/post/1",
};

describe.skipIf(!TEST_DATABASE_URL)("banco de dados", () => {
  let sql: Sql;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ sql, drop } = await createTestDatabase());
  });
  afterAll(async () => drop?.());

  /** Cria alegação com uma versão de veredito pronta para revisão. */
  async function claimAwaitingReview(flags: string[] = []) {
    const claim = await createClaim(sql, editor, { ...baseClaim, riskFlags: flags });
    const version = await withActor(sql, editor, async (tx) => {
      const evId = await addEvidence(tx, {
        claimId: claim.id, url: "https://exemplo.gov.br/nota", excerpt: "a taxa de desocupação foi estimada em 7,1%",
        stance: "contradicts", citationCheck: "ok", addedBy: editor,
      });
      return addVerdictVersion(tx, editor, {
        claimId: claim.id, verdict: "false", robustness: "intermediate", summary: "s", rationale: "r", limitations: [], evidenceIds: [evId],
      });
    });
    await transition(sql, editor, claim.id, "awaiting_review");
    return { claim, version };
  }

  it("migrations são idempotentes e criam configurações seguras por padrão", async () => {
    expect(await migrate(sql)).toEqual([]);
    expect(await getSettings(sql)).toEqual({
      killSwitch: false, autoPublishEnabled: false, maxCostPerInvestigationUsd: 0, monthlyBudgetUsd: 0, maxAgentRoundsPerInvestigation: 2,
    });
  });

  it("valida a entrada e classifica o risco no cadastro", async () => {
    await expect(createClaim(sql, editor, { ...baseClaim, originalSourceUrl: "ftp://x" })).rejects.toThrow();
    const c = await createClaim(sql, editor, { ...baseClaim, riskFlags: ["targets_candidate_or_public_official"] });
    expect(c).toMatchObject({ riskLevel: "high", status: "draft" });
  });

  it("texto original não pode ser alterado e alegação não pode ser apagada", async () => {
    const c = await createClaim(sql, editor, baseClaim);
    await expect(sql`UPDATE claims SET original_text = 'outro texto qualquer' WHERE id = ${c.id}`).rejects.toThrow(/imutável/);
    await expect(sql`DELETE FROM claims WHERE id = ${c.id}`).rejects.toThrow(/não são apagadas/);
  });

  it("veredito aprovado não pode ser alterado nem apagado — nem por SQL direto", async () => {
    const { claim, version } = await claimAwaitingReview();
    await recordReview(sql, human, { claimId: claim.id, verdictVersionId: version.id, decision: "approve" });
    expect((await getClaim(sql, claim.id))?.status).toBe("approved");
    await expect(sql`UPDATE verdict_versions SET verdict = 'true' WHERE id = ${version.id}`).rejects.toThrow(/somente-inserção/);
    await expect(sql`DELETE FROM verdict_versions WHERE id = ${version.id}`).rejects.toThrow(/somente-inserção/);
    await expect(sql`UPDATE reviews SET decision = 'reject' WHERE verdict_version_id = ${version.id}`).rejects.toThrow(/somente-inserção/);
  });

  it("caso de risco alto não chega a 'approved' sem revisão humana", async () => {
    const { claim, version } = await claimAwaitingReview(["criminal_accusation"]);
    expect(claim.riskLevel).toBe("high");
    await expect(transition(sql, editor, claim.id, "approved")).rejects.toThrow(TransitionError);
    await expect(transition(sql, system, claim.id, "approved")).rejects.toThrow(TransitionError);
    await expect(recordReview(sql, system, { claimId: claim.id, verdictVersionId: version.id, decision: "approve" })).rejects.toThrow(TransitionError);
    // Mesmo inserindo uma "revisão" de agente por SQL, o banco recusa.
    await expect(sql`INSERT INTO reviews (claim_id, verdict_version_id, reviewer_type, reviewer, decision)
                     VALUES (${claim.id}, ${version.id}, 'agent', 'bot', 'approve')`).rejects.toThrow();
    expect((await getClaim(sql, claim.id))?.status).toBe("awaiting_review");
    await recordReview(sql, human, { claimId: claim.id, verdictVersionId: version.id, decision: "approve" });
    expect((await getClaim(sql, claim.id))?.status).toBe("approved");
  });

  it("revisão de versão antiga é recusada", async () => {
    const { claim, version } = await claimAwaitingReview();
    await recordReview(sql, human, { claimId: claim.id, verdictVersionId: version.id, decision: "return" });
    await withActor(sql, editor, (tx) =>
      addVerdictVersion(tx, editor, { claimId: claim.id, verdict: "misleading", robustness: "high", summary: "s2", rationale: "r2", limitations: [], evidenceIds: [] }),
    );
    await transition(sql, editor, claim.id, "awaiting_review");
    await expect(recordReview(sql, human, { claimId: claim.id, verdictVersionId: version.id, decision: "approve" })).rejects.toThrow(/mais recente/);
  });

  it("publicação: sistema não publica; humano registra publicação manual", async () => {
    const { claim, version } = await claimAwaitingReview();
    await recordReview(sql, human, { claimId: claim.id, verdictVersionId: version.id, decision: "approve" });
    await expect(transition(sql, system, claim.id, "published")).rejects.toThrow(/publicação automática desativada/);
    const postId = await recordManualPublication(sql, human, { claimId: claim.id, channel: "instagram", externalUrl: "https://instagram.com/p/x" });
    expect(postId).toBeTruthy();
    expect((await getClaim(sql, claim.id))?.status).toBe("published");
  });

  it("correção cria nova versão, preserva a anterior e exige nova revisão", async () => {
    const { claim, version } = await claimAwaitingReview();
    await recordReview(sql, human, { claimId: claim.id, verdictVersionId: version.id, decision: "approve" });
    await recordManualPublication(sql, human, { claimId: claim.id, channel: "site" });
    const v2 = await proposeCorrection(sql, editor, {
      claimId: claim.id, verdict: "partly_true", robustness: "intermediate", summary: "corrigido", rationale: "nova evidência", limitations: [], evidenceIds: [],
      reason: "dado revisado pelo órgão", publicExplanation: "O órgão revisou a série; o veredito mudou.",
    });
    expect(v2.version).toBe(2);
    expect((await getClaim(sql, claim.id))?.status).toBe("awaiting_review");
    const [v1] = await sql`SELECT verdict FROM verdict_versions WHERE id = ${version.id}`;
    expect(v1?.verdict).toBe("false");
    const [corr] = await sql`SELECT count(*)::int AS n FROM corrections WHERE claim_id = ${claim.id}`;
    expect(corr?.n).toBe(1);
    expect((await latestVersion(sql, claim.id))?.id).toBe(v2.id);
  });

  it("toda mudança de status gera audit log com o ator", async () => {
    const { claim, version } = await claimAwaitingReview();
    await recordReview(sql, human, { claimId: claim.id, verdictVersionId: version.id, decision: "reject" });
    const logs = await sql<{ actorId: string; action: string; metadata: { from?: string; to?: string } }[]>`
      SELECT actor_id, action, metadata FROM audit_logs WHERE entity_id = ${claim.id} AND action LIKE 'claim.%' ORDER BY id`;
    expect(logs.map((l) => [l.action, l.metadata.to ?? null, l.actorId])).toEqual([
      ["claim.created", null, "editor-1"],
      ["claim.status_changed", "awaiting_review", "editor-1"],
      ["claim.status_changed", "rejected", "revisora-1"],
    ]);
    await expect(sql`DELETE FROM audit_logs`).rejects.toThrow(/somente-inserção/);
  });

  it("kill switch: só humanos alteram; bloqueia transições automáticas", async () => {
    await expect(updateSettings(sql, system, { killSwitch: true })).rejects.toThrow(TransitionError);
    await updateSettings(sql, human, { killSwitch: true });
    const c = await createClaim(sql, editor, baseClaim);
    await expect(transition(sql, system, c.id, "investigating")).rejects.toThrow(/kill switch/);
    await updateSettings(sql, human, { killSwitch: false });
    await transition(sql, system, c.id, "investigating");
    const [log] = await sql`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'settings.updated'`;
    expect(log?.n).toBe(2);
  });

  it("fila: SKIP LOCKED, tentativas limitadas e recuperação de jobs travados", async () => {
    await sql`DELETE FROM jobs`;
    const id = await enqueueJob(sql, "investigate", { claimId: "x" }, 2);
    const [a, b] = await Promise.all([claimNextJob(sql), claimNextJob(sql)]);
    expect([a?.id, b?.id].filter(Boolean)).toEqual([id]);
    const job = (a ?? b)!;
    expect(await failJob(sql, job, "erro 1")).toBe("queued");
    await sql`UPDATE jobs SET run_after = now() WHERE id = ${id}`;
    const again = (await claimNextJob(sql))!;
    expect(again.attempts).toBe(2);
    expect(await failJob(sql, again, "erro 2")).toBe("failed");
    expect(await claimNextJob(sql)).toBeUndefined();

    const id2 = await enqueueJob(sql, "investigate", {});
    await claimNextJob(sql);
    await sql`UPDATE jobs SET locked_at = now() - interval '1 hour' WHERE id = ${id2}`;
    expect(await requeueStale(sql)).toBe(1);
    const j2 = (await claimNextJob(sql))!;
    await completeJob(sql, j2.id);
    const [row] = await sql`SELECT status FROM jobs WHERE id = ${id2}`;
    expect(row?.status).toBe("succeeded");
  });
});
