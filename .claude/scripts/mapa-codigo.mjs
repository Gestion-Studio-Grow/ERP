#!/usr/bin/env node
// Mapa de código de una zona del repo, para que un agente no gaste 20-40 llamadas explorando. Cero tokens: lo
// corre Node, siempre fresco (se genera del código en el momento; no se versiona).
//
//   node .claude/scripts/mapa-codigo.mjs <carpeta|archivo> [...]                 imprime el mapa
//   node .claude/scripts/mapa-codigo.mjs <...> --a /tmp/mapa-<tarea>.md          lo escribe en un archivo (para el brief)
//
// Por archivo: líneas, si es "use server" / "use client" / "server-only", qué exporta (con línea), qué modelos de
// Prisma toca, de qué otras zonas de `@/` depende y qué tests tiene al lado. El agente lee esto (2-8 KB) y después
// abre sólo los `archivo:línea` que necesita.
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const iA = args.indexOf("--a");
const salida = iA >= 0 ? args.splice(iA, 2)[1] : null;
if (!args.length) { console.error("Uso: mapa-codigo.mjs <carpeta|archivo> [...] [--a salida.md]"); process.exit(1); }

const EXT = /\.(ts|tsx|mjs|js)$/;
const IGNORAR = /(node_modules|\.next|generated|\/worktrees\/)/;
const archivos = [];
const juntar = (p) => {
  if (IGNORAR.test(p) || !fs.existsSync(p)) return;
  const st = fs.statSync(p);
  if (st.isDirectory()) for (const f of fs.readdirSync(p).sort()) juntar(path.join(p, f));
  else if (EXT.test(p) && !/\.d\.ts$/.test(p)) archivos.push(p);
};
args.forEach(juntar);

const esTest = (f) => /\.test\.(ts|tsx|mjs)$/.test(f) || /\.e2e\.ts$/.test(f);
const fuentes = archivos.filter((f) => !esTest(f));
const tests = archivos.filter(esTest);

const salidaTxt = [`# Mapa de código — ${args.join(", ")}`, "", `${fuentes.length} archivos · ${tests.length} tests. Formato: \`línea\` nombre.`, ""];

for (const f of fuentes) {
  const lineas = fs.readFileSync(f, "utf8").split("\n");
  const marcas = [];
  const cabeza = lineas.slice(0, 5).join("\n");
  if (/^["']use server["']/m.test(cabeza)) marcas.push("use server");
  if (/^["']use client["']/m.test(cabeza)) marcas.push("use client");
  if (/import\s+["']server-only["']/.test(cabeza)) marcas.push("server-only");

  const exportados = [];
  lineas.forEach((l, i) => {
    const m = /^export\s+(?:default\s+)?(?:async\s+)?(function\*?|const|let|class|type|interface|enum)\s+([A-Za-z0-9_$]+)/.exec(l);
    if (m) exportados.push(`\`${i + 1}\` ${m[2]}${m[1] === "type" || m[1] === "interface" ? " (tipo)" : ""}`);
    else if (/^export\s+default\s+/.test(l)) exportados.push(`\`${i + 1}\` default`);
  });

  const texto = lineas.join("\n");
  const modelos = [...new Set([...texto.matchAll(/\b(?:prisma|tx|db)\.([a-z][A-Za-z0-9]*)\.(?:find|create|update|upsert|delete|count|aggregate|groupBy)/g)].map((m) => m[1]))];
  const deps = [...new Set([...texto.matchAll(/from\s+["']@\/([^"']+)["']/g)].map((m) => m[1].split("/").slice(0, 2).join("/")))];
  const base = f.replace(EXT, "");
  const susTests = tests.filter((t) => t.startsWith(base) || t.startsWith(path.dirname(f) + "/" + path.basename(base) + "-"));

  salidaTxt.push(`## ${f}  (${lineas.length} líneas${marcas.length ? ` · ${marcas.join(" · ")}` : ""})`);
  if (exportados.length) salidaTxt.push(`- exporta: ${exportados.slice(0, 25).join(" · ")}${exportados.length > 25 ? ` · … +${exportados.length - 25}` : ""}`);
  if (modelos.length) salidaTxt.push(`- prisma: ${modelos.join(", ")}`);
  if (deps.length) salidaTxt.push(`- usa: ${deps.slice(0, 12).join(", ")}${deps.length > 12 ? " …" : ""}`);
  if (susTests.length) salidaTxt.push(`- tests: ${susTests.map((t) => path.basename(t)).join(", ")}`);
  salidaTxt.push("");
}
const sueltos = tests.filter((t) => !fuentes.some((f) => t.startsWith(f.replace(EXT, ""))));
if (sueltos.length) salidaTxt.push("## Otros tests", ...sueltos.map((t) => `- ${t}`), "");

const texto = salidaTxt.join("\n");
if (salida) { fs.writeFileSync(salida, texto); console.log(`${salida}: ${Buffer.byteLength(texto)} bytes · ${fuentes.length} archivos`); }
else process.stdout.write(texto);
