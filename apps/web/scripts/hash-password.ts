import { createInterface } from "node:readline/promises";
import { hashPassword } from "../src/lib/auth/password.ts";

/** Uso: pnpm --filter @verifica-br/web hash-password  (a senha é lida do terminal, não fica no histórico). */
const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = await rl.question("Senha (mín. 12 caracteres): ");
rl.close();
console.info(await hashPassword(password));
