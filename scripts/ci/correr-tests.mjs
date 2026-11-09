#!/usr/bin/env node
// Corre una porción de `npm test` en CI (.github/workflows/gates.yml):
//   node scripts/ci/correr-tests.mjs navegador  → los archivos de scripts/ci/tests-navegador.txt
//   node scripts/ci/correr-tests.mjs resto      → todos los src/**/*.test.ts MENOS esos
// Entre las dos porciones están todos los tests de `npm test`, ni uno más ni uno menos: un archivo de la
// lista que ya no existe frena la corrida (si no, dejaría de correr sin que nadie se entere).
import { spawnSync } from "node:child_process";
import { existsSync, globSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const porcion = process.argv[2];
if (porcion !== "navegador" && porcion !== "resto") {
  console.error("Uso: node scripts/ci/correr-tests.mjs navegador|resto");
  process.exit(2);
}

const lista = readFileSync(path.join(raiz, "scripts/ci/tests-navegador.txt"), "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));
const faltan = lista.filter((f) => !existsSync(path.join(raiz, f)));
if (faltan.length) {
  console.error(`scripts/ci/tests-navegador.txt nombra archivos que no existen:\n  ${faltan.join("\n  ")}`);
  process.exit(1);
}

const navegador = new Set(lista);
const todos = globSync("src/**/*.test.ts", { cwd: raiz }).map((f) => f.split(path.sep).join("/")).sort();
const archivos = porcion === "navegador" ? lista : todos.filter((f) => !navegador.has(f));
console.log(`correr-tests ${porcion}: ${archivos.length} archivos de ${todos.length}`);

const r = spawnSync(process.execPath, ["--import", "tsx", "--test", ...archivos], { cwd: raiz, stdio: "inherit" });
process.exit(r.status ?? 1);
