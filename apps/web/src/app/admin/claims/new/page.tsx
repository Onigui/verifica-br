import { RISK_FLAGS } from "@verifica-br/core";
import { Flash } from "@/components/Flash.tsx";
import { createClaimAction } from "@/lib/actions.ts";
import { RISK_FLAG_LABELS } from "@/lib/labels.ts";

export const metadata = { title: "Nova alegação" };

export default async function NewClaimPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return (
    <>
      <h1>Nova alegação</h1>
      <p className="muted">Registre a alegação exatamente como foi feita. O texto original não pode ser alterado depois.</p>
      <Flash ok={sp.ok} error={sp.error} />
      <form action={createClaimAction} className="stack card">
        <label>
          Texto original da alegação
          <textarea name="originalText" required minLength={5} maxLength={5000} rows={4} />
        </label>
        <div className="grid two">
          <label>
            Atribuída a
            <input type="text" name="attributedTo" required maxLength={300} placeholder="Pessoa ou instituição" />
          </label>
          <label>
            URL da fonte original
            <input type="url" name="originalSourceUrl" required placeholder="https://" />
          </label>
          <label>
            Plataforma
            <input type="text" name="sourcePlatform" maxLength={100} placeholder="Ex.: entrevista, site oficial, rede social" />
          </label>
          <label>
            Data da alegação
            <input type="date" name="statedAt" />
          </label>
          <label>
            Tema
            <input type="text" name="topic" maxLength={100} placeholder="Ex.: economia" />
          </label>
          <label>
            Tipo
            <input type="text" name="claimType" maxLength={100} placeholder="Ex.: dado numérico, citação, vídeo" />
          </label>
        </div>
        <fieldset>
          <legend>Sinais de risco (marque todos que se aplicam)</legend>
          <div className="checks">
            {RISK_FLAGS.map((f) => (
              <label key={f} className="inline">
                <input type="checkbox" name="riskFlags" value={f} /> {RISK_FLAG_LABELS[f]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="actions">
          <button type="submit">Registrar alegação</button>
        </div>
      </form>
    </>
  );
}
