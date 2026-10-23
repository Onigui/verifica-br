# Plano de implementação

Cada tarefa = uma branch + um PR pequeno, com testes. Tamanho: P (≤ meio dia), M (≤ 1 dia).
Não avançar de etapa sem cumprir os critérios em [PRODUCT.md](PRODUCT.md).

## Etapa 1 — Fundação (local + CI, sem serviços externos) — implementada em 22/10/2026

| # | Tarefa | Estado |
|---|---|---|
| 1.1 | Monorepo pnpm, TypeScript estrito, ESLint, Vitest, `.gitignore`, `.env.example` | feito |
| 1.2 | CI no GitHub Actions: install, lint, typecheck, test com Postgres, secretlint, migrations | feito (CI verde em 22/10/2026) |
| 1.3 | `packages/db`: migrations SQL, triggers de imutabilidade e auditoria, `docker-compose` | feito |
| 1.4 | `packages/core`: estados, risco, `settings` (kill switch, auto-publish off), orçamento | feito |
| 1.5 | Verificador de citações com fixtures e proteção contra URLs internas | feito |
| 1.6 | `packages/ai`: `LLMProvider`, provedor falso, contratos zod, prompts v1, custos | feito |
| 1.7 | `apps/worker`: fila com SKIP LOCKED, tentativas limitadas, orçamento, pausa | feito |

**Saída:** critérios 1–9 da Etapa 1 cumpridos localmente e no CI do GitHub.

## Etapa 2 — Integrações reais (após D3–D5)

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
