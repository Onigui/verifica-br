# Riscos e bloqueios

Impacto/probabilidade: A = alto, M = médio, B = baixo.

## Bloqueios atuais

| # | Bloqueio | Desbloqueia |
|---|---|---|
| B1 | Janela de vedação do TSE (≈ 22–26/10) para conteúdo produzido por IA envolvendo candidatos | D1 |
| B2 | Sem chave da API de IA → agentes só rodam com provedor falso | D4 |
| B3 | Sem banco hospedado → nada roda fora do ambiente local | D3 |
| B4 | Sem revisor humano e responsável editorial definidos → nada pode ser aprovado | D6 |
| B5 | Sem parecer jurídico sobre a natureza do projeto no período eleitoral | D6 |

## Riscos

| Tipo | Risco | I/P | Mitigação |
|---|---|---|---|
| Editorial | Veredito errado publicado | A/M | Verificador de citações, auditor adversarial, revisão humana obrigatória, correções versionadas |
| Editorial | Percepção de viés político | A/M | Metodologia pública, mesmos critérios, registro de por que cada alegação foi escolhida |
| Editorial | Alucinação de fontes ou trechos | A/A | Toda evidência de agente precisa passar no verificador de citações antes da revisão |
| Jurídico | Enquadramento como propaganda eleitoral ou violação do art. 9º-B | A/M | Não publicar na janela; sem impulsionamento; parecer jurídico ⚖️ |
| Jurídico | Ação por dano à reputação | A/M | Risco alto ⇒ revisão reforçada; linguagem sem atribuição de intenção; canal de contestação |
| Jurídico | Repositório público expõe prompts, regras e dados | M/A | Nunca commitar dados de casos ou segredos; decidir licença (D8) |
| Técnico | Plano gratuito do Supabase pausa após 1 semana sem atividade e não tem backup automático | M/A | Rotina de atividade/backup via Actions (`pg_dump`) ou plano pago antes de publicar |
| Técnico | Limite de 300 s por função no Vercel Hobby | M/A | Agentes rodam no worker, não em requisição web |
| Técnico | Cron do GitHub Actions pode atrasar | B/A | Aceitável no MVP; disparo manual disponível |
| Técnico | Limite de tentativas de login fica na memória do processo (zera em reinício; não é compartilhado entre instâncias) | M/B | Senhas longas com scrypt; trocar por limite persistente ao ter mais pessoas ou instâncias |
| Técnico | Faixa gratuita do Gemini: sem busca na web, limites de requisição baixos, conteúdo pode ser usado pelo Google | M/A | Verificador de citações; rodada de leitura de páginas (2.5); fila com novas tentativas; provedor trocável |
| Técnico | Logs do GitHub Actions são públicos (repositório público) | M/M | Worker imprime só contagens e erros técnicos; nunca segredos ou conteúdo de casos |
| Operacional | Uma única pessoa como revisora (gargalo, sem segunda leitura) | A/A | Volume baixo e explícito; fila priorizada por risco |
| Operacional | Dependência do Instagram | M/M | Site próprio é a fonte canônica; post sempre aponta para a página |
| Financeiro | Gasto descontrolado de API | M/M | Limite por investigação, orçamento mensal no sistema e no painel do fornecedor |
| Financeiro | Vercel Hobby é só para uso não comercial | M/M | Migrar para plano pago antes de qualquer receita (D5) |
| Financeiro | Expectativa de receita rápida | M/A | Sem custo fixo relevante até haver audiência medida |
