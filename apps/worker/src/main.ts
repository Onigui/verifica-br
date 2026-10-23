import { GeminiProvider, parsePricing, type LLMProvider, type PricingTable } from "@verifica-br/ai";
import { createHttpFetcher } from "@verifica-br/core";
import { createClient } from "@verifica-br/db";
import { ConfigError, investigateClaim, NonRetryableError } from "./investigate.ts";
import { runWorker } from "./worker.ts";

/** Monta o provedor real a partir do ambiente. Configuração incompleta para o worker sem consumir jobs. */
function createProvider(env: NodeJS.ProcessEnv, pricing: PricingTable): LLMProvider {
  if (env.AI_PROVIDER !== "gemini") {
    throw new ConfigError(`AI_PROVIDER="${env.AI_PROVIDER ?? ""}" não suportado (use "gemini"). O provedor falso é só para testes.`);
  }
  const model = env.AI_MODEL || "gemini-3.8-flash";
  if (!pricing[model]) {
    throw new ConfigError(`sem preço para "${model}" em AI_PRICING_JSON (na faixa gratuita, informe 0 explicitamente)`);
  }
  try {
    return new GeminiProvider({ apiKey: env.GEMINI_API_KEY ?? "", model });
  } catch (err) {
    throw new ConfigError(err instanceof Error ? err.message : String(err));
  }
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
        provider ??= createProvider(process.env, pricing);
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
