import { CLAIM_STATUSES, ClaimStatus } from "@verifica-br/core";
import { countClaimsByStatus, listClaims } from "@verifica-br/db";
import Link from "next/link";
import { RiskBadge, StatusBadge, VerdictBadge } from "@/components/Badges.tsx";
import { Flash } from "@/components/Flash.tsx";
import { fmtDate, STATUS_LABELS } from "@/lib/labels.ts";
import { db } from "@/lib/server.ts";

export const metadata = { title: "Alegações" };

export default async function AdminHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const parsed = ClaimStatus.safeParse(sp.status);
  const status = parsed.success ? parsed.data : undefined;
  const [claims, counts] = await Promise.all([listClaims(db(), { status }), countClaimsByStatus(db())]);

  return (
    <>
      <Flash ok={sp.ok} error={sp.error} />
      <div className="actions" style={{ justifyContent: "space-between" }}>
        <h1>Alegações</h1>
        <Link href="/admin/claims/new" className="button">Nova alegação</Link>
      </div>
      <nav className="actions" aria-label="Filtrar por status" style={{ margin: ".5rem 0 1rem" }}>
        <Link href="/admin">{status ? "Todas" : <strong>Todas</strong>}</Link>
        {CLAIM_STATUSES.map((s) => (
          <Link key={s} href={`/admin?status=${s}`}>
            {s === status ? <strong>{STATUS_LABELS[s]}</strong> : STATUS_LABELS[s]} ({counts[s] ?? 0})
          </Link>
        ))}
      </nav>
      {claims.length === 0 ? (
        <p className="muted">Nenhuma alegação {status ? "neste status" : "cadastrada"}.</p>
      ) : (
        <div className="card table-scroll">
          <table>
            <thead>
              <tr><th>Alegação</th><th>Status</th><th>Risco</th><th>Veredito</th><th>Atualizada</th></tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/admin/claims/${c.id}`} className="break">
                      {c.originalText.length > 140 ? `${c.originalText.slice(0, 140)}…` : c.originalText}
                    </Link>
                    <br />
                    <small>{c.attributedTo}</small>
                  </td>
                  <td><StatusBadge status={c.status} /></td>
                  <td><RiskBadge level={c.riskLevel} /></td>
                  <td>{c.latestVerdict ? <><VerdictBadge verdict={c.latestVerdict} /> <small>v{c.latestVersion}</small></> : "—"}</td>
                  <td><small>{fmtDate(c.updatedAt)}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
