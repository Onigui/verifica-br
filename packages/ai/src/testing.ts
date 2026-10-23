import type { AuditorOutput, InvestigatorOutput } from "./contracts.ts";

/** Respostas de exemplo para o FakeProvider (dados fictícios, só para testes). */
export function sampleInvestigatorOutput(over: Partial<InvestigatorOutput> = {}): InvestigatorOutput {
  return {
    proposed_verdict: "false",
    robustness: "intermediate",
    summary: "O dado oficial citado indica 7,1%, não 12%.",
    rationale: "A nota oficial do período informa a taxa estimada; a alegação usa outro número sem fonte.",
    evidence: [
      {
        url: "https://exemplo.gov.br/nota",
        publisher: "Órgão fictício",
        source_type: "official_data",
        excerpt: "a taxa de desocupação foi estimada em 7,1%",
        stance: "contradicts",
        relevance: "Valor oficial do mesmo período da alegação.",
        limitations: "Pesquisa amostral com margem de erro.",
      },
    ],
    limitations: ["Margem de erro da pesquisa."],
    risk_flags: ["economic_or_social_indicator"],
    open_questions: [],
    ...over,
  };
}

export function sampleAuditorOutput(over: Partial<AuditorOutput> = {}): AuditorOutput {
  return {
    agrees_with_verdict: true,
    challenges: [{ type: "methodology", detail: "Confirmar que a alegação se refere ao mesmo trimestre.", severity: "medium" }],
    additional_evidence: [],
    risk_flags: [],
    summary: "Tentei achar série alternativa que sustentasse 12%; não encontrei.",
    ...over,
  };
}
