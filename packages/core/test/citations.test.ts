import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { excerptFound, htmlToText, isFetchableUrl, verifyCitation, type FetchedPage, type PageFetcher } from "../src/index.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

function fakeFetcher(pages: Record<string, Partial<FetchedPage>>): PageFetcher {
  return async (url) => {
    const p = pages[url];
    if (!p) throw new Error("ECONNREFUSED");
    return { status: 200, contentType: "text/html; charset=utf-8", body: "", finalUrl: url, ...p };
  };
}

const URL_OK = "https://exemplo.gov.br/nota";
const fetcher = fakeFetcher({
  [URL_OK]: { body: fixture("nota-ficticia.html") },
  "https://exemplo.gov.br/texto": { body: fixture("plain.txt"), contentType: "text/plain" },
  "https://exemplo.gov.br/pdf": { body: "%PDF-1.7", contentType: "application/pdf" },
  "https://exemplo.gov.br/404": { status: 404 },
});

describe("verificador de citações", () => {
  it("aceita trecho presente, mesmo com tags, entidades e quebras de linha no meio", async () => {
    const r = await verifyCitation(URL_OK, 'a taxa de desocupação foi estimada em 7,1%, segundo a pesquisa amostral "de referência" - recuo', fetcher);
    expect(r.status).toBe("ok");
  });

  it("rejeita trecho com número alterado", async () => {
    const r = await verifyCitation(URL_OK, "a taxa de desocupação foi estimada em 6,1%, segundo a pesquisa", fetcher);
    expect(r).toMatchObject({ status: "failed", detail: "trecho não encontrado na página" });
  });

  it("ignora texto escondido em script e comentários", async () => {
    expect((await verifyCitation(URL_OK, "a taxa de desocupação foi de 99%", fetcher)).status).toBe("failed");
    expect((await verifyCitation(URL_OK, "a taxa de desocupação foi de 50%", fetcher)).status).toBe("failed");
  });

  it("não aceita trecho curto demais para ser significativo", async () => {
    expect((await verifyCitation(URL_OK, "7,1%", fetcher)).status).toBe("failed");
  });

  it("aceita texto puro", async () => {
    const r = await verifyCitation("https://exemplo.gov.br/texto", "orcamento aprovado foi de R$ 10 milhoes", fetcher);
    expect(r.status).toBe("ok");
  });

  it("marca PDF como não suportado (vai para o revisor)", async () => {
    expect((await verifyCitation("https://exemplo.gov.br/pdf", "qualquer trecho com tamanho suficiente", fetcher)).status).toBe("unsupported");
  });

  it("falha em HTTP de erro e em erro de rede", async () => {
    expect((await verifyCitation("https://exemplo.gov.br/404", "qualquer trecho com tamanho suficiente", fetcher)).detail).toBe("HTTP 404");
    expect((await verifyCitation("https://fora.gov.br/x", "qualquer trecho com tamanho suficiente", fetcher)).detail).toMatch(/falha ao baixar/);
  });

  it("recusa URLs internas ou não-HTTP sem tentar baixar", async () => {
    for (const u of ["http://localhost/a", "http://127.0.0.1/a", "http://10.1.2.3/", "http://192.168.0.1/", "http://169.254.169.254/latest", "file:///etc/passwd", "https://user:pw@site.com/", "http://[::1]/"]) {
      expect(isFetchableUrl(u), u).toBe(false);
    }
    expect(isFetchableUrl("https://www.tse.jus.br/")).toBe(true);
  });

  it("htmlToText remove estilos e mantém conteúdo", () => {
    const t = htmlToText(fixture("nota-ficticia.html"));
    expect(t).not.toContain("color:red");
    expect(t).toContain("margem de erro");
    expect(excerptFound(t, "não são comparáveis com séries anteriores a 2012")).toBe(true);
  });
});
