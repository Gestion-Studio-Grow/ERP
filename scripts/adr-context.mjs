#!/usr/bin/env node
// ============================================================================
// CARGADOR DE CONTEXTO pre-sprint (FASE 0) — Etapa 1 del RFC-001.
// ============================================================================
//
// Dado un TEMA (keywords) y/o un DOMINIO, junta del `graph.json` + INDEX + lecciones el
// "qué leer primero" ACOTADO — NO todo el corpus. Responde la pregunta de calibración
// (ADR-052) "¿qué ADR/docs son relevantes para este frente?" sin obligar a leer los 59.
//
// USO:
//   node scripts/adr-context.mjs <keywords...>            # p. ej. "cuentas a pagar cheque"
//   node scripts/adr-context.mjs --domain Seguridad       # todo lo fundacional+top de un dominio
//   node scripts/adr-context.mjs pagos fiscal --domain Producto
//
// Ordena FUNDACIONAL primero (lo no-negociable), suma 1 salto de dependencias (el contexto
// que el frente hereda) y cierra con las lecciones relevantes. El grafo APUNTA al ADR
// completo, nunca lo reemplaza (ADR-008/H1): esto es una lista de lectura, no un resumen.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_ADR = 10; // techo de ADR listados (acotado, no todo)
const MAX_DEP = 8; // techo de dependencias heredadas
const MAX_LESSON = 6; // techo de lecciones

const norm = (s) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// --- args ---
const argv = process.argv.slice(2);
let domain = null;
const keywords = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--domain") domain = argv[++i];
  else keywords.push(argv[i]);
}
const kws = keywords.map(norm).filter(Boolean);
if (kws.length === 0 && !domain) {
  console.error("Uso: node scripts/adr-context.mjs <keywords...> [--domain <Dominio>]");
  process.exit(2);
}

// --- fuentes ---
const graph = JSON.parse(readFileSync(join(ROOT, "docs/adr/graph.json"), "utf8"));
const indexRaw = readFileSync(join(ROOT, "docs/adr/INDEX.md"), "utf8");
const lessonsRaw = readFileSync(join(ROOT, "docs/lecciones-aprendidas/registro.md"), "utf8");

// INDEX: id -> one-liner (resumen). Filas "| 057 | titulo | resumen |" o "| AMD | ... |".
const indexById = new Map();
for (const line of indexRaw.split("\n")) {
  const m = line.match(/^\|\s*(\d{1,3}|AMD)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
  if (!m) continue;
  const id = m[1] === "AMD" ? "AMD" : `ADR-${m[1].padStart(3, "0")}`;
  indexById.set(id, `${m[2]} — ${m[3]}`);
}

// --- scoring de ADR (título + resumen del INDEX + dominio) ---
const scoreText = (text) => {
  const t = norm(text);
  return kws.reduce((s, k) => s + (t.includes(k) ? 1 : 0), 0);
};

const scored = [];
for (const n of graph.nodes) {
  if (n.kind === "amendment") continue; // las enmiendas se listan solo si son dependencia
  const haystack = `${n.title} ${indexById.get(n.id) ?? ""} ${n.dominio.join(" ")}`;
  let score = scoreText(haystack);
  const inDomain = domain && n.dominio.some((d) => norm(d) === norm(domain));
  if (inDomain) score += 2; // el dominio pedido pesa
  if (score > 0) scored.push({ n, score, inDomain });
}

// Orden: fundacional primero, luego score desc, luego id.
scored.sort((a, b) => {
  const fa = a.n.nivel === "fundacional" ? 1 : 0;
  const fb = b.n.nivel === "fundacional" ? 1 : 0;
  if (fb - fa) return fb - fa;
  if (b.score - a.score) return b.score - a.score;
  return a.n.id.localeCompare(b.n.id);
});
const picked = scored.slice(0, MAX_ADR);
const pickedIds = new Set(picked.map((p) => p.n.id));

// 1 salto de dependencias heredadas (contexto que el frente asume), sin duplicar lo ya elegido.
const byId = new Map(graph.nodes.map((n) => [n.id, n]));
const deps = new Map();
for (const p of picked) {
  for (const d of p.n.depends_on) {
    if (pickedIds.has(d) || deps.has(d)) continue;
    const dn = byId.get(d);
    if (dn) deps.set(d, dn);
  }
}
const depList = [...deps.values()].slice(0, MAX_DEP);

// --- lecciones relevantes (bloques con case-id que matchean keywords) ---
const lessons = [];
if (kws.length) {
  for (const block of lessonsRaw.split(/\n(?=#{1,4}\s|[-*]\s|\*\*(?:MP|SEC|DX|PD)-)/)) {
    if (scoreText(block) === 0) continue;
    const cid = block.match(/(MP|SEC|DX|PD)-\d+/);
    const firstLine = block.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
    lessons.push({ cid: cid ? cid[0] : "—", snippet: firstLine.replace(/[#*]/g, "").slice(0, 90) });
    if (lessons.length >= MAX_LESSON * 3) break;
  }
}
// dedup por case-id, cap.
const seen = new Set();
const lessonPicked = lessons.filter((l) => (l.cid === "—" || !seen.has(l.cid)) && (seen.add(l.cid), true)).slice(0, MAX_LESSON);

// --- salida ---
const scope = [kws.length ? `tema="${keywords.join(" ")}"` : null, domain ? `dominio=${domain}` : null].filter(Boolean).join(" · ");
console.log(`\n📚 FASE 0 — qué leer primero  (${scope})\n`);
console.log("Primero lo CONSTITUCIONAL/no-negociable:  docs/FUNDAMENTOS-Y-VISION.md · docs/fundamentos/bases-gsg.md · CLAUDE.md");

const label = (n) => `${n.nivel === "fundacional" ? "🟢 FUND" : "  evol"}  ${n.id.padEnd(8)} ${n.title}`;
if (picked.length) {
  console.log(`\nADR relevantes (${picked.length}, acotado a ${MAX_ADR}):`);
  for (const p of picked) {
    console.log(`  ${label(p.n)}`);
    const oneLiner = indexById.get(p.n.id);
    if (oneLiner) console.log(`          ${oneLiner.slice(0, 120)}`);
  }
} else {
  console.log("\n(sin ADR que matcheen — probá otras keywords o un --domain)");
}
if (depList.length) {
  console.log(`\nContexto que HEREDAN (dependencias, 1 salto — ${depList.length}):`);
  for (const d of depList) console.log(`  ${label(d)}`);
}
if (lessonPicked.length) {
  console.log(`\nLecciones a tener presentes (${lessonPicked.length}):`);
  for (const l of lessonPicked) console.log(`  ${l.cid.padEnd(7)} ${l.snippet}`);
}
console.log(`\n(El grafo APUNTA: leé el ADR completo — el 'por qué' no se resume. ADR-008/ADR-052.)\n`);
