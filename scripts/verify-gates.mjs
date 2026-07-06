// ============================================================================
// VALLAS DE PRE-PUSH — Célula 2 (Confiabilidad)  ·  npm run gates
// ============================================================================
// Corre en secuencia las vallas que DEBEN estar verdes antes de integrar/pushear.
// Pensado como gate local reproducible (no hay CI en el repo todavía; ver
// docs/runbooks/hardening-produccion.md §6). Cada valla es un subproceso; se
// ejecutan todas aunque una falle, y el exit code final es 1 si alguna falló.
//
//   Vallas:
//   1. tsc            — el código compila (tipos sanos).
//   2. tests          — la suite unitaria pasa (npm test).
//   3. rls-coverage   — REGRESIÓN DE AISLAMIENTO: todo modelo de-tenant es
//                       protegible por RLS (prisma/rls/check-coverage.mjs). Es la
//                       red estática que corre SIN tocar Neon → apta para cada
//                       cambio. La verificación FUNCIONAL (aísla de verdad) vive en
//                       verify-rls.mjs y necesita un branch de Neon (no acá).
//
// Exit 0 = todas verdes (seguro pushear). Exit 1 = alguna roja.
// ============================================================================

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";

// npm/npx necesitan la shell en Windows (resuelven a .cmd); el gate de node se
// corre directo con process.execPath SIN shell — con shell:true en Windows el path
// de node.exe (tiene espacios) se rompe y el gate falla en falso.
const GATES = [
  { name: "tsc (tipos)", cmd: "npx", args: ["tsc", "--noEmit"], shell: isWin },
  { name: "tests (npm test)", cmd: "npm", args: ["test"], shell: isWin },
  {
    name: "rls-coverage (aislamiento)",
    cmd: process.execPath,
    args: ["prisma/rls/check-coverage.mjs"],
    shell: false,
  },
];

console.log("🚧 Corriendo vallas de pre-push…\n");
const results = [];
for (const g of GATES) {
  process.stdout.write(`── ${g.name} …\n`);
  const r = spawnSync(g.cmd, g.args, { cwd: ROOT, stdio: "inherit", shell: g.shell });
  const ok = r.status === 0;
  results.push({ name: g.name, ok });
  console.log(ok ? `   ✅ ${g.name}\n` : `   ❌ ${g.name} (exit ${r.status})\n`);
}

console.log("──────── Resumen de vallas ────────");
for (const r of results) console.log(`${r.ok ? "🟢" : "🔴"} ${r.name}`);
const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error(`\n❌ ${failed.length} valla(s) roja(s) — NO pushear hasta resolver.`);
  process.exit(1);
}
console.log("\n✅ Todas las vallas verdes.");
