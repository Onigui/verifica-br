# Produto e escopo

## Realidade do prazo (20/10 → 2º turno em 25/10/2026)

- O repositório está vazio; restam ~5 dias.
- A Res. TSE 23.610 (alterada pela 23.755/2026, art. 9º-B §3º-A) veda publicar **novos conteúdos
  produzidos ou alterados por IA** que usem imagem, voz ou manifestação de candidato ou pessoa
  pública entre **72 h antes e 24 h após** o pleito — na prática, de 22/10 até 26/10.
  Ver [LEGAL-COMPLIANCE.md](LEGAL-COMPLIANCE.md).
- Uma conta nova de Instagram não tem audiência nem histórico editorial.

**Recomendação:** usar a semana para construir e operar o fluxo **em modo interno** (sem publicar),
verificando alegações reais do 2º turno como piloto, e iniciar publicações somente após a
janela de vedação e com parecer jurídico. Decisão D1 em [DECISIONS.md](DECISIONS.md).

## MVP — indispensável

Fluxo semiautomatizado, alimentado manualmente, com uma pessoa revisora:

1. **Cadastro manual de alegação** com texto original, autoria, data, URL da fonte original.
2. **Evidências** com URL, trecho, data de consulta, apoia/contradiz, limitações.
3. **Agente investigador** (sob demanda) propõe veredito + justificativa + evidências citadas.
4. **Verificador de citações** (código, não IA): baixa cada URL e confirma que o trecho existe.
5. **Agente auditor** com instruções separadas tenta refutar a conclusão.
6. **Classificação de risco** por regras; risco alto ⇒ revisão humana obrigatória.
7. **Revisão humana** aprova, rejeita ou devolve; o veredito final vira uma **versão imutável**.
8. **Página pública** por verificação aprovada (alegação, veredito, evidências, fontes, data, limitações, histórico).
9. **Exportação de carrossel** (JPEG) e legenda derivados da versão aprovada, para **publicação manual**.
10. **Registro de publicação** (data, link/ID externo) e **correções** sem apagar histórico.
11. **Log de auditoria**, **limite de custo** por investigação e **interruptor geral** (pausar).
12. Páginas fixas: metodologia, política de correções, sobre/independência, contato.

## Fora do MVP (futuro, em ordem provável)

Radar/coleta automática de fontes · consulta automática a checagens existentes (Google Fact Check
API) · busca no site · fila com retentativas e alertas · publicação via API do Instagram ·
painel de métricas · análise audiovisual · outros canais · API pública/B2B · monetização.

Excluído por princípio: mídia sintética de pessoas reais, automação de engajamento, scraping que
viole termos, impulsionamento pago de conteúdo político.

## Critérios de aceitação — Etapa 1 (fundação, sem serviços externos)

Verificáveis localmente e no CI, sem chaves reais:

1. `pnpm install --frozen-lockfile && pnpm check` (lint, typecheck, testes, secretlint) passa em máquina limpa e no GitHub Actions.
2. Migrations criam as tabelas do [modelo de dados](ARCHITECTURE.md#modelo-de-dados-mvp) num Postgres 16 limpo e são idempotentes.
3. Testes provam que **um veredito aprovado não pode ser alterado** — só substituído por nova versão com justificativa.
4. Testes provam que alegação de **risco alto não chega a "aprovada" sem revisão humana**.
5. Testes provam que **publicação automática está desativada** por padrão e que o interruptor geral bloqueia execuções.
6. Verificador de citações testado com páginas de fixture: trecho presente ⇒ ok; ausente/alterado ⇒ falha.
7. Agentes rodam contra um **provedor falso** (fixture) e gravam `agent_runs` com custo estimado; o provedor real é só um adaptador.
8. Toda mudança de status gera linha em `audit_logs`.
9. `.env.example` documenta variáveis; varredura de segredos no CI não encontra credenciais.

A Etapa 2 (provedor de IA real, banco hospedado, deploy de staging) só começa com D3–D5 aprovadas.
