import "server-only";
import type { Actor } from "@verifica-br/core";
import { createClient, type Sql } from "@verifica-br/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "./auth/session.ts";
import { findUser, LoginThrottle, parseAdminUsers, type AdminUser } from "./auth/users.ts";

const globalForDb = globalThis as unknown as { __vbrSql?: Sql; __vbrThrottle?: LoginThrottle };

export function db(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  globalForDb.__vbrSql ??= createClient(url, { max: 5 });
  return globalForDb.__vbrSql;
}

export function loginThrottle(): LoginThrottle {
  globalForDb.__vbrThrottle ??= new LoginThrottle();
  return globalForDb.__vbrThrottle;
}

export function adminUsers(): AdminUser[] {
  return parseAdminUsers(process.env.ADMIN_USERS);
}

export type SessionUser = Pick<AdminUser, "id" | "name">;

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token, process.env.SESSION_SECRET);
  if (!session) return null;
  const user = findUser(adminUsers(), session.sub);
  return user ? { id: user.id, name: user.name } : null;
}

/** Garante sessão válida; sem ela, volta ao login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export const actorOf = (user: SessionUser): Actor => ({ type: "human", id: user.id });
