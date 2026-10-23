import { readFileSync } from "node:fs";
import type { z } from "zod";
import { AuditorOutput, extractJson, InvestigatorOutput } from "./contracts.ts";
import { costUsd, estimateCostUsd, priceFor, type CompletionRequest, type LLMProvider, type PricingTable, type Usage } from "./provider.ts";

export type AgentRole = "investigator" | "auditor";

export const PROMPT_VERSIONS: Record<AgentRole, string> = {
  investigator: "investigator.v1",
  auditor: "auditor.v1",
};

const promptCache = new Map<string, string>();
export function loadPrompt(version: string): string {
  let p = promptCache.get(version);
  if (!p) {
    p = readFileSync(new URL(`../prompts/${version}.md`, import.meta.url), "utf8");
    promptCache.set(version, p);
  }
  return p;
}

export interface ClaimInput {
  originalText: string;
  attributedTo: string;
  originalSourceUrl: string;
  statedAt?: string | undefined;
  context?: string | undefined;
}

export interface EvidenceInput {
  url: string;
  excerpt: string;
  stance: string;
  citationCheck: string;
  limitations?: string | undefined;
}

/** Escapa marcas de delimitação para que o material não "feche" o bloco de dados. */
const data = (obj: unknown) => `<dados>\n${JSON.stringify(obj, null, 2).replaceAll("</dados>", "<\\/dados>")}\n</dados>`;

export function buildInvestigatorRequest(claim: ClaimInput, evidence: EvidenceInput[], maxOutputTokens = 4000): CompletionRequest {
  return {
    system: loadPrompt(PROMPT_VERSIONS.investigator),
    user: `Alegação e evidências já registradas por humanos:\n${data({ claim, evidence })}`,
    maxOutputTokens,
    enableWebSearch: true,
  };
}

export function buildAuditorRequest(
  claim: ClaimInput,
  evidence: EvidenceInput[],
  proposal: Pick<InvestigatorOutput, "proposed_verdict" | "robustness" | "summary" | "rationale" | "limitations">,
  maxOutputTokens = 3000,
): CompletionRequest {
  return {
    system: loadPrompt(PROMPT_VERSIONS.auditor),
    user: `Alegação, evidências (com status do verificador de citações) e conclusão proposta:\n${data({ claim, evidence, proposal })}`,
    maxOutputTokens,
    enableWebSearch: true,
  };
}

export type AgentRunResult<T> =
  | { status: "succeeded"; output: T; rawText: string; model: string; usage: Usage; costUsd: number; promptVersion: string }
  | { status: "invalid_output" | "provider_error"; error: string; rawText?: string; model: string; usage?: Usage; costUsd: number; promptVersion: string };

async function run<T>(
  role: AgentRole,
  schema: z.ZodType<T>,
  provider: LLMProvider,
  req: CompletionRequest,
  pricing: PricingTable,
): Promise<AgentRunResult<T>> {
  const promptVersion = PROMPT_VERSIONS[role];
  const price = priceFor(provider, pricing);
  let res;
  try {
    res = await provider.complete(req);
  } catch (err) {
    return { status: "provider_error", error: err instanceof Error ? err.message : String(err), model: provider.model, costUsd: 0, promptVersion };
  }
  const cost = costUsd(price, res.usage);
  try {
    const output = schema.parse(extractJson(res.text));
    return { status: "succeeded", output, rawText: res.text, model: res.model, usage: res.usage, costUsd: cost, promptVersion };
  } catch (err) {
    return { status: "invalid_output", error: err instanceof Error ? err.message : String(err), rawText: res.text, model: res.model, usage: res.usage, costUsd: cost, promptVersion };
  }
}

export const runInvestigator = (provider: LLMProvider, req: CompletionRequest, pricing: PricingTable) =>
  run("investigator", InvestigatorOutput, provider, req, pricing);

export const runAuditor = (provider: LLMProvider, req: CompletionRequest, pricing: PricingTable) =>
  run("auditor", AuditorOutput, provider, req, pricing);

/** Estimativa de custo para checar orçamento antes de chamar o provedor. */
export function estimateRequestCost(provider: LLMProvider, req: CompletionRequest, pricing: PricingTable, expectedWebSearches = 5): number {
  return estimateCostUsd(priceFor(provider, pricing), req, expectedWebSearches);
}
