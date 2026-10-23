import type { Actor, ClaimStatus, CitationCheck, RiskLevel, Robustness, Stance, Verdict } from "@verifica-br/core";
import type { Queryable, Sql } from "./client.ts";
import { enqueueJob } from "./jobs.ts";
import { addVerdictVersion, getClaim, logAction, transitionClaim, TransitionError, withActor, type NewVersion, type VersionRow } from "./repo.ts";

/** Consultas e comandos do painel administrativo. Toda escrita exige ator humano. */

function requireHuman(actor: Actor): void {
  if (actor.type !== "human") throw new TransitionError("ação restrita a pessoas autenticadas");
}

export interface ClaimListItem {
  id: string;
  originalText: string;
  attributedTo: string;
  status: ClaimStatus;
  riskLevel: RiskLevel;
  updatedAt: Date;
  latestVerdict: Verdict | null;
  latestVersion: number | null;
}

export async function listClaims(q: Queryable, opts: { status?: ClaimStatus | undefined; limit?: number } = {}): Promise<ClaimListItem[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  return q<ClaimListItem[]>`
    SELECT c.id, c.original_text, c.attributed_to, c.status, c.risk_level, c.updated_at,
           v.verdict AS latest_verdict, v.version AS latest_version
    FROM claims c
    LEFT JOIN LATERAL (SELECT verdict, version FROM verdict_versions WHERE claim_id = c.id ORDER BY version DESC LIMIT 1) v ON true
    WHERE ${opts.status ? q`c.status = ${opts.status}` : q`true`}
    ORDER BY CASE c.risk_level WHEN 'high' THEN 0 WHEN 'intermediate' THEN 1 ELSE 2 END, c.updated_at DESC
    LIMIT ${limit}`;
}

export async function countClaimsByStatus(q: Queryable): Promise<Partial<Record<ClaimStatus, number>>> {
  const rows = await q<{ status: ClaimStatus; n: number }[]>`SELECT status, count(*)::int AS n FROM claims GROUP BY status`;
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

export interface ClaimDetail {
  claim: {
    id: string; originalText: string; normalizedText: string | null; attributedTo: string; originalSourceUrl: string;
    sourcePlatform: string | null; statedAt: Date | null; topic: string | null; claimType: string | null;
    riskLevel: RiskLevel; riskFlags: string[]; status: ClaimStatus; createdBy: string; createdAt: Date; updatedAt: Date;
  };
  evidence: Array<{
    id: string; url: string; publisher: string | null; sourceType: string | null; excerpt: string; stance: Stance;
    relevanceNotes: string | null; limitations: string | null; publicationDate: string | null; accessedAt: Date;
    citationCheck: CitationCheck; citationDetail: string | null; addedByType: Actor["type"]; addedBy: string; addedByRunId: string | null;
  }>;
  versions: Array<{
    id: string; version: number; verdict: Verdict; robustness: Robustness; summary: string; rationale: string;
    limitations: string[]; evidenceIds: string[]; methodologyVersion: string; createdByType: Actor["type"]; createdBy: string;
    createdAt: Date; investigationId: string | null;
    reviews: Array<{ id: string; reviewer: string; decision: string; comments: string | null; reviewedAt: Date }>;
  }>;
  investigations: Array<{
    id: string; status: string; methodologyVersion: string; summary: Record<string, unknown>; errorDetails: string | null;
    startedAt: Date; completedAt: Date | null;
    runs: Array<{ id: string; role: string; provider: string; model: string; promptVersion: string; output: unknown; status: string; error: string | null; costEstimateUsd: number; inputTokens: number; outputTokens: number; createdAt: Date }>;
  }>;
  corrections: Array<{ id: string; previousVersionId: string; newVersionId: string; reason: string; publicExplanation: string; createdBy: string; createdAt: Date }>;
  posts: Array<{ id: string; verdictVersionId: string; channel: string; status: string; publishedAt: Date | null; externalUrl: string | null }>;
  jobs: Array<{ id: string; status: string; attempts: number; maxAttempts: number; lastError: string | null; createdAt: Date }>;
  audit: Array<{ id: string; actorType: string; actorId: string; action: string; metadata: Record<string, unknown>; createdAt: Date }>;
}

export async function getClaimDetail(q: Queryable, id: string): Promise<ClaimDetail | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const [claim] = await q<ClaimDetail["claim"][]>`
    SELECT id, original_text, normalized_text, attributed_to, original_source_url, source_platform, stated_at, topic, claim_type,
           risk_level, risk_flags, status, created_by, created_at, updated_at
    FROM claims WHERE id = ${id}`;
  if (!claim) return undefined;

  const [evidence, versions, reviews, investigations, runs, corrections, posts, jobs, audit] = await Promise.all([
    q<ClaimDetail["evidence"]>`
      SELECT e.id, s.url, s.publisher, s.source_type, e.excerpt, e.stance, e.relevance_notes, e.limitations, e.publication_date,
             e.accessed_at, e.citation_check, e.citation_detail, e.added_by_type, e.added_by, e.added_by_run_id
      FROM evidence e JOIN sources s ON s.id = e.source_id WHERE e.claim_id = ${id} ORDER BY e.created_at, e.id`,
    q<Omit<ClaimDetail["versions"][number], "reviews">[]>`
      SELECT id, version, verdict, robustness, summary, rationale, limitations, evidence_ids, methodology_version,
             created_by_type, created_by, created_at, investigation_id
      FROM verdict_versions WHERE claim_id = ${id} ORDER BY version DESC`,
    q<(ClaimDetail["versions"][number]["reviews"][number] & { verdictVersionId: string })[]>`
      SELECT id, verdict_version_id, reviewer, decision, comments, reviewed_at FROM reviews WHERE claim_id = ${id} ORDER BY reviewed_at, id`,
    q<Omit<ClaimDetail["investigations"][number], "runs">[]>`
      SELECT id, status, methodology_version, summary, error_details, started_at, completed_at
      FROM investigations WHERE claim_id = ${id} ORDER BY started_at DESC`,
    q<(Omit<ClaimDetail["investigations"][number]["runs"][number], "costEstimateUsd"> & { costEstimateUsd: string; investigationId: string })[]>`
      SELECT ar.id, ar.investigation_id, ar.role, ar.provider, ar.model, ar.prompt_version, ar.output, ar.status, ar.error,
             ar.cost_estimate_usd, ar.input_tokens, ar.output_tokens, ar.created_at
      FROM agent_runs ar JOIN investigations i ON i.id = ar.investigation_id WHERE i.claim_id = ${id} ORDER BY ar.created_at, ar.id`,
    q<ClaimDetail["corrections"]>`
      SELECT id, previous_version_id, new_version_id, reason, public_explanation, created_by, created_at
      FROM corrections WHERE claim_id = ${id} ORDER BY created_at`,
    q<ClaimDetail["posts"]>`
      SELECT id, verdict_version_id, channel, status, published_at, external_url FROM posts WHERE claim_id = ${id} ORDER BY created_at`,
    q<ClaimDetail["jobs"]>`
      SELECT id, status, attempts, max_attempts, last_error, created_at FROM jobs
      WHERE type = 'investigate' AND payload->>'claimId' = ${id} ORDER BY created_at DESC LIMIT 10`,
    q<ClaimDetail["audit"]>`
      SELECT a.id::text AS id, a.actor_type, a.actor_id, a.action, a.metadata, a.created_at FROM audit_logs a
      WHERE a.entity_id = ${id} ORDER BY a.id`,
  ]);

  return {
    claim,
    evidence,
    versions: versions.map((v) => ({
      ...v,
      reviews: reviews.filter((r) => r.verdictVersionId === v.id).map(({ verdictVersionId: _v, ...r }) => r),
    })),
    investigations: investigations.map((inv) => ({
      ...inv,
      runs: runs
        .filter((r) => r.investigationId === inv.id)
        .map(({ investigationId: _i, costEstimateUsd, ...r }) => ({ ...r, costEstimateUsd: Number(costEstimateUsd) })),
    })),
    corrections,
    posts,
    jobs,
    audit,
  };
}

/** Coloca a alegação na fila do worker. Recusa duplicatas e status inadequados. */
export async function requestInvestigation(sql: Sql, actor: Actor, claimId: string): Promise<string> {
  requireHuman(actor);
  return withActor(sql, actor, async (tx) => {
    const claim = await getClaim(tx, claimId, true);
    if (!claim) throw new TransitionError("alegação não encontrada");
    if (claim.status !== "draft" && claim.status !== "returned") {
      throw new TransitionError(`só é possível investigar alegações em rascunho ou devolvidas (atual: ${claim.status})`);
    }
    const [pending] = await tx`SELECT id FROM jobs WHERE type = 'investigate' AND payload->>'claimId' = ${claimId} AND status IN ('queued','running') LIMIT 1`;
    if (pending) throw new TransitionError("já existe investigação na fila para esta alegação");
    const jobId = await enqueueJob(tx, "investigate", { claimId });
    await logAction(tx, actor, "investigation.requested", "claim", claimId, { jobId });
    return jobId;
  });
}

/** Caso montado por humanos: cria versão de veredito e envia para revisão na mesma transação. */
export async function proposeManualVerdict(sql: Sql, actor: Actor, v: NewVersion): Promise<VersionRow> {
  requireHuman(actor);
  return withActor(sql, actor, async (tx) => {
    const claim = await getClaim(tx, v.claimId, true);
    if (!claim) throw new TransitionError("alegação não encontrada");
    if (claim.status !== "draft" && claim.status !== "returned") {
      throw new TransitionError(`proposta manual só em rascunho ou devolvida (atual: ${claim.status})`);
    }
    const [pending] = await tx`SELECT id FROM jobs WHERE type = 'investigate' AND payload->>'claimId' = ${v.claimId} AND status IN ('queued','running') LIMIT 1`;
    if (pending) throw new TransitionError("há uma investigação automática na fila; aguarde o resultado");
    const valid = await tx<{ id: string }[]>`SELECT id FROM evidence WHERE claim_id = ${v.claimId} AND id = ANY(${tx.array(v.evidenceIds)}::uuid[])`;
    if (valid.length !== new Set(v.evidenceIds).size) throw new TransitionError("evidência inválida para esta alegação");
    const version = await addVerdictVersion(tx, actor, v);
    await transitionClaim(tx, actor, v.claimId, "awaiting_review");
    return version;
  });
}

/** Suspende ou republica uma verificação publicada (o histórico permanece). */
export async function setPublicationState(sql: Sql, actor: Actor, claimId: string, to: "suspended" | "published", reason: string): Promise<void> {
  requireHuman(actor);
  if (!reason.trim()) throw new TransitionError("informe o motivo");
  await withActor(sql, actor, async (tx) => {
    await transitionClaim(tx, actor, claimId, to);
    await logAction(tx, actor, to === "suspended" ? "publication.suspended" : "publication.restored", "claim", claimId, { reason });
  });
}
