#!/usr/bin/env node
// ============================================================================
// NOTAS DE VERSIÓN + VERSIONADO SEMVER — `npm run release:notas -- [opciones]`
// ============================================================================
//
// Lee los commits desde el último tag `vX.Y.Z` (o desde --desde), los agrupa por tipo
// convencional (feat/fix/perf/…; lo no convencional va a «Otros cambios»), propone la próxima
// versión y muestra las notas. Con --escribir actualiza CHANGELOG.md (idempotente). Con --tag crea
// el tag anotado LOCAL `vX.Y.Z` — nunca lo pushea: publicar el tag es del dueño, porque en este repo
// un push a main ya es un deploy (CLAUDE.md, «Autorización y gates»).
//
// Opciones:
//   --desde <ref>     desde dónde contar (default: último tag vX.Y.Z; sin tags: origin/main si existe
//                     y no es HEAD, si no toda la historia).
//   --hasta <ref>     hasta dónde (default HEAD).
//   --version <x.y.z> fuerza la versión (si no, la calcula: base = último tag o package.json).
//   --escribir        actualiza CHANGELOG.md.
//   --tag             crea el tag local vX.Y.Z (requiere --escribir antes, en otro commit).
//   --json            imprime {version, salto, desde, commits, notas} en JSON.
//
// Sin dependencias. Exit 0 siempre que pueda leer git; 2 si no.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { commits as leerCommits, existeRef, git, tags, urlDelRepo, crearTagLocal } from "./git.mjs";
import {
  insertarEnChangelog,
  parsearCommit,
  parsearVersion,
  renderNotas,
  saltoDeVersion,
  siguienteVersion,
  ultimoTagSemver,
} from "./lib.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function arg(nombre) {
  const i = process.argv.indexOf(nombre);
  return i === -1 ? undefined : process.argv[i + 1];
}
const bandera = (n) => process.argv.includes(n);

/** Calcula todo lo de una versión. Exportado para preparar.mjs. */
export function calcularRelease({ desde, hasta = "HEAD", version } = {}) {
  const opts = { cwd: RAIZ };
  const ultimoTag = ultimoTagSemver(tags(opts));
  let base = desde ?? ultimoTag;
  if (!base && existeRef("origin/main", opts)) {
    const head = git(["rev-parse", hasta], opts);
    const main = git(["rev-parse", "origin/main"], opts);
    if (head !== main) base = "origin/main";
  }
  const crudos = leerCommits(base ?? null, hasta, opts);
  const parseados = crudos.map(parsearCommit).filter(Boolean);
  const pkg = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));
  const actual = ultimoTag ? ultimoTag.replace(/^v/, "") : pkg.version;
  const salto = saltoDeVersion(parseados, actual);
  const nueva = version ?? (salto ? siguienteVersion(actual, salto) : actual);
  if (!parsearVersion(nueva)) throw new Error(`--version inválida: ${nueva}`);
  const fecha = new Date().toISOString().slice(0, 10);
  const notas = renderNotas({ version: nueva, fecha, commits: parseados, repoUrl: urlDelRepo(opts) });
  const convencionales = parseados.filter((c) => c.convencional).length;
  return { version: nueva, actual, salto, desde: base ?? "(toda la historia)", hasta, commits: parseados.length, convencionales, notas };
}

function main() {
  let r;
  try {
    r = calcularRelease({ desde: arg("--desde"), hasta: arg("--hasta"), version: arg("--version") });
  } catch (err) {
    console.error(`✖ ${err instanceof Error ? err.message : err}`);
    process.exit(2);
  }
  if (bandera("--json")) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log(`Versión actual ${r.actual} → propuesta ${r.version} (${r.salto ?? "sin cambios"})`);
    console.log(`Rango: ${r.desde}..${r.hasta} · ${r.commits} commits (${r.convencionales} convencionales)\n`);
    console.log(r.notas);
  }
  if (bandera("--escribir")) {
    const ruta = join(RAIZ, "CHANGELOG.md");
    const previo = existsSync(ruta) ? readFileSync(ruta, "utf8") : "";
    writeFileSync(ruta, insertarEnChangelog(previo, r.notas, r.version));
    console.error(`✔ CHANGELOG.md actualizado con ${r.version}. Commitealo por pathspec: git add CHANGELOG.md`);
  }
  if (bandera("--tag")) {
    const tag = `v${r.version}`;
    if (tags({ cwd: RAIZ }).includes(tag)) {
      console.error(`✖ el tag ${tag} ya existe.`);
      process.exit(1);
    }
    crearTagLocal(tag, `Release ${r.version}`, { cwd: RAIZ });
    console.error(`✔ tag LOCAL ${tag} creado. No se pusheó: publicarlo (git push origin ${tag}) es decisión del dueño.`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
