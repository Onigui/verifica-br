export interface Settings {
  killSwitch: boolean;
  autoPublishEnabled: boolean;
  maxCostPerInvestigationUsd: number;
  monthlyBudgetUsd: number;
  maxAgentRoundsPerInvestigation: number;
}

/** Padrões seguros: tudo que gasta ou publica começa travado. */
export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  killSwitch: false,
  autoPublishEnabled: false,
  maxCostPerInvestigationUsd: 0,
  monthlyBudgetUsd: 0,
  maxAgentRoundsPerInvestigation: 2,
});

export type BudgetCheck = { ok: true } | { ok: false; reason: string };

/**
 * Verifica se uma chamada estimada cabe nos limites. Custo estimado 0 (provedor falso) sempre cabe,
 * salvo kill switch. Orçamentos 0 bloqueiam qualquer gasto real até serem configurados.
 */
export function checkBudget(
  settings: Settings,
  usage: { investigationSpentUsd: number; monthSpentUsd: number; nextCallEstimateUsd: number },
): BudgetCheck {
  if (settings.killSwitch) return { ok: false, reason: "sistema pausado (kill switch ativo)" };
  const next = usage.nextCallEstimateUsd;
  if (next < 0 || !Number.isFinite(next)) return { ok: false, reason: "estimativa de custo inválida" };
  if (next === 0) return { ok: true };
  if (usage.investigationSpentUsd + next > settings.maxCostPerInvestigationUsd) {
    return { ok: false, reason: "limite de custo por investigação atingido" };
  }
  if (usage.monthSpentUsd + next > settings.monthlyBudgetUsd) {
    return { ok: false, reason: "orçamento mensal atingido" };
  }
  return { ok: true };
}
