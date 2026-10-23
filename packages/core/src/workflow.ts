import type { Actor, ClaimStatus, ReviewDecision } from "./domain.ts";
import type { Settings } from "./settings.ts";

/** Transições permitidas. Ver diagrama em docs/METHODOLOGY.md. */
export const TRANSITIONS: Readonly<Record<ClaimStatus, readonly ClaimStatus[]>> = {
  draft: ["investigating", "awaiting_review"],
  investigating: ["auditing", "awaiting_review", "draft"],
  auditing: ["awaiting_review", "draft"],
  awaiting_review: ["approved", "returned", "rejected"],
  returned: ["investigating", "awaiting_review"],
  rejected: [],
  approved: ["published", "awaiting_review"],
  published: ["suspended", "awaiting_review"],
  suspended: ["published", "awaiting_review"],
};

/** Contexto mínimo para decidir uma transição. */
export interface TransitionContext {
  actor: Actor;
  settings: Settings;
  /** Última versão de veredito da alegação, se houver. */
  latestVersionId?: string | undefined;
  /** Revisão humana registrada para a última versão, se houver. */
  latestReview?: { verdictVersionId: string; reviewerType: Actor["type"]; decision: ReviewDecision } | undefined;
}

export type TransitionResult = { ok: true } | { ok: false; reason: string };

export function canTransition(from: ClaimStatus, to: ClaimStatus, ctx: TransitionContext): TransitionResult {
  if (!TRANSITIONS[from].includes(to)) {
    return { ok: false, reason: `transição não permitida: ${from} → ${to}` };
  }

  if (ctx.settings.killSwitch && ctx.actor.type !== "human") {
    return { ok: false, reason: "sistema pausado (kill switch ativo)" };
  }

  if (to === "awaiting_review" && !ctx.latestVersionId) {
    return { ok: false, reason: "não há versão de veredito para revisar" };
  }

  if (to === "approved" || to === "returned" || to === "rejected") {
    // Aprovação, devolução e rejeição são sempre atos humanos no MVP.
    if (ctx.actor.type !== "human") {
      return { ok: false, reason: "somente revisão humana pode decidir um caso" };
    }
    const expected: ReviewDecision = to === "approved" ? "approve" : to === "returned" ? "return" : "reject";
    const r = ctx.latestReview;
    if (!r || r.reviewerType !== "human" || r.verdictVersionId !== ctx.latestVersionId || r.decision !== expected) {
      return { ok: false, reason: `exige revisão humana "${expected}" da versão mais recente` };
    }
  }

  if (to === "published" && ctx.actor.type !== "human") {
    // Publicação automática: desativada por padrão e sem categorias liberadas no MVP.
    if (!ctx.settings.autoPublishEnabled) {
      return { ok: false, reason: "publicação automática desativada" };
    }
    return { ok: false, reason: "nenhuma categoria aprovada para publicação automática" };
  }

  return { ok: true };
}
