// ============================================================================
// NÚCLEO PURO DEL TREN DE RELEASES — sin dependencias, sin red, sin git, sin disco.
// ============================================================================
//
// Lo usan los CLI de esta carpeta (notas.mjs, smoke.mjs, sello-gsg.mjs, pr-checklist.mjs,
// preparar.mjs). Todo lo que decide vive acá, como funciones puras, y se testea con
// `npm run test:release` (lib.test.mjs). Los CLI sólo leen (git, disco, HTTP) y escriben.
//
// Zona ESTÁNDAR (ADR-046): precisión y convención. Los textos para el dueño van en criollo claro.

// ── Commits convencionales → notas de versión ────────────────────────────────────────────────

/** Secciones de las notas, en el orden en que se muestran. */
export const SECCIONES = [
  { tipo: "breaking", titulo: "⚠️ Cambios que rompen" },
  { tipo: "feat", titulo: "Novedades" },
  { tipo: "fix", titulo: "Arreglos" },
  { tipo: "perf", titulo: "Rendimiento" },
  { tipo: "security", titulo: "Seguridad" },
  { tipo: "refactor", titulo: "Mejoras internas" },
  { tipo: "build", titulo: "Plataforma y CI" },
  { tipo: "docs", titulo: "Documentación" },
  { tipo: "test", titulo: "Pruebas" },
  { tipo: "chore", titulo: "Mantenimiento" },
  { tipo: "revert", titulo: "Reversiones" },
  { tipo: "otros", titulo: "Otros cambios" },
];

// Tipos que se aceptan como convencionales y a qué sección van.
const TIPO_A_SECCION = {
  feat: "feat",
  fix: "fix",
  perf: "perf",
  security: "security",
  sec: "security",
  refactor: "refactor",
  build: "build",
  ci: "build",
  docs: "docs",
  test: "test",
  tests: "test",
  chore: "chore",
  style: "chore",
  revert: "revert",
};

const CABECERA = /^(?<tipo>[a-zA-Z]+)(?:\((?<alcance>[^)]*)\))?(?<rompe>!)?:\s*(?<asunto>.+)$/;

/**
 * Parsea un commit (asunto + cuerpo). Devuelve null para los merges (no son cambios: sus commits
 * ya aparecen por separado). Un commit no convencional va a «Otros cambios» con su asunto tal cual.
 * @param {{hash: string, asunto: string, cuerpo?: string}} c
 */
export function parsearCommit(c) {
  const asunto = (c.asunto ?? "").trim();
  if (asunto === "" || /^Merge (branch|remote-tracking branch|pull request|commit) /.test(asunto)) return null;
  const cuerpo = c.cuerpo ?? "";
  const m = CABECERA.exec(asunto);
  const rompeEnCuerpo = /^BREAKING[ -]CHANGE:/m.test(cuerpo);
  const tipo = m?.groups ? TIPO_A_SECCION[m.groups.tipo.toLowerCase()] : undefined;
  // "Pedidos: algo" parece convencional pero «Pedidos» no es un tipo: va entero a «Otros».
  if (!m?.groups || !tipo) {
    return { hash: c.hash, tipo: "otros", alcance: null, asunto, rompe: rompeEnCuerpo, convencional: false };
  }
  return {
    hash: c.hash,
    tipo,
    alcance: m.groups.alcance?.trim() || null,
    asunto: m.groups.asunto.trim(),
    rompe: Boolean(m.groups.rompe) || rompeEnCuerpo,
    convencional: true,
  };
}

/** semver "x.y.z" (con o sin "v") → [x, y, z], o null. */
export function parsearVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v ?? "").trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * El salto de versión que piden los commits: "major" | "minor" | "patch" | null (nada que publicar).
 * En 0.x un cambio que rompe sube la MINOR (convención semver para versiones iniciales).
 */
export function saltoDeVersion(commits, versionActual) {
  const lista = commits.filter(Boolean);
  if (lista.length === 0) return null;
  const [mayor] = parsearVersion(versionActual) ?? [0];
  if (lista.some((c) => c.rompe)) return mayor === 0 ? "minor" : "major";
  if (lista.some((c) => c.tipo === "feat")) return "minor";
  return "patch";
}

/** Aplica el salto. */
export function siguienteVersion(versionActual, salto) {
  const v = parsearVersion(versionActual);
  if (!v) throw new Error(`versión inválida: ${versionActual}`);
  const [a, b, c] = v;
  if (salto === "major") return `${a + 1}.0.0`;
  if (salto === "minor") return `${a}.${b + 1}.0`;
  if (salto === "patch") return `${a}.${b}.${c + 1}`;
  return `${a}.${b}.${c}`;
}

/** El último tag semver (`vX.Y.Z`) de una lista de tags, o null. */
export function ultimoTagSemver(tags) {
  let mejor = null;
  for (const t of tags) {
    const v = parsearVersion(t);
    if (!v || !/^v/.test(t.trim())) continue;
    if (!mejor || comparar(v, mejor.v) > 0) mejor = { tag: t.trim(), v };
  }
  return mejor?.tag ?? null;
}

function comparar(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** Agrupa commits parseados por sección (los que rompen, además, en «Cambios que rompen»). */
export function agruparPorSeccion(commits) {
  const grupos = new Map(SECCIONES.map((s) => [s.tipo, []]));
  for (const c of commits.filter(Boolean)) {
    if (c.rompe) grupos.get("breaking").push(c);
    grupos.get(c.tipo).push(c);
  }
  return grupos;
}

/**
 * Notas de una versión, en Markdown.
 * @param {{version: string, fecha: string, commits: any[], repoUrl?: string}} o
 */
export function renderNotas({ version, fecha, commits, repoUrl }) {
  const grupos = agruparPorSeccion(commits);
  const lineas = [`## ${version} — ${fecha}`, ""];
  let alguna = false;
  for (const s of SECCIONES) {
    const lista = grupos.get(s.tipo);
    if (lista.length === 0) continue;
    alguna = true;
    lineas.push(`### ${s.titulo}`, "");
    for (const c of lista) {
      const corto = c.hash.slice(0, 8);
      const ref = repoUrl ? `[\`${corto}\`](${repoUrl}/commit/${c.hash})` : `\`${corto}\``;
      lineas.push(`- ${c.alcance ? `**${c.alcance}:** ` : ""}${c.asunto} (${ref})`);
    }
    lineas.push("");
  }
  if (!alguna) lineas.push("_Sin cambios._", "");
  return lineas.join("\n");
}

export const CABECERA_CHANGELOG = `# Changelog

Todas las versiones del ERP de Gestión Studio Grow. Lo genera \`npm run release:notas\`
(scripts/release/notas.mjs) a partir de los commits convencionales; no se edita a mano.
Versionado semántico por tag (\`vX.Y.Z\`): \`feat\` sube la minor, \`fix\` y el resto la patch,
un cambio que rompe (\`!\` o \`BREAKING CHANGE:\`) la major (la minor mientras estemos en 0.x).

`;

/**
 * Inserta (o reemplaza) la entrada de `version` en el CHANGELOG existente, debajo de la cabecera.
 * Idempotente: correrlo dos veces con la misma versión deja el mismo archivo.
 */
export function insertarEnChangelog(existente, notas, version) {
  const previo = String(existente ?? "");
  const inicio = previo.indexOf("\n## ");
  const cuerpo = inicio === -1 ? "" : previo.slice(inicio + 1);
  const entradas = cuerpo.split(/(?=^## )/m).filter((e) => e.trim() !== "");
  const sinLaMisma = entradas.filter((e) => !e.startsWith(`## ${version} `));
  return `${CABECERA_CHANGELOG}${notas.trimEnd()}\n\n${sinLaMisma.map((e) => e.trimEnd()).join("\n\n")}${sinLaMisma.length ? "\n" : ""}`;
}

// ── Gate de Excelencia: checklist del PR ────────────────────────────────────────────────────

/** Los 4 bloques del Gate (CLAUDE.md). Cada uno se reconoce por alguna de sus palabras. */
export const BLOQUES_GATE = [
  { id: "sap", nombre: "1. Auditoría SAP Fiori + ángulo argentino", patron: /(SAP|Fiori|Excelencia UX)/i },
  { id: "sello", nombre: "2. Sello de marca GSG", patron: /Sello/i },
  { id: "arquitectura", nombre: "3. Excelencia Arquitectura", patron: /Arquitectura/i },
  { id: "confiabilidad", nombre: "4. Confiabilidad de Producción", patron: /Confiabilidad/i },
];

/**
 * Revisa el cuerpo de un PR: que tenga el Gate de Excelencia, los 4 bloques, y ninguna casilla
 * sin tildar salvo las marcadas N/A (con su porqué). PURA.
 * @returns {{ok: boolean, faltan: string[], sinTildar: string[], tildadas: number}}
 */
export function revisarChecklistPR(cuerpo) {
  const texto = String(cuerpo ?? "");
  const faltan = [];
  if (!/Gate de Excelencia/i.test(texto)) faltan.push("la sección «Gate de Excelencia»");
  // Sólo se buscan los bloques en los TÍTULOS (líneas que empiezan con #), no en cualquier texto.
  const titulos = texto.split(/\r?\n/).filter((l) => /^\s*#{1,6}\s/.test(l)).join("\n");
  for (const b of BLOQUES_GATE) if (!b.patron.test(titulos)) faltan.push(`el bloque «${b.nombre}»`);
  const casillas = texto.split(/\r?\n/).filter((l) => /^\s*[-*]\s+\[[ xX]\]/.test(l));
  const sinTildar = casillas
    .filter((l) => /\[ \]/.test(l) && !/\bN\/?A\b/i.test(l))
    .map((l) => l.trim().slice(0, 160));
  const tildadas = casillas.filter((l) => /\[[xX]\]/.test(l)).length;
  return { ok: faltan.length === 0 && sinTildar.length === 0 && tildadas > 0, faltan, sinTildar, tildadas };
}

// ── Sello GSG en metadata ───────────────────────────────────────────────────────────────────

export const SELLO_GENERATOR = /generator\s*:\s*["'`]Gestión Studio Grow["'`]/;

/**
 * ¿Cada página tiene el sello, ella o algún layout ancestro? `archivos` es un Map ruta→contenido
 * (rutas con "/", relativas a la raíz del repo). Devuelve las páginas sin sello. PURA.
 * @param {Map<string,string>} archivos
 * @param {string[]} paginas
 * @param {string} raizApp  ej. "src/app"
 */
export function paginasSinSello(archivos, paginas, raizApp = "src/app") {
  const tieneSello = (ruta) => SELLO_GENERATOR.test(archivos.get(ruta) ?? "");
  const faltan = [];
  for (const p of paginas) {
    if (tieneSello(p)) continue;
    let dir = p.slice(0, p.lastIndexOf("/"));
    let ok = false;
    while (dir.length >= raizApp.length) {
      for (const nombre of ["layout.tsx", "layout.ts", "layout.jsx", "layout.js"]) {
        if (tieneSello(`${dir}/${nombre}`)) ok = true;
      }
      if (ok || dir === raizApp) break;
      dir = dir.slice(0, dir.lastIndexOf("/"));
    }
    if (!ok) faltan.push(p);
  }
  return faltan;
}

// ── Smoke post-deploy ───────────────────────────────────────────────────────────────────────

/**
 * Evalúa una respuesta del smoke. Resultado: "ok" | "aviso" | "falla", con un texto criollo.
 * @param {"health"|"ready"|"facturita"|"contador"|"login"} chequeo
 * @param {{status: number, location?: string|null, json?: any, texto?: string}} r
 * @param {{commit?: string, modo?: "produccion"|"preview"}} esperado
 */
export function evaluarSmoke(chequeo, r, esperado = {}) {
  const preview = esperado.modo === "preview";
  if (r.status === 401 || r.status === 403) {
    return { nivel: preview ? "aviso" : "falla", texto: `HTTP ${r.status}: el deploy está protegido (Vercel Authentication). En preview es normal.` };
  }
  if (chequeo !== "health" && r.status === 503 && /Preview bloqueado/i.test(r.texto ?? "")) {
    return { nivel: preview ? "aviso" : "falla", texto: "preview bloqueado: apunta a la base de producción (scripts/preview-base.mjs)." };
  }
  switch (chequeo) {
    case "health": {
      if (r.status !== 200 || r.json?.status !== "ok") return { nivel: "falla", texto: `/api/health respondió ${r.status}` };
      if (esperado.commit && !String(r.json.commit ?? "").startsWith(esperado.commit)) {
        return { nivel: "falla", texto: `corre el commit ${String(r.json.commit).slice(0, 8)}, se esperaba ${esperado.commit.slice(0, 8)}` };
      }
      const a = r.json.arca;
      const arca = a ? ` · ARCA ${a.facturacion ? "encendida" : "apagada"}, modo ${a.modo}${a.facturacion && !a.cronProtegido ? " (¡sin CRON_SECRET!)" : ""}` : "";
      if (a?.facturacion && !a.cronProtegido) return { nivel: "falla", texto: `vivo${arca}` };
      if (a?.flags?.erroresDeConfig > 0) return { nivel: "aviso", texto: `vivo${arca} · FACTURACION_FLAGS con ${a.flags.erroresDeConfig} error(es)` };
      return { nivel: "ok", texto: `vivo, commit ${String(r.json.commit ?? "?").slice(0, 8)}${arca}` };
    }
    case "ready": {
      if (r.status !== 200 || r.json?.status !== "ready") return { nivel: preview ? "aviso" : "falla", texto: `/api/ready respondió ${r.status} (¿la base no responde?)` };
      const a = r.json.arca;
      if (!a) return { nivel: "ok", texto: "base OK" };
      const resumen = `base OK · motor ARCA: ${a.estado}${a.alertas?.length ? ` (${a.alertas.join(", ")})` : ""}`;
      if (a.estado === "critico") return { nivel: "aviso", texto: `${resumen} → ver docs/runbooks/facturacion/incidentes.md` };
      if (a.estado === "atencion" || a.estado === "sin-medicion") return { nivel: "aviso", texto: resumen };
      return { nivel: "ok", texto: resumen };
    }
    case "facturita": {
      if (r.status === 200) return { nivel: "ok", texto: "Facturita abre" };
      if (r.status >= 300 && r.status < 400) return { nivel: "aviso", texto: `Facturita redirige a ${r.location ?? "?"} (¿portón del sitio?)` };
      return { nivel: "falla", texto: `Facturita respondió ${r.status}` };
    }
    case "contador": {
      // Sin sesión, /contador manda al login del negocio (portón de tenant, src/proxy.ts).
      if (r.status >= 300 && r.status < 400 && /\/admin\/login/.test(r.location ?? "")) {
        return { nivel: "ok", texto: "el panel del contador pide login" };
      }
      if (r.status === 200) return { nivel: "falla", texto: "¡/contador respondió 200 SIN sesión! El portón de tenant no está cerrando." };
      return { nivel: "falla", texto: `/contador respondió ${r.status}${r.location ? ` → ${r.location}` : ""}` };
    }
    case "login": {
      if (r.status === 200) return { nivel: "ok", texto: "el login abre" };
      return { nivel: "falla", texto: `/admin/login respondió ${r.status}` };
    }
    default:
      return { nivel: "falla", texto: `chequeo desconocido: ${chequeo}` };
  }
}

/** El exit code del smoke: 1 si alguna falla. */
export function codigoSalidaSmoke(resultados) {
  return resultados.some((r) => r.nivel === "falla") ? 1 : 0;
}

// ── Migraciones ──────────────────────────────────────────────────────────────────────────────

/**
 * Colisiones de timestamp entre carpetas de prisma/migrations (`AAAAMMDDhhmmss_nombre`): dos con el
 * mismo prefijo se aplican en un orden que depende del nombre, no de la intención. PURA.
 */
export function colisionesDeMigraciones(carpetas) {
  const porTs = new Map();
  for (const c of carpetas) {
    const m = /^(\d{14})_/.exec(c);
    if (!m) continue;
    porTs.set(m[1], [...(porTs.get(m[1]) ?? []), c]);
  }
  return [...porTs.values()].filter((l) => l.length > 1);
}

/** Las migraciones nombradas en prisma/lote-deploy.txt (ignora comentarios y vacías). PURA. */
export function leerLote(texto) {
  return String(texto ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*/, "").trim())
    .filter((l) => /^\d{14}_/.test(l));
}
