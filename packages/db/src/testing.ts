import { randomBytes } from "node:crypto";
import { createClient, migrate, type Sql } from "./client.ts";

/** URL administrativa para testes; ausente = testes de banco são pulados (o CI exige presença). */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (process.env.REQUIRE_DB_TESTS === "1" && !TEST_DATABASE_URL) {
  throw new Error("REQUIRE_DB_TESTS=1 mas TEST_DATABASE_URL não foi definida");
}

/** Cria um banco descartável com as migrations aplicadas. */
export async function createTestDatabase(): Promise<{ sql: Sql; drop: () => Promise<void> }> {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL não definida");
  const name = `vbr_test_${randomBytes(6).toString("hex")}`;
  const admin = createClient(TEST_DATABASE_URL, { max: 1 });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  const sql = createClient(url.toString());
  await migrate(sql);
  return {
    sql,
    drop: async () => {
      await sql.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}
