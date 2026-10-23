import { Flash } from "@/components/Flash.tsx";
import { loginAction } from "@/lib/actions.ts";
import { adminUsers } from "@/lib/server.ts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entrar", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const configured = adminUsers().length > 0 && (process.env.SESSION_SECRET?.length ?? 0) >= 32;
  return (
    <main className="wrap" style={{ maxWidth: 420 }}>
      <h1>Painel VerificaBR</h1>
      <Flash ok={sp.ok} error={sp.error} />
      {!configured ? (
        <div className="flash error">Acesso não configurado: defina ADMIN_USERS e SESSION_SECRET (veja .env.example).</div>
      ) : (
        <form action={loginAction} className="stack card">
          <label>
            Usuário
            <input type="text" name="username" autoComplete="username" required />
          </label>
          <label>
            Senha
            <input type="password" name="password" autoComplete="current-password" required />
          </label>
          <button type="submit">Entrar</button>
        </form>
      )}
    </main>
  );
}
