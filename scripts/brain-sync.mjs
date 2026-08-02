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
// Se abre como vault de Obsidian apuntando a la RAÍZ del repo (no a `brain/`): las notas
// enlazan a `docs/`, y con el vault acotado a `brain/` esos enlaces quedan afuera y mueren.
// Mismos archivos para las dos puntas — el dueño los navega, los agentes los leen.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BRAIN = join(ROOT, "brain");
const CHECK = process.argv.includes("--check");

const written = [];
const MARCA = "<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->";

// --- helpers -----------------------------------------------------------------

/** Aborta con un mensaje accionable. Regla del generador: ante la duda, FALLAR RUIDOSO. */
function abortar(motivo, comoArreglarlo) {
  console.error(`\n✗ brain-sync abortó: ${motivo}`);
  if (comoArreglarlo) console.error(`  → ${comoArreglarlo}`);
  console.error("  No se tocó el vault: prefiere quedar viejo antes que quedar mintiendo.\n");
  process.exit(1);
}

/**
 * `git` devuelve null —no ""— cuando el comando falla, para poder distinguir
 * "el repo dice que está limpio" de "no pude preguntarle al repo". Confundir esas dos
 * cosas hacía que ESTADO afirmara "Árbol | limpio" fuera de un repo git: mentir en la
 * dirección peligrosa (tranquilizar sin saber).
 */
const git = (...args) => {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
};

// El recorte va DESPUÉS de limpiar los guiones de borde; al revés dejaba muñones como
// `...-sin-deletemany-.md`. Además corta en palabra entera: un nombre de archivo con
// media palabra final se lee como un archivo corrupto.
const slug = (s) => {
  const base = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  const corto = base.length > 60 ? base.slice(0, 60).replace(/-[^-]*$/, "") : base;
  return corto.replace(/^-+|-+$/g, "");
};

/**
 * Saca el ID del principio del título. En `graph.json` conviven dos formatos —
 * "ADR-001: Título" y "ADR-023 — Título"— y contemplar solo el primero producía
 * líneas de índice que decían el ID dos veces ("ADR-023 — ADR-023 — Check de…").
 */
const limpiarTitulo = (t) => (t ?? "").replace(/^ADR-\d+\s*[—–:-]\s*/, "").trim();

/** Recorta para una línea de índice sin cortar a mitad de palabra y avisando que hay más. */
const resumir = (s, max = 200) => {
  const limpio = s.replace(/\s+/g, " ").trim();
  if (limpio.length <= max) return limpio;
  return limpio.slice(0, max).replace(/\s+\S*$/, "") + " […]";
};

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
  if (head === null) {
    abortar(
      "no pude leer el repo con git (¿estás fuera del repo, o .git está roto?)",
      "corré el script desde la raíz del repo",
    );
  }
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  const headDate = git("log", "-1", "--format=%cs");
  const commits = (git("log", "-12", "--format=%h · %cs · %s") ?? "").split("\n").filter(Boolean);

  // `brain/` se excluye del conteo: el propio sync ensucia el árbol al escribir, así
  // que incluirlo hacía que dos corridas seguidas dieran números distintos.
  const sucios = (git("status", "--porcelain") ?? "")
    .split("\n")
    .filter(Boolean)
    .filter((l) => !/\sbrain\//.test(l));

  // La Fase 0 de CLAUDE.md pide el tip de `main` y las ramas con trabajo, no solo la
  // rama donde estás parado. Si no hay `main` local (clon de una sola rama), se dice
  // "no disponible" en vez de inventar.
  const mainRef = ["main", "origin/main"].find((r) => git("rev-parse", "--verify", "-q", r));
  const mainHead = mainRef ? git("log", "-1", "--format=%h · %cs · %s", mainRef) : null;
  const ramas = (git("for-each-ref", "--format=%(refname:short)", "--sort=-committerdate", "refs/heads") ?? "")
    .split("\n")
    .filter(Boolean);

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

  // Sello de generación en UTC: sin esto, quien lee la foto commiteada desde GitHub o
  // el celular no puede saber si es de hace una hora o de hace dos semanas.
  const sello = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";

  const L = [];
  L.push("---");
  L.push("tipo: estado");
  L.push("generado: true");
  L.push(`generado_el: ${sello}`);
  L.push("tags: [brain/estado, fase-0]");
  L.push("---");
  L.push(MARCA);
  L.push("");
  L.push("# 🧠 Estado — la foto derivada del repo");
  L.push("");
  L.push(`> ⏱️ **Foto tomada el ${sello} sobre \`${head}\`.**`);
  L.push(
    "> No se escribe a mano: sale de `git` + `prisma/migrations/` + `docs/`, así que **al momento",
  );
  L.push(
    "> de generarla no puede estar desactualizada** (es la causa de la lección **MP-12**). Pero una",
  );
  L.push(
    "> vez commiteada envejece como cualquier archivo: **si la estás leyendo en GitHub o en el celular,",
  );
  L.push("> mirá la fecha de arriba**. Para tenerla fresca: `npm run brain`.");
  L.push("");
  L.push("## Git");
  L.push("");
  L.push("| Campo | Valor |");
  L.push("|---|---|");
  L.push(`| Rama actual | \`${branch}\` |`);
  L.push(`| HEAD | \`${head}\` (${headDate}) |`);
  L.push(
    `| Árbol | ${sucios.length === 0 ? "limpio" : `**${sucios.length} archivo(s) sin commitear**`} _(sin contar \`brain/\`)_ |`,
  );
  L.push(
    `| Tip de \`main\` | ${mainHead ? mainHead : "_no disponible (este clon no trae `main` local)_"} |`,
  );
  L.push("");
  if (ramas.length > 1) {
    L.push(`**Ramas locales (${ramas.length}, más reciente primero):** ${ramas.map((r) => `\`${r}\``).join(" · ")}`);
    L.push("");
  }
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
  L.push(
    `| Nodos en el grafo | ${(graph?.nodes ?? []).length} _(los ${adrFiles.length} ADR + ${Math.max(0, (graph?.nodes ?? []).length - adrFiles.length)} enmiendas)_ |`,
  );
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
  L.push("## Lo que esta foto NO puede cubrir");
  L.push("");
  L.push(
    "Se deriva del repo, así que **solo sabe lo que el repo sabe**. Estos ítems de la Fase 0 no son",
  );
  L.push("derivables y siguen viviendo en el documento narrativo — leelos ahí cuando el frente los toque:");
  L.push("");
  L.push("- **Tenants vivos y su estado de publicación** → `docs/ESTADO-ACTUAL.md` §1");
  L.push("- **Gates abiertos y decisiones pendientes del dueño** → `docs/ESTADO-ACTUAL.md` (HANDOFF)");
  L.push("- **Bugs conocidos y frentes en curso** → `docs/ESTADO-ACTUAL.md` §7");
  L.push("- **Qué migraciones corrieron REALMENTE en Neon** → solo lo confirma el dueño (Gate 2)");
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
  // Sin fuente NO se regenera: la limpieza de la zona generada correría igual y
  // dejaría un índice que dice "0 lecciones" con exit 0. Una sesión que se calibrara
  // contra eso concluiría que no hay guardarraíles — el peor fallo posible acá.
  if (!existsSync(src)) {
    abortar(
      "no encuentro docs/lecciones-aprendidas/registro.md (la fuente de las lecciones)",
      "si el archivo se movió, actualizá la ruta en scripts/brain-sync.mjs",
    );
  }
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
  let campoAbierto = null; // campo que puede continuar en las líneas siguientes
  let enIndice = false;

  const cerrar = () => {
    if (actual) out.push(actual);
    actual = null;
    campoAbierto = null;
  };

  for (const linea of lineas) {
    if (/^## Índice/.test(linea)) { enIndice = true; continue; }
    if (/^## /.test(linea)) enIndice = false;
    if (enIndice) continue;

    // Entrada: **[PD-1] Título**
    const m = linea.match(/^\*\*\[([A-Z]{2,3}-\d+)\]\s*(.+?)\*\*\s*$/);
    if (m) {
      cerrar();
      const [, id, titulo] = m;
      actual = { id, titulo, cat: id.split("-")[0], campos: {}, cuerpo: [] };
      continue;
    }
    if (!actual) continue;
    if (/^## /.test(linea)) { cerrar(); continue; }

    // Campo: - **Guardarraíl:** ...
    const f = linea.match(/^-\s*\*\*(.+?):\*\*\s*(.*)$/);
    if (f) {
      campoAbierto = f[1].replace(/\s*\(.*\)\s*$/, "").trim();
      actual.campos[campoAbierto] = f[2].trim();
      actual.cuerpo.push(linea);
      continue;
    }

    // Continuación: en el registro los campos largos se envuelven en líneas indentadas.
    // Quedarse con la primera línea dejaba guardarraíles cortados a mitad de frase
    // JUSTO en el índice, que es lo único que la sesión lee de las lecciones. Una regla
    // a medias es peor que no tenerla: parece completa y dice otra cosa.
    if (campoAbierto && /^\s{2,}\S/.test(linea)) {
      actual.campos[campoAbierto] = `${actual.campos[campoAbierto]} ${linea.trim()}`.trim();
      actual.cuerpo.push(linea);
      continue;
    }

    // Una línea nueva sin indentar cierra el campo abierto (pero sigue la entrada).
    campoAbierto = null;
    // El separador de sección del registro no es parte de la lección.
    if (/^-{3,}\s*$/.test(linea)) continue;
    actual.cuerpo.push(linea); // se preservan las líneas en blanco: son los párrafos
  }
  cerrar();

  // Red de seguridad: si el formato del registro cambia, las entradas que no matcheen
  // desaparecen SIN AVISO y el vault publica un corpus incompleto que parece completo.
  // Contamos las candidatas por su marca de apertura y exigimos que cierre el número.
  const candidatas = lineas.filter((l) => /^\*\*\[/.test(l)).length;
  if (out.length !== candidatas) {
    abortar(
      `el registro tiene ${candidatas} entradas pero se parsearon ${out.length}`,
      "revisá el formato `**[ID] Título**` de las que faltan en docs/lecciones-aprendidas/registro.md",
    );
  }

  return out.map((l) => ({ ...l, catNombre: CATS[l.cat] ?? l.cat }));
}

function buildLecciones(lecciones) {
  let cambio = false;
  const dir = join(BRAIN, "20-lecciones");

  limpiarZonaGenerada(dir);

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

    // Puente entre los dos clusters del grafo: la lección enlaza a las decisiones que
    // cita. Es lo que deja ver de un vistazo QUÉ DECISIÓN nos costó qué cicatriz —
    // un ADR con muchas lecciones colgando es una zona de riesgo, no una casualidad.
    const adrs = [...new Set((l.cuerpo.join(" ").match(/ADR-\d{3}/g) ?? []))].sort();
    if (adrs.length) {
      L.push("## Decisiones relacionadas");
      L.push("");
      for (const a of adrs) L.push(`- [${a}](../30-decisiones/${a}.md)`);
      L.push("");
    }

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
      // `resumir` corta en palabra entera y marca el recorte con […]: media frase sin
      // aviso se lee como la regla completa y dice otra cosa.
      I.push(`- **[${l.id}](${l.id}-${slug(l.titulo)}.md)** — ${resumir(g.replace(/\*\*/g, ""))}`);
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

  // Una decisión que desaparece del grafo no puede dejar una nota huérfana
  // enlazando a la nada (ver limpiarZonaGenerada).
  limpiarZonaGenerada(join(BRAIN, "30-decisiones"));
  const fundacionales = nodes.filter((n) => n.nivel === "fundacional");

  const porDominio = new Map();
  for (const n of nodes) {
    for (const d of n.dominio?.length ? n.dominio : ["⚠️ sin dominio asignado"]) {
      porDominio.set(d, [...(porDominio.get(d) ?? []), n]);
    }
  }

  // Cada línea APUNTA al ADR real: el índice es el mapa, el ADR es el territorio.
  const archivos = existsSync(join(ROOT, "docs/adr"))
    ? readdirSync(join(ROOT, "docs/adr")).filter((f) => f.endsWith(".md"))
    : [];
  const archivoDe = (id) => archivos.find((f) => f.startsWith(id));

  // El índice enlaza al NODO del vault (que a su vez enlaza al ADR real). Así el
  // índice también es parte del grafo en vez de un callejón sin salida.
  const linea = (n) => {
    const t = limpiarTitulo(n.title);
    const f = archivoDe(n.id);
    const marca = n.nivel === "fundacional" ? " 🏛️" : "";
    const deps = n.dependents?.length ? ` _(${n.dependents.length} dependientes)_` : "";
    const fuente = f ? ` · [fuente ${n.id}](../../docs/adr/${f})` : "";
    return `- **[${n.id}](${n.id}.md)**${marca} — ${t}${deps}${fuente}`;
  };

  // --- Una nota por decisión, con las dependencias como ENLACES REALES.
  //
  // Esto es lo que hace visible el grafo: `depends_on` vive en el frontmatter y en
  // graph.json, pero Obsidian arma el grafo con los ENLACES del cuerpo, no con el
  // frontmatter. Sin estas notas, el vault se ve como cuatro nodos sueltos en vez de
  // la arquitectura real. Se usan enlaces markdown relativos (no wikilinks) para que
  // el grafo funcione en Obsidian Y las notas sigan navegables en GitHub.
  let cambio = false;
  const porId = new Map(nodes.map((n) => [n.id, n]));
  const tituloDe = (id) => (porId.has(id) ? limpiarTitulo(porId.get(id).title) : id);
  const ref = (id) => `[${id}](${id}.md)${porId.has(id) ? ` — ${tituloDe(id)}` : ""}`;

  for (const n of nodes) {
    const f = archivoDe(n.id);
    const N = [];
    N.push("---");
    N.push(`id: ${n.id}`);
    N.push(`nivel: ${n.nivel ?? "evolutiva"}`);
    N.push(`dominio: [${(n.dominio ?? []).join(", ")}]`);
    N.push("tipo: decision");
    N.push("generado: true");
    N.push(
      `tags: [brain/decision, adr/${n.nivel ?? "evolutiva"}${(n.dominio ?? [])
        .map((d) => `, dominio/${slug(d)}`)
        .join("")}]`,
    );
    N.push("---");
    N.push(MARCA);
    N.push("");
    N.push(`# ${n.id} — ${tituloDe(n.id)}`);
    N.push("");
    if (n.nivel === "fundacional") {
      N.push("> 🏛️ **Fundacional** — de las que no se tocan sin Advisory + Challenger (ADR-045).");
      N.push("");
    }
    N.push(
      `**El razonamiento completo está en ${f ? `[\`docs/adr/${f}\`](../../docs/adr/${f})` : "`docs/adr/`"}** — ` +
        "esta nota es solo el nodo del mapa (ADR-008: el *porqué* no se resume).",
    );
    N.push("");
    if (n.dominio?.length) {
      N.push(`**Dominio:** ${n.dominio.join(" · ")}`);
      N.push("");
    }
    N.push(`## Depende de (${n.depends_on?.length ?? 0})`);
    N.push("");
    N.push(
      n.depends_on?.length
        ? n.depends_on.map((d) => `- ${ref(d)}`).join("\n")
        : "_Ninguna: es raíz._",
    );
    N.push("");
    N.push(`## Lo que se cae si esto cambia (${n.dependents?.length ?? 0})`);
    N.push("");
    N.push(
      n.dependents?.length
        ? n.dependents.map((d) => `- ${ref(d)}`).join("\n")
        : "_Nada depende de esta decisión todavía._",
    );
    N.push("");
    N.push("---");
    N.push("");
    N.push("[Índice de decisiones](000-INDICE.md) · [Guardarraíles](../20-lecciones/000-INDICE.md)");

    cambio = emit(join("30-decisiones", `${n.id}.md`), N.join("\n")) || cambio;
  }

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
  L.push("**¿Dónde vive esto en el código?** → [mapa código ↔ decisión](000-CODIGO.md).");
  L.push("");
  L.push(`## 🏛️ Fundacionales (${fundacionales.length}) — lo no negociable`);
  L.push("");
  for (const n of fundacionales) L.push(linea(n));
  L.push("");
  // Diagrama del núcleo fundacional: se limita a las aristas entre fundacionales
  // (incluir las 200+ del grafo entero da una madeja ilegible). Mermaid lo renderiza
  // tanto GitHub como Obsidian → hay dibujo aunque no uses Obsidian.
  const idsFund = new Set(fundacionales.map((n) => n.id));
  const nAristas = fundacionales.reduce(
    (acc, n) => acc + (n.depends_on ?? []).filter((d) => idsFund.has(d)).length,
    0,
  );
  if (nAristas > 0) {
    L.push("### El núcleo, dibujado");
    L.push("");
    L.push("```mermaid");
    L.push("graph RL");
    // Las etiquetas van entre comillas: una comilla en el título (ADR-060, ADR-069)
    // rompe el parser de Mermaid y el diagrama no renderiza. Se escapan como entidad.
    const etiqueta = (id) => {
      const t = tituloDe(id);
      const corto = t.length > 34 ? t.slice(0, 34).replace(/\s+\S*$/, "") + "…" : t;
      return corto.replace(/"/g, "#quot;");
    };
    for (const n of fundacionales) {
      L.push(`  ${n.id.replace("-", "")}["${n.id}<br/>${etiqueta(n.id)}"]`);
    }
    for (const n of fundacionales) {
      for (const d of n.depends_on ?? []) {
        if (idsFund.has(d)) L.push(`  ${n.id.replace("-", "")} --> ${d.replace("-", "")}`);
      }
    }
    L.push("```");
    L.push("");
    L.push(
      `_La flecha se lee **"depende de"**. Solo el núcleo fundacional; el grafo completo `+
        `(${nodes.length} nodos) se navega en Obsidian, filtrando por tag._\n\n` +
        "**El mismo grafo, en texto:** cada nodo de arriba tiene su nota con las secciones " +
        "*\"Depende de\"* y *\"Lo que se cae si esto cambia\"* — la misma información que las " +
        "flechas, en listas de enlaces. Si no podés ver el diagrama, no te estás perdiendo nada.",
    );
    L.push("");
  }
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

  cambio = emit("30-decisiones/000-INDICE.md", L.join("\n")) || cambio;
  return buildMapaCodigo(escanearCodigo(), nodes) || cambio;
}

// --- 4. MAPA CÓDIGO ↔ DECISIÓN -------------------------------------------------
//
// RFC-001 Etapa 2. Se deriva de las citas `ADR-NNN` que el código YA tiene: 287 de los
// 577 archivos de `src/` citan al menos un ADR (83% en `src/modules/`), así que no es
// un mapa vacío.
//
// LÍMITE DECLARADO, no disimulado: esto son **CITAS, no autoridad**. Que un archivo
// cite un ADR no prueba que lo implemente, y que no lo cite no prueba lo contrario —
// el caso testigo es `src/plugins/bancos/`, que implementa ADR-075 y cita nueve ADR
// vecinos menos ese. Por eso el mapa se llama "citas", etiqueta la posición de cada
// referencia (cabecera ≈ gobierna · inline ≈ mención) y MUESTRA SUS AGUJEROS. Un mapa
// que aparenta completitud es peor que no tener mapa.

const ZONAS_CODIGO = ["src", "prisma", "scripts"];
const EXT_CODIGO = [".ts", ".tsx", ".js", ".mjs", ".mts", ".sql", ".prisma"];
const LINEAS_CABECERA = 10;

function escanearCodigo() {
  const porAdr = new Map(); // ADR-NNN → [{ archivo, tipo }]
  const archivos = ZONAS_CODIGO.flatMap((z) =>
    EXT_CODIGO.flatMap((e) => walk(join(ROOT, z), e)),
  );

  for (const full of archivos) {
    const rel = full.slice(ROOT.length + 1);
    const lineas = readFileSync(full, "utf8").split("\n");
    const vistos = new Map(); // ADR → tipo (gana "cabecera")
    lineas.forEach((linea, i) => {
      for (const m of linea.matchAll(/ADR-\d{3}/g)) {
        const tipo = i < LINEAS_CABECERA ? "cabecera" : "inline";
        if (vistos.get(m[0]) !== "cabecera") vistos.set(m[0], tipo);
      }
    });
    for (const [adr, tipo] of vistos) {
      porAdr.set(adr, [...(porAdr.get(adr) ?? []), { archivo: rel, tipo }]);
    }
  }

  // Camino inverso: los ADR que citan rutas concretas del código.
  const rutasPorAdr = new Map();
  const dirAdr = join(ROOT, "docs/adr");
  if (existsSync(dirAdr)) {
    for (const f of readdirSync(dirAdr).filter((x) => /^ADR-\d+.*\.md$/.test(x))) {
      const id = f.match(/^(ADR-\d+)/)[1];
      const rutas = [
        ...new Set(
          (readFileSync(join(dirAdr, f), "utf8").match(/\b(?:src|prisma)\/[\w./[\]()-]+/g) ?? [])
            .map((r) => r.replace(/[.,;)]+$/, "")),
        ),
      ];
      if (rutas.length) rutasPorAdr.set(id, rutas);
    }
  }

  return { porAdr, rutasPorAdr, totalArchivos: archivos.length };
}

function buildMapaCodigo(codigo, nodes) {
  const { porAdr, rutasPorAdr, totalArchivos } = codigo;
  const idsAdr = new Set(nodes.filter((n) => /^ADR-/.test(n.id)).map((n) => n.id));

  // Los tres agujeros que el mapa tiene que mostrar en vez de tapar.
  const huerfanas = [...porAdr.keys()].filter((a) => !idsAdr.has(a)).sort();
  const sinVinculo = [...idsAdr].filter((a) => !porAdr.has(a) && !rutasPorAdr.has(a)).sort();
  const conVinculo = [...idsAdr].filter((a) => porAdr.has(a) || rutasPorAdr.has(a));

  const archivosConCita = new Set([...porAdr.values()].flat().map((v) => v.archivo)).size;

  const L = [];
  L.push("---");
  L.push("tipo: indice");
  L.push("generado: true");
  L.push("tags: [brain/indice, brain/codigo]");
  L.push("---");
  L.push(MARCA);
  L.push("");
  L.push("# 🔗 Mapa código ↔ decisión");
  L.push("");
  L.push("> ⚠️ **Esto son CITAS, no autoridad.** Se deriva de las referencias `ADR-NNN` que el código");
  L.push("> ya tiene escritas. Que un archivo cite un ADR **no prueba que lo implemente**, y que no lo");
  L.push("> cite **no prueba lo contrario**: `src/plugins/bancos/` implementa ADR-075 y cita nueve ADR");
  L.push("> vecinos menos ese. Usalo para orientarte rápido, no para concluir.");
  L.push("");
  L.push("**Cómo leer el tipo de vínculo:**");
  L.push("");
  L.push(
    `- **cabecera** — la cita está en las primeras ${LINEAS_CABECERA} líneas del archivo. Por convención de facto del repo, eso suele declarar la decisión que lo gobierna.`,
  );
  L.push("- **inline** — la cita está en el cuerpo: casi siempre justifica una línea puntual.");
  L.push("- **el ADR cita la ruta** — camino inverso: la decisión nombra el archivo.");
  L.push("");
  L.push("## Cobertura");
  L.push("");
  L.push("| Métrica | Valor |");
  L.push("|---|---:|");
  // Desglosado por zona a propósito: mezclarlas infla la señal. Que un script de
  // mantenimiento nombre un ADR no es lo mismo que el core de dominio citándolo.
  for (const z of ZONAS_CODIGO) {
    const de = [...porAdr.values()].flat().filter((v) => v.archivo.startsWith(z + "/"));
    const arch = new Set(de.map((v) => v.archivo)).size;
    const tot = EXT_CODIGO.flatMap((e) => walk(join(ROOT, z), e)).length;
    L.push(`| Archivos de \`${z}/\` que citan un ADR | ${arch} de ${tot} |`);
  }
  L.push(`| Archivos escaneados en total | ${totalArchivos} |`);
  L.push(`| Archivos que citan algún ADR | ${archivosConCita} |`);
  L.push(`| ADR con vínculo (cita desde código **o** ruta citada por el ADR) | ${conVinculo.length} de ${idsAdr.size} |`);
  L.push("");
  L.push("## 🕳️ Los agujeros (a la vista, no tapados)");
  L.push("");
  if (huerfanas.length) {
    L.push(
      `- **Citas a ADR que no existen como documento:** ${huerfanas.join(", ")}. El código invoca una decisión que no está escrita — o el ADR falta, o la cita quedó mal.`,
    );
  }
  L.push(
    `- **${sinVinculo.length} ADR sin ningún vínculo al código.** Muchos son de proceso o negocio y ahí es correcto (N/A); los técnicos que aparezcan acá merecen una mirada: ${sinVinculo.join(", ") || "—"}`,
  );
  L.push(
    "- **Un directorio puede no citar su propio ADR** (caso `bancos`/ADR-075). La ausencia en este mapa no es evidencia de nada.",
  );
  L.push("");
  L.push("## Dónde se cita cada decisión");
  L.push("");
  for (const id of [...idsAdr].sort()) {
    const refs = porAdr.get(id) ?? [];
    const rutas = rutasPorAdr.get(id) ?? [];
    if (!refs.length && !rutas.length) continue;
    const cab = refs.filter((r) => r.tipo === "cabecera");
    const inl = refs.filter((r) => r.tipo === "inline");
    L.push(`### [${id}](${id}.md)`);
    L.push("");
    if (cab.length) L.push(`- **cabecera (${cab.length}):** ${cab.slice(0, 8).map((r) => `\`${r.archivo}\``).join(" · ")}${cab.length > 8 ? ` … y ${cab.length - 8} más` : ""}`);
    if (inl.length) L.push(`- **inline (${inl.length}):** ${inl.slice(0, 5).map((r) => `\`${r.archivo}\``).join(" · ")}${inl.length > 5 ? ` … y ${inl.length - 5} más` : ""}`);
    if (rutas.length) L.push(`- **el ADR cita:** ${rutas.slice(0, 5).map((r) => `\`${r}\``).join(" · ")}`);
    L.push("");
  }
  L.push("---");
  L.push("");
  L.push("Derivado de `src/`, `prisma/` y `scripts/` por `npm run brain`. Índice: [decisiones](000-INDICE.md).");

  return emit("30-decisiones/000-CODIGO.md", L.join("\n"));
}

// --- 5. METODOLOGÍA — el Gate y los playbooks que se pagan en CADA push --------

/** Bloque de apertura de un doc: del H1 hasta el primer `---` o `##`. Ahí vive el lead. */
function bloqueApertura(texto) {
  const lineas = texto.split("\n");
  const iH1 = lineas.findIndex((l) => /^# /.test(l));
  if (iH1 < 0) return { titulo: null, bloque: [] };
  const resto = lineas.slice(iH1 + 1);
  const fin = resto.findIndex((l) => /^---\s*$/.test(l) || /^## /.test(l));
  return { titulo: lineas[iH1].replace(/^#\s*/, "").trim(), bloque: fin < 0 ? resto : resto.slice(0, fin) };
}

/** Lead de un doc: cadena de patrones reales del repo; si ninguno matchea, NO se inventa. */
function leerLead(bloque) {
  const patrones = [
    /^\s*>?\s*\*\*Qué es:\*\*\s*(.+)$/,
    /^\s*>?\s*\*\*Para qué:\*\*\s*(.+)$/,
    /^\s*>?\s*\*\*Regla dura:\*\*\s*(.+)$/,
    /^\s*>?\s*\*\*Rubro \(texto libre\):\*\*\s*(.+)$/,
  ];
  for (let i = 0; i < bloque.length; i++) {
    for (const p of patrones) {
      const m = bloque[i].match(p);
      if (!m) continue;
      // Los leads vienen envueltos a ~100 columnas: sin juntar la continuación se corta
      // la frase al medio (misma lección que el parser de guardarraíles).
      let txt = m[1];
      for (let j = i + 1; j < bloque.length && bloque[j].trim(); j++) {
        txt += " " + bloque[j].replace(/^\s*>?\s*/, "").trim();
      }
      return txt.replace(/\*\*/g, "").trim();
    }
  }
  return null;
}

/** Rebana una sección literal entre dos anclas. Verbatim: rebanar no es resumir. */
function rebanar(texto, desde, hasta) {
  const lineas = texto.split("\n");
  const i = lineas.findIndex((l) => desde.test(l));
  if (i < 0) return null;
  const resto = lineas.slice(i + 1);
  const f = resto.findIndex((l) => hasta.test(l));
  return [lineas[i], ...(f < 0 ? resto : resto.slice(0, f))];
}

function buildMetodologia() {
  limpiarZonaGenerada(join(BRAIN, "40-metodologia"));

  const dir = join(ROOT, "docs/metodologia");
  const docs = [
    ...(existsSync(dir) ? walk(dir, ".md") : []),
    join(ROOT, "docs/METODOLOGIA-SPRINT.md"),
  ].filter((f) => existsSync(f) && !basename(f).startsWith("_"));
  if (!docs.length) abortar("no encontré playbooks en docs/metodologia/", "¿se movió la carpeta?");

  const fichas = docs.map((full) => {
    const texto = readFileSync(full, "utf8");
    const { titulo, bloque } = bloqueApertura(texto);
    if (!titulo) abortar(`${full.slice(ROOT.length + 1)} no tiene H1`, "todo playbook arranca con `# Título`");
    return {
      rel: full.slice(ROOT.length + 1),
      titulo,
      lead: leerLead(bloque),
      // Los playbooks que la norma marca obligatorios lo dicen en su propio encabezado.
      obligatorio: /OBLIGATORI[OA]|PASO OBLIGATORIO/.test([titulo, ...bloque].join(" ")),
      caso: /registro-casos\//.test(full),
    };
  });

  const linea = (f) => {
    const desde = join(BRAIN, "40-metodologia");
    const rel = "../../" + f.rel;
    const t = f.titulo.replace(/^[🔎🏷️🎬🤖🧭📓]\s*/u, "");
    return `- ${f.obligatorio ? "🔒 " : ""}**[${t}](${rel})**${f.lead ? ` — ${resumir(f.lead)}` : ""}`;
  };

  const L = ["---", "tipo: indice", "generado: true", "tags: [brain/indice, brain/metodologia]", "---", MARCA, ""];
  L.push("# 🧰 Metodología — índice de playbooks y del Gate");
  L.push("");
  L.push("> Recetas probadas del repo. **Antes de reinventar un flujo, fijate si ya hay una.** Esto es el");
  L.push("> índice: cada línea enlaza al playbook completo, que es donde está el método y su porqué.");
  L.push("> 🔒 = la norma lo marca obligatorio.");
  L.push("");
  L.push("**El checklist del Gate, tildable:** [GATE-CHECKLIST.md](GATE-CHECKLIST.md) — copia literal de la fuente.");
  L.push("");
  L.push("## Playbooks");
  L.push("");
  for (const f of fichas.filter((x) => !x.caso)) L.push(linea(f));
  L.push("");
  const casos = fichas.filter((x) => x.caso);
  if (casos.length) {
    L.push(`## Registro de casos (${casos.length}) — entrenamiento de la célula de extracción`);
    L.push("");
    for (const f of casos) L.push(linea(f));
    L.push("");
  }
  L.push("---");
  L.push("");
  L.push("Derivado de `docs/metodologia/` + `docs/METODOLOGIA-SPRINT.md` por `npm run brain`.");
  let cambio = emit("40-metodologia/000-INDICE.md", L.join("\n"));

  // --- El checklist, rebanado literal de sus dos fuentes canónicas.
  const sprint = readFileSync(join(ROOT, "docs/METODOLOGIA-SPRINT.md"), "utf8");
  const gate = rebanar(sprint, /^## .*GATE DE EXCELENCIA/i, /^## /);
  if (!gate) abortar("no encontré la sección del Gate en docs/METODOLOGIA-SPRINT.md", "¿cambió el encabezado?");
  const bloques = gate.filter((l) => /^\*\*[1-4]\./.test(l)).length;
  if (bloques !== 4) {
    abortar(`el Gate debería tener 4 bloques y encontré ${bloques}`, "revisá docs/METODOLOGIA-SPRINT.md");
  }

  const sap = join(ROOT, "docs/metodologia/auditoria-sap-fiori.md");
  const argentino = existsSync(sap) ? rebanar(readFileSync(sap, "utf8"), /^###?\s*8\./, /^---\s*$/) : null;

  const G = ["---", "tipo: checklist", "generado: true", "tags: [brain/gate, brain/metodologia]", "---", MARCA, ""];
  G.push("# 🛡️ Gate de Excelencia — el checklist para tildar");
  G.push("");
  G.push("> **Copia literal, no resumen.** Se rebana de las fuentes canónicas en cada `npm run brain`, así");
  G.push("> que no puede divergir de ellas. **Ante cualquier duda manda la fuente**, citada en cada bloque.");
  G.push("> Sirve para no pagar 45 KB de lectura en cada push solo para llegar a los ítems.");
  G.push("");
  G.push("_Fuente: `docs/METODOLOGIA-SPRINT.md` → GATE DE EXCELENCIA_");
  G.push("");
  G.push(...gate);
  if (argentino) {
    G.push("");
    G.push("---");
    G.push("");
    G.push("_Fuente: `docs/metodologia/auditoria-sap-fiori.md` §8_");
    G.push("");
    G.push(...argentino);
  }
  G.push("");
  G.push("---");
  G.push("");
  G.push("> ⚠️ **Divergencia conocida en las fuentes:** `CLAUDE.md` define el bloque 1 como *7 ángulos +");
  G.push("> ángulo argentino*, pero la versión corta del checklist trae solo los 7 —el argentino vive");
  G.push("> aparte, en §8—. Esta nota **ensambla las dos fuentes** para que no se te escape, pero el");
  G.push("> arreglo va en las fuentes (consolidación), no acá.");

  return emit("40-metodologia/GATE-CHECKLIST.md", G.join("\n")) || cambio;
}

// --- 6. CALIBRACIÓN — el corpus que ADR-052 obliga a leer a TODO agente --------

function buildCalibracion() {
  limpiarZonaGenerada(join(BRAIN, "50-calibracion"));
  let cambio = false;

  // --- Roster derivado de .claude/agents/. La tabla manual del roster ya driftea
  // (dice 7 charters materializados; hay 25) — por eso se deriva, no se copia.
  const dirAg = join(ROOT, ".claude/agents");
  const agentes = existsSync(dirAg)
    ? readdirSync(dirAg)
        .filter((f) => f.endsWith(".md"))
        .map((f) => {
          const txt = readFileSync(join(dirAg, f), "utf8");
          const campo = (k) => (txt.match(new RegExp(`^${k}:\\s*(.+)$`, "m")) ?? [])[1]?.trim() ?? null;
          // El modelo NO está en el frontmatter de ningún agente; la única declaración
          // es prosa en el H1 ("· capa Opus SIEMPRE"). Se extrae de ahí y se marca.
          const capa = (txt.match(/^#\s.*·\s*capa\s+(.+)$/m) ?? [])[1]?.trim() ?? null;
          return { archivo: f, name: campo("name") ?? f.replace(/\.md$/, ""), desc: campo("description"), tools: campo("tools"), capa, declaraModelo: /^model:/m.test(txt) };
        })
    : [];

  if (agentes.length) {
    const sinModelo = agentes.filter((a) => !a.declaraModelo).length;
    const A = ["---", "tipo: roster", "generado: true", "tags: [brain/calibracion, brain/roster]", "---", MARCA, ""];
    A.push("# 👥 Agentes materializados — derivado de `.claude/agents/`");
    A.push("");
    A.push(`> ${agentes.length} agentes con charter real. Esta tabla **se deriva de los archivos**, no se`);
    A.push("> mantiene a mano: el roster narrado (`docs/organizacion/roster-completo-gsg.md`) quedó viejo");
    A.push("> respecto del repo, que es la enfermedad que el vault existe para curar.");
    A.push("");
    if (sinModelo) {
      A.push(`> 🚨 **${sinModelo} de ${agentes.length} agentes NO declaran \`model:\` en su frontmatter.**`);
      A.push("> La capa que ves abajo es **prosa del encabezado**, no una instrucción que el harness honre:");
      A.push("> al despachar, el subagente **hereda el modelo del padre**. Es la causa exacta de la lección");
      A.push("> **MP-4** (Opus por herencia) y **MP-9** (modelo mal etiquetado), y deja sin red la regla de");
      A.push("> `CLAUDE.md` §3 de que el Gate **nunca** se degrada de modelo. **Se eleva al dueño.**");
      A.push("");
    }
    A.push("| Agente | Capa declarada (prosa) | `model:` | Qué hace |");
    A.push("|---|---|:---:|---|");
    for (const a of agentes.sort((x, y) => x.name.localeCompare(y.name))) {
      A.push(
        `| [${a.name}](../../.claude/agents/${a.archivo}) | ${a.capa ?? "_sin declarar_"} | ${a.declaraModelo ? "✅" : "❌"} | ${resumir(a.desc ?? "", 120)} |`,
      );
    }
    A.push("");
    A.push("---");
    A.push("");
    A.push("Derivado de `.claude/agents/` por `npm run brain`. Organigrama y células propuestas:");
    A.push("[roster-completo-gsg.md](../../docs/organizacion/roster-completo-gsg.md).");
    cambio = emit("50-calibracion/AGENTES.md", A.join("\n")) || cambio;
  }

  // --- Bases: una nota por sección, con su regla núcleo citada verbatim.
  const bases = join(ROOT, "docs/fundamentos/bases-gsg.md");
  const secciones = [];
  if (existsSync(bases)) {
    const lineas = readFileSync(bases, "utf8").split("\n");
    let actual = null;
    for (const l of lineas) {
      const m = l.match(/^##\s+(\d+)\.\s+(.+)$/);
      if (m) {
        if (actual) secciones.push(actual);
        actual = { n: m[1], titulo: m[2].trim(), cuerpo: [] };
      } else if (actual) actual.cuerpo.push(l);
    }
    if (actual) secciones.push(actual);
  }

  for (const s of secciones) {
    const cita = s.cuerpo.filter((l) => /^>\s*\S/.test(l));
    const B = ["---", `seccion: ${s.n}`, "tipo: base", "generado: true", "tags: [brain/calibracion, brain/bases]", "---", MARCA, ""];
    B.push(`# Bases GSG §${s.n} — ${s.titulo}`);
    B.push("");
    if (cita.length) {
      B.push("**La regla, en las palabras de la fuente:**");
      B.push("");
      B.push(...cita.slice(0, 12));
      B.push("");
    }
    B.push(
      `**Texto completo:** [\`docs/fundamentos/bases-gsg.md\` §${s.n}](../../docs/fundamentos/bases-gsg.md) — esta nota es el nodo del mapa, no la base.`,
    );
    B.push("");
    B.push("---");
    B.push("");
    B.push("[Índice de calibración](000-INDICE.md)");
    cambio = emit(`50-calibracion/BASES-${s.n}-${slug(s.titulo)}.md`, B.join("\n")) || cambio;
  }

  // --- Índice: los pasos de ADR-052 + a dónde ir por tipo de rol.
  const I = ["---", "tipo: indice", "generado: true", "tags: [brain/indice, brain/calibracion]", "---", MARCA, ""];
  I.push("# 🎓 Calibración — qué leer antes de actuar (ADR-052)");
  I.push("");
  I.push("> **Ningún agente empieza a operar sin calibrarse.** Este índice te dice *qué* leer para que no");
  I.push("> tengas que leer los cuatro documentos de gobernanza solo para averiguarlo.");
  I.push("");
  I.push("## Los tres pasos (ADR-052)");
  I.push("");
  I.push("1. **Leer el corpus de tu rol** — abajo, por tipo de rol.");
  I.push("2. **Escribir 3-5 bullets** con los principios que van a guiar tus decisiones, declarando tu");
  I.push("   **zona de de-sesgo** (ADR-046: humano/criollo para copy y venta · estándar/preciso para");
  I.push("   código, fiscal e infra). **Sin este paso la calibración no cuenta**, por más que hayas leído.");
  I.push("3. **Recién entonces actuar.**");
  I.push("");
  I.push("## Base para todos");
  I.push("");
  I.push("- `CLAUDE.md` — modelo de trabajo, Gate, gates de deploy/DB, ciclo DEMO→VENTA→INVERSIÓN");
  I.push("- [Guardarraíles de tu área](../20-lecciones/000-INDICE.md) — abrí solo tus categorías");
  I.push("- [Estado del repo](../10-estado/ESTADO.md) — la foto derivada (Fase 0)");
  I.push("");
  I.push("## Por tipo de rol");
  I.push("");
  I.push("| Si sos… | Sumá a la base |");
  I.push("|---|---|");
  I.push("| **Gobernanza** (PMO · Arquitecto · Advisory · Challenger) | ADR-032/039/045/048/049/050/051 · `factory-reforzada.md` · `asignacion-modelos-sprint.md` |");
  I.push("| **Core de Pagos/Fiscal** | ADR-022/024/025 |");
  I.push("| **Core de Plataforma** | ADR-001/015/018/023/029 |");
  I.push("| **Core de Diseño** | ADR-009/043/044 |");
  I.push("| **Core de Inventario** | ADR-002/036 |");
  I.push("| **Seguridad** | ADR-018/041 + lecciones `SEC-*` |");
  I.push("| **Data / DBA** | ADR-018/019/023 + lecciones `DB-*` |");
  I.push("| **Preset IA** | ADR-034/033/042/044 · `generador-preset-ia.md` |");
  I.push("| **QA / Probador** | [Gate](../40-metodologia/GATE-CHECKLIST.md) + lecciones de defectos |");
  I.push("| **Agencia** (Digital/Grow/Growth/Pricing) | charter del sector + análisis de mercado + ADR-027/044 |");
  I.push("");
  I.push("_Los ADR se abren desde [el índice de decisiones](../30-decisiones/000-INDICE.md)._");
  I.push("");
  if (secciones.length) {
    I.push(`## Las bases (${secciones.length} secciones)`);
    I.push("");
    for (const s of secciones) I.push(`- [§${s.n} — ${s.titulo}](BASES-${s.n}-${slug(s.titulo)}.md)`);
    I.push("");
  }
  I.push("## Quién es quién");
  I.push("");
  I.push("- [Agentes materializados](AGENTES.md) — tabla derivada de `.claude/agents/`");
  I.push("- [Roster completo](../../docs/organizacion/roster-completo-gsg.md) — organigrama y células propuestas");
  I.push("");
  I.push("---");
  I.push("");
  I.push("> **Nota de fidelidad:** ADR-052 no incluye `bases-gsg.md` ni ADR-046 en su lista mínima, aunque");
  I.push("> `CLAUDE.md` los trata como base y el paso 2 exige declarar la zona de de-sesgo de ADR-046. Acá");
  I.push("> se enlazan igual —apuntar no es normar—, pero el texto del ADR merece un fix por la retro.");

  return emit("50-calibracion/000-INDICE.md", I.join("\n")) || cambio;
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

/**
 * Borra la zona generada antes de reescribirla, PERO solo lo que generó este script
 * (lo que lleva la MARCA). Antes borraba todo `.md` del directorio: una nota propia
 * guardada ahí por error desaparecía sin aviso y sin vuelta atrás si no estaba
 * commiteada. La convención "tus notas van en 90-notas/" ahora está enforced, no
 * solo documentada.
 */
function limpiarZonaGenerada(dir) {
  if (CHECK || !existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".md")) continue;
    const full = join(dir, f);
    if (readFileSync(full, "utf8").includes(MARCA)) rmSync(full);
    else console.error(`⚠ conservo brain/${basename(dir)}/${f}: no lo generé yo (movelo a brain/90-notas/)`);
  }
}

/**
 * `null` = no existe (caso previsto). Un JSON corrupto NO devuelve null: aborta.
 * Tragarse el error de parseo dejaba el vault stale en silencio y hacía que ESTADO
 * dijera "0 nodos en el grafo → correr npm run adr:graph", una receta equivocada
 * para un archivo roto.
 */
function readJson(rel) {
  const full = join(ROOT, rel);
  if (!existsSync(full)) return null;
  try {
    return JSON.parse(readFileSync(full, "utf8"));
  } catch (e) {
    abortar(`${rel} no es JSON válido (${e.message})`, "regeneralo con: npm run adr:graph");
  }
}

// --- main ---------------------------------------------------------------------

const lecciones = parseLecciones();
let desactualizado = false;
desactualizado = buildEstado() || desactualizado;
desactualizado = buildLecciones(lecciones) || desactualizado;
desactualizado = buildDecisiones() || desactualizado;
desactualizado = buildMetodologia() || desactualizado;
desactualizado = buildCalibracion() || desactualizado;

if (CHECK) {
  // Comparar solo CONTENIDO dejaba dos agujeros: un archivo intruso en la zona
  // generada daba "al día" y después el sync lo borraba (o sea, el check decía verde
  // sobre una corrida que NO era no-op), y una nota borrada a mano tampoco se notaba.
  // El check compara además el LISTADO real contra lo que el script emitiría.
  const esperados = new Set(written);
  for (const zona of ["20-lecciones", "30-decisiones"]) {
    const dir = join(BRAIN, zona);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".md"))) {
      const rel = `${zona}/${f}`;
      if (esperados.has(rel)) continue;
      const propio = readFileSync(join(dir, f), "utf8").includes(MARCA);
      console.error(
        propio
          ? `✗ sobra (el sync lo borraría): brain/${rel}`
          : `✗ nota ajena en zona generada: brain/${rel} → movela a brain/90-notas/`,
      );
      desactualizado = true;
    }
  }
  for (const rel of written) {
    if (!existsSync(join(BRAIN, rel))) {
      console.error(`✗ falta: brain/${rel}`);
      desactualizado = true;
    }
  }

  if (desactualizado) {
    console.error("\n✗ El vault está desactualizado. Corré: npm run brain");
    process.exit(1);
  }
  console.log(`✓ brain/ al día — ${written.length} notas verificadas`);
} else {
  console.log(`✓ brain/ regenerado — ${written.length} notas (${lecciones.length} lecciones atómicas)`);
  console.log("  Entrada: brain/000-MAPA.md · En Obsidian: abrí la RAÍZ del repo como vault (no brain/).");
}
