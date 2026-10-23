import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Sql } from "../src/index.ts";
import { createTestDatabase, TEST_DATABASE_URL } from "../src/testing.ts";

/**
 * Simula os papéis da API automática do Supabase (anon/authenticated) e confirma que,
 * após as migrations, eles não conseguem ler nem escrever nada.
 */
describe.skipIf(!TEST_DATABASE_URL)("bloqueio da API pública (Supabase)", () => {
  let sql: Sql;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    const admin = createClient(TEST_DATABASE_URL!, { max: 1 });
    for (const role of ["anon", "authenticated"]) {
      await admin.unsafe(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`);
    }
    await admin.end();
    ({ sql, drop } = await createTestDatabase());
  });
  afterAll(async () => drop?.());

  it("todas as tabelas do schema public têm RLS ligado (inclusive as de migrations futuras)", async () => {
    const rows = await sql<{ tablename: string; rowsecurity: boolean }[]>`
      SELECT c.relname AS tablename, c.relrowsecurity AS rowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'`;
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.filter((r) => !r.rowsecurity).map((r) => r.tablename)).toEqual([]);
  });

  it("papéis da API não têm privilégio em nenhuma tabela", async () => {
    const granted = await sql`
      SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')`;
    expect(granted).toEqual([]);
  });

  it("mesmo com SET ROLE anon, leitura e escrita falham", async () => {
    await expect(sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE anon`;
      await tx`SELECT * FROM claims`;
    })).rejects.toThrow(/permission denied/);
    await expect(sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx`UPDATE settings SET kill_switch = true`;
    })).rejects.toThrow(/permission denied/);
  });

  it("o dono das tabelas (servidor) continua operando normalmente", async () => {
    const [s] = await sql`SELECT kill_switch FROM settings WHERE id = 1`;
    expect(s?.killSwitch).toBe(false);
  });
});

describe("conexão via pooler", () => {
  it("desliga prepared statements na porta 6543 ou com DB_PREPARE=false", async () => {
    const { usesTransactionPooler } = await import("../src/client.ts");
    expect(usesTransactionPooler("postgres://u:p@aws-0-sa-east-1.pooler.supabase.com:6543/postgres", {})).toBe(true);
    expect(usesTransactionPooler("postgres://u:p@db.x.supabase.co:5432/postgres", {})).toBe(false);
    expect(usesTransactionPooler("postgres://u:p@host:5432/db", { DB_PREPARE: "false" })).toBe(true);
  });
});
