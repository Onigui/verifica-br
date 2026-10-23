# Conformidade — eleitoral, dados e plataformas

Levantamento técnico feito em 20/10/2026. **Não é parecer jurídico.** Itens marcados ⚖️
exigem análise de advogado(a) antes de publicar.

## Eleições 2026

- 1º turno 04/10/2026; 2º turno **25/10/2026** (TSE). (fonte 1)
- **Conteúdo sintético (IA)** — Res. TSE 23.610/2019, alterada pela Res. 23.755/2026, art. 9º-B: (fontes 1, 2)
  - rotulagem explícita, destacada e acessível de conteúdo criado ou alterado significativamente por IA em propaganda;
  - **§3º-A:** vedadas a publicação e a republicação, ainda que gratuitas, e o impulsionamento de **novos
    conteúdos produzidos ou alterados por IA** que utilizem imagem, voz ou manifestação de candidato ou
    pessoa pública, **entre 72 h antes e 24 h depois** do pleito, mesmo rotulados.
  - ⚖️ Não está claro se um carrossel de checagem com texto redigido com apoio de IA e citação de um
    candidato se enquadra. **Postura do projeto:** não publicar nada sobre candidatos/pessoas públicas
    nessa janela (≈ 22/10 a 26/10/2026).
- **Recomendação de candidatos por IA** é vedada a provedores de sistemas de IA (art. 28 §1º-C). (fonte 2)
  Os prompts e saídas do VerificaBR nunca recomendam, ranqueiam ou opinam sobre voto.
- **Impulsionamento pago** de conteúdo político-eleitoral é restrito a partidos, federações e candidatos
  (art. 3º-B, art. 29 §8º). (fonte 2) ⇒ Sem anúncios pagos de checagens eleitorais.
- **Pesquisas eleitorais** exigem registro para divulgação (Lei 9.504/1997, art. 33; Res. TSE 23.600/2019). (fonte 3)
  ⇒ Não publicar números de pesquisa sem identificar o registro. ⚖️
- **Dia da eleição** — a Lei 9.504/1997 (art. 39 §5º) tipifica condutas de propaganda no dia do pleito. ⚖️ Confirmar alcance para veículos informativos.
- **Desinformação sobre o sistema de votação** é tema prioritário de fiscalização (art. 8º, art. 28 §4º-A). (fonte 2)
  ⇒ Alegações sobre urnas = risco alto.
- ⚖️ A resolução não trata especificamente de agências de checagem; a natureza jurídica do VerificaBR
  (jornalismo/informação vs. propaganda) depende da atividade concreta, do financiamento e da distribuição.

## Dados pessoais (LGPD)

- Lei 13.709/2018. O art. 4º, II, "a" afasta a aplicação a tratamento para fins exclusivamente jornalísticos. (fonte 4)
  ⚖️ Confirmar se o projeto se enquadra (há intenção de monetização/B2B).
- Mínimo de dados: formulário de contato com nome opcional e e-mail; sem rastreamento de leitores no MVP.
- Dados de terceiros citados (pessoas públicas) limitados ao necessário para a verificação.

## Instagram (Meta)

- Publicação via API exige conta **profissional**, app Meta com permissões de publicação
  (`instagram_business_content_publish` ou `instagram_content_publish`) e nível de acesso adequado. (fonte 5)
- Imagens só em **JPEG**, hospedadas em URL pública; carrossel até 20 itens. (fonte 5)
- Limite: a página de referência informa **50** publicações/24 h; o guia geral cita 100 — usar o
  endpoint `content_publishing_limit` como verdade. (fontes 5, 6)
- **MVP: publicação manual.** Proibido: automação de comentários, DMs, follows, engajamento artificial, scraping.

## IA — termos e custos

- Assinaturas pagas do Claude (Pro etc.) **não incluem** acesso à API; a API é contratada e cobrada à parte no Console. (fonte 7)
- Preços por token devem ser lidos na página oficial no momento da contratação (fonte 8) — não foram
  verificados nesta auditoria. ⚖️ Ler a política de uso do fornecedor sobre conteúdo eleitoral.
- **Gemini API, faixa gratuita** (verificado em 23/10/2026, fonte 9): modelos Flash sem custo, mas o
  plano gratuito indica "Content used to improve our products" e busca com Google Search não está
  disponível na faixa gratuita. Limites de requisição aparecem só no AI Studio. Consequências:
  não enviar dados pessoais não públicos (formulários de contato ficam fora do fluxo de IA) e tratar
  rascunhos de veredito como potencialmente lidos por terceiros. ⚖️ Ler os termos adicionais da
  Gemini API antes do uso em produção.

## Fontes

1. [TSE — Regras sobre uso de IA nas Eleições 2026](https://www.tse.jus.br/comunicacao/noticias/2026/Abril/por-dentro-das-eleicoes-conheca-as-regras-sobre-uso-de-ia-na-campanha-eleitoral-de-2026)
2. [TSE — Res. 23.755/2026 (compilada)](https://www.tse.jus.br/legislacao/compilada/res/2026/resolucao-no-23-755-de-2-de-marco-de-2026)
3. [TSE — Temas selecionados, divulgação de pesquisa](https://temasselecionados.tse.jus.br/temas-selecionados/pesquisa-eleitoral/divulgacao)
4. [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
5. [Meta — Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing)
6. [Meta — content_publishing_limit](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit)
7. [Claude Help Center — plano pago e API](https://support.claude.com/en/articles/9876003)
8. [Preços da API Claude](https://platform.claude.com/docs/en/about-claude/pricing)
9. [Gemini API — preços e faixa gratuita](https://ai.google.dev/gemini-api/docs/pricing)
