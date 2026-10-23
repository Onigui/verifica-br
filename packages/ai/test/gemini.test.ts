import { describe, expect, it } from "vitest";
import { GeminiProvider, ProviderHttpError } from "../src/gemini.ts";
import { buildInvestigatorRequest, runInvestigator } from "../src/index.ts";
import { sampleInvestigatorOutput } from "../src/testing.ts";

type Call = { url: string; init: RequestInit };

function fakeFetch(status: number, body: unknown, calls: Call[] = []): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

const req = { system: "sistema", user: "pergunta", maxOutputTokens: 100 };

describe("adaptador Gemini (HTTP simulado)", () => {
  it("monta o pedido REST e lê texto e uso de tokens", async () => {
    const calls: Call[] = [];
    const p = new GeminiProvider({
      apiKey: "chave-de-teste", model: "gemini-3.8-flash",
      fetchImpl: fakeFetch(200, {
        candidates: [{ content: { parts: [{ text: "pensando", thought: true }, { text: '{"ok":' }, { text: "true}" }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 7, thoughtsTokenCount: 20 },
        modelVersion: "gemini-3.8-flash-001",
      }, calls),
    });
    const r = await p.complete(req);
    expect(r).toEqual({ text: '{"ok":true}', model: "gemini-3.8-flash-001", usage: { inputTokens: 50, outputTokens: 27, webSearches: 0 } });

    const call = calls[0]!;
    expect(call.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
    expect((call.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("chave-de-teste");
    const body = JSON.parse(String(call.init.body));
    expect(body.system_instruction.parts[0].text).toBe("sistema");
    expect(body.contents[0]).toEqual({ role: "user", parts: [{ text: "pergunta" }] });
    expect(body.generationConfig.maxOutputTokens).toBe(100);
  });

  it("429 e 5xx são erros com nova tentativa; 400 não; a chave nunca aparece na mensagem", async () => {
    for (const [status, retryable] of [[429, true], [503, true], [400, false], [403, false]] as const) {
      const p = new GeminiProvider({ apiKey: "segredo-123", model: "m", fetchImpl: fakeFetch(status, { error: { code: status, status: "X", message: "falhou" } }) });
      const err = await p.complete(req).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ProviderHttpError);
      expect((err as ProviderHttpError).retryable).toBe(retryable);
      expect((err as Error).message).not.toContain("segredo-123");
    }
  });

  it("resposta bloqueada ou vazia vira erro explícito", async () => {
    const blocked = new GeminiProvider({ apiKey: "k", model: "m", fetchImpl: fakeFetch(200, { promptFeedback: { blockReason: "SAFETY" } }) });
    await expect(blocked.complete(req)).rejects.toThrow(/bloqueado/);
    const empty = new GeminiProvider({ apiKey: "k", model: "m", fetchImpl: fakeFetch(200, { candidates: [{ finishReason: "MAX_TOKENS" }] }) });
    await expect(empty.complete(req)).rejects.toThrow(/MAX_TOKENS/);
  });

  it("recusa configuração inválida", () => {
    expect(() => new GeminiProvider({ apiKey: "", model: "m" })).toThrow(/GEMINI_API_KEY/);
    expect(() => new GeminiProvider({ apiKey: "k", model: "../x" })).toThrow(/modelo inválido/);
  });

  it("integra com o agente investigador; custo vem da tabela de preços (0 na faixa gratuita)", async () => {
    const p = new GeminiProvider({
      apiKey: "k", model: "gemini-3.8-flash",
      fetchImpl: fakeFetch(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(sampleInvestigatorOutput()) }] } }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 300 } }),
    });
    const r = await runInvestigator(p, buildInvestigatorRequest({ originalText: "x".repeat(10), attributedTo: "a", originalSourceUrl: "https://e.com" }, []), {
      "gemini-3.8-flash": { inputPerMTok: 0, outputPerMTok: 0 },
    });
    expect(r).toMatchObject({ status: "succeeded", costUsd: 0 });
  });
});
