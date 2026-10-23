import { describe, expect, it } from "vitest";
import { assessRisk, canTransition, checkBudget, DEFAULT_SETTINGS, escalate, type Actor, type TransitionContext } from "../src/index.ts";

const human: Actor = { type: "human", id: "revisora-1" };
const agent: Actor = { type: "agent", id: "investigator" };
const system: Actor = { type: "system", id: "worker" };

const ctx = (over: Partial<TransitionContext> = {}): TransitionContext => ({
  actor: human,
  settings: { ...DEFAULT_SETTINGS },
  latestVersionId: "v2",
  ...over,
});

describe("matriz de risco", () => {
  it("risco alto prevalece e toda classe exige revisão humana", () => {
    const r = assessRisk(["economic_or_social_indicator", "criminal_accusation"]);
    expect(r).toEqual({ level: "high", reasons: ["criminal_accusation"], humanReviewRequired: true });
    expect(assessRisk(["economic_or_social_indicator"]).level).toBe("intermediate");
    expect(assessRisk([])).toMatchObject({ level: "low", humanReviewRequired: true });
  });

  it("escalate nunca reduz o risco", () => {
    expect(escalate("high", "low")).toBe("high");
    expect(escalate("low", "intermediate")).toBe("intermediate");
  });
});

describe("fluxo editorial", () => {
  it("bloqueia transições fora do diagrama", () => {
    expect(canTransition("draft", "published", ctx()).ok).toBe(false);
    expect(canTransition("rejected", "investigating", ctx()).ok).toBe(false);
  });

  it("caso de risco alto não é aprovado sem revisão humana da versão mais recente", () => {
    expect(canTransition("awaiting_review", "approved", ctx()).ok).toBe(false);
    expect(
      canTransition("awaiting_review", "approved", ctx({ latestReview: { verdictVersionId: "v1", reviewerType: "human", decision: "approve" } })).ok,
    ).toBe(false);
    expect(
      canTransition("awaiting_review", "approved", ctx({ latestReview: { verdictVersionId: "v2", reviewerType: "human", decision: "approve" } })).ok,
    ).toBe(true);
  });

  it("agente ou sistema nunca aprovam, mesmo com revisão registrada", () => {
    const latestReview = { verdictVersionId: "v2", reviewerType: "human" as const, decision: "approve" as const };
    expect(canTransition("awaiting_review", "approved", ctx({ actor: agent, latestReview })).ok).toBe(false);
    expect(canTransition("awaiting_review", "approved", ctx({ actor: system, latestReview })).ok).toBe(false);
    expect(
      canTransition("awaiting_review", "approved", ctx({ latestReview: { ...latestReview, reviewerType: "agent" } })).ok,
    ).toBe(false);
  });

  it("decisão registrada precisa corresponder ao destino", () => {
    const latestReview = { verdictVersionId: "v2", reviewerType: "human" as const, decision: "reject" as const };
    expect(canTransition("awaiting_review", "approved", ctx({ latestReview })).ok).toBe(false);
    expect(canTransition("awaiting_review", "rejected", ctx({ latestReview })).ok).toBe(true);
  });

  it("publicação automática está desligada por padrão e não há categoria liberada", () => {
    expect(DEFAULT_SETTINGS.autoPublishEnabled).toBe(false);
    expect(canTransition("approved", "published", ctx({ actor: system }))).toEqual({ ok: false, reason: "publicação automática desativada" });
    const on = { ...DEFAULT_SETTINGS, autoPublishEnabled: true };
    expect(canTransition("approved", "published", ctx({ actor: system, settings: on })).ok).toBe(false);
    expect(canTransition("approved", "published", ctx({ actor: human })).ok).toBe(true);
  });

  it("kill switch bloqueia automação mas não a ação humana", () => {
    const paused = { ...DEFAULT_SETTINGS, killSwitch: true };
    expect(canTransition("draft", "investigating", ctx({ actor: system, settings: paused })).ok).toBe(false);
    expect(canTransition("draft", "investigating", ctx({ actor: human, settings: paused })).ok).toBe(true);
  });

  it("não envia para revisão sem versão de veredito", () => {
    expect(canTransition("draft", "awaiting_review", ctx({ latestVersionId: undefined })).ok).toBe(false);
  });
});

describe("orçamento", () => {
  const s = { ...DEFAULT_SETTINGS, maxCostPerInvestigationUsd: 1, monthlyBudgetUsd: 10 };
  it("orçamento zero bloqueia gasto real, permite provedor falso", () => {
    expect(checkBudget(DEFAULT_SETTINGS, { investigationSpentUsd: 0, monthSpentUsd: 0, nextCallEstimateUsd: 0.01 }).ok).toBe(false);
    expect(checkBudget(DEFAULT_SETTINGS, { investigationSpentUsd: 0, monthSpentUsd: 0, nextCallEstimateUsd: 0 }).ok).toBe(true);
  });
  it("respeita limite por investigação e mensal", () => {
    expect(checkBudget(s, { investigationSpentUsd: 0.9, monthSpentUsd: 0, nextCallEstimateUsd: 0.2 })).toMatchObject({ ok: false });
    expect(checkBudget(s, { investigationSpentUsd: 0, monthSpentUsd: 9.95, nextCallEstimateUsd: 0.1 })).toMatchObject({ ok: false });
    expect(checkBudget(s, { investigationSpentUsd: 0.2, monthSpentUsd: 2, nextCallEstimateUsd: 0.2 }).ok).toBe(true);
  });
  it("kill switch bloqueia até custo zero; estimativa inválida é recusada", () => {
    expect(checkBudget({ ...s, killSwitch: true }, { investigationSpentUsd: 0, monthSpentUsd: 0, nextCallEstimateUsd: 0 }).ok).toBe(false);
    expect(checkBudget(s, { investigationSpentUsd: 0, monthSpentUsd: 0, nextCallEstimateUsd: Number.NaN }).ok).toBe(false);
  });
});
