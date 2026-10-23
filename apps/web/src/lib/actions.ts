"use server";

import { createHttpFetcher, NewClaim, ReviewDecision, Robustness, Stance, verifyCitation, Verdict } from "@verifica-br/core";
import {
  addEvidence,
  createClaim,
  proposeCorrection,
  proposeManualVerdict,
  recordManualPublication,
  recordReview,
  requestInvestigation,
  setPublicationState,
  TransitionError,
  updateSettings,
  withActor,
} from "@verifica-br/db";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from "./auth/session.ts";
import { authenticate } from "./auth/users.ts";
import { actorOf, adminUsers, db, loginThrottle, requireUser } from "./server.ts";

/** Redireciona com mensagem; erros de regra viram mensagem, erros inesperados sobem. */
function back(path: string, kind: "ok" | "error", msg: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(msg)}`);
}

function friendly(err: unknown): string | null {
  if (err instanceof TransitionError) return err.message;
  if (err instanceof z.ZodError) return `Dados inválidos: ${err.issues.map((i) => `${i.path.join(".") || "campo"} — ${i.message}`).join("; ")}`;
  return null;
}

async function run(path: string, fn: () => Promise<string | void>): Promise<never> {
  let okMsg: string | void;
  try {
    okMsg = await fn();
  } catch (err) {
    const msg = friendly(err);
    if (msg) back(path, "error", msg);
    throw err;
  }
  back(path, "ok", okMsg || "Feito.");
}

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
const opt = (fd: FormData, k: string) => str(fd, k).trim() || undefined;
const uuid = z.uuid();

// ---------- sessão ----------

export async function loginAction(fd: FormData): Promise<void> {
  const id = str(fd, "username").trim().toLowerCase();
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = `${id}|${ip}`;
  const throttle = loginThrottle();
  if (throttle.isBlocked(key)) back("/login", "error", "Muitas tentativas. Aguarde 15 minutos.");
  const user = await authenticate(adminUsers(), id, str(fd, "password"));
  if (!user) {
    throttle.fail(key);
    back("/login", "error", "Usuário ou senha inválidos.");
  }
  throttle.reset(key);
  (await cookies()).set(SESSION_COOKIE, createSessionToken(user.id, process.env.SESSION_SECRET), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ---------- alegações ----------

export async function createClaimAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  let id = "";
  try {
    const input = NewClaim.parse({
      originalText: str(fd, "originalText"),
      attributedTo: str(fd, "attributedTo"),
      originalSourceUrl: str(fd, "originalSourceUrl").trim(),
      sourcePlatform: opt(fd, "sourcePlatform"),
      statedAt: opt(fd, "statedAt"),
      topic: opt(fd, "topic"),
      claimType: opt(fd, "claimType"),
      riskFlags: fd.getAll("riskFlags").map(String),
    });
    id = (await createClaim(db(), actorOf(user), input)).id;
  } catch (err) {
    const msg = friendly(err);
    if (msg) back("/admin/claims/new", "error", msg);
    throw err;
  }
  back(`/admin/claims/${id}`, "ok", "Alegação registrada.");
}

const EvidenceForm = z.object({
  claimId: uuid,
  url: z.url({ protocol: /^https?$/ }),
  publisher: z.string().max(300).optional(),
  sourceType: z.string().max(60).optional(),
  excerpt: z.string().trim().min(20, "o trecho precisa de pelo menos 20 caracteres").max(3000),
  stance: Stance,
  relevanceNotes: z.string().max(2000).optional(),
  limitations: z.string().max(2000).optional(),
  publicationDate: z.string().max(40).optional(),
});

/** Evidência humana: a citação também é conferida automaticamente, mas o registro é mantido. */
export async function addEvidenceAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const claimId = str(fd, "claimId");
  const path = `/admin/claims/${uuid.safeParse(claimId).success ? claimId : ""}`;
  await run(path, async () => {
    const e = EvidenceForm.parse({
      claimId, url: str(fd, "url").trim(), publisher: opt(fd, "publisher"), sourceType: opt(fd, "sourceType"),
      excerpt: str(fd, "excerpt"), stance: str(fd, "stance"), relevanceNotes: opt(fd, "relevanceNotes"),
      limitations: opt(fd, "limitations"), publicationDate: opt(fd, "publicationDate"),
    });
    const check = await verifyCitation(e.url, e.excerpt, createHttpFetcher({ timeoutMs: 10_000 }));
    const actor = actorOf(user);
    await withActor(db(), actor, (tx) => addEvidence(tx, { ...e, citationCheck: check.status, citationDetail: check.detail, addedBy: actor }));
    return `Evidência registrada. Citação: ${check.detail}.`;
  });
}

export async function requestInvestigationAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const claimId = uuid.parse(str(fd, "claimId"));
  await run(`/admin/claims/${claimId}`, async () => {
    await requestInvestigation(db(), actorOf(user), claimId);
    return "Investigação colocada na fila do worker.";
  });
}

const VersionForm = z.object({
  claimId: uuid,
  verdict: Verdict,
  robustness: Robustness,
  summary: z.string().trim().min(10).max(800),
  rationale: z.string().trim().min(10).max(5000),
  limitations: z.array(z.string().trim().min(1).max(1000)).max(20),
  evidenceIds: z.array(uuid).max(50),
});

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

function parseVersion(fd: FormData) {
  return VersionForm.parse({
    claimId: str(fd, "claimId"), verdict: str(fd, "verdict"), robustness: str(fd, "robustness"),
    summary: str(fd, "summary"), rationale: str(fd, "rationale"), limitations: lines(str(fd, "limitations")),
    evidenceIds: fd.getAll("evidenceIds").map(String),
  });
}

export async function proposeManualVerdictAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const claimId = uuid.parse(str(fd, "claimId"));
  await run(`/admin/claims/${claimId}`, async () => {
    const v = await proposeManualVerdict(db(), actorOf(user), parseVersion(fd));
    return `Versão ${v.version} criada e enviada para revisão.`;
  });
}

export async function reviewAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const claimId = uuid.parse(str(fd, "claimId"));
  await run(`/admin/claims/${claimId}`, async () => {
    const decision = ReviewDecision.parse(str(fd, "decision"));
    const comments = opt(fd, "comments");
    if (decision !== "approve" && !comments) throw new TransitionError("explique o motivo ao devolver ou rejeitar");
    if (str(fd, "confirm") !== "yes") throw new TransitionError("marque a confirmação de que conferiu as evidências");
    await recordReview(db(), actorOf(user), { claimId, verdictVersionId: uuid.parse(str(fd, "verdictVersionId")), decision, comments });
    return decision === "approve" ? "Versão aprovada." : decision === "return" ? "Caso devolvido." : "Caso rejeitado.";
  });
}

export async function recordPublicationAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const claimId = uuid.parse(str(fd, "claimId"));
  await run(`/admin/claims/${claimId}`, async () => {
    const channel = z.enum(["instagram", "site", "outro"]).parse(str(fd, "channel"));
    const externalUrl = opt(fd, "externalUrl");
    if (externalUrl) z.url({ protocol: /^https?$/ }).parse(externalUrl);
    await recordManualPublication(db(), actorOf(user), { claimId, channel, externalUrl, caption: opt(fd, "caption") });
    return "Publicação registrada.";
  });
}

export async function publicationStateAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const claimId = uuid.parse(str(fd, "claimId"));
  await run(`/admin/claims/${claimId}`, async () => {
    const to = z.enum(["suspended", "published"]).parse(str(fd, "to"));
    await setPublicationState(db(), actorOf(user), claimId, to, str(fd, "reason"));
    return to === "suspended" ? "Publicação suspensa." : "Publicação restabelecida.";
  });
}

export async function correctionAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const claimId = uuid.parse(str(fd, "claimId"));
  await run(`/admin/claims/${claimId}`, async () => {
    const reason = z.string().trim().min(5).max(2000).parse(str(fd, "reason"));
    const publicExplanation = z.string().trim().min(10).max(2000).parse(str(fd, "publicExplanation"));
    const v = await proposeCorrection(db(), actorOf(user), { ...parseVersion(fd), reason, publicExplanation });
    return `Correção aberta: versão ${v.version} aguardando revisão.`;
  });
}

// ---------- configurações ----------

export async function updateSettingsAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  await run("/admin/settings", async () => {
    const money = z.coerce.number().min(0).max(10_000);
    await updateSettings(db(), actorOf(user), {
      killSwitch: str(fd, "killSwitch") === "on",
      maxCostPerInvestigationUsd: money.parse(str(fd, "maxCostPerInvestigationUsd")),
      monthlyBudgetUsd: money.parse(str(fd, "monthlyBudgetUsd")),
      maxAgentRoundsPerInvestigation: z.coerce.number().int().min(1).max(5).parse(str(fd, "maxAgentRoundsPerInvestigation")),
    });
    return "Configurações salvas.";
  });
}

