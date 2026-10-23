import { VERDICTS } from "@verifica-br/core";
import { getClaimDetail, type ClaimDetail } from "@verifica-br/db";
import { notFound } from "next/navigation";
import { CitationBadge, RiskBadge, StatusBadge, VerdictBadge } from "@/components/Badges.tsx";
import { Flash } from "@/components/Flash.tsx";
import {
  addEvidenceAction,
  correctionAction,
  proposeManualVerdictAction,
  publicationStateAction,
  recordPublicationAction,
  requestInvestigationAction,
  reviewAction,
} from "@/lib/actions.ts";
import { DECISION_LABELS, fmtDate, RISK_FLAG_LABELS, ROBUSTNESS_LABELS, STANCE_LABELS, verdictLabel } from "@/lib/labels.ts";
import { db } from "@/lib/server.ts";

export const metadata = { title: "Alegação" };

type Detail = ClaimDetail;
type Version = Detail["versions"][number];

export default async function ClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const d = await getClaimDetail(db(), id);
  if (!d) notFound();
  const { claim } = d;
  const latest = d.versions[0];
  const editable = claim.status === "draft" || claim.status === "returned";
  const pendingJob = d.jobs.find((j) => j.status === "queued" || j.status === "running");

  return (
    <>
      <Flash ok={sp.ok} error={sp.error} />
      <div className="actions"><StatusBadge status={claim.status} /><RiskBadge level={claim.riskLevel} /></div>
      <h1 style={{ marginTop: ".6rem" }}>Alegação</h1>
      <blockquote className="break">{claim.originalText}</blockquote>
      <dl className="kv">
        <dt>Atribuída a</dt><dd>{claim.attributedTo}</dd>
        <dt>Fonte original</dt><dd><a href={claim.originalSourceUrl} target="_blank" rel="noopener noreferrer nofollow">{claim.originalSourceUrl}</a></dd>
        {claim.sourcePlatform && <><dt>Plataforma</dt><dd>{claim.sourcePlatform}</dd></>}
        {claim.statedAt && <><dt>Data</dt><dd>{fmtDate(claim.statedAt)}</dd></>}
        {claim.topic && <><dt>Tema</dt><dd>{claim.topic}</dd></>}
        <dt>Sinais de risco</dt>
        <dd>{claim.riskFlags.length ? claim.riskFlags.map((f) => RISK_FLAG_LABELS[f as keyof typeof RISK_FLAG_LABELS] ?? f).join(" · ") : "nenhum"}</dd>
        <dt>Registrada</dt><dd>{fmtDate(claim.createdAt)} por {claim.createdBy}</dd>
      </dl>

      {/* ---------- Próxima ação ---------- */}
      {editable && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Próximo passo</h2>
          {claim.status === "returned" && latest && <p>Devolvida na versão {latest.version}. Veja os comentários da revisão abaixo.</p>}
          <div className="grid two">
            <div>
              <h3>Investigação automática</h3>
              <p className="muted">O worker roda investigador, verificador de citações e auditor, e devolve o caso para revisão humana.</p>
              {pendingJob ? (
                <p><span className="badge warn">Na fila ({pendingJob.status})</span></p>
              ) : (
                <form action={requestInvestigationAction}>
                  <input type="hidden" name="claimId" value={claim.id} />
                  <button type="submit">Enfileirar investigação</button>
                </form>
              )}
            </div>
            <div>
              <h3>Veredito manual</h3>
              <details>
                <summary>Propor veredito com as evidências registradas</summary>
                <form action={proposeManualVerdictAction} className="stack" style={{ marginTop: ".75rem" }}>
                  <input type="hidden" name="claimId" value={claim.id} />
                  <VersionFields evidence={d.evidence} />
                  <div className="actions"><button type="submit">Enviar para revisão</button></div>
                </form>
              </details>
            </div>
          </div>
        </section>
      )}

      {claim.status === "awaiting_review" && latest && <ReviewPanel claimId={claim.id} version={latest} detail={d} />}

      {(claim.status === "approved" || claim.status === "published" || claim.status === "suspended") && latest && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Publicação</h2>
          <p>Versão vigente: <VerdictBadge verdict={latest.verdict} /> v{latest.version}</p>
          {claim.status === "approved" && (
            <form action={recordPublicationAction} className="stack">
              <input type="hidden" name="claimId" value={claim.id} />
              <p className="muted">Publique manualmente e registre aqui o link. Nada é publicado automaticamente.</p>
              <div className="grid two">
                <label>
                  Canal
                  <select name="channel" defaultValue="instagram">
                    <option value="instagram">Instagram</option>
                    <option value="site">Site</option>
                    <option value="outro">Outro</option>
                  </select>
                </label>
                <label>
                  Link da publicação
                  <input type="url" name="externalUrl" placeholder="https://" />
                </label>
              </div>
              <label>
                Legenda usada (opcional)
                <textarea name="caption" maxLength={2200} />
              </label>
              <div className="actions"><button type="submit">Registrar publicação</button></div>
            </form>
          )}
          {(claim.status === "published" || claim.status === "suspended") && (
            <form action={publicationStateAction} className="stack">
              <input type="hidden" name="claimId" value={claim.id} />
              <input type="hidden" name="to" value={claim.status === "published" ? "suspended" : "published"} />
              <label>
                Motivo
                <input type="text" name="reason" required maxLength={500} />
              </label>
              <div className="actions">
                <button type="submit" className={claim.status === "published" ? "danger" : ""}>
                  {claim.status === "published" ? "Suspender publicação" : "Restabelecer publicação"}
                </button>
              </div>
            </form>
          )}
          <details style={{ marginTop: "1rem" }}>
            <summary>Abrir correção (nova versão, volta para revisão)</summary>
            <form action={correctionAction} className="stack" style={{ marginTop: ".75rem" }}>
              <input type="hidden" name="claimId" value={claim.id} />
              <label>
                Motivo interno
                <textarea name="reason" required minLength={5} maxLength={2000} />
              </label>
              <label>
                Explicação pública da correção
                <textarea name="publicExplanation" required minLength={10} maxLength={2000} />
              </label>
              <VersionFields evidence={d.evidence} defaults={latest} />
              <div className="actions"><button type="submit">Abrir correção</button></div>
            </form>
          </details>
        </section>
      )}

      {/* ---------- Evidências ---------- */}
      <h2>Evidências ({d.evidence.length})</h2>
      {d.evidence.length === 0 && <p className="muted">Nenhuma evidência registrada.</p>}
      {d.evidence.map((e) => <EvidenceCard key={e.id} e={e} />)}
      {claim.status !== "rejected" && (
        <details className="card">
          <summary>Adicionar evidência</summary>
          <form action={addEvidenceAction} className="stack" style={{ marginTop: ".75rem" }}>
            <input type="hidden" name="claimId" value={claim.id} />
            <div className="grid two">
              <label>URL da fonte<input type="url" name="url" required placeholder="https://" /></label>
              <label>Instituição ou autor<input type="text" name="publisher" maxLength={300} /></label>
              <label>
                Tipo de fonte
                <select name="sourceType" defaultValue="primary_document">
                  <option value="primary_document">Documento original</option>
                  <option value="official_data">Base oficial</option>
                  <option value="law_or_court">Legislação / decisão judicial</option>
                  <option value="original_statement">Declaração ou registro integral</option>
                  <option value="academic">Acadêmica</option>
                  <option value="journalism">Jornalismo</option>
                  <option value="fact_checker">Organização de verificação</option>
                  <option value="other">Outra</option>
                </select>
              </label>
              <label>
                Relação com a alegação
                <select name="stance" defaultValue="contradicts">
                  <option value="supports">Sustenta</option>
                  <option value="contradicts">Contradiz</option>
                  <option value="context">Contexto</option>
                </select>
              </label>
              <label>Data de publicação da fonte<input type="text" name="publicationDate" maxLength={40} placeholder="Ex.: 2026-09-30" /></label>
            </div>
            <label>
              Trecho literal da página (será conferido automaticamente)
              <textarea name="excerpt" required minLength={20} maxLength={3000} />
            </label>
            <label>Por que é relevante<textarea name="relevanceNotes" maxLength={2000} /></label>
            <label>Limitações da fonte<textarea name="limitations" maxLength={2000} /></label>
            <div className="actions"><button type="submit">Adicionar evidência</button></div>
          </form>
        </details>
      )}

      {/* ---------- Investigações ---------- */}
      {d.investigations.length > 0 && <h2>Investigações automáticas</h2>}
      {d.investigations.map((inv) => <InvestigationCard key={inv.id} inv={inv} />)}

      {/* ---------- Histórico ---------- */}
      <h2>Versões do veredito</h2>
      {d.versions.length === 0 && <p className="muted">Nenhuma versão ainda.</p>}
      {d.versions.map((v) => <VersionCard key={v.id} v={v} />)}

      {d.corrections.length > 0 && (
        <>
          <h2>Correções</h2>
          {d.corrections.map((c) => (
            <div key={c.id} className="card">
              <p><strong>{fmtDate(c.createdAt)}</strong> por {c.createdBy}</p>
              <p>{c.publicExplanation}</p>
              <small>Motivo interno: {c.reason}</small>
            </div>
          ))}
        </>
      )}

      {d.posts.length > 0 && (
        <>
          <h2>Publicações</h2>
          <ul>
            {d.posts.map((p) => (
              <li key={p.id}>
                {p.channel} · {fmtDate(p.publishedAt)}{" "}
                {p.externalUrl && <a href={p.externalUrl} target="_blank" rel="noopener noreferrer nofollow">link</a>}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Trilha de auditoria</h2>
      <ul className="timeline card">
        {d.audit.map((a) => (
          <li key={a.id}>
            <small>{fmtDate(a.createdAt)}</small> · <strong>{a.actorId}</strong> <small>({a.actorType})</small> · <code>{a.action}</code>
            {"from" in a.metadata || "to" in a.metadata ? <small> {String(a.metadata.from ?? "")} → {String(a.metadata.to ?? "")}</small> : null}
            {typeof a.metadata.reason === "string" && <small> — {a.metadata.reason}</small>}
          </li>
        ))}
      </ul>
    </>
  );
}

function VersionFields({ evidence, defaults }: { evidence: Detail["evidence"]; defaults?: Version }) {
  return (
    <>
      <div className="grid two">
        <label>
          Veredito
          <select name="verdict" defaultValue={defaults?.verdict ?? "unverifiable"}>
            {VERDICTS.map((v) => <option key={v} value={v}>{verdictLabel(v)}</option>)}
          </select>
        </label>
        <label>
          Robustez
          <select name="robustness" defaultValue={defaults?.robustness ?? "intermediate"}>
            {(["high", "intermediate", "insufficient"] as const).map((r) => <option key={r} value={r}>{ROBUSTNESS_LABELS[r]}</option>)}
          </select>
        </label>
      </div>
      <label>Resumo da conclusão<textarea name="summary" required minLength={10} maxLength={800} defaultValue={defaults?.summary} /></label>
      <label>Justificativa<textarea name="rationale" required minLength={10} maxLength={5000} rows={6} defaultValue={defaults?.rationale} /></label>
      <label>Limitações (uma por linha)<textarea name="limitations" defaultValue={defaults?.limitations.join("\n")} /></label>
      <fieldset>
        <legend>Evidências que sustentam esta versão</legend>
        {evidence.length === 0 && <small>Nenhuma evidência registrada.</small>}
        <div className="checks">
          {evidence.map((e) => (
            <label key={e.id} className="inline">
              <input type="checkbox" name="evidenceIds" value={e.id} defaultChecked={defaults ? defaults.evidenceIds.includes(e.id) : e.citationCheck === "ok"} />
              <span className="break"><small>{new URL(e.url).hostname} · {STANCE_LABELS[e.stance]} · {e.citationCheck === "ok" ? "citação confirmada" : "citação NÃO confirmada"}</small><br />“{e.excerpt.slice(0, 120)}{e.excerpt.length > 120 ? "…" : ""}”</span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

function EvidenceCard({ e }: { e: Detail["evidence"][number] }) {
  return (
    <div className="card">
      <div className="actions">
        <span className="badge">{STANCE_LABELS[e.stance]}</span>
        <CitationBadge check={e.citationCheck} />
        <small>adicionada por {e.addedBy} ({e.addedByType})</small>
      </div>
      <blockquote className="break">{e.excerpt}</blockquote>
      <p className="break"><a href={e.url} target="_blank" rel="noopener noreferrer nofollow">{e.url}</a>{e.publisher && <> · {e.publisher}</>}</p>
      {e.relevanceNotes && <p><small>Relevância: {e.relevanceNotes}</small></p>}
      {e.limitations && <p><small>Limitações: {e.limitations}</small></p>}
      {e.citationDetail && <p><small>Verificador: {e.citationDetail} · consulta em {fmtDate(e.accessedAt)}</small></p>}
    </div>
  );
}

interface Proposal { proposed_verdict?: string; summary?: string; rationale?: string; limitations?: string[]; open_questions?: string[] }
interface Audit { agrees_with_verdict?: boolean; suggested_verdict?: string; summary?: string; challenges?: Array<{ type: string; detail: string; severity: string }> }

function InvestigationCard({ inv }: { inv: Detail["investigations"][number] }) {
  const investigator = inv.runs.find((r) => r.role === "investigator");
  const auditor = inv.runs.find((r) => r.role === "auditor");
  const p = (investigator?.output ?? {}) as Proposal;
  const a = (auditor?.output ?? {}) as Audit;
  const cost = inv.runs.reduce((s, r) => s + r.costEstimateUsd, 0);
  return (
    <div className="card">
      <p>
        <strong>{fmtDate(inv.startedAt)}</strong> · status <code>{inv.status}</code> · metodologia {inv.methodologyVersion} · custo estimado US$ {cost.toFixed(4)}
      </p>
      {inv.errorDetails && <div className="flash error">{inv.errorDetails}</div>}
      <div className="grid two">
        <div>
          <h3>Investigador {investigator && <small>({investigator.model}, {investigator.promptVersion})</small>}</h3>
          {investigator?.status !== "succeeded" ? <p className="muted">{investigator ? `${investigator.status}: ${investigator.error ?? ""}` : "não executado"}</p> : (
            <>
              <p>Propõe: <strong>{p.proposed_verdict ? verdictLabel(p.proposed_verdict as never) : "—"}</strong></p>
              <p>{p.summary}</p>
              <details><summary>Justificativa</summary><p>{p.rationale}</p></details>
              {p.open_questions?.length ? <details><summary>Perguntas em aberto</summary><ul>{p.open_questions.map((q, i) => <li key={i}>{q}</li>)}</ul></details> : null}
            </>
          )}
        </div>
        <div>
          <h3>Auditor {auditor && <small>({auditor.model}, {auditor.promptVersion})</small>}</h3>
          {auditor?.status !== "succeeded" ? <p className="muted">{auditor ? `${auditor.status}: ${auditor.error ?? ""}` : "não executado"}</p> : (
            <>
              <p>
                {a.agrees_with_verdict ? <span className="badge ok">Não conseguiu refutar</span> : <span className="badge bad">Contesta a conclusão</span>}
                {a.suggested_verdict && <> · sugere <strong>{verdictLabel(a.suggested_verdict as never)}</strong></>}
              </p>
              <p>{a.summary}</p>
              {a.challenges?.length ? (
                <ul>{a.challenges.map((c, i) => <li key={i}><span className={`badge ${c.severity === "high" ? "bad" : c.severity === "medium" ? "warn" : ""}`}>{c.severity}</span> <code>{c.type}</code> {c.detail}</li>)}</ul>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function VersionCard({ v }: { v: Version }) {
  return (
    <div className="card">
      <div className="actions">
        <strong>v{v.version}</strong> <VerdictBadge verdict={v.verdict} /> <span className="badge">Robustez {ROBUSTNESS_LABELS[v.robustness].toLowerCase()}</span>
        <small>{fmtDate(v.createdAt)} · {v.createdBy} ({v.createdByType}) · metodologia {v.methodologyVersion}</small>
      </div>
      <p>{v.summary}</p>
      <details><summary>Justificativa e limitações</summary><p>{v.rationale}</p>{v.limitations.length > 0 && <ul>{v.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>}<small>{v.evidenceIds.length} evidência(s) vinculada(s)</small></details>
      {v.reviews.map((r) => (
        <p key={r.id}><small><strong>{DECISION_LABELS[r.decision] ?? r.decision}</strong> por {r.reviewer} em {fmtDate(r.reviewedAt)}{r.comments && <> — “{r.comments}”</>}</small></p>
      ))}
    </div>
  );
}

function ReviewPanel({ claimId, version, detail }: { claimId: string; version: Version; detail: Detail }) {
  const linked = detail.evidence.filter((e) => version.evidenceIds.includes(e.id));
  const unconfirmed = linked.filter((e) => e.citationCheck !== "ok").length;
  const inv = detail.investigations.find((i) => i.id === version.investigationId);
  const audit = inv?.runs.find((r) => r.role === "auditor")?.output as Audit | undefined;
  return (
    <section className="card" style={{ borderColor: "var(--warn)" }}>
      <h2 style={{ marginTop: 0 }}>Revisão humana — versão {version.version}</h2>
      <p><VerdictBadge verdict={version.verdict} /> <span className="badge">Robustez {ROBUSTNESS_LABELS[version.robustness].toLowerCase()}</span></p>
      <p>{version.summary}</p>
      <ul>
        <li>{linked.length} evidência(s) vinculada(s){unconfirmed > 0 && <strong> — {unconfirmed} sem citação confirmada</strong>}</li>
        {detail.claim.riskLevel === "high" && <li><strong>Risco alto:</strong> confira cada fonte pessoalmente; segunda leitura recomendada.</li>}
        {audit && audit.agrees_with_verdict === false && <li><strong>O auditor contestou esta conclusão.</strong> Veja a investigação abaixo.</li>}
      </ul>
      <form action={reviewAction} className="stack">
        <input type="hidden" name="claimId" value={claimId} />
        <input type="hidden" name="verdictVersionId" value={version.id} />
        <fieldset>
          <legend>Decisão</legend>
          <label className="inline"><input type="radio" name="decision" value="approve" required /> Aprovar esta versão</label>
          <label className="inline"><input type="radio" name="decision" value="return" /> Devolver para investigação</label>
          <label className="inline"><input type="radio" name="decision" value="reject" /> Rejeitar (não será verificada)</label>
        </fieldset>
        <label>Comentários (obrigatório para devolver ou rejeitar)<textarea name="comments" maxLength={4000} /></label>
        <label className="inline"><input type="checkbox" name="confirm" value="yes" required /> Conferi as evidências e as fontes citadas nesta versão.</label>
        <div className="actions"><button type="submit">Registrar decisão</button></div>
      </form>
    </section>
  );
}
