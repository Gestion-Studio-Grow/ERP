#!/usr/bin/env node
// ============================================================================
// LINK-CHECK + frontmatter de ADRs — gancho de gobernanza (RFC-001 Etapa 1, R3/R5).
// ============================================================================
//
// Lo corre el GATE (ADR-040) antes de aprobar un merge con ADR nuevos/tocados. Dos chequeos,
// falla (exit 1) ante cualquiera:
//   (1) FRONTMATTER COMPLETO: cada `docs/adr/ADR-*.md` empieza con `---` y tiene
//       id / nivel / dominio / depends_on (lo que el grafo consume). — gancho del Gate.
//   (2) REFERENCIAS NO ROTAS: todo `ADR-NNN` / `AMD-NNN` citado en los ADR resuelve a un id
//       existente (archivo ADR o nodo AMD del graph.json). — evita IDs colgados (R3).
//
// No modifica nada (read-only). IDs inmutables (R1). Se re-corre libre: `node scripts/adr-linkcheck.mjs`.

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ADR_DIR = join(ROOT, "docs/adr");

const files = readdirSync(ADR_DIR).filter((f) => /^ADR-\d{3}.*\.md$/.test(f)).sort();
const adrIds = new Set(files.map((f) => f.match(/ADR-\d{3}/)[0]));

// IDs de enmienda válidos = nodos AMD del grafo (fuente única; el grafo los declara).
const amdIds = new Set(["AMD"]);
try {
  const graph = JSON.parse(readFileSync(join(ADR_DIR, "graph.json"), "utf8"));
  for (const n of graph.nodes) if (n.kind === "amendment") amdIds.add(n.id);
} catch {
  // sin grafo aún: se validan solo los ADR; AMD paraguas queda como válido.
}

const problems = [];

// (1) Frontmatter completo.
const REQUIRED = ["id", "nivel", "dominio", "depends_on"];
for (const f of files) {
  const raw = readFileSync(join(ADR_DIR, f), "utf8");
  if (!raw.startsWith("---")) {
    problems.push(`[frontmatter] ${f}: no empieza con '---' (falta frontmatter). Corré: node scripts/adr-graph.mjs`);
    continue;
  }
  const fm = raw.slice(3, raw.indexOf("\n---", 3));
  for (const key of REQUIRED) {
    if (!new RegExp(`(^|\\n)\\s*${key}\\s*:`).test(fm)) {
      problems.push(`[frontmatter] ${f}: falta el campo '${key}'.`);
    }
  }
}

// (2) Referencias no rotas (en los cuerpos ADR).
for (const f of files) {
  const raw = readFileSync(join(ADR_DIR, f), "utf8");
  for (const m of raw.matchAll(/\b(ADR|AMD)-(\d{3})\b/g)) {
    const id = `${m[1]}-${m[2]}`;
    const known = m[1] === "ADR" ? adrIds.has(id) : amdIds.has(id);
    if (!known) problems.push(`[ref rota] ${f}: cita "${id}" que no existe (ni archivo ADR ni nodo AMD).`);
  }
}

if (problems.length) {
  console.error(`❌ adr-linkcheck: ${problems.length} problema(s):`);
  for (const p of [...new Set(problems)].sort()) console.error(`   ${p}`);
  process.exit(1);
}
console.log(`✅ adr-linkcheck: ${files.length} ADR con frontmatter completo · 0 referencias rotas (ADR/AMD).`);
