# Decisões

Registro canônico. Formato: ID · data · status · decisão · motivo. Decisão aprovada só muda
por nova entrada que a substitua.

## Pendentes de aprovação

| ID | Questão | Recomendação |
|---|---|---|
| D4 | Provedor de IA | **Gemini API, faixa gratuita**, com adaptador pronto e trocável. Atenção: na faixa gratuita o Google pode usar o conteúdo para melhorar produtos e não há busca na web. Aguarda você confirmar e criar a chave |
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
| D3 | 23/10/2026 | Banco: projeto Supabase `verifica-br` (`sa-east-1`, plano gratuito) na conta nova `onisensato`, sem tocar em projetos existentes | Aprovação do responsável |
| D5 | 23/10/2026 | Hospedagem web: Vercel, conta nova (projeto `verifica-br`) | Aprovação do responsável |
| A6 | 23/10/2026 | API automática do Supabase bloqueada: RLS em todas as tabelas sem políticas e privilégios de `anon`/`authenticated` revogados (migration 0002). O app acessa o banco só pelo servidor | Técnica: segurança |
| A5 | 23/10/2026 | Login do painel próprio (usuários em variável de ambiente, hash scrypt, sessão assinada) em vez de Supabase Auth | Técnica: tira a dependência da decisão D3 e serve a uma equipe pequena. Trocável depois sem mexer no domínio |
| A4 | 22/10/2026 | Banco com migrations em SQL puro + driver `postgres`, em vez de Prisma | Técnica: o Prisma precisa baixar binários nativos (bloqueados no ambiente de desenvolvimento) e triggers de imutabilidade são SQL de qualquer forma. Reversível |
