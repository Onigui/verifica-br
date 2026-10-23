import type { CitationCheck } from "./domain.ts";

/**
 * Verificador de citações: confirma, sem IA, que o trecho citado existe na página da fonte.
 * Evidência de agente só segue para revisão com status "ok"; os demais ficam visíveis ao revisor.
 */

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** Extrai texto visível de HTML (suficiente para busca de trechos; não é um renderizador). */
export function htmlToText(html: string): string {
  const withoutHidden = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi, " ");
  const withBreaks = withoutHidden.replace(/<\/?(p|div|br|li|h[1-6]|tr|td|th|section|article)\b[^>]*>/gi, "\n");
  return decodeEntities(withBreaks.replace(/<[^>]+>/g, " "));
}

/** Normalização para comparar trechos: aspas, travessões, espaços e caixa. Preserva acentos. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201A\u2032`\u00B4]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033\u00AB\u00BB]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u00AD\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    // Tags inline viram espaço na extração ("<b>7%</b>," -> "7% ,"); une a pontuação de volta.
    .replace(/ ([,.;:!?)\]])/g, "$1")
    .replace(/([([]) /g, "$1")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export const MIN_EXCERPT_CHARS = 20;

export function excerptFound(pageText: string, excerpt: string): boolean {
  const e = normalizeForMatch(excerpt);
  if (e.length < MIN_EXCERPT_CHARS) return false;
  return normalizeForMatch(pageText).includes(e);
}

/** Bloqueia destinos que não devem ser buscados a partir de URLs sugeridas por IA (SSRF). */
export function isFetchableUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split(".").map(Number) as [number, number];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) {
      return false;
    }
  }
  if (host.includes(":")) return false; // IPv6 literal: recusado por simplicidade.
  return true;
}

export interface FetchedPage {
  status: number;
  contentType: string;
  body: string;
  finalUrl: string;
}

/** Abstração de rede para testes com fixtures. */
export type PageFetcher = (url: string) => Promise<FetchedPage>;

export interface CitationResult {
  status: CitationCheck;
  detail: string;
  finalUrl?: string;
}

export async function verifyCitation(url: string, excerpt: string, fetchPage: PageFetcher): Promise<CitationResult> {
  if (!isFetchableUrl(url)) return { status: "failed", detail: "URL inválida ou não permitida" };
  if (normalizeForMatch(excerpt).length < MIN_EXCERPT_CHARS) {
    return { status: "failed", detail: `trecho com menos de ${MIN_EXCERPT_CHARS} caracteres` };
  }
  let page: FetchedPage;
  try {
    page = await fetchPage(url);
  } catch (err) {
    return { status: "failed", detail: `falha ao baixar: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (page.status < 200 || page.status >= 300) {
    return { status: "failed", detail: `HTTP ${page.status}`, finalUrl: page.finalUrl };
  }
  const type = page.contentType.toLowerCase();
  let text: string;
  if (type.includes("html")) text = htmlToText(page.body);
  else if (type.startsWith("text/") || type.includes("json")) text = page.body;
  else return { status: "unsupported", detail: `tipo não suportado: ${type || "desconhecido"}`, finalUrl: page.finalUrl };

  return excerptFound(text, excerpt)
    ? { status: "ok", detail: "trecho encontrado na página", finalUrl: page.finalUrl }
    : { status: "failed", detail: "trecho não encontrado na página", finalUrl: page.finalUrl };
}

/** Fetcher real com tempo limite e teto de tamanho. Redirecionamentos são revalidados. */
export function createHttpFetcher(opts: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number } = {}): PageFetcher {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxBytes = opts.maxBytes ?? 5_000_000;
  const maxRedirects = opts.maxRedirects ?? 5;
  return async (startUrl) => {
    let url = startUrl;
    for (let i = 0; i <= maxRedirects; i++) {
      if (!isFetchableUrl(url)) throw new Error("redirecionamento para destino não permitido");
      const res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": "VerificaBR-citation-check/0.1", accept: "text/html,text/plain;q=0.9,*/*;q=0.1" },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = new URL(res.headers.get("location") as string, url).toString();
        continue;
      }
      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new Error("página excede o tamanho máximo");
        }
        chunks.push(value);
      }
      const body = new TextDecoder("utf-8").decode(Buffer.concat(chunks));
      return { status: res.status, contentType: res.headers.get("content-type") ?? "", body, finalUrl: url };
    }
    throw new Error("redirecionamentos demais");
  };
}
