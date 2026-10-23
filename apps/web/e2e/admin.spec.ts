import { expect, test, type Page } from "@playwright/test";
import { E2E_USER } from "../playwright.config.ts";

const shots = process.env.E2E_SCREENSHOTS_DIR;
async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

async function login(page: Page, password = E2E_USER.password) {
  await page.goto("/login");
  await page.getByLabel("Usuário").fill(E2E_USER.id);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  if (password === E2E_USER.password) await page.waitForURL(/\/admin$/);
  else await page.waitForURL(/\/login\?error=/);
}

// Mensagens das ações (o Next também injeta um "alert" vazio de acessibilidade; filtramos pela classe).
const okFlash = (page: Page) => page.locator(".flash.ok");
const errFlash = (page: Page) => page.locator(".flash.error");
const openDetails = (page: Page, text: string) => page.locator("summary", { hasText: text }).click();

async function createClaim(page: Page, text: string, flags: string[] = []) {
  await page.goto("/admin/claims/new");
  await page.getByLabel("Texto original da alegação").fill(text);
  await page.getByLabel("Atribuída a").fill("Pessoa fictícia");
  await page.getByLabel("URL da fonte original").fill("https://example.com/declaracao");
  for (const f of flags) await page.getByLabel(f).check();
  await page.getByRole("button", { name: "Registrar alegação" }).click();
  await expect(okFlash(page)).toHaveText("Alegação registrada.");
}

test("painel exige login e recusa senha errada", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login$/);
  await login(page, "senha-errada-qualquer");
  await expect(errFlash(page)).toHaveText("Usuário ou senha inválidos.");
  // Cookie forjado não abre o painel.
  await page.context().addCookies([{ name: "vbr_session", value: "abc.def", url: "http://localhost:3100" }]);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login$/);
});

test("fluxo editorial completo com revisão humana, publicação manual, suspensão e correção", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "Alegações" })).toBeVisible();

  // Alegação A: vai para a fila automática; veredito manual fica bloqueado enquanto isso.
  await createClaim(page, "Alegação A de teste: o índice subiu 20% em um ano.");
  await page.getByRole("button", { name: "Enfileirar investigação" }).click();
  await expect(okFlash(page)).toHaveText("Investigação colocada na fila do worker.");
  await expect(page.getByText("Na fila (queued)")).toBeVisible();

  // Alegação B: risco alto, montada por humanos.
  await createClaim(page, "Alegação B de teste: o programa atendeu 2 milhões de famílias.", ["Envolve candidato(a) ou agente público"]);
  await expect(page.getByText("Risco alto")).toBeVisible();
  await expect(page.getByText("Rascunho", { exact: true })).toBeVisible();

  await openDetails(page, "Adicionar evidência");
  await page.getByLabel("URL da fonte").fill("https://example.com/relatorio");
  await page.getByLabel("Instituição ou autor").fill("Órgão fictício");
  await page.getByLabel("Trecho literal da página (será conferido automaticamente)").fill("foram atendidas 1,4 milhão de famílias no exercício");
  await page.getByRole("button", { name: "Adicionar evidência" }).click();
  await expect(okFlash(page)).toContainText("Evidência registrada.");
  // Trecho inexistente na página (ou rede indisponível): nunca é marcado como confirmado.
  await expect(page.getByText("Citação: não confirmada")).toBeVisible();
  await shot(page, "01-alegacao-com-evidencia");

  await openDetails(page, "Propor veredito com as evidências registradas");
  await page.getByLabel("Veredito").selectOption("false");
  await page.getByLabel("Resumo da conclusão").fill("O relatório oficial informa 1,4 milhão de famílias, não 2 milhões.");
  await page.getByLabel("Justificativa").fill("O número citado não aparece em nenhuma fonte oficial; o relatório do exercício indica 1,4 milhão.");
  await page.locator('input[name="evidenceIds"]').first().check();
  await page.getByRole("button", { name: "Enviar para revisão" }).click();
  await expect(okFlash(page)).toHaveText("Versão 1 criada e enviada para revisão.");
  await expect(page.getByRole("heading", { name: "Revisão humana — versão 1" })).toBeVisible();
  await expect(page.getByText("1 sem citação confirmada")).toBeVisible();
  await shot(page, "02-revisao");

  // Rejeitar sem comentário é recusado.
  await page.getByLabel("Rejeitar (não será verificada)").check();
  await page.getByLabel("Conferi as evidências e as fontes citadas nesta versão.").check();
  await page.getByRole("button", { name: "Registrar decisão" }).click();
  await expect(errFlash(page)).toHaveText("explique o motivo ao devolver ou rejeitar");

  await page.getByLabel("Aprovar esta versão").check();
  await page.getByLabel("Conferi as evidências e as fontes citadas nesta versão.").check();
  await page.getByRole("button", { name: "Registrar decisão" }).click();
  await expect(okFlash(page)).toHaveText("Versão aprovada.");
  await expect(page.getByText("Aprovada", { exact: true })).toBeVisible();

  await page.getByLabel("Link da publicação").fill("https://www.instagram.com/p/exemplo/");
  await page.getByRole("button", { name: "Registrar publicação" }).click();
  await expect(okFlash(page)).toHaveText("Publicação registrada.");

  await page.getByLabel("Motivo", { exact: true }).fill("Nova informação do órgão em análise");
  await page.getByRole("button", { name: "Suspender publicação" }).click();
  await expect(okFlash(page)).toHaveText("Publicação suspensa.");

  await openDetails(page, "Abrir correção (nova versão, volta para revisão)");
  await page.getByLabel("Motivo interno").fill("Órgão publicou revisão da série");
  await page.getByLabel("Explicação pública da correção").fill("O órgão revisou o número para 1,6 milhão; o veredito foi atualizado.");
  await page.getByLabel("Veredito").selectOption("partly_true");
  await page.getByRole("button", { name: "Abrir correção" }).click();
  await expect(okFlash(page)).toHaveText("Correção aberta: versão 2 aguardando revisão.");
  await expect(page.getByRole("heading", { name: "Revisão humana — versão 2" })).toBeVisible();

  // A versão 1 continua no histórico com a aprovação original.
  await expect(page.getByText("Aprovou por revisora")).toBeVisible();
  await expect(page.getByText("publication.suspended")).toBeVisible();
  await shot(page, "03-correcao-e-historico");

  await page.goto("/admin");
  await expect(page.getByRole("link", { name: /Alegação B de teste/ })).toBeVisible();
  await shot(page, "04-lista");
});

test("pausa geral aparece no painel e pode ser desligada", async ({ page }) => {
  await login(page);
  await page.goto("/admin/settings");
  await page.getByLabel(/Pausar o sistema/).check();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(okFlash(page)).toHaveText("Configurações salvas.");
  await expect(page.getByText("Sistema pausado")).toBeVisible();
  await expect(page.getByText("Publicação automática: desativada")).toBeVisible();
  await shot(page, "05-configuracoes");
  await page.getByLabel(/Pausar o sistema/).uncheck();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Sistema pausado")).toHaveCount(0);
  await page.getByRole("button", { name: "Sair" }).click();
  await page.waitForURL(/\/login$/);
  expect((await page.context().cookies()).find((c) => c.name === "vbr_session")).toBeUndefined();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login$/);
});

test("painel utilizável no celular @mobile", async ({ page }) => {
  await login(page);
  await page.goto("/admin/claims/new");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await shot(page, "06-mobile-nova-alegacao");
});
