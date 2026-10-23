import postgres from "postgres";

export type Sql = postgres.Sql;
/** Conexão ou transação: as funções de repositório aceitam ambas. */
export type Queryable = postgres.Sql | postgres.TransactionSql;

export function createClient(url: string, opts: { max?: number } = {}): Sql {
  return postgres(url, {
    max: opts.max ?? 5,
    transform: postgres.camel,
    onnotice: () => {},
    types: { bigint: postgres.BigInt },
  });
}
