# Plano de implementação

Cada tarefa = uma branch + um PR pequeno, com testes. Tamanho: P (≤ meio dia), M (≤ 1 dia).
Não avançar de etapa sem cumprir os critérios em [PRODUCT.md](PRODUCT.md).

## Etapa 1 — Fundação (local + CI, sem serviços externos)

| # | Tarefa | Tam. |
|---|---|---|
| 1.1 | Monorepo pnpm, TypeScript estrito, ESLint, Vitest, `.gitignore`, `.env.example` | P |
| 1.2 | CI no GitHub Actions: install, lint, typecheck, test, varredura de segredos (gitleaks) | P |
| 1.3 | `packages/db`: schema Prisma + migrations + trigger de imutabilidade; `docker-compose` com Postgres | M |
| 1.4 | `packages/core`: máquina de estados, regras de risco, versões de veredito, `settings` (kill switch, auto-publish off), audit log | M |
| 1.5 | Verificador de citações (download, extração de texto, busca normalizada do trecho) com fixtures | M |
| 1.6 | `packages/ai`: interface `LLMProvider`, provedor falso, contratos de saída (zod) do investigador e do auditor, prompts v1 | M |
| 1.7 | `apps/worker`: fila `jobs` com travamento, tentativas limitadas, checagem de orçamento | M |

**Saída:** critérios 1–9 da Etapa 1 cumpridos e demonstrados no CI.

## Etapa 2 — Integrações reais (após D2–D5)

| # | Tarefa | Tam. |
|---|---|---|
| 2.1 | Adaptador Anthropic API + busca na web; teste real com 3 alegações de baixo risco | M |
| 2.2 | Projeto de banco hospedado (staging), migrations, backup via Actions | P |
| 2.3 | Workflow do Actions que executa o worker (cron + manual) | P |

## Etapa 3 — Admin e revisão

| # | Tarefa | Tam. |
|---|---|---|
| 3.1 | Next.js + Supabase Auth (somente admin) | P |
| 3.2 | Cadastro de alegação e evidências | M |
| 3.3 | Tela de investigação: lado a lado investigador × auditor, status das citações | M |
| 3.4 | Revisão: aprovar / devolver / rejeitar, nova versão, correção | M |

## Etapa 4 — Saída pública

| # | Tarefa | Tam. |
|---|---|---|
| 4.1 | Página pública por verificação + metodologia, correções, sobre, contato | M |
| 4.2 | Geração de carrossel JPEG e legenda a partir da versão aprovada | M |
| 4.3 | Registro manual de publicação (link do post) | P |
| 4.4 | Deploy de staging, revisão completa, depois produção (com aprovação) | P |

**MVP concluído** quando os 18 critérios da seção 19 do Documento Mestre forem verificados,
incluindo pausa sem perda de dados e procedimento de correção.

## Depois do MVP

Ver "Fora do MVP" em [PRODUCT.md](PRODUCT.md). Prioridade sugerida: Google Fact Check API →
fontes cadastradas (Radar) → métricas → publicação via API do Instagram.
