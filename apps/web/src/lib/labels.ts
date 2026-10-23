import { VERDICT_LABELS_PT, type ClaimStatus, type RiskFlag, type RiskLevel, type Robustness, type Verdict } from "@verifica-br/core";

export const STATUS_LABELS: Record<ClaimStatus, string> = {
  draft: "Rascunho",
  investigating: "Em investigação",
  auditing: "Em auditoria",
  awaiting_review: "Aguardando revisão",
  returned: "Devolvida",
  rejected: "Rejeitada",
  approved: "Aprovada",
  published: "Publicada",
  suspended: "Suspensa",
};

export const RISK_LABELS: Record<RiskLevel, string> = { low: "Baixo", intermediate: "Intermediário", high: "Alto" };

export const ROBUSTNESS_LABELS: Record<Robustness, string> = { high: "Alta", intermediate: "Intermediária", insufficient: "Insuficiente" };

export const verdictLabel = (v: Verdict) => VERDICT_LABELS_PT[v];

export const RISK_FLAG_LABELS: Record<RiskFlag, string> = {
  criminal_accusation: "Acusação criminal",
  corruption_or_fraud: "Corrupção ou fraude",
  reputational_harm: "Dano grave à reputação",
  targets_candidate_or_public_official: "Envolve candidato(a) ou agente público",
  health: "Saúde",
  suspected_manipulated_media: "Mídia suspeita de manipulação",
  electoral_process_integrity: "Integridade do processo eleitoral",
  conflicting_evidence: "Evidências conflitantes",
  unreliable_sources: "Fontes pouco confiáveis",
  hard_to_reverse_harm: "Dano difícil de reverter",
  economic_or_social_indicator: "Indicador econômico ou social",
  requires_political_or_historical_context: "Exige contexto político/histórico",
  depends_on_full_video_sequence: "Depende da sequência completa do vídeo",
  cross_methodology_statistics: "Estatísticas de metodologias diferentes",
};

export const STANCE_LABELS = { supports: "Sustenta", contradicts: "Contradiz", context: "Contexto" } as const;

export const CITATION_LABELS = { pending: "Pendente", ok: "Confirmada", failed: "Não confirmada", unsupported: "Não verificável automaticamente" } as const;

export const DECISION_LABELS: Record<string, string> = { approve: "Aprovou", return: "Devolveu", reject: "Rejeitou" };

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(d));
}
