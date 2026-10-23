import { createClient } from "@verifica-br/db";
import { migrate } from "@verifica-br/db/migrate";

/** Recria o banco do teste ponta a ponta. Recusa qualquer banco cujo nome não termine em _e2e. */
const url = process.env.E2E_DATABASE_URL;
if (!url) throw new Error("E2E_DATABASE_URL não definida");
const target = new URL(url);
const name = target.pathname.slice(1);
if (!/^[a-z0-9_]+_e2e$/.test(name)) throw new Error(`banco "${name}" não parece ser de teste (precisa terminar em _e2e)`);

const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = createClient(adminUrl.toString(), { max: 1 });
await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
await admin.unsafe(`CREATE DATABASE ${name}`);
await admin.end();

const sql = createClient(url, { max: 1 });
await migrate(sql);
await sql.end();
console.info(`[e2e] banco ${name} pronto`);
