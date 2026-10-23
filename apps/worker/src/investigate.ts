import {
  buildAuditorRequest,
  buildInvestigatorRequest,
  estimateRequestCost,
  runAuditor,
  runInvestigator,
  type AgentRunResult,
  type CompletionRequest,
  type EvidenceInput,
  type InvestigatorOutput,
  type LLMProvider,
  type PricingTable,
  type ProposedEvidence,
} from "@verifica-br/ai";
import { checkBudget, verifyCitation, type Actor, type PageFetcher, type RiskFlag } from "@verifica-br/core";
import {
  addEvidence,
  addVerdictVersion,
  finishInvestigation,
  getClaim,
  getSettings,
  listEvidence,
  raiseRisk,
  recordAgentRun,
  spentUsd,
  startInvestigation,
  transitionClaim,
  withActor,
  type ClaimRow,
  type Sql,
} from "@verifica-br/db";

export class NonRetryableError extends Error {}
export class PausedError extends Error {}
/** Configuração ausente/inválida: o job volta à fila e o worker para, sem consumir tentativa. */
export class ConfigError extends Error {}

export interface InvestigateDeps {
  sql: Sql;
  provider: LLMProvider;
  pricing: PricingTable;
  fetchPage: PageFetcher;
  now?: () => Date;
}

const WORKER: Actor = { type: "system", id: "worker" };
const INVESTIGATOR: Actor = { type: "agent", id: "investigator" };
const AUDITOR: Actor = { type: "agent", id: "auditor" };

export type InvestigationOutcome =
  | { status: "awaiting_review"; investigationId: string; versionId: string; auditorAgrees: boolean; citations: Record<string, number> }
  | { status: "aborted"; investigationId: string; reason: string };

const claimInput = (c: ClaimRow) => ({
  originalText: c.originalText,
  attributedTo: c.attributedTo,
  originalSourceUrl: c.originalSourceUrl,
  statedAt: c.statedAt?.toISOString(),
});

const toEvidenceInput = (e: { url: string; excerpt: string; stance: string; citationCheck: string; limitations: string | null }): EvidenceInput => ({
  url: e.url,
  excerpt: e.excerpt,
  stance: e.stance,
  citationCheck: e.citationCheck,
  limitations: e.limitations ?? undefined,
});

/**
 * Falha de orçamento encerra a investigação sem erro (não adianta tentar de novo);
 * falha do provedor ou saída inválida lança erro para o job ser tentado novamente.
 *
 * Investigação completa de uma alegação: investigador → verificador de citações → auditor →
 * versão de veredito proposta → aguardando revisão humana. Nada aqui aprova ou publica.
 * Chamadas externas acontecem fora de transações; cada gravação é uma transação curta.
 */
export async function investigateClaim(deps: InvestigateDeps, claimId: string): Promise<InvestigationOutcome> {
  const { sql, provider, pricing } = deps;
  const now = deps.now ?? (() => new Date());

  const settings = await getSettings(sql);
  if (settings.killSwitch) throw new PausedError("sistema pausado (kill switch ativo)");
  const claim = await getClaim(sql, claimId);
  if (!claim) throw new NonRetryableError("alegação não encontrada");
  if (claim.status !== "draft" && claim.status !== "returned") {
    throw new NonRetryableError(`alegação em status ${claim.status} não pode ser investigada`);
  }
  const [{ n: previousRuns } = { n: 0 }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM investigations WHERE claim_id = ${claimId}`;
  if (previousRuns >= settings.maxAgentRoundsPerInvestigation) {
    throw new NonRetryableError(`limite de ${settings.maxAgentRoundsPerInvestigation} investigações automáticas por alegação atingido`);
  }

  const investigationId = await withActor(sql, WORKER, async (tx) => {
    await transitionClaim(tx, WORKER, claimId, "investigating");
    return startInvestigation(tx, claimId);
  });

  const abort = async (reason: string, failed = false): Promise<InvestigationOutcome> => {
    await withActor(sql, WORKER, async (tx) => {
      await finishInvestigation(tx, investigationId, failed ? "failed" : "aborted", {}, reason);
      const current = await getClaim(tx, claimId);
      if (current && (current.status === "investigating" || current.status === "auditing")) {
        await transitionClaim(tx, WORKER, claimId, "draft");
      }
    });
    return { status: "aborted", investigationId, reason };
  };

  /** Checa orçamento e executa um agente, registrando a execução em agent_runs. */
  async function runAgent<T>(role: "investigator" | "auditor", req: CompletionRequest, exec: () => Promise<AgentRunResult<T>>) {
    const estimate = estimateRequestCost(provider, req, pricing);
    const budget = checkBudget(await getSettings(sql), {
      investigationSpentUsd: await spentUsd(sql, { investigationId }),
      monthSpentUsd: await spentUsd(sql, { month: now() }),
      nextCallEstimateUsd: estimate,
    });
    const base = { investigationId, role, provider: provider.name, model: provider.model, input: req };
    if (!budget.ok) {
      await recordAgentRun(sql, { ...base, promptVersion: "-", costEstimateUsd: 0, status: "skipped_budget", error: budget.reason });
      return { result: undefined, runId: undefined, reason: budget.reason };
    }
    const result = await exec();
    const runId = await recordAgentRun(sql, {
      ...base,
      model: result.model,
      promptVersion: result.promptVersion,
      output: result.status === "succeeded" ? result.output : undefined,
      rawText: result.rawText,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
      webSearches: result.usage?.webSearches,
      costEstimateUsd: result.costUsd,
      status: result.status,
      error: result.status === "succeeded" ? undefined : result.error,
    });
    return { result, runId, reason: result.status === "succeeded" ? undefined : result.error };
  }

  const citations: Record<string, number> = { ok: 0, failed: 0, unsupported: 0 };
  async function storeAgentEvidence(items: ProposedEvidence[], actor: Actor, runId: string): Promise<void> {
    for (const ev of items) {
      const check = await verifyCitation(ev.url, ev.excerpt, deps.fetchPage);
      citations[check.status] = (citations[check.status] ?? 0) + 1;
      await addEvidence(sql, {
        claimId, url: ev.url, publisher: ev.publisher, sourceType: ev.source_type, excerpt: ev.excerpt, stance: ev.stance,
        relevanceNotes: ev.relevance, limitations: ev.limitations, publicationDate: ev.published_at,
        citationCheck: check.status, citationDetail: check.detail, addedBy: actor, addedByRunId: runId,
      });
    }
  }

  // 1. Investigador
  const humanEvidence = (await listEvidence(sql, claimId)).map(toEvidenceInput);
  const invReq = buildInvestigatorRequest(claimInput(claim), humanEvidence);
  const inv = await runAgent("investigator", invReq, () => runInvestigator(provider, invReq, pricing));
  if (!inv.result) return abort(`investigador: ${inv.reason}`);
  if (inv.result.status !== "succeeded" || !inv.runId) {
    await abort(`investigador: ${inv.reason}`, true);
    throw new Error(`investigador: ${inv.reason}`);
  }
  const proposal: InvestigatorOutput = inv.result.output;
  await withActor(sql, WORKER, (tx) => raiseRisk(tx, claimId, proposal.risk_flags));
  await storeAgentEvidence(proposal.evidence, INVESTIGATOR, inv.runId);
  await withActor(sql, WORKER, (tx) => transitionClaim(tx, WORKER, claimId, "auditing"));

  // 2. Auditor adversarial, vendo o status real das citações
  const allEvidence = (await listEvidence(sql, claimId)).map(toEvidenceInput);
  const audReq = buildAuditorRequest(claimInput(claim), allEvidence, proposal);
  const aud = await runAgent("auditor", audReq, () => runAuditor(provider, audReq, pricing));
  if (!aud.result) return abort(`auditor: ${aud.reason}`);
  if (aud.result.status !== "succeeded" || !aud.runId) {
    await abort(`auditor: ${aud.reason}`, true);
    throw new Error(`auditor: ${aud.reason}`);
  }
  const audit = aud.result.output;
  await storeAgentEvidence(audit.additional_evidence, AUDITOR, aud.runId);

  const contested = !audit.agrees_with_verdict || audit.challenges.some((c) => c.severity === "high");
  const extraFlags: RiskFlag[] = [...audit.risk_flags, ...(contested ? (["conflicting_evidence"] as const) : [])];
  if (citations.failed! > 0) extraFlags.push("unreliable_sources");

  // 3. Versão proposta: só referencia evidências com citação confirmada (ou registradas por humanos).
  const finalEvidence = await sql<{ id: string; citationCheck: string; addedByType: string }[]>`
    SELECT id, citation_check, added_by_type FROM evidence WHERE claim_id = ${claimId}`;
  const usable = finalEvidence.filter((e) => e.citationCheck === "ok" || e.addedByType === "human").map((e) => e.id);
  const limitations = [...proposal.limitations];
  let robustness = proposal.robustness;
  if (usable.length === 0) {
    robustness = "insufficient";
    limitations.push("Nenhuma citação foi confirmada automaticamente; exige verificação manual das fontes.");
  }
  if (contested) limitations.push(`Auditoria contestou a conclusão: ${audit.summary}`);

  const version = await withActor(sql, WORKER, async (tx) => {
    await raiseRisk(tx, claimId, extraFlags);
    const v = await addVerdictVersion(tx, INVESTIGATOR, {
      claimId, investigationId, verdict: proposal.proposed_verdict, robustness, summary: proposal.summary,
      rationale: proposal.rationale, limitations, evidenceIds: usable,
    });
    await finishInvestigation(tx, investigationId, "completed", {
      auditor_agrees: audit.agrees_with_verdict,
      auditor_suggested_verdict: audit.suggested_verdict ?? null,
      challenges: audit.challenges,
      auditor_summary: audit.summary,
      citations,
      open_questions: proposal.open_questions,
    });
    await transitionClaim(tx, WORKER, claimId, "awaiting_review");
    return v;
  });

  return { status: "awaiting_review", investigationId, versionId: version.id, auditorAgrees: audit.agrees_with_verdict, citations };
}
