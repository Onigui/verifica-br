import {
  assessRisk,
  canTransition,
  escalate,
  NewClaim,
  type Actor,
  type ActorType,
  type CitationCheck,
  type ClaimStatus,
  type ReviewDecision,
  type RiskFlag,
  type RiskLevel,
  type Robustness,
  type Settings,
  type Stance,
  type Verdict,
} from "@verifica-br/core";
import type { Queryable, Sql } from "./client.ts";

export class TransitionError extends Error {}

export const METHODOLOGY_VERSION = "0.1-rascunho";

/** Executa em transação com o ator registrado para os triggers de auditoria. */
export async function withActor<T>(sql: Sql, actor: Actor, fn: (tx: Queryable) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.actor_type', ${actor.type}, true), set_config('app.actor_id', ${actor.id}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

export async function logAction(q: Queryable, actor: Actor, action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
  await q`INSERT INTO audit_logs (actor_type, actor_id, action, entity_type, entity_id, metadata)
          VALUES (${actor.type}, ${actor.id}, ${action}, ${entityType}, ${entityId}, ${q.json(metadata as never)})`;
}

// ---------- settings ----------

export async function getSettings(q: Queryable): Promise<Settings> {
  const [r] = await q<{ killSwitch: boolean; autoPublishEnabled: boolean; maxCostPerInvestigationUsd: string; monthlyBudgetUsd: string; maxAgentRoundsPerInvestigation: number }[]>`
    SELECT kill_switch, auto_publish_enabled, max_cost_per_investigation_usd, monthly_budget_usd, max_agent_rounds_per_investigation FROM settings WHERE id = 1`;
  if (!r) throw new Error("tabela settings vazia");
  return {
    killSwitch: r.killSwitch,
    autoPublishEnabled: r.autoPublishEnabled,
    maxCostPerInvestigationUsd: Number(r.maxCostPerInvestigationUsd),
    monthlyBudgetUsd: Number(r.monthlyBudgetUsd),
    maxAgentRoundsPerInvestigation: r.maxAgentRoundsPerInvestigation,
  };
}

/** Somente humanos alteram configurações; cada alteração vai para o audit log. */
export async function updateSettings(sql: Sql, actor: Actor, patch: Partial<Settings>): Promise<Settings> {
  if (actor.type !== "human") throw new TransitionError("somente humanos alteram configurações");
  return withActor(sql, actor, async (tx) => {
    const cur = await getSettings(tx);
    const next = { ...cur, ...patch };
    await tx`UPDATE settings SET kill_switch = ${next.killSwitch}, auto_publish_enabled = ${next.autoPublishEnabled},
              max_cost_per_investigation_usd = ${next.maxCostPerInvestigationUsd}, monthly_budget_usd = ${next.monthlyBudgetUsd},
              max_agent_rounds_per_investigation = ${next.maxAgentRoundsPerInvestigation}, updated_at = now() WHERE id = 1`;
    await logAction(tx, actor, "settings.updated", "settings", null, { from: cur, to: next });
    return next;
  });
}

// ---------- claims ----------

export interface ClaimRow {
  id: string;
  originalText: string;
  attributedTo: string;
  originalSourceUrl: string;
  statedAt: Date | null;
  riskLevel: RiskLevel;
  riskFlags: string[];
  status: ClaimStatus;
}

export async function createClaim(sql: Sql, actor: Actor, input: unknown): Promise<ClaimRow> {
  const c = NewClaim.parse(input);
  const risk = assessRisk(c.riskFlags);
  return withActor(sql, actor, async (tx) => {
    const [row] = await tx<ClaimRow[]>`
      INSERT INTO claims (original_text, attributed_to, original_source_url, source_platform, stated_at, topic, claim_type, risk_level, risk_flags, created_by)
      VALUES (${c.originalText}, ${c.attributedTo}, ${c.originalSourceUrl}, ${c.sourcePlatform ?? null}, ${c.statedAt ?? null},
              ${c.topic ?? null}, ${c.claimType ?? null}, ${risk.level}, ${tx.array(c.riskFlags)}, ${actor.id})
      RETURNING id, original_text, attributed_to, original_source_url, stated_at, risk_level, risk_flags, status`;
    return row as ClaimRow;
  });
}

export async function getClaim(q: Queryable, id: string, forUpdate = false): Promise<ClaimRow | undefined> {
  const rows = forUpdate
    ? await q<ClaimRow[]>`SELECT id, original_text, attributed_to, original_source_url, stated_at, risk_level, risk_flags, status FROM claims WHERE id = ${id} FOR UPDATE`
    : await q<ClaimRow[]>`SELECT id, original_text, attributed_to, original_source_url, stated_at, risk_level, risk_flags, status FROM claims WHERE id = ${id}`;
  return rows[0];
}

/** Acrescenta sinais de risco; o nível só sobe. */
export async function raiseRisk(q: Queryable, claimId: string, flags: RiskFlag[]): Promise<RiskLevel> {
  const claim = await getClaim(q, claimId, true);
  if (!claim) throw new Error("alegação não encontrada");
  const merged = [...new Set([...claim.riskFlags, ...flags])] as RiskFlag[];
  const level = escalate(claim.riskLevel, assessRisk(merged).level);
  await q`UPDATE claims SET risk_flags = ${q.array(merged)}, risk_level = ${level} WHERE id = ${claimId}`;
  return level;
}

interface LatestReview {
  verdictVersionId: string;
  reviewerType: ActorType;
  decision: ReviewDecision;
}

/** Única porta de mudança de status: aplica as regras de packages/core dentro da transação. */
export async function transitionClaim(tx: Queryable, actor: Actor, claimId: string, to: ClaimStatus): Promise<void> {
  const claim = await getClaim(tx, claimId, true);
  if (!claim) throw new TransitionError("alegação não encontrada");
  const settings = await getSettings(tx);
  const latest = await latestVersion(tx, claimId);
  const [review] = latest
    ? await tx<LatestReview[]>`SELECT verdict_version_id, reviewer_type, decision FROM reviews WHERE verdict_version_id = ${latest.id} ORDER BY reviewed_at DESC, id DESC LIMIT 1`
    : [];
  const result = canTransition(claim.status, to, { actor, settings, latestVersionId: latest?.id, latestReview: review });
  if (!result.ok) throw new TransitionError(result.reason);
  await tx`UPDATE claims SET status = ${to} WHERE id = ${claimId}`;
}

export async function transition(sql: Sql, actor: Actor, claimId: string, to: ClaimStatus): Promise<void> {
  await withActor(sql, actor, (tx) => transitionClaim(tx, actor, claimId, to));
}

// ---------- sources & evidence ----------

export async function upsertSource(q: Queryable, s: { url: string; publisher?: string | undefined; sourceType?: string | undefined }): Promise<string> {
  const [row] = await q<{ id: string }[]>`
    INSERT INTO sources (url, publisher, source_type) VALUES (${s.url}, ${s.publisher ?? null}, ${s.sourceType ?? null})
    ON CONFLICT (url) DO UPDATE SET publisher = COALESCE(sources.publisher, EXCLUDED.publisher), source_type = COALESCE(sources.source_type, EXCLUDED.source_type)
    RETURNING id`;
  return row!.id;
}

export interface NewEvidence {
  claimId: string;
  url: string;
  publisher?: string | undefined;
  sourceType?: string | undefined;
  excerpt: string;
  stance: Stance;
  relevanceNotes?: string | undefined;
  limitations?: string | undefined;
  publicationDate?: string | undefined;
  citationCheck: CitationCheck;
  citationDetail?: string | undefined;
  addedBy: Actor;
  addedByRunId?: string | undefined;
}

export interface EvidenceRow {
  id: string;
  url: string;
  excerpt: string;
  stance: Stance;
  limitations: string | null;
  citationCheck: CitationCheck;
}

export async function addEvidence(q: Queryable, e: NewEvidence): Promise<string> {
  const sourceId = await upsertSource(q, { url: e.url, publisher: e.publisher, sourceType: e.sourceType });
  const [row] = await q<{ id: string }[]>`
    INSERT INTO evidence (claim_id, source_id, excerpt, stance, relevance_notes, limitations, publication_date, citation_check, citation_detail, added_by_type, added_by_run_id, added_by)
    VALUES (${e.claimId}, ${sourceId}, ${e.excerpt}, ${e.stance}, ${e.relevanceNotes ?? null}, ${e.limitations ?? null}, ${e.publicationDate ?? null},
            ${e.citationCheck}, ${e.citationDetail ?? null}, ${e.addedBy.type}, ${e.addedByRunId ?? null}, ${e.addedBy.id})
    RETURNING id`;
  return row!.id;
}

export async function listEvidence(q: Queryable, claimId: string): Promise<EvidenceRow[]> {
  return q<EvidenceRow[]>`
    SELECT e.id, s.url, e.excerpt, e.stance, e.limitations, e.citation_check
    FROM evidence e JOIN sources s ON s.id = e.source_id WHERE e.claim_id = ${claimId} ORDER BY e.created_at, e.id`;
}

// ---------- verdict versions, reviews, corrections ----------

export interface VersionRow {
  id: string;
  version: number;
  verdict: Verdict;
  robustness: Robustness;
}

export async function latestVersion(q: Queryable, claimId: string): Promise<VersionRow | undefined> {
  const [row] = await q<VersionRow[]>`SELECT id, version, verdict, robustness FROM verdict_versions WHERE claim_id = ${claimId} ORDER BY version DESC LIMIT 1`;
  return row;
}

export interface NewVersion {
  claimId: string;
  investigationId?: string | undefined;
  verdict: Verdict;
  robustness: Robustness;
  summary: string;
  rationale: string;
  limitations: string[];
  evidenceIds: string[];
}

/** Nova versão = número seguinte, calculado com a alegação travada (sem corrida). */
export async function addVerdictVersion(tx: Queryable, actor: Actor, v: NewVersion): Promise<VersionRow> {
  await getClaim(tx, v.claimId, true);
  const prev = await latestVersion(tx, v.claimId);
  const [row] = await tx<VersionRow[]>`
    INSERT INTO verdict_versions (claim_id, version, investigation_id, verdict, robustness, summary, rationale, limitations, evidence_ids, methodology_version, created_by_type, created_by)
    VALUES (${v.claimId}, ${(prev?.version ?? 0) + 1}, ${v.investigationId ?? null}, ${v.verdict}, ${v.robustness}, ${v.summary}, ${v.rationale},
            ${tx.array(v.limitations)}, ${tx.array(v.evidenceIds)}::uuid[], ${METHODOLOGY_VERSION}, ${actor.type}, ${actor.id})
    RETURNING id, version, verdict, robustness`;
  await logAction(tx, actor, "verdict.version_created", "claim", v.claimId, { versionId: row!.id, version: row!.version, verdict: row!.verdict });
  return row!;
}

const DECISION_TARGET: Record<ReviewDecision, ClaimStatus> = { approve: "approved", return: "returned", reject: "rejected" };

/** Registra a decisão humana sobre a versão mais recente e aplica a transição na mesma transação. */
export async function recordReview(
  sql: Sql,
  actor: Actor,
  r: { claimId: string; verdictVersionId: string; decision: ReviewDecision; comments?: string | undefined },
): Promise<void> {
  if (actor.type !== "human") throw new TransitionError("somente revisão humana pode decidir um caso");
  await withActor(sql, actor, async (tx) => {
    const latest = await latestVersion(tx, r.claimId);
    if (latest?.id !== r.verdictVersionId) throw new TransitionError("a revisão deve ser sobre a versão mais recente");
    await tx`INSERT INTO reviews (claim_id, verdict_version_id, reviewer_type, reviewer, decision, comments)
             VALUES (${r.claimId}, ${r.verdictVersionId}, ${actor.type}, ${actor.id}, ${r.decision}, ${r.comments ?? null})`;
    await transitionClaim(tx, actor, r.claimId, DECISION_TARGET[r.decision]);
  });
}

/**
 * Correção de caso aprovado/publicado: cria nova versão, registra a explicação pública e
 * devolve o caso para revisão. A versão anterior permanece intacta.
 */
export async function proposeCorrection(
  sql: Sql,
  actor: Actor,
  c: NewVersion & { reason: string; publicExplanation: string },
): Promise<VersionRow> {
  if (actor.type !== "human") throw new TransitionError("correções são abertas por humanos");
  return withActor(sql, actor, async (tx) => {
    const prev = await latestVersion(tx, c.claimId);
    if (!prev) throw new TransitionError("não há versão anterior para corrigir");
    const next = await addVerdictVersion(tx, actor, c);
    await tx`INSERT INTO corrections (claim_id, previous_version_id, new_version_id, reason, public_explanation, created_by)
             VALUES (${c.claimId}, ${prev.id}, ${next.id}, ${c.reason}, ${c.publicExplanation}, ${actor.id})`;
    await transitionClaim(tx, actor, c.claimId, "awaiting_review");
    return next;
  });
}

/** Publicação registrada manualmente (MVP): só a partir de versão aprovada. */
export async function recordManualPublication(
  sql: Sql,
  actor: Actor,
  p: { claimId: string; channel: string; caption?: string | undefined; externalUrl?: string | undefined; externalId?: string | undefined },
): Promise<string> {
  return withActor(sql, actor, async (tx) => {
    const latest = await latestVersion(tx, p.claimId);
    if (!latest) throw new TransitionError("sem versão aprovada");
    await transitionClaim(tx, actor, p.claimId, "published");
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO posts (claim_id, verdict_version_id, channel, caption, status, published_at, external_id, external_url)
      VALUES (${p.claimId}, ${latest.id}, ${p.channel}, ${p.caption ?? null}, 'published', now(), ${p.externalId ?? null}, ${p.externalUrl ?? null})
      RETURNING id`;
    return row!.id;
  });
}

// ---------- investigations & agent runs ----------

export async function startInvestigation(q: Queryable, claimId: string): Promise<string> {
  const [row] = await q<{ id: string }[]>`INSERT INTO investigations (claim_id, methodology_version) VALUES (${claimId}, ${METHODOLOGY_VERSION}) RETURNING id`;
  return row!.id;
}

export async function finishInvestigation(q: Queryable, id: string, status: "completed" | "failed" | "aborted", summary: Record<string, unknown>, error?: string) {
  await q`UPDATE investigations SET status = ${status}, summary = ${q.json(summary as never)}, error_details = ${error ?? null}, completed_at = now() WHERE id = ${id}`;
}

export interface NewAgentRun {
  investigationId: string;
  role: "investigator" | "auditor";
  provider: string;
  model: string;
  promptVersion: string;
  input: unknown;
  output?: unknown;
  rawText?: string | undefined;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  webSearches?: number | undefined;
  costEstimateUsd: number;
  status: "succeeded" | "invalid_output" | "provider_error" | "skipped_budget";
  error?: string | undefined;
}

export async function recordAgentRun(q: Queryable, r: NewAgentRun): Promise<string> {
  const [row] = await q<{ id: string }[]>`
    INSERT INTO agent_runs (investigation_id, role, provider, model, prompt_version, input, output, raw_text, input_tokens, output_tokens, web_searches, cost_estimate_usd, status, error)
    VALUES (${r.investigationId}, ${r.role}, ${r.provider}, ${r.model}, ${r.promptVersion}, ${q.json(r.input as never)},
            ${r.output === undefined ? null : q.json(r.output as never)}, ${r.rawText ?? null}, ${r.inputTokens ?? 0}, ${r.outputTokens ?? 0},
            ${r.webSearches ?? 0}, ${r.costEstimateUsd}, ${r.status}, ${r.error ?? null})
    RETURNING id`;
  return row!.id;
}

export async function spentUsd(q: Queryable, scope: { investigationId: string } | { month: Date }): Promise<number> {
  const [row] =
    "investigationId" in scope
      ? await q<{ total: string }[]>`SELECT COALESCE(SUM(cost_estimate_usd), 0) AS total FROM agent_runs WHERE investigation_id = ${scope.investigationId}`
      : await q<{ total: string }[]>`SELECT COALESCE(SUM(cost_estimate_usd), 0) AS total FROM agent_runs
                                     WHERE created_at >= date_trunc('month', ${scope.month}::timestamptz) AND created_at < date_trunc('month', ${scope.month}::timestamptz) + interval '1 month'`;
  return Number(row!.total);
}
