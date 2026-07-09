#!/usr/bin/env node
// ============================================================================
// GENERADOR del grafo de ADRs + frontmatter — Etapa 0 del RFC-001 (navegación 0b).
// ============================================================================
//
// ADITIVO, IDs INMUTABLES (RFC-001 R1). Deriva TODO de los ADR reales + el INDEX (mismos
// IDs) — no reordena, no renumera, no toca el cuerpo:
//   1. Agrega frontmatter YAML (nivel / dominio / depends_on) a cada `docs/adr/ADR-*.md`,
//      tomando el `Depende de:` YA escrito (idempotente: no re-agrega si ya tiene `---`).
//   2. Genera `docs/adr/graph.json`: nodos (id/title/nivel/dominio/depends_on) + `dependents`
//      (reverso) → responde "¿qué depende de esta decisión?".
//
// El grafo APUNTA al ADR completo, nunca lo reemplaza (ADR-008/ADR-001, H1/R2). Se re-corre
// como subproducto del ritual (Gate/retro, R5): `node scripts/adr-graph.mjs`.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ADR_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "adr");

// nivel fundacional (RFC-001 §2 + H2 para ADR-008). El resto: evolutiva.
const FUNDACIONAL = new Set(["ADR-001", "ADR-002", "ADR-005", "ADR-008", "ADR-017", "ADR-018", "ADR-044", "ADR-058"]);

// dominio (RFC-001 §2 clusters + juicio para los no listados). Multi-dominio permitido (H4).
const DOMINIO = {
  "ADR-001": ["Arquitectura", "Datos"], "ADR-002": ["Arquitectura"], "ADR-003": ["Producto"],
  "ADR-004": ["Producto", "Datos"], "ADR-005": ["Arquitectura"], "ADR-006": ["Arquitectura", "IA"],
  "ADR-007": ["Negocio"], "ADR-008": ["IA", "Negocio"], "ADR-009": ["Producto", "UX"],
  "ADR-010": ["Arquitectura", "Plataforma"], "ADR-011": ["Producto"], "ADR-012": ["Producto"],
  "ADR-013": ["Producto"], "ADR-014": ["Producto"], "ADR-015": ["Plataforma", "Seguridad"],
  "ADR-016": ["Operaciones"], "ADR-017": ["Seguridad"], "ADR-018": ["Seguridad", "Datos"],
  "ADR-019": ["Plataforma"], "ADR-020": ["Arquitectura"], "ADR-021": ["Plataforma"],
  "ADR-022": ["Producto", "Arquitectura"], "ADR-023": ["Plataforma", "Datos"], "ADR-024": ["Producto"],
  "ADR-025": ["Producto"], "ADR-026": ["Operaciones"], "ADR-027": ["Producto", "Datos"],
  "ADR-028": ["Plataforma"], "ADR-029": ["Plataforma"], "ADR-030": ["Producto", "Negocio"],
  "ADR-031": ["Producto"], "ADR-032": ["Negocio", "Operaciones"], "ADR-033": ["Operaciones"],
  "ADR-034": ["Producto", "IA"], "ADR-035": ["Producto"], "ADR-036": ["Producto"], "ADR-037": ["Producto"],
  "ADR-038": ["Operaciones", "Negocio"], "ADR-039": ["Operaciones"], "ADR-040": ["Operaciones"],
  "ADR-041": ["Seguridad"], "ADR-042": ["UX", "Seguridad"], "ADR-043": ["Seguridad", "UX"],
  "ADR-044": ["Negocio", "Producto"], "ADR-045": ["Operaciones"], "ADR-046": ["Operaciones"],
  "ADR-047": ["Operaciones"], "ADR-048": ["Operaciones"], "ADR-049": ["Operaciones"],
  "ADR-050": ["Operaciones"], "ADR-051": ["Operaciones"], "ADR-052": ["Operaciones"],
  "ADR-053": ["Operaciones"], "ADR-054": ["Arquitectura"], "ADR-055": ["Arquitectura"],
  "ADR-056": ["Producto", "Plataforma"], "ADR-057": ["Arquitectura", "Datos"],
  "ADR-058": ["Producto", "Arquitectura"], "ADR-059": ["Producto", "UX"],
};

/**
 * Extrae los IDs de dependencia del `Depende de:` de un ADR. Maneja: header MULTI-LÍNEA
 * (acumula continuaciones), rangos "ADR-001 a 009", y refs con barra "ADR-054/055".
 */
function extractDeps(body, selfId) {
  const lines = body.split("\n");
  const start = lines.findIndex((l) => /depende de/i.test(l));
  if (start === -1) return [];
  // Acumular la línea + sus continuaciones (hasta blanco, nuevo campo **X:**, header, cita).
  let block = lines[start];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*$/.test(l) || /^\s*\*\*[^*]+:\*\*/.test(l) || /^#/.test(l) || /^---/.test(l) || /^\s*>/.test(l)) break;
    block += " " + l;
  }

  const deps = new Set();
  // Rangos "ADR-NNN a NNN" (ej. ADR-010: "ADR-001 a 009").
  for (const m of block.matchAll(/ADR-(\d{3})\s+a\s+(\d{3})/g)) {
    for (let n = Number(m[1]); n <= Number(m[2]); n++) deps.add(`ADR-${String(n).padStart(3, "0")}`);
  }
  // Refs con barra "ADR-054/055" / "ADR-001/018" → todos los números.
  for (const m of block.matchAll(/ADR-\d{3}(?:\/\d{3})+/g)) {
    for (const num of m[0].matchAll(/\d{3}/g)) deps.add(`ADR-${num[0]}`);
  }
  // Tokens sueltos ADR-NNN / AMD-NNN.
  for (const m of block.matchAll(/(ADR|AMD)-(\d{3})/g)) deps.add(`${m[1]}-${m[2]}`);
  if (/AMENDMENTS/.test(block)) deps.add("AMD");
  deps.delete(selfId);
  return [...deps].sort();
}

const files = readdirSync(ADR_DIR).filter((f) => /^ADR-\d{3}.*\.md$/.test(f)).sort();
const nodes = [];
let fmAdded = 0;

for (const file of files) {
  const path = join(ADR_DIR, file);
  const raw = readFileSync(path, "utf8");
  const id = file.match(/ADR-\d{3}/)[0];
  const titleLine = raw.split("\n").find((l) => l.startsWith("# ")) ?? `# ${id}`;
  const title = titleLine.replace(/^#\s+/, "").trim();
  const nivel = FUNDACIONAL.has(id) ? "fundacional" : "evolutiva";
  const dominio = DOMINIO[id] ?? ["(sin clasificar)"];
  const depends_on = extractDeps(raw, id);

  nodes.push({ id, title, nivel, dominio, depends_on, dependents: [] });

  // Frontmatter idempotente: solo si el archivo NO empieza con "---".
  if (!raw.startsWith("---")) {
    const fm =
      `---\n` +
      `id: ${id}\n` +
      `nivel: ${nivel}\n` +
      `dominio: [${dominio.join(", ")}]\n` +
      `depends_on: [${depends_on.join(", ")}]\n` +
      `---\n`;
    writeFileSync(path, fm + raw);
    fmAdded++;
  }
}

// Reverso: dependents (solo entre nodos ADR; AMD no es nodo del grafo).
const byId = new Map(nodes.map((n) => [n.id, n]));
for (const n of nodes) {
  for (const dep of n.depends_on) {
    const target = byId.get(dep);
    if (target) target.dependents.push(n.id);
  }
}
for (const n of nodes) n.dependents.sort();

const graph = {
  generated: "2026-07-09",
  source: "docs/adr/ (headers 'Depende de:') + docs/adr/INDEX.md — mismos IDs, derivado, aditivo",
  rules: [
    "IDs ADR-NNN INMUTABLES (RFC-001 R1).",
    "El grafo APUNTA al ADR completo, nunca lo reemplaza (ADR-008/ADR-001, H1/R2).",
    "Se re-genera como subproducto del ritual (Gate/retro): node scripts/adr-graph.mjs.",
  ],
  query: "dependents[X] responde '¿qué se cae / qué depende si cambio X?'",
  count: nodes.length,
  nodes,
};

writeFileSync(join(ADR_DIR, "graph.json"), JSON.stringify(graph, null, 2) + "\n");
console.log(`ADRs: ${nodes.length} · frontmatter agregado: ${fmAdded} · graph.json escrito (docs/adr/graph.json)`);
