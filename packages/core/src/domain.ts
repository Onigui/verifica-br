import { z } from "zod";

/** Vereditos públicos. Ver docs/METHODOLOGY.md. */
export const VERDICTS = [
  "true",
  "false",
  "partly_true",
  "misleading",
  "out_of_context",
  "unverifiable",
] as const;
export const Verdict = z.enum(VERDICTS);
export type Verdict = z.infer<typeof Verdict>;

export const VERDICT_LABELS_PT: Record<Verdict, string> = {
  true: "VERDADEIRO",
  false: "FALSO",
  partly_true: "PARCIALMENTE VERDADEIRO",
  misleading: "ENGANOSO",
  out_of_context: "FORA DE CONTEXTO",
  unverifiable: "NÃO VERIFICÁVEL",
};

export const Robustness = z.enum(["high", "intermediate", "insufficient"]);
export type Robustness = z.infer<typeof Robustness>;

export const RiskLevel = z.enum(["low", "intermediate", "high"]);
export type RiskLevel = z.infer<typeof RiskLevel>;

export const CLAIM_STATUSES = [
  "draft",
  "investigating",
  "auditing",
  "awaiting_review",
  "returned",
  "rejected",
  "approved",
  "published",
  "suspended",
] as const;
export const ClaimStatus = z.enum(CLAIM_STATUSES);
export type ClaimStatus = z.infer<typeof ClaimStatus>;

export const Stance = z.enum(["supports", "contradicts", "context"]);
export type Stance = z.infer<typeof Stance>;

export const CitationCheck = z.enum(["pending", "ok", "failed", "unsupported"]);
export type CitationCheck = z.infer<typeof CitationCheck>;

export const ActorType = z.enum(["human", "agent", "system"]);
export type ActorType = z.infer<typeof ActorType>;

export interface Actor {
  type: ActorType;
  id: string;
}

export const ReviewDecision = z.enum(["approve", "return", "reject"]);
export type ReviewDecision = z.infer<typeof ReviewDecision>;

/** Sinais que elevam o risco de uma alegação. Ver matriz em docs/METHODOLOGY.md. */
export const RISK_FLAGS = [
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
  "economic_or_social_indicator",
  "requires_political_or_historical_context",
  "depends_on_full_video_sequence",
  "cross_methodology_statistics",
] as const;
export const RiskFlag = z.enum(RISK_FLAGS);
export type RiskFlag = z.infer<typeof RiskFlag>;

/** Entrada de cadastro de uma alegação. O texto original é preservado como recebido. */
export const NewClaim = z.object({
  originalText: z.string().trim().min(5).max(5000),
  attributedTo: z.string().trim().min(1).max(300),
  originalSourceUrl: z.url({ protocol: /^https?$/ }),
  sourcePlatform: z.string().trim().max(100).optional(),
  statedAt: z.coerce.date().optional(),
  topic: z.string().trim().max(100).optional(),
  claimType: z.string().trim().max(100).optional(),
  riskFlags: z.array(RiskFlag).default([]),
});
export type NewClaim = z.infer<typeof NewClaim>;
