import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

const scrypt = (pw: string, salt: Buffer, len: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(pw, salt, len, opts, (err, key) => (err ? reject(err) : resolve(key))));

const PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEY_LEN = 32;

/** Formato: scrypt$N$r$p$salt(base64url)$hash(base64url). */
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) throw new Error("a senha precisa ter pelo menos 12 caracteres");
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LEN, { ...PARAMS, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [N, r, p] = parts.slice(1, 4).map(Number) as [number, number, number];
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0) || N > 2 ** 20) return false;
  const salt = Buffer.from(parts[4]!, "base64url");
  const expected = Buffer.from(parts[5]!, "base64url");
  if (expected.length !== KEY_LEN) return false;
  const actual = await scrypt(password, salt, KEY_LEN, { N, r, p, maxmem: 256 * 1024 * 1024 });
  return timingSafeEqual(actual, expected);
}
