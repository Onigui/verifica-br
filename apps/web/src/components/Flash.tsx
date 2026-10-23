/** Mensagem vinda das server actions via ?ok= / ?error=. */
export function Flash({ ok, error }: { ok?: string | string[] | undefined; error?: string | string[] | undefined }) {
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const e = pick(error);
  const o = pick(ok);
  if (e) return <div className="flash error" role="alert">{e}</div>;
  if (o) return <div className="flash ok" role="status">{o}</div>;
  return null;
}
