# Operação

Como colocar e manter o VerificaBR rodando. Segredos **nunca** vão para o repositório nem para
mensagens: são colados direto nos painéis abaixo.

## Serviços

| Serviço | Uso | Conta / recurso |
|---|---|---|
| Supabase | Banco Postgres | org `onisensato`, projeto `verifica-br` (`sa-east-1`, gratuito) |
| Vercel | Painel web (`apps/web`) | conta nova, projeto `verifica-br` |
| GitHub Actions | CI (`ci.yml`) e worker agendado (`worker.yml`) | repositório `Onigui/verifica-br` |
| Google AI Studio | Gemini API (faixa gratuita) | chave a criar (D4) |

## Configuração (uma vez)

**1. String de conexão do banco** — Supabase → projeto `verifica-br` → *Connect* → *Transaction pooler*
(porta 6543). Substitua `[YOUR-PASSWORD]` pela senha do banco (em *Database settings* é possível redefini-la).

**2. GitHub** → *Settings → Secrets and variables → Actions*:

| Tipo | Nome | Valor |
|---|---|---|
| Secret | `DATABASE_URL` | string do passo 1 |
| Secret | `GEMINI_API_KEY` | chave do AI Studio |
| Variable | `AI_PRICING_JSON` | `{"gemini-3.8-flash":{"inputPerMTok":0,"outputPerMTok":0}}` |
| Variable (opcional) | `AI_MODEL` | `gemini-3.8-flash` |

**3. Vercel** → projeto `verifica-br`:

- *Settings → General*: Root Directory `apps/web` (framework Next.js; o pnpm é detectado pelo lockfile).
- *Settings → Environment Variables* (Production e Preview): `DATABASE_URL` (passo 1), `SESSION_SECRET`
  (`openssl rand -hex 32`) e `ADMIN_USERS` (gerado com `pnpm --filter @verifica-br/web hash-password`).

## Rotina

- O worker roda a cada 15 min (e manualmente em *Actions → Worker → Run workflow*). Antes de processar,
  aplica migrations pendentes.
- **Pausar tudo:** painel → Configurações → "Pausar o sistema". Jobs ficam na fila, nada se perde.
- **Gasto:** com a faixa gratuita, o custo registrado é 0. Ao trocar para um plano pago, atualize
  `AI_PRICING_JSON` com os preços oficiais e defina os limites em Configurações.
- Falhas do worker aparecem como execução vermelha em *Actions* (o GitHub avisa por e-mail).

## Banco e migrations

Migrations vivem em `packages/db/migrations/` e são aplicadas em ordem, uma única vez
(`schema_migrations`). Toda tabela nova precisa de RLS (o teste `supabase-hardening` falha se faltar).
Estado aplicado no Supabase em 23/10/2026: `0001_init`, `0002_block_public_api`, `0003_fk_indexes`.
