/** Abstração de provedor de IA. O domínio nunca importa SDKs de fornecedores diretamente. */

export interface CompletionRequest {
  system: string;
  user: string;
  maxOutputTokens: number;
  /** Permite ao provedor usar busca na web, se suportada (Etapa 2). */
  enableWebSearch?: boolean;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  webSearches?: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  usage: Usage;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  /** Provedores falsos não geram custo e não exigem tabela de preços. */
  readonly isFake: boolean;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

/** Preços em USD; valores devem vir da página oficial do fornecedor, nunca do código. */
export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
  perWebSearch?: number;
}
export type PricingTable = Record<string, ModelPrice>;

export class PricingMissingError extends Error {
  constructor(model: string) {
    super(`sem preço configurado para o modelo "${model}" (AI_PRICING_JSON)`);
  }
}

export function priceFor(provider: LLMProvider, pricing: PricingTable): ModelPrice {
  if (provider.isFake) return { inputPerMTok: 0, outputPerMTok: 0, perWebSearch: 0 };
  const p = pricing[provider.model];
  if (!p) throw new PricingMissingError(provider.model);
  return p;
}

export function costUsd(price: ModelPrice, usage: Usage): number {
  const tokens = (usage.inputTokens * price.inputPerMTok + usage.outputTokens * price.outputPerMTok) / 1_000_000;
  return tokens + (usage.webSearches ?? 0) * (price.perWebSearch ?? 0);
}

/** Estimativa conservadora antes da chamada (≈ 4 caracteres por token; saída no teto). */
export function estimateCostUsd(price: ModelPrice, req: CompletionRequest, expectedWebSearches = 0): number {
  const inputTokens = Math.ceil((req.system.length + req.user.length) / 4);
  return costUsd(price, { inputTokens, outputTokens: req.maxOutputTokens, webSearches: req.enableWebSearch ? expectedWebSearches : 0 });
}

export function parsePricing(json: string | undefined): PricingTable {
  if (!json || !json.trim()) return {};
  const raw: unknown = JSON.parse(json);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("AI_PRICING_JSON deve ser um objeto");
  const out: PricingTable = {};
  for (const [model, v] of Object.entries(raw as Record<string, unknown>)) {
    const p = v as Partial<ModelPrice>;
    const nums = [p.inputPerMTok, p.outputPerMTok, p.perWebSearch ?? 0];
    if (nums.some((n) => typeof n !== "number" || !Number.isFinite(n) || n < 0)) {
      throw new Error(`preço inválido para "${model}"`);
    }
    out[model] = { inputPerMTok: p.inputPerMTok as number, outputPerMTok: p.outputPerMTok as number, perWebSearch: p.perWebSearch ?? 0 };
  }
  return out;
}

/** Provedor de testes: devolve respostas roteirizadas por função do agente. */
export class FakeProvider implements LLMProvider {
  readonly name = "fake";
  readonly model = "fake-model";
  readonly isFake = true;
  readonly calls: CompletionRequest[] = [];
  private readonly script: Array<string | ((req: CompletionRequest) => string)>;

  constructor(script: Array<string | ((req: CompletionRequest) => string)>) {
    this.script = [...script];
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.calls.push(req);
    const next = this.script.shift();
    if (next === undefined) throw new Error("FakeProvider: roteiro esgotado");
    const text = typeof next === "function" ? next(req) : next;
    return { text, model: this.model, usage: { inputTokens: Math.ceil((req.system.length + req.user.length) / 4), outputTokens: Math.ceil(text.length / 4) } };
  }
}
