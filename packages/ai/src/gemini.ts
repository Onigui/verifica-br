import type { CompletionRequest, CompletionResult, LLMProvider } from "./provider.ts";

/**
 * Adaptador da Gemini API (Google AI Studio), via REST.
 * Referência: https://ai.google.dev/gemini-api/docs/generate-content/text-generation
 *
 * Observações:
 * - A busca na web (Grounding with Google Search) não está disponível na faixa gratuita;
 *   `enableWebSearch` é ignorado aqui. As evidências vêm do cadastro humano e do verificador de citações.
 * - Na faixa gratuita, o conteúdo enviado pode ser usado pelo Google para melhorar produtos
 *   (ver docs/LEGAL-COMPLIANCE.md). Não enviar dados pessoais não públicos.
 */

export class ProviderHttpError extends Error {
  constructor(readonly status: number, message: string, readonly retryable: boolean) {
    super(message);
  }
}

export interface GeminiOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Para testes: substitui o fetch global. */
  fetchImpl?: typeof fetch;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> }; finishReason?: string }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  modelVersion?: string;
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
}

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  readonly isFake = false;
  readonly model: string;
  private readonly opts: Required<Omit<GeminiOptions, "fetchImpl">> & { fetchImpl: typeof fetch };

  constructor(opts: GeminiOptions) {
    if (!opts.apiKey) throw new Error("GEMINI_API_KEY ausente");
    if (!/^[a-z0-9.-]+$/i.test(opts.model)) throw new Error(`modelo inválido: ${opts.model}`);
    this.model = opts.model;
    this.opts = {
      apiKey: opts.apiKey,
      model: opts.model,
      baseUrl: opts.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta",
      timeoutMs: opts.timeoutMs ?? 120_000,
      fetchImpl: opts.fetchImpl ?? fetch,
    };
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const res = await this.opts.fetchImpl(`${this.opts.baseUrl}/models/${this.model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.opts.apiKey },
      signal: AbortSignal.timeout(this.opts.timeoutMs),
      body: JSON.stringify({
        system_instruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: req.user }] }],
        generationConfig: { maxOutputTokens: req.maxOutputTokens, temperature: 0.2 },
      }),
    });

    let data: GeminiResponse;
    try {
      data = (await res.json()) as GeminiResponse;
    } catch {
      throw new ProviderHttpError(res.status, `resposta não-JSON (HTTP ${res.status})`, res.status >= 500);
    }
    if (!res.ok) {
      // 429 (cota) e 5xx podem dar certo mais tarde; 4xx restantes são erro de configuração/pedido.
      const retryable = res.status === 429 || res.status >= 500;
      // Nunca incluir a chave na mensagem.
      throw new ProviderHttpError(res.status, `Gemini HTTP ${res.status}: ${data.error?.status ?? ""} ${data.error?.message ?? ""}`.trim(), retryable);
    }
    if (data.promptFeedback?.blockReason) {
      throw new ProviderHttpError(200, `pedido bloqueado pelo provedor: ${data.promptFeedback.blockReason}`, false);
    }

    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts ?? []).filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("");
    if (!text) throw new ProviderHttpError(200, `resposta vazia (finishReason: ${candidate?.finishReason ?? "?"})`, true);

    const u = data.usageMetadata ?? {};
    return {
      text,
      model: data.modelVersion ?? this.model,
      // Tokens de "raciocínio" são cobrados como saída nos planos pagos; contamos junto.
      usage: { inputTokens: u.promptTokenCount ?? 0, outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0), webSearches: 0 },
    };
  }
}
