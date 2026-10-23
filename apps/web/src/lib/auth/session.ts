import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "vbr_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
}

function assertSecret(secret: string | undefined): string {
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET ausente ou com menos de 32 caracteres");
  return secret;
}

const sign = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest("base64url");

export function createSessionToken(userId: string, secret: string | undefined, nowSec = Math.floor(Date.now() / 1000)): string {
  const payload: SessionPayload = { sub: userId, iat: nowSec, exp: nowSec + SESSION_TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, assertSecret(secret))}`;
}

export function verifySessionToken(token: string | undefined, secret: string | undefined, nowSec = Math.floor(Date.now() / 1000)): SessionPayload | null {
  if (!token) return null;
  const key = assertSecret(secret);
  const [body, mac, extra] = token.split(".");
  if (!body || !mac || extra !== undefined) return null;
  const expected = Buffer.from(sign(body, key));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (typeof p.sub !== "string" || typeof p.exp !== "number" || typeof p.iat !== "number") return null;
    if (p.exp <= nowSec || p.iat > nowSec + 60) return null;
    return { sub: p.sub, iat: p.iat, exp: p.exp };
  } catch {
    return null;
  }
}
