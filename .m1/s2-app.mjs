// S2 — `next start` contra el BRANCH de ensayo. Nunca producción. Uso: node .m1/s2-app.mjs <puerto> [VAR=valor ...]
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const BRANCH_HOST = "ep-silent-sound-ace1esn0.sa-east-1.aws.neon.tech";
const original = fs.readFileSync("C:/Users/mlloveras2/Documents/Claude/Factory-GSG/estetica-erp/.env", "utf8").match(/^DATABASE_URL="?([^"\r\n]+)"?/m)[1];
const u = new URL(original); u.hostname = BRANCH_HOST;
if (!u.toString().includes(BRANCH_HOST)) throw new Error("No es el branch");
const [puerto, ...vars] = process.argv.slice(2);
const env = { ...process.env };
for (const v of ["FORCE_TENANT_SLUG", "TENANT_HOST_MAP", "DEMO_MODE_ENABLED", "MP_MODO", "MP_ACCESS_TOKEN", "MP_MODO_LEGADO", "MP_SIMULAR_AVISOS", "OPERATOR_PASSWORD"]) delete env[v];
Object.assign(env, { NODE_ENV: "production", DATABASE_URL: u.toString(), OPERATOR_DATABASE_URL: u.toString(), RLS_ENFORCEMENT: "on", APP_BASE_DOMAIN: "localhost", AUTH_SECRET: randomBytes(32).toString("hex"), DB_CONNECTION_LIMIT: "3" });
for (const kv of vars) { const i = kv.indexOf("="); env[kv.slice(0, i)] = kv.slice(i + 1); }
const s = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "start", "-p", puerto], { cwd: path.resolve("."), env, stdio: "inherit" });
s.on("exit", (c) => process.exit(c ?? 0));
