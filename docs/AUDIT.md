# Auditoria do estado atual — 20/10/2026

Fotografia verificada nesta data. Não atualizar retroativamente; criar nova seção se refeita.

## Repositório `Onigui/verifica-br`

| Item | Estado verificado |
|---|---|
| Conteúdo | **Vazio** — nenhum commit, arquivo, branch, teste ou CI (clone retornou repositório vazio) |
| Criado em | 08/10/2026, público, sem licença, sem descrição |
| Issues / PRs | 0 / 0 |
| Secrets do Actions | Não verificável por este ambiente (acesso bloqueado pelo proxy) |

Consequência: não há nada a reaproveitar nem a migrar. Tudo do MVP precisa ser construído.

## Contas e serviços já existentes (verificação somente leitura)

| Serviço | O que existe | Relevância |
|---|---|---|
| Supabase | Org "banco de dados liga": 1 projeto **ativo** (Liga do Bem) e 1 **pausado**, ambos `sa-east-1` | Plano gratuito permite 2 projetos ativos; criar um projeto VerificaBR pode exigir manter o outro pausado — **a confirmar** no painel |
| Vercel | Time `oniguis-projects` com 4 projetos (Liga do Bem, sof-web1) | Plano não verificado; Hobby é restrito a uso não comercial |
| Render | Workspace com 3 serviços no plano free (sof-web, famesp) | Free hiberna sem tráfego; não serve para worker contínuo |
| GitHub Actions | Repositório público | Pode executar rotinas agendadas/sob demanda sem PC ligado |
| Anthropic API | **Nenhuma chave/conta de API verificada** | Claude Pro **não** inclui API (ver LEGAL-COMPLIANCE) |
| Meta / Instagram | **Nenhuma conta, app ou permissão verificada** | Publicação via API não pode ser assumida |
| Domínio | Nenhum verificado | — |

Nenhum serviço foi criado, alterado ou contratado nesta auditoria.

## Ferramentas no ambiente de desenvolvimento (verificadas)

Node 22.22, npm 10.9, pnpm 10.28, Docker 29.9, psql 16.15 — suficientes para desenvolver
e testar localmente com Postgres em contêiner, sem depender de serviços pagos.

## Ferramentas de desenvolvimento vs. serviços de produção

| Desenvolvimento (não roda o produto) | Produção (precisa existir separadamente) |
|---|---|
| Claude (assinatura) como agente de engenharia | Chave própria da Anthropic API com limite de gasto |
| Ambiente local / sessões de IA | Banco Postgres hospedado, hospedagem web, executor de rotinas |
| — | Conta profissional do Instagram (publicação manual no MVP) |
