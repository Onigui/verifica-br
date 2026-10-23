# Arquitetura mínima (aprovada em 22/10/2026 — D2)

Estado: `packages/core`, `packages/ai`, `packages/db`, `apps/worker` (Etapa 1) e o painel em `apps/web`
(Etapa 3) implementados. Páginas públicas e carrossel: Etapa 4.

Objetivo: o menor conjunto de peças que cumpre o MVP e pode crescer até os "engines" do
Documento Mestre **sem reescrita** — a lógica de domínio fica em pacotes TypeScript puros,
independentes de framework e de hospedagem.

## Visão geral

```
                ┌──────────────────────────── apps/web (Next.js) ─────────────────────────────┐
 Revisor ──────►│ /admin  (login próprio)   cadastro, evidências, revisão, exportar carrossel │
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
                 │ packages/db (SQL + postgres)│◄─────│ apps/worker (Node CLI)       │
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
| Banco | Postgres + migrations em SQL puro + driver `postgres` (A4) | Regras críticas (imutabilidade, auditoria) ficam em triggers; sem binários nativos | Mesmo schema em qualquer Postgres (Supabase ou outro) |
| Auth | Login próprio do painel (A5): usuários em `ADMIN_USERS` com hash scrypt, sessão em cookie assinado (HMAC, 12 h) | Equipe pequena; não depende de serviço externo | Supabase Auth ou outro provedor quando houver mais pessoas e papéis |
| Execução de agentes | Tabela `jobs` + `apps/worker` disparado por GitHub Actions (`worker.yml`: a cada 15 min e manual; aplica migrations pendentes antes) | Investigação leva minutos; não depende do PC ligado | Worker dedicado (Render/Railway) ou fila Redis quando o volume justificar |
| IA | `LLMProvider` + adaptador Gemini (faixa gratuita, REST); provedor falso para testes | Custo zero para começar; troca de fornecedor sem tocar no domínio | Anthropic ou outro adaptador pago quando houver orçamento |
| Busca de evidências | Ferramenta de busca do provedor de IA + **verificador de citações** próprio | Evita citações inventadas | Google Fact Check API, fontes cadastradas |
| Carrossel | HTML → JPEG renderizado no servidor (Playwright ou `@vercel/og`) | Instagram aceita só JPEG; sem imagens geradas por IA | Publicação via API oficial |
| CI | GitHub Actions: lint, typecheck, testes com Postgres real, secretlint, migrations em banco limpo | Grátis para repositório público | Deploy de preview |

Fora do MVP: n8n, Redis, NestJS separado, Storage de mídia (carrossel é gerado sob demanda).

## Modelo de dados (MVP)

Fonte da verdade: `packages/db/migrations/`. Resumo, derivado do modelo conceitual do Documento Mestre:

- `claims` — `original_text` (imutável), `normalized_text`, `attributed_to`, `original_source_url`,
  `source_platform`, `stated_at`, `topic`, `claim_type`, `risk_level`, `status`.
- `sources` — `url` (única), `publisher`, `source_type`, `reliability_notes`.
- `evidence` — `claim_id`, `source_id`, `excerpt`, `accessed_at`, `data_period`, `stance`
  (`supports|contradicts|context`), `limitations`, `citation_check` (`pending|ok|failed|unsupported`), `added_by` (`human|agent_run_id`).
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

Regras garantidas pelo próprio banco (valem mesmo para SQL direto):

- `verdict_versions`, `reviews`, `corrections`, `agent_runs` e `audit_logs` são somente-inserção;
- `claims.original_text` é imutável e alegações não são apagadas;
- `reviews.reviewer_type` só aceita `human`;
- toda mudança de status ou risco de alegação gera `audit_logs` com o ator da transação
  (`app.actor_type` / `app.actor_id`).

## Fluxo do worker

`investigate` (job) → checa kill switch e limite de investigações por alegação → investigador
(com orçamento checado antes) → verificador de citações em cada evidência → auditor (vê o status
das citações) → versão proposta só com evidências confirmadas → `awaiting_review`.
Falha do provedor devolve a alegação a `draft` e o job é tentado de novo; falta de orçamento
encerra sem nova tentativa; kill switch ou provedor não configurado devolvem o job à fila intacto.

## Ambientes e segredos

`local` (Docker Postgres, provedor falso) → `staging` → `production`. Segredos só em variáveis de
ambiente do provedor de hospedagem e em GitHub Secrets; `.env.example` sem valores.

## Controles de custo

Limite por investigação e orçamento mensal verificados **antes** de cada chamada (padrão 0 =
nenhum gasto real permitido); máximo de investigações automáticas por alegação
(`max_agent_rounds_per_investigation`, padrão 2); nenhuma execução em laço sem limite; custo
gravado em `agent_runs`. Preços vêm de `AI_PRICING_JSON`, copiados da página oficial — sem preço
configurado, provedor real é recusado. Além disso, limite de gasto no painel do fornecedor.
