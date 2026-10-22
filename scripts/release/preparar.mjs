#!/usr/bin/env node
// ============================================================================
// PREPARAR UN RELEASE — `npm run release:preparar -- [--sin-build] [--smoke <url>] [--salida <ruta>]`
// ============================================================================
//
// Corre TODO lo verificable de docs/release/CHECKLIST-RELEASE.md y deja un reporte en Markdown,
// para que al dueño le quede una sola decisión: «deployá». No publica, no pushea, no toca Neon,
// no crea tags ni escribe el CHANGELOG (eso es `npm run release:notas -- --escribir`).
//
// Lo que corre (cada paso aunque otro falle; el exit final es 1 si algo BLOQUEANTE falló):
//   1. Estado del árbol: rama, commit, archivos sin commitear (aviso).
//   2. tsc --noEmit (con 6 GB de heap, como el build de Vercel).       BLOQUEANTE
//   3. npm test (cuenta pass/fail/skipped del resumen).                  BLOQUEANTE
//   4. npm run test:release (el núcleo de este tren).                    BLOQUEANTE
//   5. gate:rls (cobertura estática de RLS).                             BLOQUEANTE
//   6. gate:sello (sello GSG en el backoffice, con trinquete).           BLOQUEANTE
//   7. lint.                                                             NO bloqueante (deuda)
//   8. next build (se saltea con --sin-build; queda «no verificado»).   BLOQUEANTE
//   9. Migraciones: nuevas en esta rama vs origin/main, colisiones de timestamp, lote declarado.
//      Informa; aplicarlas es Gate 2 del dueño, NUNCA lo hace este script.
//  10. Versión propuesta + notas (scripts/release/notas.mjs).
//  11. (opcional) smoke contra --smoke <url> (ej. el preview de la rama).
//  12. Pasos HUMANOS: backup de Neon, Gate 2, variables, «deployá», smoke de producción.
//
// Reporte: --salida <ruta> o, por defecto, el directorio temporal del sistema (no ensucia el repo).
// En GitHub Actions además va al resumen del job (GITHUB_STEP_SUMMARY).

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existeRef, git } from "./git.mjs";
import { colisionesDeMigraciones, leerLote } from "./lib.mjs";
import { calcularRelease } from "./notas.mjs";
import { correrSmoke, renderSmoke } from "./smoke.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const isWin = process.platform === "win32";
const bandera = (n) => process.argv.includes(n);
const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i === -1 ? undefined : process.argv[i + 1];
};

/** Corre un comando, muestra la salida en vivo y devuelve {ok, segundos, salida}. */
function correr(cmd, args, env = {}) {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, {
    cwd: RAIZ,
    encoding: "utf8",
    shell: isWin,
    env: { ...process.env, ...env },
    maxBuffer: 256 * 1024 * 1024,
  });
  const salida = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  process.stdout.write(salida.split("\n").slice(-15).join("\n") + "\n");
  return { ok: r.status === 0, segundos: Math.round((Date.now() - t0) / 1000), salida };
}

function heap() {
  return /--max-old-space-size/.test(process.env.NODE_OPTIONS ?? "")
    ? {}
    : { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=6144`.trim() };
}

/** Lee el resumen del reporte de node --test (TAP "# pass N" o spec "ℹ pass N"). */
function resumenTests(salida) {
  const n = (k) => {
    const m = new RegExp(`^(?:# |ℹ )${k} (\\d+)`, "m").exec(salida);
    return m ? Number(m[1]) : null;
  };
  return { tests: n("tests"), pass: n("pass"), fail: n("fail"), skipped: n("skipped") };
}

const pasos = [];
function paso(nombre, bloqueante, fn) {
  console.log(`\n── ${nombre}${bloqueante ? "" : " (no bloqueante)"} …`);
  let r;
  try {
    r = fn();
  } catch (err) {
    r = { estado: "falla", detalle: err instanceof Error ? err.message : String(err) };
  }
  pasos.push({ nombre, bloqueante, ...r });
  return r;
}

const comando = (cmd, args, env) => () => {
  const r = correr(cmd, args, env);
  return { estado: r.ok ? "ok" : "falla", detalle: `${r.segundos} s`, salida: r.salida };
};

async function main() {
  const fecha = new Date().toISOString();

  // 1. Árbol
  const rama = git(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: RAIZ });
  const commit = git(["rev-parse", "HEAD"], { cwd: RAIZ });
  const sucio = git(["status", "--porcelain"], { cwd: RAIZ });
  paso("Estado del árbol", false, () => ({
    estado: sucio ? "aviso" : "ok",
    detalle: `rama ${rama} · commit ${commit.slice(0, 8)}${sucio ? ` · ${sucio.split("\n").length} archivo(s) sin commitear (no entran al release)` : " · limpio"}`,
  }));

  // 2–8. Vallas
  paso("tsc --noEmit", true, comando("npx", ["tsc", "--noEmit"], heap()));
  paso("npm test", true, () => {
    const r = correr("npm", ["test"]);
    const s = resumenTests(r.salida);
    const detalle = `${s.pass ?? "?"} pass · ${s.fail ?? "?"} fail · ${s.skipped ?? "?"} skipped · ${r.segundos} s`;
    return { estado: r.ok ? (s.skipped ? "aviso" : "ok") : "falla", detalle: s.skipped ? `${detalle} (en CI no se saltea nada: hay tests que necesitan ERP_TEST_PG_URL)` : detalle };
  });
  paso("test:release", true, comando("npm", ["run", "test:release"]));
  paso("gate:rls", true, comando("npm", ["run", "gate:rls"]));
  paso("gate:sello (sello GSG)", true, comando("npm", ["run", "gate:sello"]));
  paso("lint", false, () => {
    const r = correr("npm", ["run", "lint"]);
    return { estado: r.ok ? "ok" : "aviso", detalle: r.ok ? `${r.segundos} s` : `deuda de lint pre-existente (no bloquea) · ${r.segundos} s` };
  });
  if (bandera("--sin-build")) {
    pasos.push({ nombre: "next build", bloqueante: true, estado: "no-verificado", detalle: "salteado con --sin-build: correlo antes de pedir el deploy" });
  } else {
    paso("next build", true, comando("npm", ["run", "build"], heap()));
  }

  // 9. Migraciones (estático: no toca ninguna base)
  const dirMig = join(RAIZ, "prisma", "migrations");
  const carpetas = existsSync(dirMig) ? readdirSync(dirMig).filter((n) => /^\d{14}_/.test(n)).sort() : [];
  const colisiones = colisionesDeMigraciones(carpetas);
  let nuevas = [];
  if (existeRef("origin/main", { cwd: RAIZ })) {
    const enMain = (git(["ls-tree", "--name-only", "origin/main", "prisma/migrations/"], { cwd: RAIZ }) ?? "")
      .split("\n")
      .map((l) => l.replace(/^prisma\/migrations\//, ""));
    nuevas = carpetas.filter((c) => !enMain.includes(c));
  }
  const loteRuta = join(RAIZ, "prisma", "lote-deploy.txt");
  const lote = existsSync(loteRuta) ? leerLote(readFileSync(loteRuta, "utf8")) : [];
  const fueraDelLote = nuevas.filter((n) => !lote.includes(n));
  paso("Migraciones (Gate 2)", true, () => ({
    estado: colisiones.length ? "falla" : nuevas.length ? "aviso" : "ok",
    detalle: [
      `${carpetas.length} en el repo`,
      colisiones.length ? `COLISIÓN de timestamp: ${colisiones.map((c) => c.join(" = ")).join("; ")}` : "sin colisiones de timestamp",
      nuevas.length ? `${nuevas.length} NUEVA(S) respecto de origin/main: ${nuevas.join(", ")} → Gate 2 (backup + OK del dueño)` : "ninguna nueva respecto de origin/main",
      fueraDelLote.length ? `fuera de prisma/lote-deploy.txt: ${fueraDelLote.join(", ")} (el build de Vercel frena si no coinciden)` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  }));

  // 10. Versión y notas
  let release = null;
  paso("Versión y notas", false, () => {
    release = calcularRelease({});
    return { estado: "ok", detalle: `${release.actual} → ${release.version} (${release.salto ?? "sin cambios"}) · ${release.commits} commits desde ${release.desde}` };
  });

  // 11. Smoke opcional
  let smokeTexto = null;
  const urlSmoke = arg("--smoke");
  if (urlSmoke) {
    console.log(`\n── Smoke contra ${urlSmoke} …`);
    const res = await correrSmoke(urlSmoke, { modo: bandera("--smoke-preview") ? "preview" : "produccion" });
    smokeTexto = renderSmoke(urlSmoke, res);
    console.log(smokeTexto);
    pasos.push({
      nombre: "Smoke",
      bloqueante: true,
      estado: res.some((r) => r.nivel === "falla") ? "falla" : res.some((r) => r.nivel === "aviso") ? "aviso" : "ok",
      detalle: urlSmoke,
    });
  }

  // Reporte
  const bloqueantesRojos = pasos.filter((p) => p.bloqueante && (p.estado === "falla" || p.estado === "no-verificado"));
  const listo = bloqueantesRojos.length === 0;
  const icono = { ok: "✅", aviso: "🟡", falla: "❌", "no-verificado": "⬜" };
  const md = [
    `# Reporte de preparación de release`,
    ``,
    `- **Fecha:** ${fecha}`,
    `- **Rama / commit:** \`${rama}\` · \`${commit}\``,
    `- **Versión propuesta:** ${release ? `${release.version} (desde ${release.actual}, salto ${release.salto ?? "ninguno"})` : "no calculada"}`,
    `- **Veredicto:** ${listo ? "✅ LISTO para pedir el deploy (faltan sólo los pasos humanos de abajo)" : `❌ NO LISTO — ${bloqueantesRojos.map((p) => p.nombre).join(", ")}`}`,
    ``,
    `## Lo verificable (automático)`,
    ``,
    `| Paso | Bloquea | Estado | Detalle |`,
    `|---|---|---|---|`,
    ...pasos.map((p) => `| ${p.nombre} | ${p.bloqueante ? "sí" : "no"} | ${icono[p.estado] ?? p.estado} ${p.estado} | ${String(p.detalle ?? "").replace(/\|/g, "\\|")} |`),
    ``,
    `## Pasos HUMANOS (los hace el dueño, en este orden)`,
    ``,
    `1. [ ] **Backup de Neon** — Neon → Branches → crear branch desde \`main\` (nombre \`backup-pre-${release?.version ?? "release"}\`). Es lo único que deshace un error de datos.`,
    `2. [ ] **Gate 2 — migraciones** — ${nuevas.length ? `hay ${nuevas.length} nueva(s): revisá \`prisma/lote-deploy.txt\` y cargá \`MIGRATE_DATABASE_URL\` (sólo Production) para que el build las aplique; o dejala vacía y no se migra.` : "no hay migraciones nuevas: no cargues `MIGRATE_DATABASE_URL`."}`,
    `3. [ ] **Variables** — si el release las pide (ver notas y docs/release/CHECKLIST-RELEASE.md §Variables). Las pega el dueño; el agente nunca.`,
    `4. [ ] **«Deployá»** — merge a \`main\` (en este repo, push a main = deploy de producción en Vercel).`,
    `5. [ ] **Smoke de producción** — \`npm run release:smoke -- https://<dominio-de-producción> --commit ${commit.slice(0, 8)}\` (o esperar el del workflow \`release\`).`,
    `6. [ ] **Tag** — \`npm run release:notas -- --escribir\` + commit del CHANGELOG, y \`npm run release:notas -- --tag\` + \`git push origin v${release?.version ?? "X.Y.Z"}\`.`,
    `7. [ ] Si algo sale mal: docs/runbooks/facturacion/rollback.md.`,
    ``,
    smokeTexto ? `## Smoke\n\n\`\`\`\n${smokeTexto}\n\`\`\`\n` : ``,
    `## Notas de la versión (borrador)`,
    ``,
    release ? release.notas : "_No se pudieron calcular._",
    ``,
    `— Elaborado por GSG (Plataforma, publicación y mantenimiento) · scripts/release/preparar.mjs`,
    ``,
  ].join("\n");

  const salida = arg("--salida") ?? join(tmpdir(), `gsg-release-${commit.slice(0, 8)}.md`);
  writeFileSync(salida, md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  console.log(`\n${listo ? "✔ LISTO" : "✖ NO LISTO"} — reporte en ${salida}`);
  process.exit(listo ? 0 : 1);
}

main();
