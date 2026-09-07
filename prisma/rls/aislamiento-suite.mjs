// SUITE de aislamiento multi-tenant — corre en cada release. Orquesta, en orden:
//   1. aislamiento-seed-tenant-b.mjs   — siembra un 2º tenant con datos distinguibles.
//   2. aislamiento-ataque-db.mjs       — ATAQUE 1 (nivel DB): app_rls NOBYPASSRLS + RLS on.
//   3. aislamiento-ataque-app.mjs      — ATAQUE 2 (nivel app): consultas de Server Actions
//                                        que resuelven por `id` sin `tenantId`, en los dos
//                                        regímenes del flag RLS_ENFORCEMENT.
//
//   DATABASE_URL="postgresql://postgres@127.0.0.1:5433/erp_val" node prisma/rls/aislamiento-suite.mjs
//
// NOTA CLAVE (leer el veredicto en el reporte): que el ATAQUE 1 dé "AISLADO" solo
// significa que el backstop RLS aísla CUANDO está aplicado (0001) y la app conecta
// como app_rls (NOBYPASSRLS) con el flag ON. Si la app conecta como owner/superuser
// (rolbypassrls) o con el flag OFF —como hace el comando de arranque local— las
// policies existen pero NO se aplican: ahí manda el ATAQUE 2. El aislamiento REAL
// exige las tres cosas juntas: policies + rol sin bypass + flag on + GUC por request.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const steps = [
  "aislamiento-seed-tenant-b.mjs",
  "aislamiento-ataque-db.mjs",
  "aislamiento-ataque-app.mjs",
];

function run(file) {
  return new Promise((resolve) => {
    console.log(`\n╔══ ${file} ${"═".repeat(Math.max(0, 50 - file.length))}`);
    const p = spawn(process.execPath, [join(here, file)], { stdio: "inherit", env: process.env });
    p.on("exit", (code) => resolve(code ?? 1));
  });
}

let worst = 0;
for (const s of steps) {
  const code = await run(s);
  worst = Math.max(worst, code);
}
console.log(`\n${worst === 0 ? "Suite OK (backstop DB verificado; revisar ATAQUE 2 para el régimen de runtime real)." : "Suite con hallazgos — ver arriba."}`);
process.exit(worst);
