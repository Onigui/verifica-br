import type { CitationCheck, ClaimStatus, RiskLevel, Verdict } from "@verifica-br/core";
import { CITATION_LABELS, RISK_LABELS, STATUS_LABELS, verdictLabel } from "@/lib/labels.ts";

const STATUS_TONE: Partial<Record<ClaimStatus, string>> = {
  awaiting_review: "warn", approved: "ok", published: "ok", rejected: "bad", suspended: "bad", returned: "warn",
};

export const StatusBadge = ({ status }: { status: ClaimStatus }) => (
  <span className={`badge ${STATUS_TONE[status] ?? ""}`}>{STATUS_LABELS[status]}</span>
);

export const RiskBadge = ({ level }: { level: RiskLevel }) => (
  <span className={`badge ${level === "high" ? "bad" : level === "intermediate" ? "warn" : ""}`}>Risco {RISK_LABELS[level].toLowerCase()}</span>
);

export const VerdictBadge = ({ verdict }: { verdict: Verdict }) => (
  <span className={`badge ${verdict === "true" ? "ok" : verdict === "unverifiable" ? "" : "bad"}`}>{verdictLabel(verdict)}</span>
);

export const CitationBadge = ({ check }: { check: CitationCheck }) => (
  <span className={`badge ${check === "ok" ? "ok" : check === "failed" ? "bad" : "warn"}`}>Citação: {CITATION_LABELS[check].toLowerCase()}</span>
);
