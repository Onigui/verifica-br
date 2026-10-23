# VerificaBR

Plataforma independente de investigação e verificação de alegações públicas,
baseada em evidências rastreáveis, auditoria adversarial e revisão humana.

> **Estado:** Etapas 1 e 3 implementadas — domínio, banco, agentes com provedor falso, worker e
> painel de revisão. Sem provedor de IA real, sem páginas públicas, sem deploy e sem publicação.

**Princípio central:** não basta uma IA dizer que algo é verdadeiro ou falso — é preciso
mostrar como a conclusão foi alcançada.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `packages/core` | Domínio puro: vereditos, risco, fluxo de status, orçamento, verificador de citações |
| `packages/ai` | Interface `LLMProvider`, provedor falso, contratos de saída, prompts versionados, custos |
| `packages/db` | Migrations SQL (com triggers de imutabilidade e auditoria), repositórios, fila de jobs |
| `apps/worker` | Processa a fila: investigador → citações → auditor → aguardando revisão humana |
| `apps/web` | Painel (Next.js): cadastro, evidências, investigação, revisão, publicação manual, correções |

## Desenvolvimento

Requisitos: Node 22+, pnpm 10, Postgres 16 (`docker compose up -d` ou instalação local).

```bash
pnpm install
cp .env.example .env            # ajuste as URLs do banco
pnpm db:migrate                 # aplica migrations em DATABASE_URL
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm check

# Painel: defina ADMIN_USERS e SESSION_SECRET no .env (veja .env.example)
pnpm --filter @verifica-br/web hash-password   # gera o hash da sua senha
pnpm --filter @verifica-br/web dev             # http://localhost:3000/admin

# Teste ponta a ponta (recria o banco *_e2e indicado)
pnpm build && E2E_DATABASE_URL=postgres://postgres:postgres@localhost:5432/vbr_e2e pnpm e2e
```

Sem `TEST_DATABASE_URL`, os testes de banco são pulados localmente; no CI eles são obrigatórios.

## Documentação

Cada arquivo tem uma função única. Decisões aprovadas vivem **apenas** em `DECISIONS.md`.

| Arquivo | Função |
|---|---|
| [docs/AUDIT.md](docs/AUDIT.md) | Diagnóstico do estado real (repositório, contas, ferramentas) em 20/10/2026 |
| [docs/PRODUCT.md](docs/PRODUCT.md) | Escopo do MVP, o que fica para depois, critérios de aceitação |
| [docs/METHODOLOGY.md](docs/METHODOLOGY.md) | Vereditos, matriz de risco das alegações, fluxo editorial |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitetura, modelo de dados, fluxo do worker, controles de custo |
| [docs/LEGAL-COMPLIANCE.md](docs/LEGAL-COMPLIANCE.md) | Regras eleitorais, LGPD e plataformas — com fontes |
| [docs/RISKS.md](docs/RISKS.md) | Riscos editoriais, jurídicos, técnicos, operacionais e financeiros |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Plano de implementação em tarefas pequenas e seu estado |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Registro canônico de decisões (pendentes e aprovadas) |

O Documento Mestre (v1.0) é a especificação de origem; estes arquivos registram o que
foi decidido a partir dele, sem copiá-lo.

## Regras de trabalho no repositório

- Trabalho em branches; `main` só recebe merge aprovado.
- Nenhum segredo no código (`.env` fica fora do Git; secretlint no CI).
- Nenhuma integração é declarada funcionando sem teste real.
- Publicação automática desativada por padrão.
