import type { RiskFlag, RiskLevel } from "./domain.ts";

const HIGH: ReadonlySet<RiskFlag> = new Set<RiskFlag>([
  "criminal_accusation",
  "corruption_or_fraud",
  "reputational_harm",
  "targets_candidate_or_public_official",
  "health",
  "suspected_manipulated_media",
  "electoral_process_integrity",
  "conflicting_evidence",
  "unreliable_sources",
  "hard_to_reverse_harm",
]);

const INTERMEDIATE: ReadonlySet<RiskFlag> = new Set<RiskFlag>([
  "economic_or_social_indicator",
  "requires_political_or_historical_context",
  "depends_on_full_video_sequence",
  "cross_methodology_statistics",
]);

export interface RiskAssessment {
  level: RiskLevel;
  reasons: RiskFlag[];
  /** No MVP é sempre true; o campo existe para a futura automação por categoria. */
  humanReviewRequired: true;
}

/** Classifica o risco pelo sinal mais grave presente. Regra determinística, sem IA. */
export function assessRisk(flags: readonly RiskFlag[]): RiskAssessment {
  const unique = [...new Set(flags)];
  const high = unique.filter((f) => HIGH.has(f));
  if (high.length > 0) return { level: "high", reasons: high, humanReviewRequired: true };
  const mid = unique.filter((f) => INTERMEDIATE.has(f));
  if (mid.length > 0) return { level: "intermediate", reasons: mid, humanReviewRequired: true };
  return { level: "low", reasons: [], humanReviewRequired: true };
}

/** Une sinais de vários pontos (cadastro, auditor, verificador) sem nunca reduzir o risco. */
export function escalate(current: RiskLevel, next: RiskLevel): RiskLevel {
  const order: RiskLevel[] = ["low", "intermediate", "high"];
  return order.indexOf(next) > order.indexOf(current) ? next : current;
}
