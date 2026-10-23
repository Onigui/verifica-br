import { readdirSync, readFileSync } from "node:fs";
import type { Sql } from "./client.ts";

/** Fora do index: o caminho relativo das migrations não deve entrar em bundles (Next.js). */
const MIGRATIONS_DIR = new URL("../migrations/", import.meta.url);

/** Aplica, em ordem, as migrations SQL ainda não registradas. Idempotente. */
export async function migrate(sql: Sql): Promise<string[]> {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  const applied = new Set((await sql<{ name: string }[]>`SELECT name FROM schema_migrations`).map((r) => r.name));
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const done: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const body = readFileSync(new URL(file, MIGRATIONS_DIR), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
    });
    done.push(file);
  }
  return done;
}
