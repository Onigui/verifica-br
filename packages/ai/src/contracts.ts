import { RiskFlag, Robustness, Stance, Verdict } from "@verifica-br/core";
import { z } from "zod";

/** Evidência proposta por um agente. Só é aceita após o verificador de citações. */
export const ProposedEvidence = z.object({
  url: z.url({ protocol: /^https?$/ }),
  publisher: z.string().max(300).optional(),
  source_type: z.enum(["primary_document", "official_data", "law_or_court", "original_statement", "academic", "journalism", "fact_checker", "other"]),
  excerpt: z.string().min(20).max(1500),
  stance: Stance,
  relevance: z.string().min(1).max(1000),
  limitations: z.string().max(1000).optional(),
  published_at: z.string().max(40).optional(),
});
export type ProposedEvidence = z.infer<typeof ProposedEvidence>;

export const InvestigatorOutput = z.object({
  proposed_verdict: Verdict,
  robustness: Robustness,
  summary: z.string().min(1).max(800),
  rationale: z.string().min(1).max(5000),
  evidence: z.array(ProposedEvidence).max(12),
  limitations: z.array(z.string().max(1000)).max(20),
  risk_flags: z.array(RiskFlag).default([]),
  open_questions: z.array(z.string().max(1000)).max(20).default([]),
});
export type InvestigatorOutput = z.infer<typeof InvestigatorOutput>;

export const CHALLENGE_TYPES = [
  "contradicting_source",
  "outdated_data",
  "missing_context",
  "transcription_error",
  "methodology",
  "correlation_causation",
  "alternative_interpretation",
  "single_source",
  "secondary_over_primary",
  "media_manipulation",
  "overstated_conclusion",
  "unverified_citation",
  "other",
] as const;

export const AuditorOutput = z.object({
  agrees_with_verdict: z.boolean(),
  suggested_verdict: Verdict.optional(),
  challenges: z
    .array(z.object({ type: z.enum(CHALLENGE_TYPES), detail: z.string().min(1).max(2000), severity: z.enum(["low", "medium", "high"]) }))
    .max(30),
  additional_evidence: z.array(ProposedEvidence).max(8).default([]),
  risk_flags: z.array(RiskFlag).default([]),
  summary: z.string().min(1).max(1500),
});
export type AuditorOutput = z.infer<typeof AuditorOutput>;

/** Extrai o primeiro objeto JSON de uma resposta (tolera cercas de código). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("resposta sem objeto JSON");
  return JSON.parse(candidate.slice(start, end + 1));
}
