// Pase M1 (30/10) — SÓLO LECTURA: qué migraciones tiene aplicadas Neon prod. No se commitea.
import fs from "node:fs";
import pg from "pg";
const env = fs.readFileSync("C:/Users/mlloveras2/Documents/Claude/Factory-GSG/estetica-erp/.env", "utf8");
const url = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)[1].replace("-pooler", "");
const c = new pg.Client({ connectionString: url });
await c.connect();
await c.query("BEGIN TRANSACTION READ ONLY");
const r = await c.query(`SELECT migration_name, finished_at IS NOT NULL AS ok, rolled_back_at IS NOT NULL AS rb FROM _prisma_migrations ORDER BY migration_name`);
await c.query("ROLLBACK");
await c.end();
const enBase = new Set(r.rows.filter((x) => x.ok && !x.rb).map((x) => x.migration_name));
const repo = fs.readdirSync("prisma/migrations").filter((d) => /^\d/.test(d));
console.log("en base:", enBase.size, "· en repo:", repo.length);
console.log("PENDIENTES (en repo, no en base):", repo.filter((d) => !enBase.has(d)));
console.log("En base y no en repo:", [...enBase].filter((d) => !repo.includes(d)));
console.log("Fallidas/revertidas:", r.rows.filter((x) => !x.ok || x.rb).map((x) => x.migration_name));
