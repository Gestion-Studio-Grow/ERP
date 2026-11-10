import { test } from "node:test";
import assert from "node:assert/strict";
import { clasificarArchivos, leerLote, cambioDeScripts, rutaSensible } from "./lib/cambios.mjs";
import { nombreRespaldo, tituloMerge, evaluarProduccion, deployDelCommit, estadoDeploy, saludOk, puedePublicar } from "./lib/util.mjs";

const EN_MAIN = ["20261106120000_support_ticket", "20261108120000_profeturnos_clubes_serie_grupal"];
const f = (filename, status = "modified", previous_filename) => ({ filename, status, previous_filename });

test("código de la app y una migración nueva → sin bloqueos, migración detectada", () => {
  const r = clasificarArchivos(
    [f("src/app/page.tsx"), f("prisma/schema.prisma"), f("prisma/migrations/20261109120000_nueva/migration.sql", "added")],
    EN_MAIN,
  );
  assert.deepEqual(r.bloqueos, []);
  assert.deepEqual(r.nuevas, ["20261109120000_nueva"]);
  assert.equal(r.tocaSchema, true);
});

test("modificar, borrar o renombrar una migración existente → frena", () => {
  for (const a of [
    f("prisma/migrations/20261106120000_support_ticket/migration.sql", "modified"),
    f("prisma/migrations/20261106120000_support_ticket/migration.sql", "removed"),
    f("prisma/migrations/20261110000000_x/migration.sql", "renamed", "prisma/migrations/20261106120000_support_ticket/migration.sql"),
  ]) {
    const r = clasificarArchivos([a], EN_MAIN);
    assert.equal(r.bloqueos.length, 1, JSON.stringify(a));
    assert.deepEqual(r.nuevas, []);
  }
});

test("una carpeta 'nueva' con el nombre de una que ya está en main → frena", () => {
  const r = clasificarArchivos([f("prisma/migrations/20261106120000_support_ticket/migration.sql", "added")], EN_MAIN);
  assert.equal(r.bloqueos.length, 1);
});

test("rutas sensibles frenan (workflows, pipeline, build, vallas), también si se renombran desde ahí", () => {
  for (const ruta of [
    ".github/workflows/gates.yml",
    ".github/workflows/publicar.yml",
    "scripts/publicar/lib/sql.mjs",
    "scripts/vercel-build.mjs",
    "scripts/release/pr-checklist.mjs",
    "vercel.json",
    "prisma/migrations/migration_lock.toml",
  ]) {
    assert.ok(rutaSensible(ruta), ruta);
    assert.equal(clasificarArchivos([f(ruta)], EN_MAIN).bloqueos.length, 1, ruta);
  }
  assert.equal(clasificarArchivos([f("src/x.ts", "renamed", ".github/workflows/gates.yml")], EN_MAIN).bloqueos.length, 1);
  assert.equal(rutaSensible("src/github/x.ts"), null);
});

test("migración fuera de orden o con nombre raro → aviso, no bloqueo", () => {
  const r = clasificarArchivos(
    [f("prisma/migrations/20260101000000_vieja/migration.sql", "added"), f("prisma/migrations/rara/migration.sql", "added")],
    EN_MAIN,
  );
  assert.deepEqual(r.bloqueos, []);
  assert.equal(r.avisos.length, 2);
});

test("leerLote ignora comentarios y vacías", () => {
  assert.deepEqual(leerLote("# hola\n\n 2026_a \n#x\n2026_b\r\n"), ["2026_a", "2026_b"]);
});

test("cambioDeScripts: dependencias sí, scripts no", () => {
  const base = JSON.stringify({ scripts: { test: "node --test", build: "next build" }, dependencies: { a: "1" } });
  assert.equal(cambioDeScripts(base, JSON.stringify({ scripts: { build: "next build", test: "node --test" }, dependencies: { a: "2" } })), null);
  assert.match(cambioDeScripts(base, JSON.stringify({ scripts: { test: "true", build: "next build" } })), /scripts/);
  assert.match(cambioDeScripts(base, "{no json"), /JSON/);
});

test("nombreRespaldo", () => {
  assert.equal(nombreRespaldo(48, new Date("2026-11-08T15:30:12.345Z")), "respaldo-pre-pr-48-20261108-153012");
  assert.throws(() => nombreRespaldo("x"));
});

test("tituloMerge quita [sin-deploy] y [preview] (un merge publicado siempre construye)", () => {
  assert.equal(tituloMerge(7, "Docs [sin-deploy] nuevas"), "Merge PR #7: Docs nuevas");
  assert.equal(tituloMerge(7, "[Preview] x\ny"), "Merge PR #7: x y");
  assert.equal(tituloMerge(7, ""), "Merge PR #7: (sin título)");
});

test("evaluarProduccion: READY ok; en curso o ERROR frena; CANCELED se saltea", () => {
  assert.equal(evaluarProduccion([{ uid: "a", state: "READY", created: 1 }]).ok, true);
  assert.equal(evaluarProduccion([{ uid: "b", state: "CANCELED", created: 2 }, { uid: "a", state: "READY", created: 1 }]).ok, true);
  assert.equal(evaluarProduccion([{ uid: "b", state: "ERROR", created: 2 }, { uid: "a", state: "READY", created: 1 }]).ok, false);
  assert.equal(evaluarProduccion([{ uid: "b", state: "BUILDING", created: 2 }, { uid: "a", state: "READY", created: 1 }]).ok, false);
  assert.equal(evaluarProduccion([]).ok, false);
});

test("deployDelCommit y estadoDeploy", () => {
  const ds = [
    { uid: "x", created: 1, state: "ERROR", meta: { githubCommitSha: "s" } },
    { uid: "y", created: 2, state: "READY", meta: { githubCommitSha: "s" } },
    { uid: "z", created: 3, state: "READY", meta: { githubCommitSha: "t" } },
  ];
  assert.equal(deployDelCommit(ds, "s").uid, "y");
  assert.equal(deployDelCommit(ds, "u"), null);
  assert.equal(estadoDeploy({ state: "READY" }), "ok");
  assert.equal(estadoDeploy({ state: "ERROR" }), "rojo");
  assert.equal(estadoDeploy({ state: "CANCELED" }), "rojo");
  assert.equal(estadoDeploy({ state: "BUILDING" }), "esperar");
});

test("saludOk exige status ok y el commit exacto", () => {
  assert.equal(saludOk({ status: "ok", commit: "abc" }, "abc"), true);
  assert.equal(saludOk({ status: "ok", commit: "old" }, "abc"), false);
  assert.equal(saludOk(null, "abc"), false);
});

test("puedePublicar: write o más, y la lista PUBLICAR_QUIENES si está", () => {
  assert.equal(puedePublicar({ permission: "write", role_name: "write" }, "ana", "").ok, true);
  assert.equal(puedePublicar({ permission: "admin", role_name: "admin" }, "Ana", "ana, beto").ok, true);
  assert.equal(puedePublicar({ permission: "read", role_name: "triage" }, "ana", "").ok, false);
  assert.equal(puedePublicar({ permission: "admin", role_name: "admin" }, "carla", "ana,beto").ok, false);
});
