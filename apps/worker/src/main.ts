import { parsePricing, type LLMProvider } from "@verifica-br/ai";
import { createHttpFetcher } from "@verifica-br/core";
import { createClient } from "@verifica-br/db";
import { ConfigError, investigateClaim, NonRetryableError } from "./investigate.ts";
import { runWorker } from "./worker.ts";

/** Provedores reais entram aqui na Etapa 2 (ex.: adaptador da Anthropic API). */
function createProvider(name: string | undefined): LLMProvider {
  throw new ConfigError(
    `AI_PROVIDER="${name ?? ""}" não disponível. Nenhum provedor real foi integrado ainda (Etapa 2); ` +
      "o provedor falso existe só para testes e nunca grava vereditos em banco real.",
  );
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não definida");
  process.exit(1);
}

const sql = createClient(url, { max: 2 });
try {
  const maxJobs = Number(process.env.WORKER_MAX_JOBS ?? 5);
  const pricing = parsePricing(process.env.AI_PRICING_JSON);
  const fetchPage = createHttpFetcher();
  let provider: LLMProvider | undefined;

  const report = await runWorker(
    sql,
    {
      investigate: async (job) => {
        const claimId = job.payload.claimId;
        if (typeof claimId !== "string") throw new NonRetryableError("payload sem claimId");
        provider ??= createProvider(process.env.AI_PROVIDER);
        return investigateClaim({ sql, provider, pricing, fetchPage }, claimId);
      },
    },
    maxJobs,
  );
  console.info(`[worker] ${JSON.stringify(report)}`);
  if (report.stoppedBecause === "config_error") process.exitCode = 1;
} finally {
  await sql.end();
}
