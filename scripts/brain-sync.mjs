#!/usr/bin/env node
// ============================================================================
// BRAIN SYNC — genera el "segundo cerebro" (vault) DERIVÁNDOLO del repo.
// ============================================================================
//
// Continúa RFC-001 (Etapas 0/1 ya hechas: frontmatter + graph.json + adr-context.mjs)
// y ataca el hallazgo de `docs/metricas/costo-uso-factory.md`: el 86% del gasto es
// ACARREO DE CONTEXTO, no generación. Hoy una sesión, para saber "en qué estamos",
// se traga `ESTADO-ACTUAL.md` (44 KB) y `lecciones-aprendidas/registro.md` (38 KB).
//
// Este script produce un vault de notas ATÓMICAS y una foto de estado DERIVADA de
// git + prisma + docs. Es determinístico y cuesta CERO tokens: lo corre Node, no el
// modelo. Al derivarse del repo no puede driftear (la causa de MP-12).
//
// REGLA DEL VAULT (no negociable): `brain/` es el MAPA, `docs/` es el TERRITORIO.
// Todo lo generado APUNTA al documento completo, nunca lo reemplaza (ADR-008/H1).
// Conocimiento nuevo se escribe en `docs/` (o en la zona humana `brain/90-notas/`),
// jamás en la zona generada — se pisa en el próximo sync.
//
// USO:
//   npm run brain              # regenera la zona generada del vault
//   npm run brain -- --check   # no escribe; falla si el vault está desactualizado
//
// Abrir `brain/` como vault de Obsidian: markdown plano + frontmatter + wikilinks.
// Mismos archivos para las dos puntas — el dueño los navega, los agentes los leen.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BRAIN = join(ROOT, "brain");
const CHECK = process.argv.includes("--check");

const written = [];
const MARCA = "<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->";

// --- helpers -----------------------------------------------------------------

const git = (...args) => {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

const slug = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

/**
 * Escribe si cambió. En --check solo marca la diferencia.
 *
 * `volatil: true` = la nota es una foto del AHORA (árbol sucio, últimos commits) y por
 * definición queda vieja apenas tocás un archivo. Chequear su frescura no significa nada
 * y haría fallar el Gate en toda sesión con trabajo en curso: en --check se saltea.
 * Lo que sí tiene sentido chequear es lo derivado de material YA COMMITEADO (lecciones,
 * decisiones): si eso quedó viejo, el mapa contradice al territorio.
 */
function emit(relPath, body, { volatil = false } = {}) {
  if (CHECK && volatil) return false;
  const full = join(BRAIN, relPath);
  const content = body.endsWith("\n") ? body : body + "\n";
  const prev = existsSync(full) ? readFileSync(full, "utf8") : null;
  written.push(relPath);
  if (prev === content) return false;
  if (CHECK) {
    console.error(`✗ desactualizado: brain/${relPath}`);
    return true;
  }
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  return true;
}

// --- 1. ESTADO — la foto derivada (reemplaza leer 44 KB para saber dónde estamos)

function buildEstado() {
  const head = git("rev-parse", "--short", "HEAD");
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  const headDate = git("log", "-1", "--format=%cs");
  const commits = git("log", "-12", "--format=%h · %cs · %s")
    .split("\n")
    .filter(Boolean);
  const dirty = git("status", "--porcelain").split("\n").filter(Boolean).length;

  // Migraciones: el orden lo da el nombre (timestamp). Las COLISIONES de timestamp
  // son un riesgo real de orden de aplicación → la Fase 0 de CLAUDE.md las pide.
  const migDir = join(ROOT, "prisma/migrations");
  const migs = existsSync(migDir)
    ? readdirSync(migDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
    : [];
  const porTimestamp = new Map();
  for (const m of migs) {
    const ts = m.slice(0, 14);
    porTimestamp.set(ts, [...(porTimestamp.get(ts) ?? []), m]);
  }
  const colisiones = [...porTimestamp.entries()].filter(([, v]) => v.length > 1);

  // Corpus: cuánto conocimiento hay y cuánto pesa acarrearlo.
  const docsMd = walk(join(ROOT, "docs"), ".md");
  const palabras = docsMd.reduce(
    (acc, f) => acc + readFileSync(f, "utf8").split(/\s+/).filter(Boolean).length,
    0,
  );

  const graph = readJson("docs/adr/graph.json");
  const adrFiles = existsSync(join(ROOT, "docs/adr"))
    ? readdirSync(join(ROOT, "docs/adr")).filter((f) => /^ADR-\d+/.test(f))
    : [];
  const enGrafo = new Set((graph?.nodes ?? []).map((n) => n.id));
  const huerfanos = adrFiles
    .map((f) => f.match(/^(ADR-\d+)/)?.[1])
    .filter((id) => id && !enGrafo.has(id));

  // Superficies con front de marca propia (señal derivada, no verdad declarada).
  const fronts = existsSync(join(ROOT, "src/app/tienda"))
    ? readdirSync(join(ROOT, "src/app/tienda"))
        .filter((f) => /Front\.tsx$/.test(f))
        .map((f) => f.replace(/Front\.tsx$/, ""))
    : [];

  const L = [];
  L.push("---");
  L.push("tipo: estado");
  L.push("generado: true");
  L.push("tags: [brain/estado, fase-0]");
  L.push("---");
  L.push(MARCA);
  L.push("");
  L.push("# 🧠 Estado — la foto derivada del repo");
  L.push("");
  L.push(
    "> Esto **no se escribe a mano**: sale de `git` + `prisma/migrations/` + `docs/`. Por eso no puede",
  );
  L.push(
    "> driftear (la causa de la lección **MP-12**). Es el arranque de la **Fase 0** de `CLAUDE.md`:",
  );
  L.push("> leé esto en vez de `docs/ESTADO-ACTUAL.md` salvo que necesites el detalle narrativo.");
  L.push("");
  L.push("## Git");
  L.push("");
  L.push("| Campo | Valor |");
  L.push("|---|---|");
  L.push(`| Rama actual | \`${branch}\` |`);
  L.push(`| HEAD | \`${head}\` (${headDate}) |`);
  L.push(
    `| Árbol | ${dirty === 0 ? "limpio" : `**${dirty} archivo(s) sin commitear**`} |`,
  );
  L.push("");
  L.push("**Últimos commits**");
  L.push("");
  for (const c of commits) L.push(`- ${c}`);
  L.push("");
  L.push("## Migraciones (Prisma)");
  L.push("");
  L.push(`- **Total en el repo:** ${migs.length}`);
  L.push(`- **Últimas 5:** ${migs.slice(-5).map((m) => `\`${m}\``).join(" · ")}`);
  if (colisiones.length) {
    L.push("");
    L.push(
      "> ⚠️ **Colisión de timestamp** — dos migraciones comparten prefijo, así que el orden de",
    );
    L.push("> aplicación depende del desempate alfabético. Revisar antes de cualquier Gate 2:");
    for (const [ts, v] of colisiones) L.push(`> - \`${ts}\` → ${v.map((x) => `\`${x}\``).join(" + ")}`);
  }
  L.push("");
  L.push(
    "> **Aplicado en Neon = NO verificable desde el repo.** Este bloque dice qué migraciones *existen*,",
  );
  L.push("> no cuáles corrieron. Confirmar con el dueño (Gate 2, `CLAUDE.md`).");
  L.push("");
  L.push("## Corpus de conocimiento");
  L.push("");
  L.push("| Fuente | Volumen |");
  L.push("|---|---:|");
  L.push(`| Documentos en \`docs/\` | ${docsMd.length} |`);
  L.push(`| Palabras en \`docs/\` | ${palabras.toLocaleString("es-AR")} |`);
  L.push(`| ADRs | ${adrFiles.length} |`);
  L.push(`| Nodos en el grafo | ${(graph?.nodes ?? []).length} |`);
  if (huerfanos.length) {
    L.push("");
    L.push(
      `> ⚠️ **${huerfanos.length} ADR fuera del grafo** (${huerfanos.join(", ")}) → correr \`npm run adr:graph\`.`,
    );
  }
  L.push("");
  L.push("## Superficies con front propio");
  L.push("");
  L.push(fronts.length ? fronts.map((f) => `- \`${f}\``).join("\n") : "- (ninguna detectada)");
  L.push("");
  L.push("---");
  L.push("");
  L.push(
    "**Detalle narrativo:** [ESTADO-ACTUAL.md](../../docs/ESTADO-ACTUAL.md) · " +
      "**Roadmap:** [ESTADO-Y-ROADMAP.md](../../docs/ESTADO-Y-ROADMAP.md) · " +
      "**Decisiones:** [índice](../30-decisiones/000-INDICE.md) · " +
      "**Guardarraíles:** [índice](../20-lecciones/000-INDICE.md)",
  );

  return emit("10-estado/ESTADO.md", L.join("\n"), { volatil: true });
}

// --- 2. LECCIONES — 38 casos en un doc de 38 KB → 38 notas atómicas ------------

function parseLecciones() {
  const src = join(ROOT, "docs/lecciones-aprendidas/registro.md");
  if (!existsSync(src)) return [];
  const lineas = readFileSync(src, "utf8").split("\n");

  const CATS = {
    PD: "Prod / Deploy",
    DB: "Datos / DB",
    MT: "Multi-tenant",
    DX: "Demo / UX",
    MP: "Metodología / Proceso",
    SEC: "Seguridad",
  };

  const out = [];
  let actual = null;
  let enIndice = false;

  for (const linea of lineas) {
    if (/^## Índice/.test(linea)) { enIndice = true; continue; }
    if (/^## /.test(linea)) enIndice = false;
    if (enIndice) continue;

    // Entrada: **[PD-1] Título**
    const m = linea.match(/^\*\*\[([A-Z]{2,3}-\d+)\]\s*(.+?)\*\*\s*$/);
    if (m) {
      if (actual) out.push(actual);
      const [, id, titulo] = m;
      actual = { id, titulo, cat: id.split("-")[0], campos: {}, cuerpo: [] };
      continue;
    }
    if (!actual) continue;
    if (/^## /.test(linea)) { out.push(actual); actual = null; continue; }

    // Campo: - **Guardarraíl:** ...
    const f = linea.match(/^-\s*\*\*(.+?):\*\*\s*(.*)$/);
    if (f) {
      actual.campos[f[1].replace(/\s*\(.*\)\s*$/, "").trim()] = f[2].trim();
      actual.cuerpo.push(linea);
    } else if (linea.trim()) {
      actual.cuerpo.push(linea);
    }
  }
  if (actual) out.push(actual);

  return out.map((l) => ({ ...l, catNombre: CATS[l.cat] ?? l.cat }));
}

function buildLecciones(lecciones) {
  let cambio = false;
  const dir = join(BRAIN, "20-lecciones");

  // La zona generada se limpia antes de regenerar: si una lección se renombra en
  // el registro, no queda una nota huérfana mintiendo.
  if (!CHECK && existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".md")) rmSync(join(dir, f));
    }
  }

  for (const l of lecciones) {
    const nombre = `${l.id}-${slug(l.titulo)}.md`;
    const guardarrail = l.campos["Guardarraíl"] ?? l.campos["Guardarrail"] ?? "";
    const leccion = l.campos["Lección"] ?? l.campos["Leccion"] ?? "";

    const L = [];
    L.push("---");
    L.push(`id: ${l.id}`);
    L.push(`categoria: ${l.cat}`);
    L.push("tipo: leccion");
    L.push("generado: true");
    L.push(`tags: [brain/leccion, leccion/${l.cat.toLowerCase()}]`);
    L.push("---");
    L.push(MARCA);
    L.push("");
    L.push(`# [${l.id}] ${l.titulo}`);
    L.push("");
    L.push(`**Categoría:** ${l.catNombre}`);
    L.push("");
    if (guardarrail) {
      L.push("> 🛡️ **Guardarraíl (la regla verificable):**");
      L.push(`> ${guardarrail}`);
      L.push("");
    }
    if (leccion) {
      L.push(`**Lección:** ${leccion}`);
      L.push("");
    }
    L.push("## Detalle");
    L.push("");
    L.push(...l.cuerpo);
    L.push("");
    L.push("---");
    L.push("");
    L.push(
      "Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · " +
        "Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)",
    );

    cambio = emit(join("20-lecciones", nombre), L.join("\n")) || cambio;
  }

  // Índice de 1 línea por lección: esto es lo que una sesión lee para decidir
  // QUÉ lección abrir, en vez de tragarse las 38.
  const porCat = new Map();
  for (const l of lecciones) porCat.set(l.cat, [...(porCat.get(l.cat) ?? []), l]);

  const I = [];
  I.push("---");
  I.push("tipo: indice");
  I.push("generado: true");
  I.push("tags: [brain/indice]");
  I.push("---");
  I.push(MARCA);
  I.push("");
  I.push("# 🛡️ Lecciones — índice de guardarraíles");
  I.push("");
  I.push(
    `> ${lecciones.length} lecciones, una nota por lección. **Leé este índice y abrí solo la que aplica**`,
  );
  I.push(
    "> — no el registro entero. Calibración obligatoria antes de tocar Prod/Deploy · Datos/DB ·",
  );
  I.push("> Multi-tenant · Seguridad (ADR-052).");
  I.push("");
  for (const [cat, items] of porCat) {
    I.push(`## ${cat} — ${items[0].catNombre}`);
    I.push("");
    for (const l of items) {
      const g = l.campos["Guardarraíl"] ?? l.campos["Guardarrail"] ?? l.titulo;
      I.push(`- **[${l.id}](${l.id}-${slug(l.titulo)}.md)** — ${g.replace(/\*\*/g, "")}`);
    }
    I.push("");
  }
  I.push("---");
  I.push("");
  I.push("Fuente: `docs/lecciones-aprendidas/registro.md` (ADR-047 la alimenta en cada retro).");

  return emit("20-lecciones/000-INDICE.md", I.join("\n")) || cambio;
}

// --- 3. DECISIONES — índice fino sobre el grafo (apunta, no reemplaza) --------

function buildDecisiones() {
  const graph = readJson("docs/adr/graph.json");
  if (!graph?.nodes) return false;

  const nodes = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const fundacionales = nodes.filter((n) => n.nivel === "fundacional");

  const porDominio = new Map();
  for (const n of nodes) {
    for (const d of n.dominio?.length ? n.dominio : ["(sin dominio)"]) {
      porDominio.set(d, [...(porDominio.get(d) ?? []), n]);
    }
  }

  // Cada línea APUNTA al ADR real: el índice es el mapa, el ADR es el territorio.
  const archivos = existsSync(join(ROOT, "docs/adr"))
    ? readdirSync(join(ROOT, "docs/adr")).filter((f) => f.endsWith(".md"))
    : [];
  const archivoDe = (id) => archivos.find((f) => f.startsWith(id));

  const linea = (n) => {
    const t = n.title.replace(/^ADR-\d+:\s*/, "");
    const f = archivoDe(n.id);
    const ref = f ? `[${n.id}](../../docs/adr/${f})` : n.id;
    const marca = n.nivel === "fundacional" ? " 🏛️" : "";
    const deps = n.dependents?.length ? ` _(${n.dependents.length} dependientes)_` : "";
    return `- **${ref}**${marca} — ${t}${deps}`;
  };

  const L = [];
  L.push("---");
  L.push("tipo: indice");
  L.push("generado: true");
  L.push("tags: [brain/indice, brain/decisiones]");
  L.push("---");
  L.push(MARCA);
  L.push("");
  L.push("# 🏛️ Decisiones — índice fino");
  L.push("");
  L.push(
    `> ${nodes.length} decisiones. Esto es el **mapa** (1 línea por ADR); el razonamiento completo vive`,
  );
  L.push(
    "> en `docs/adr/ADR-NNN-*.md` y **no se resume** (ADR-008: el *porqué* es lo que evita rediscutir).",
  );
  L.push("> Para armar una lista de lectura acotada por tema: `npm run adr:context -- <keywords>`.");
  L.push("");
  L.push(`## 🏛️ Fundacionales (${fundacionales.length}) — lo no negociable`);
  L.push("");
  for (const n of fundacionales) L.push(linea(n));
  L.push("");
  L.push("## Vistas por dominio");
  L.push("");
  L.push("_Solo los IDs: buscá el detalle en la lista completa de abajo (no se repite el título)._");
  L.push("");
  for (const [dom, items] of [...porDominio].sort((a, b) => b[1].length - a[1].length)) {
    L.push(`- **${dom}** (${items.length}) — ${items.map((n) => n.id).join(", ")}`);
  }
  L.push("");
  L.push(`## Todas (${nodes.length})`);
  L.push("");
  for (const n of nodes) L.push(linea(n));
  L.push("");
  L.push("---");
  L.push("");
  L.push("Fuente: `docs/adr/graph.json` (`npm run adr:graph`) · Detalle: `docs/adr/INDEX.md`.");

  return emit("30-decisiones/000-INDICE.md", L.join("\n"));
}

// --- utilidades ---------------------------------------------------------------

function walk(dir, ext) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full, ext));
    else if (e.name.endsWith(ext)) out.push(full);
  }
  return out;
}

function readJson(rel) {
  const full = join(ROOT, rel);
  if (!existsSync(full)) return null;
  try {
    return JSON.parse(readFileSync(full, "utf8"));
  } catch {
    return null;
  }
}

// --- main ---------------------------------------------------------------------

const lecciones = parseLecciones();
let desactualizado = false;
desactualizado = buildEstado() || desactualizado;
desactualizado = buildLecciones(lecciones) || desactualizado;
desactualizado = buildDecisiones() || desactualizado;

if (CHECK) {
  if (desactualizado) {
    console.error("\n✗ El vault está desactualizado. Corré: npm run brain");
    process.exit(1);
  }
  console.log("✓ brain/ al día");
} else {
  console.log(`✓ brain/ regenerado — ${written.length} notas (${lecciones.length} lecciones atómicas)`);
  console.log("  Abrí la carpeta `brain/` como vault en Obsidian, o leé brain/000-MAPA.md.");
}
