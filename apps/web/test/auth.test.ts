import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/lib/auth/password.ts";
import { createSessionToken, SESSION_TTL_SECONDS, verifySessionToken } from "../src/lib/auth/session.ts";
import { authenticate, LoginThrottle, parseAdminUsers } from "../src/lib/auth/users.ts";

const SECRET = "s".repeat(40);

describe("senhas", () => {
  it("hash scrypt confere a senha certa e recusa a errada", async () => {
    const h = await hashPassword("senha-bem-longa-123");
    expect(h).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await verifyPassword("senha-bem-longa-123", h)).toBe(true);
    expect(await verifyPassword("senha-bem-longa-124", h)).toBe(false);
    expect(await verifyPassword("x", "formato-invalido")).toBe(false);
  });
  it("exige senha com pelo menos 12 caracteres", async () => {
    await expect(hashPassword("curta")).rejects.toThrow();
  });
});

describe("sessão assinada", () => {
  it("aceita token válido e recusa adulterado, expirado ou com segredo errado", () => {
    const now = 1_800_000_000;
    const t = createSessionToken("guilherme", SECRET, now);
    expect(verifySessionToken(t, SECRET, now + 10)).toMatchObject({ sub: "guilherme" });
    const [body, mac] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "admin", iat: now, exp: now + 999 })).toString("base64url");
    expect(verifySessionToken(`${forged}.${mac}`, SECRET, now)).toBeNull();
    expect(verifySessionToken(`${body}.${mac}x`, SECRET, now)).toBeNull();
    expect(verifySessionToken(t, SECRET, now + SESSION_TTL_SECONDS + 1)).toBeNull();
    expect(verifySessionToken(t, "o".repeat(40), now)).toBeNull();
    expect(verifySessionToken(undefined, SECRET, now)).toBeNull();
  });
  it("recusa segredo fraco", () => {
    expect(() => createSessionToken("x", "curto")).toThrow(/SESSION_SECRET/);
  });
});

describe("usuários do painel", () => {
  it("autentica por id e senha; não revela se o usuário existe", async () => {
    const users = parseAdminUsers(JSON.stringify([{ id: "revisora", name: "Revisora", passwordHash: await hashPassword("senha-da-revisora") }]));
    expect(await authenticate(users, " Revisora ", "senha-da-revisora")).toMatchObject({ id: "revisora" });
    expect(await authenticate(users, "revisora", "errada-errada")).toBeNull();
    expect(await authenticate(users, "fantasma", "senha-da-revisora")).toBeNull();
  });
  it("valida ADMIN_USERS", () => {
    expect(parseAdminUsers(undefined)).toEqual([]);
    expect(() => parseAdminUsers('[{"id":"A B","name":"x","passwordHash":"scrypt$1"}]')).toThrow();
    const u = { id: "a1", name: "x", passwordHash: "scrypt$1" };
    expect(() => parseAdminUsers(JSON.stringify([u, u]))).toThrow(/repetidos/);
  });
  it("bloqueia após 5 falhas na janela", () => {
    const t = new LoginThrottle(5, 1000);
    for (let i = 0; i < 5; i++) t.fail("k", 0);
    expect(t.isBlocked("k", 10)).toBe(true);
    expect(t.isBlocked("k", 2000)).toBe(false);
  });
});
