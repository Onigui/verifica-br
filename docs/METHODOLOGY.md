# Metodologia editorial (rascunho — exige aprovação editorial)

Esta é a base da futura página pública de metodologia. Versão: `0.1-rascunho`.

## Vereditos

| Veredito | Usar quando |
|---|---|
| VERDADEIRO | Evidências disponíveis sustentam materialmente a alegação |
| FALSO | Evidências confiáveis contradizem materialmente a alegação |
| PARCIALMENTE VERDADEIRO | Há elementos corretos, mas omite ou distorce elementos relevantes |
| ENGANOSO | A apresentação leva a conclusão que as evidências não sustentam |
| FORA DE CONTEXTO | Material real apresentado sem contexto essencial ou em circunstância diferente |
| NÃO VERIFICÁVEL | Evidências insuficientes para conclusão responsável |

"Falso" não é sinônimo de "não comprovado". "Enganoso" não é sinônimo de "controverso".

## Robustez (separada do veredito)

`alta` · `intermediária` · `insuficiente` — registrada junto com qualidade das fontes,
completude e risco. Nenhum número único resume tudo; nenhum limiar numérico será fixado
antes de testes com casos revisados por humanos.

## Risco da alegação

| Nível | Exemplos | Regra no MVP |
|---|---|---|
| Baixo | data em documento oficial; número em base pública; citação integral | Revisão humana (automação só no futuro, por categoria aprovada) |
| Intermediário | indicadores econômicos/sociais com bases e períodos; vídeo que depende da sequência | Revisão humana |
| Alto | acusação criminal, corrupção, fraude; ataque a reputação; candidatos e agentes públicos; saúde; mídia suspeita de manipulação; integridade do processo eleitoral; evidências conflitantes | Revisão humana **obrigatória** + segunda leitura recomendada |

No MVP **todo** caso passa por revisão humana. A classificação de risco serve para priorizar e
registrar exigências extras, não para dispensar revisão.

## Fluxo e estados

```
rascunho → em_investigacao → em_auditoria → aguardando_revisao
        → aprovada → publicada → (corrigida | suspensa)
aguardando_revisao → devolvida → em_investigacao
aguardando_revisao → rejeitada
```

- O auditor recebe alegação, evidências e conclusão provisória com a instrução:
  *"Tente demonstrar que a conclusão proposta está errada."*
- Duas chamadas de IA concordando **não** equivalem a validação independente.
- Conteúdo editorial (legenda, carrossel, página) é gerado **a partir da versão aprovada**;
  nunca reescreve o veredito.

## Hierarquia de fontes (orientação, não regra cega)

1. Documentos originais/fontes primárias
2. Bases oficiais e sua metodologia
3. Legislação e decisões judiciais
4. Declarações e registros integrais
5. Pesquisa acadêmica
6. Jornalismo com fontes identificadas
7. Organizações de verificação
8. Outras secundárias.

## Seleção de alegações

Relevância pública, alcance, risco de dano e possibilidade de verificação. Sem cota de
"equilíbrio" entre lados; mesma metodologia para todos.

## Correções

Erros materiais são corrigidos publicamente; a versão anterior permanece visível com a
justificativa da mudança.
