import { createClient } from "./client.ts";
import { migrate } from "./migrate.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não definida");
  process.exit(1);
}
const sql = createClient(url, { max: 1 });
try {
  const done = await migrate(sql);
  console.info(done.length ? `migrations aplicadas: ${done.join(", ")}` : "banco já está atualizado");
} finally {
  await sql.end();
}
