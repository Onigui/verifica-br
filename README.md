# VerificaBR

Plataforma independente de investigação e verificação de alegações públicas,
baseada em evidências rastreáveis, auditoria adversarial e revisão humana.

> **Estado:** Fase 0 (auditoria e plano). Ainda não há código, deploy ou publicação.

**Princípio central:** não basta uma IA dizer que algo é verdadeiro ou falso — é preciso
mostrar como a conclusão foi alcançada.

## Documentação

Cada arquivo tem uma função única. Decisões aprovadas vivem **apenas** em `DECISIONS.md`.

| Arquivo | Função |
|---|---|
| [docs/AUDIT.md](docs/AUDIT.md) | Diagnóstico do estado real (repositório, contas, ferramentas) em 20/10/2026 |
| [docs/PRODUCT.md](docs/PRODUCT.md) | Escopo do MVP, o que fica para depois, critérios de aceitação |
| [docs/METHODOLOGY.md](docs/METHODOLOGY.md) | Vereditos, matriz de risco das alegações, fluxo editorial |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitetura mínima, modelo de dados, dev vs. produção |
| [docs/LEGAL-COMPLIANCE.md](docs/LEGAL-COMPLIANCE.md) | Regras eleitorais, LGPD e plataformas — com fontes |
| [docs/RISKS.md](docs/RISKS.md) | Riscos editoriais, jurídicos, técnicos, operacionais e financeiros |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Plano de implementação em tarefas pequenas |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Registro canônico de decisões (pendentes e aprovadas) |

O Documento Mestre (v1.0) é a especificação de origem; estes arquivos registram o que
foi decidido a partir dele, sem copiá-lo.

## Regras de trabalho no repositório

- Trabalho em branches; `main` só recebe merge aprovado.
- Nenhum segredo no código (`.env` fica fora do Git).
- Nenhuma integração é declarada funcionando sem teste real.
- Publicação automática desativada por padrão.
