# Decisões

Registro canônico. Formato: ID · data · status · decisão · motivo. Decisão aprovada só muda
por nova entrada que a substitua.

## Pendentes de aprovação

| ID | Questão | Recomendação |
|---|---|---|
| D3 | Banco hospedado | Novo projeto Supabase gratuito em `sa-east-1` para staging (pode exigir manter um projeto existente pausado); até lá, só Postgres local |
| D4 | Provedor de IA em produção | Conta própria na Anthropic API, com limite de gasto mensal definido por você no painel |
| D5 | Hospedagem web | Vercel Hobby enquanto não houver receita; plano pago antes de monetizar |
| D6 | Responsáveis | Quem revisa e aprova vereditos, quem responde editorialmente e qual advogado(a) dará parecer |
| D7 | Nome e presença | Confirmar "VerificaBR": domínio, @ no Instagram e busca de marca no INPI |
| D8 | Repositório público | Manter público (CI grátis, transparência) e escolher licença, ou tornar privado |
| D9 | Metodologia v0.1 | Aprovar ou ajustar [METHODOLOGY.md](METHODOLOGY.md) |

## Aprovadas

| ID | Data | Decisão | Origem |
|---|---|---|---|
| A1 | 20/10/2026 | Publicação automática desativada por padrão; todo caso passa por revisão humana no MVP | Documento Mestre §7, §23 |
| A2 | 20/10/2026 | Sem mídia sintética de pessoas reais; sem automação de engajamento; sem impulsionamento político pago | Documento Mestre §12.3, §14.1 |
| A3 | 20/10/2026 | Publicação no Instagram manual no MVP | Documento Mestre §12.3 |
| D1 | 22/10/2026 | Não publicar antes do 2º turno; piloto interno; primeira publicação após 26/10 e com parecer jurídico | Aprovação do responsável ("Perfeito, continue") |
| D2 | 22/10/2026 | Arquitetura mínima de [ARCHITECTURE.md](ARCHITECTURE.md): monorepo, Next.js único, `core`/`ai`/`db`, worker via GitHub Actions | Aprovação do responsável |
| A5 | 23/10/2026 | Login do painel próprio (usuários em variável de ambiente, hash scrypt, sessão assinada) em vez de Supabase Auth | Técnica: tira a dependência da decisão D3 e serve a uma equipe pequena. Trocável depois sem mexer no domínio |
| A4 | 22/10/2026 | Banco com migrations em SQL puro + driver `postgres`, em vez de Prisma | Técnica: o Prisma precisa baixar binários nativos (bloqueados no ambiente de desenvolvimento) e triggers de imutabilidade são SQL de qualquer forma. Reversível |
