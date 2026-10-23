import { randomBytes, scryptSync } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

export const E2E_USER = { id: "revisora", name: "Revisora E2E", password: "senha-do-teste-e2e" };

// Hash no mesmo formato de src/lib/auth/password.ts.
const salt = randomBytes(16);
const hash = ["scrypt", 16384, 8, 1, salt.toString("base64url"), scryptSync(E2E_USER.password, salt, 32, { N: 16384, r: 8, p: 1 }).toString("base64url")].join("$");

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // Ambientes com Chromium pré-instalado podem apontar o executável (ex.: /opt/pw-browsers/chromium).
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: {
    command: `next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? "",
      ADMIN_USERS: JSON.stringify([{ id: E2E_USER.id, name: E2E_USER.name, passwordHash: hash }]),
      SESSION_SECRET: randomBytes(32).toString("hex"),
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
