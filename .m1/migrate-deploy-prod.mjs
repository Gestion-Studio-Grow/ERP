// Pase M1 (30/10) — `prisma migrate deploy` contra Neon prod con el rol directo. No se commitea.
import fs from "node:fs";
import { spawnSync } from "node:child_process";
const env = fs.readFileSync("C:/Users/mlloveras2/Documents/Claude/Factory-GSG/estetica-erp/.env", "utf8");
const url = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)[1].replace("-pooler", "");
const r = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url, MIGRATE_DATABASE_URL: url },
});
process.exit(r.status ?? 1);
