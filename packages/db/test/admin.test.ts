import type { Actor } from "@verifica-br/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addEvidence,
  countClaimsByStatus,
  createClaim,
  getClaimDetail,
  listClaims,
  proposeManualVerdict,
  recordManualPublication,
  recordReview,
  requestInvestigation,
  setPublicationState,
  TransitionError,
  withActor,
  type Sql,
} from "../src/index.ts";
import { createTestDatabase, TEST_DATABASE_URL } from "../src/testing.ts";

const editor: Actor = { type: "human", id: "editor-1" };
const system: Actor = { type: "system", id: "worker" };
const base = { originalText: "O programa atendeu 2 milhões de famílias em 2025.", attributedTo: "Pessoa fictícia", originalSourceUrl: "https://exemplo.com/p/2" };

describe.skipIf(!TEST_DATABASE_URL)("consultas e comandos do painel", () => {
  let sql: Sql;
  let drop: () => Promise<void>;
  beforeAll(async () => {
    ({ sql, drop } = await createTestDatabase());
  });
  afterAll(async () => drop?.());

  async function withEvidence() {
    const claim = await createClaim(sql, editor, base);
    const evId = await withActor(sql, editor, (tx) =>
      addEvidence(tx, { claimId: claim.id, url: "https://exemplo.gov.br/rel", excerpt: "foram atendidas 1,4 milhão de famílias no exercício", stance: "contradicts", citationCheck: "ok", addedBy: editor }),
    );
    return { claim, evId };
  }

  it("pedido de investigação: só humano, só em rascunho/devolvida, sem duplicar", async () => {
    const claim = await createClaim(sql, editor, base);
    await expect(requestInvestigation(sql, system, claim.id)).rejects.toThrow(TransitionError);
    const jobId = await requestInvestigation(sql, editor, claim.id);
    expect(jobId).toBeTruthy();
    await expect(requestInvestigation(sql, editor, claim.id)).rejects.toThrow(/já existe investigação/);
    const detail = await getClaimDetail(sql, claim.id);
    expect(detail?.jobs).toHaveLength(1);
    expect(detail?.audit.map((a) => a.action)).toContain("investigation.requested");
  });

  it("veredito manual vai direto para revisão e só aceita evidências da própria alegação", async () => {
    const { claim, evId } = await withEvidence();
    const other = await withEvidence();
    const v = { claimId: claim.id, verdict: "false" as const, robustness: "high" as const, summary: "s", rationale: "r", limitations: [] };
    await expect(proposeManualVerdict(sql, editor, { ...v, evidenceIds: [other.evId] })).rejects.toThrow(/evidência inválida/);
    const version = await proposeManualVerdict(sql, editor, { ...v, evidenceIds: [evId] });
    expect(version.version).toBe(1);
    const detail = await getClaimDetail(sql, claim.id);
    expect(detail?.claim.status).toBe("awaiting_review");
    expect(detail?.versions[0]).toMatchObject({ verdict: "false", evidenceIds: [evId], createdByType: "human", reviews: [] });
    await expect(proposeManualVerdict(sql, editor, { ...v, evidenceIds: [] })).rejects.toThrow(/rascunho ou devolvida/);
  });

  it("veredito manual é recusado enquanto há investigação na fila", async () => {
    const { claim, evId } = await withEvidence();
    await requestInvestigation(sql, editor, claim.id);
    await expect(
      proposeManualVerdict(sql, editor, { claimId: claim.id, verdict: "false", robustness: "high", summary: "s", rationale: "r", limitations: [], evidenceIds: [evId] }),
    ).rejects.toThrow(/na fila/);
  });

  it("detalhe reúne evidências, versões com revisões, publicações e trilha de auditoria", async () => {
    const { claim, evId } = await withEvidence();
    const version = await proposeManualVerdict(sql, editor, { claimId: claim.id, verdict: "false", robustness: "high", summary: "s", rationale: "r", limitations: [], evidenceIds: [evId] });
    await recordReview(sql, { type: "human", id: "revisora" }, { claimId: claim.id, verdictVersionId: version.id, decision: "approve", comments: "ok" });
    await recordManualPublication(sql, editor, { claimId: claim.id, channel: "instagram", externalUrl: "https://instagram.com/p/abc" });
    await expect(setPublicationState(sql, editor, claim.id, "suspended", " ")).rejects.toThrow(/motivo/);
    await setPublicationState(sql, editor, claim.id, "suspended", "nova evidência em análise");

    const d = (await getClaimDetail(sql, claim.id))!;
    expect(d.claim.status).toBe("suspended");
    expect(d.evidence[0]).toMatchObject({ url: "https://exemplo.gov.br/rel", citationCheck: "ok" });
    expect(d.versions[0]?.reviews[0]).toMatchObject({ reviewer: "revisora", decision: "approve", comments: "ok" });
    expect(d.posts[0]).toMatchObject({ channel: "instagram", status: "published" });
    expect(d.audit.map((a) => a.action)).toEqual([
      "claim.created", "verdict.version_created", "claim.status_changed", "claim.status_changed",
      "claim.status_changed", "claim.status_changed", "publication.suspended",
    ]);
    expect(typeof d.audit[0]?.id).toBe("string");
    expect(await getClaimDetail(sql, "nao-e-uuid")).toBeUndefined();
  });

  it("lista prioriza risco alto e filtra por status", async () => {
    await createClaim(sql, editor, { ...base, riskFlags: ["health"] });
    const all = await listClaims(sql);
    expect(all[0]?.riskLevel).toBe("high");
    const drafts = await listClaims(sql, { status: "draft" });
    expect(drafts.every((c) => c.status === "draft")).toBe(true);
    const counts = await countClaimsByStatus(sql);
    expect(counts.draft).toBeGreaterThan(0);
  });
});
