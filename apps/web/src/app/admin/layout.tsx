import { getSettings } from "@verifica-br/db";
import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/lib/actions.ts";
import { db, requireUser } from "@/lib/server.ts";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const settings = await getSettings(db());
  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <Link href="/admin" className="brand">VerificaBR · painel</Link>
          <nav className="nav">
            <Link href="/admin">Alegações</Link>
            <Link href="/admin/claims/new">Nova alegação</Link>
            <Link href="/admin/settings">Configurações</Link>
          </nav>
          <form action={logoutAction} className="actions">
            <small>{user.name}</small>
            <button type="submit" className="secondary">Sair</button>
          </form>
        </div>
      </header>
      {settings.killSwitch && (
        <div className="banner" role="alert">
          <div className="wrap">Sistema pausado: o worker não processa investigações até a pausa ser desligada.</div>
        </div>
      )}
      <main className="wrap">{children}</main>
    </>
  );
}
