# Arquitetura mínima (proposta — aguarda aprovação D2/D3)

Objetivo: o menor conjunto de peças que cumpre o MVP e pode crescer até os "engines" do
Documento Mestre **sem reescrita** — a lógica de domínio fica em pacotes TypeScript puros,
independentes de framework e de hospedagem.

## Visão geral

```
                ┌──────────────────────────── apps/web (Next.js) ─────────────────────────────┐
 Revisor ──────►│ /admin  (Supabase Auth)   cadastro, evidências, revisão, exportar carrossel │
 Público ──────►│ /       páginas de verificação, metodologia, correções, contato            │
                └───────────────┬─────────────────────────────────────────────────────────────┘
                                │ usa
                 ┌──────────────▼──────────────┐      ┌──────────────────────────────┐
                 │ packages/core               │      │ packages/ai                  │
                 │ estados, risco, versões,    │◄─────│ interface LLMProvider        │
                 │ validação (zod), auditoria  │      │ investigador, auditor        │
                 └──────────────┬──────────────┘      │ prompts versionados, custo   │
                                │                     └──────────────┬───────────────┘
                 ┌──────────────▼──────────────┐      ┌──────────────▼───────────────┐
                 │ packages/db (Prisma)        │◄─────│ apps/worker (Node CLI)       │
                 │ Postgres                    │      │ processa fila `jobs`         │
                 └─────────────────────────────┘      │ roda via GitHub Actions      │
                                                      └──────────────────────────────┘
```

## Escolhas e justificativa

| Área | MVP | Por quê | Evolução prevista |
|---|---|---|---|
| Monorepo | pnpm workspaces | Já instalado; isola domínio | — |
| Web pública + admin | **Um** app Next.js | Um deploy, uma autenticação | Separar admin se necessário |
| Backend | Route handlers do Next + `packages/core` | NestJS separado exigiria outro serviço hospedado agora | `packages/core` é importado por um NestJS futuro sem mudança |
| Banco | Postgres (Supabase) + Prisma | Stack já dominada; Postgres é portátil | Mesmo schema em qualquer Postgres |
| Auth | Supabase Auth, só para admin | Público não precisa de login | Papéis (revisor, editor) |
| Execução de agentes | Tabela `jobs` + `apps/worker` disparado por GitHub Actions (cron e manual) | Investigação leva minutos; não depende do PC ligado | Worker dedicado (Render/Railway) ou fila Redis quando o volume justificar |
| IA | `LLMProvider` + adaptador Anthropic API; provedor falso para testes | Troca de fornecedor sem tocar no domínio | Outros adaptadores |
| Busca de evidências | Ferramenta de busca do provedor de IA + **verificador de citações** próprio | Evita citações inventadas | Google Fact Check API, fontes cadastradas |
| Carrossel | HTML → JPEG renderizado no servidor (Playwright ou `@vercel/og`) | Instagram aceita só JPEG; sem imagens geradas por IA | Publicação via API oficial |
| CI | GitHub Actions: lint, typecheck, testes, varredura de segredos | Grátis para repositório público | Deploy de preview |

Fora do MVP: n8n, Redis, NestJS separado, Storage de mídia (carrossel é gerado sob demanda).

## Modelo de dados (MVP)

Derivado do modelo conceitual do Documento Mestre, com ajustes:

- `claims` — `original_text` (imutável), `normalized_text`, `attributed_to`, `original_source_url`,
  `source_platform`, `stated_at`, `topic`, `claim_type`, `risk_level`, `status`.
- `sources` — `url` (única), `publisher`, `source_type`, `reliability_notes`.
- `evidence` — `claim_id`, `source_id`, `excerpt`, `accessed_at`, `data_period`, `stance`
  (`supports|contradicts|context`), `limitations`, `citation_check` (`ok|failed|pending`), `added_by` (`human|agent_run_id`).
- `investigations` — execução por alegação, `methodology_version`, status, erros.
- `agent_runs` — `role`, `provider`, `model`, `prompt_version`, tokens, `cost_estimate_usd`, entrada/saída (JSON).
- `verdict_versions` — `claim_id`, `version`, `verdict`, `robustness`, `rationale`, `limitations`,
  `evidence_ids[]`, `created_by`. **Somente inserção**; aprovação via `reviews`.
- `reviews` — `verdict_version_id`, `reviewer_id`, `decision`, `comments`.
- `posts` — `verdict_version_id`, `channel`, `caption`, `status`, `published_at`, `external_url`.
- `corrections` — `claim_id`, `previous_version_id`, `new_version_id`, `public_explanation`.
- `audit_logs` — ator, ação, entidade, metadados.
- `jobs` — fila simples (`type`, `payload`, `status`, `attempts`, `max_attempts`, `locked_at`).
- `settings` — `kill_switch`, `auto_publish_enabled=false`, `max_cost_per_investigation_usd`, `monthly_budget_usd`.

Regras no banco: `verdict_versions` sem UPDATE/DELETE (trigger), `UNIQUE(claim_id, version)`.

## Ambientes e segredos

`local` (Docker Postgres, provedor falso) → `staging` → `production`. Segredos só em variáveis de
ambiente do provedor de hospedagem e em GitHub Secrets; `.env.example` sem valores.

## Controles de custo

Limite por investigação e orçamento mensal verificados **antes** de cada chamada; número máximo
de rodadas por agente; nenhuma execução em laço sem limite; custo gravado em `agent_runs`.
Além disso, limite de gasto configurado no painel do fornecedor da API.
