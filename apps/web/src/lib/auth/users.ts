import { z } from "zod";
import { verifyPassword } from "./password.ts";

/**
 * Pessoas com acesso ao painel, definidas em ADMIN_USERS (JSON). Sem banco de usuários no MVP:
 * a equipe é pequena e as senhas ficam apenas como hash scrypt em variável de ambiente.
 */
const AdminUser = z.object({
  id: z.string().regex(/^[a-z0-9._-]{2,40}$/),
  name: z.string().min(1).max(80),
  passwordHash: z.string().startsWith("scrypt$"),
});
export type AdminUser = z.infer<typeof AdminUser>;

export function parseAdminUsers(json: string | undefined): AdminUser[] {
  if (!json?.trim()) return [];
  const users = z.array(AdminUser).parse(JSON.parse(json));
  const ids = new Set(users.map((u) => u.id));
  if (ids.size !== users.length) throw new Error("ADMIN_USERS tem ids repetidos");
  return users;
}

export function findUser(users: AdminUser[], id: string): AdminUser | undefined {
  return users.find((u) => u.id === id);
}

// Hash fixo usado quando o usuário não existe, para não revelar quais ids são válidos pelo tempo de resposta.
const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export async function authenticate(users: AdminUser[], id: string, password: string): Promise<AdminUser | null> {
  const user = findUser(users, id.trim().toLowerCase());
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  return user && ok ? user : null;
}

/** Limite simples de tentativas por chave (memória do processo; suficiente para poucas pessoas). */
export class LoginThrottle {
  private readonly failures = new Map<string, number[]>();
  constructor(private readonly max = 5, private readonly windowMs = 15 * 60 * 1000) {}

  isBlocked(key: string, now = Date.now()): boolean {
    const recent = (this.failures.get(key) ?? []).filter((t) => now - t < this.windowMs);
    this.failures.set(key, recent);
    return recent.length >= this.max;
  }
  fail(key: string, now = Date.now()): void {
    this.failures.set(key, [...(this.failures.get(key) ?? []), now]);
  }
  reset(key: string): void {
    this.failures.delete(key);
  }
}
