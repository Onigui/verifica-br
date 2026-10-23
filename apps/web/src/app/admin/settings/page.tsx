import { getSettings } from "@verifica-br/db";
import { Flash } from "@/components/Flash.tsx";
import { updateSettingsAction } from "@/lib/actions.ts";
import { db } from "@/lib/server.ts";

export const metadata = { title: "Configurações" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const s = await getSettings(db());
  const [{ total } = { total: "0" }] = await db()<{ total: string }[]>`
    SELECT COALESCE(SUM(cost_estimate_usd), 0)::text AS total FROM agent_runs WHERE created_at >= date_trunc('month', now())`;
  return (
    <>
      <h1>Configurações</h1>
      <Flash ok={sp.ok} error={sp.error} />
      <form action={updateSettingsAction} className="stack card">
        <label className="inline">
          <input type="checkbox" name="killSwitch" defaultChecked={s.killSwitch} />
          <span><strong>Pausar o sistema</strong> — o worker para de processar investigações; nada é apagado.</span>
        </label>
        <div className="grid two">
          <label>
            Limite por investigação (USD)
            <input type="number" name="maxCostPerInvestigationUsd" min={0} step="0.01" defaultValue={s.maxCostPerInvestigationUsd} />
          </label>
          <label>
            Orçamento mensal de IA (USD)
            <input type="number" name="monthlyBudgetUsd" min={0} step="0.01" defaultValue={s.monthlyBudgetUsd} />
          </label>
          <label>
            Investigações automáticas por alegação
            <input type="number" name="maxAgentRoundsPerInvestigation" min={1} max={5} defaultValue={s.maxAgentRoundsPerInvestigation} />
          </label>
        </div>
        <p className="muted">
          Com limites em 0, nenhuma chamada paga de IA é feita. Gasto estimado neste mês: <strong>US$ {Number(total).toFixed(4)}</strong>.
        </p>
        <p className="muted">
          Publicação automática: <strong>{s.autoPublishEnabled ? "ativada" : "desativada"}</strong>. Não é editável no MVP (decisão A1).
        </p>
        <div className="actions"><button type="submit">Salvar</button></div>
      </form>
    </>
  );
}
