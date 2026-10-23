import postgres from "postgres";

export type Sql = postgres.Sql;
/** Conexão ou transação: as funções de repositório aceitam ambas. */
export type Queryable = postgres.Sql | postgres.TransactionSql;

/**
 * Pooler em modo transação (Supabase Supavisor, porta 6543) não suporta prepared statements.
 * Detecta pela porta ou por DB_PREPARE=false.
 */
export function usesTransactionPooler(url: string, env: Record<string, string | undefined> = process.env): boolean {
  if (env.DB_PREPARE === "false") return true;
  try {
    return new URL(url).port === "6543";
  } catch {
    return false;
  }
}

export function createClient(url: string, opts: { max?: number } = {}): Sql {
  return postgres(url, {
    max: opts.max ?? 5,
    prepare: !usesTransactionPooler(url),
    transform: postgres.camel,
    onnotice: () => {},
    types: { bigint: postgres.BigInt },
  });
}
