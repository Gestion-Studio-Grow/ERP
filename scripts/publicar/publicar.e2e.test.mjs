// Recorrido completo de publicar.mjs contra un GitHub/Vercel/Neon FALSOS (servidor local).
// Verifica el camino feliz en modo real y que cada rojo frene ANTES del merge.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = new URL("./publicar.mjs", import.meta.url).pathname;
const HEAD = "h".repeat(40);
const BASE = "b".repeat(40);
const MERGE = "m".repeat(40);
const NP = "np-cuenta-secreta";
const VP = "prj_cuenta_secreta";

const SQL_OK = `CREATE TABLE "Nueva" ("id" TEXT, "tenantId" TEXT);
ALTER TABLE "Nueva" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Nueva";
CREATE POLICY tenant_isolation ON "Nueva"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));`;

function escenario(cambios = {}) {
  const e = {
    permiso: { permission: "admin", role_name: "admin" },
    pr: {
      state: "open",
      draft: false,
      mergeable: true,
      mergeable_state: "clean",
      title: "Módulo nuevo [sin-deploy]",
      base: { ref: "main" },
      head: { sha: HEAD, repo: { full_name: "gsg/erp" } },
      labels: [{ name: "gsg:publicar" }],
    },
    behind: 0,
    deploysAntes: [{ uid: "dpl_prev", state: "READY", created: 1, meta: { githubCommitSha: BASE } }],
    jobsPr: [
      { name: "tsc", status: "completed", conclusion: "success" },
      { name: "lint", status: "completed", conclusion: "failure" },
    ],
    jobsMain: [
      { name: "tsc", status: "completed", conclusion: "success" },
      { name: "lint", status: "completed", conclusion: "failure" },
    ],
    archivos: [
      { filename: "src/x.ts", status: "modified" },
      { filename: "prisma/migrations/20261109120000_nueva/migration.sql", status: "added" },
    ],
    sql: SQL_OK,
    lote: "# lote\n20261109120000_nueva\n",
    envVercel: [{ key: "MIGRATE_DATABASE_URL", target: ["production"] }],
    deployMerge: "READY",
    ...cambios,
  };
  e.llamadas = [];
  return e;
}

function servidor(e) {
  const srv = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const p = url.pathname;
    let cuerpo = "";
    req.on("data", (d) => (cuerpo += d));
    req.on("end", () => {
      e.llamadas.push(`${req.method} ${p}`);
      const json = (o, st = 200) => {
        res.writeHead(st, { "Content-Type": "application/json" });
        res.end(JSON.stringify(o));
      };
      const raw = (t) => {
        res.writeHead(200);
        res.end(t);
      };
      const R = "/gh/repos/gsg/erp";
      if (p === `${R}/collaborators/ana/permission`) return json(e.permiso);
      if (p === `${R}/pulls/5` && req.method === "GET") return json(e.pr);
      if (p === `${R}/git/ref/heads/main`) return json({ object: { sha: BASE } });
      if (p === `${R}/compare/${BASE}...${HEAD}`) return json({ behind_by: e.behind });
      const mRuns = /^\/gh\/repos\/gsg\/erp\/actions\/workflows\/([^/]+)\/runs$/.exec(p);
      if (mRuns) {
        if (url.searchParams.get("head_sha"))
          return json({ workflow_runs: [{ id: 10, event: "push", head_sha: HEAD, status: "completed", conclusion: "success", created_at: "2026-11-08T10:00:00Z", html_url: "u" }] });
        return json({ workflow_runs: [{ id: 20, event: "push", head_sha: BASE, status: "completed", conclusion: "success", created_at: "2026-11-08T09:00:00Z" }] });
      }
      if (p === `${R}/actions/runs/10/jobs`) return json({ jobs: e.jobsPr });
      if (p === `${R}/actions/runs/20/jobs`) return json({ jobs: e.jobsMain });
      if (p === `${R}/pulls/5/files`) return json(url.searchParams.get("page") === "1" ? e.archivos : []);
      if (p === `${R}/contents/prisma/migrations`) {
        const dirs = [{ type: "dir", name: "20261108120000_vieja" }];
        if (url.searchParams.get("ref") === HEAD) dirs.push({ type: "dir", name: "20261109120000_nueva" }, ...(e.dirsExtraHead ?? []));
        return json(dirs);
      }
      if (p === `${R}/contents/prisma/migrations/20261108120000_vieja/migration.sql`) return raw(e.sqlVieja ?? "CREATE TABLE \"V\" (\"id\" TEXT);");
      if (p === `${R}/contents/prisma/migrations/20261109120000_nueva/migration.sql`) return raw(e.sql);
      if (p === `${R}/contents/prisma/lote-deploy.txt`) return raw(e.lote);
      if (p === `${R}/git/commits/${HEAD}` && req.method === "GET") return json({ sha: HEAD, tree: { sha: "arbol-head" } });
      if (p === `${R}/git/commits` && req.method === "POST") {
        e.commitMerge = JSON.parse(cuerpo);
        return json({ sha: MERGE }, 201);
      }
      if (p === `${R}/git/refs/heads/main` && req.method === "PATCH") {
        // main se movió entre la verificación y el merge: no es fast-forward → 422.
        if (e.mainSeMueve) return json({ message: "Update is not a fast forward" }, 422);
        e.mergeBody = JSON.parse(cuerpo);
        return json({ object: { sha: MERGE } });
      }
      if (p === `${R}/pulls/5/merge`) {
        e.mergeConApiDePr = true;
        return json({ merged: true, sha: MERGE });
      }
      if (p === `${R}/issues/5/comments`) {
        e.comentario = JSON.parse(cuerpo).body;
        return json({}, 201);
      }
      if (p.startsWith(`${R}/issues/5/labels/`)) return json([]);
      if (p === "/vercel/v6/deployments") {
        const ds = [...e.deploysAntes];
        if (e.mergeBody) ds.push({ uid: "dpl_new", state: e.deployMerge, created: 9, meta: { githubCommitSha: MERGE } });
        return json({ deployments: ds });
      }
      if (p === `/vercel/v9/projects/${VP}/env`) return e.vercelEnvFalla ? json({ message: `project ${VP} not found` }, 404) : json({ envs: e.envVercel });
      if (p === `/neon/projects/${NP}/branches` && req.method === "GET") return json({ branches: [{ id: "br-main", default: true }] });
      if (p === `/neon/projects/${NP}/branches` && req.method === "POST") {
        e.respaldo = JSON.parse(cuerpo).branch;
        return json({ branch: { id: "br-resp", name: e.respaldo.name }, operations: [{ id: "op1" }] }, 201);
      }
      if (p === `/neon/projects/${NP}/operations/op1`) return json({ operation: { status: "finished" } });
      if (p === `/neon/projects/${NP}/branches/br-resp`) return json({ branch: { id: "br-resp", name: e.respaldo?.name } });
      if (p === `/neon/projects/${NP}/branches/br-main`) return json({ branch: { id: "br-main" } });
      if (p === "/prod/api/health") return json({ status: "ok", commit: e.mergeBody ? MERGE : BASE });
      if (p === "/prod/api/ready") return json({ status: "ready" });
      json({ message: `ruta no simulada ${req.method} ${p}` }, 404);
    });
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv)));
}

function paso(nombre, env) {
  return new Promise((resolve) => {
    const ch = spawn(process.execPath, [SCRIPT, nombre], { env });
    let out = "";
    ch.stdout.on("data", (d) => (out += d));
    ch.stderr.on("data", (d) => (out += d));
    ch.on("close", (code) => resolve({ code, out }));
  });
}
async function recorrer(e, modo = "real") {
  const srv = await servidor(e);
  const base = `http://127.0.0.1:${srv.address().port}`;
  const dir = mkdtempSync(join(tmpdir(), "publicar-"));
  const salida = join(dir, "out");
  writeFileSync(salida, "");
  const comun = {
    PATH: process.env.PATH,
    GITHUB_REPOSITORY: "gsg/erp",
    GITHUB_API_URL: `${base}/gh`,
    PUBLICAR_VERCEL_API: `${base}/vercel`,
    PUBLICAR_NEON_API: `${base}/neon`,
    PROD_URL: `${base}/prod`,
    GITHUB_OUTPUT: salida,
    PUBLICAR_INFORME: join(dir, "informe.md"),
    PR_NUMBER: "5",
    SENDER: "ana",
    GH_TOKEN: "t",
    PUBLICAR_GH_TOKEN: "t2",
    NEON_API_KEY: "k",
    NEON_PROJECT_ID: NP,
    VERCEL_TOKEN: "v",
    VERCEL_PROJECT_ID: VP,
    PUBLICAR_MODO: modo,
    CI_WORKFLOWS: "gates.yml",
    PUBLICAR_SONDEO_MS: "10",
    CI_ESPERA_MIN: "0.01",
  };
  let frenoEn = null;
  for (const nombre of ["precondiciones", "ci", "cambios", "respaldo", "merge", "vercel"]) {
    const outs = Object.fromEntries(
      readFileSync(salida, "utf8").split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
    );
    const r = await paso(nombre, {
      ...comun,
      HEAD_SHA: outs.head_sha ?? "",
      BASE_SHA: outs.base_sha ?? "",
      MERGE_SHA: outs.merge_sha ?? "",
      RESPALDO: outs.respaldo ?? "",
    });
    if (r.code !== 0) {
      frenoEn = nombre;
      break;
    }
  }
  await paso("comentar", { ...comun, JOB_STATUS: frenoEn ? "failure" : "success" });
  srv.close();
  return { frenoEn, informe: readFileSync(join(dir, "informe.md"), "utf8") };
}

test("camino feliz (modo real): respaldo, merge del sha exacto, deploy READY, comentario PUBLICADO", async () => {
  const e = escenario();
  const r = await recorrer(e);
  assert.equal(r.frenoEn, null, r.informe);
  assert.match(e.respaldo.name, /^respaldo-pre-pr-5-\d{8}-\d{6}$/);
  assert.equal(e.respaldo.parent_id, "br-main");
  // Merge = commit con padres EXACTOS (base verificada + head verificado) y main movido con
  // force:false (compare-and-swap), nunca la API de merge del PR.
  assert.deepEqual(e.commitMerge.parents, [BASE, HEAD]);
  assert.equal(e.commitMerge.tree, "arbol-head");
  assert.match(e.commitMerge.message, /^Merge PR #5: Módulo nuevo\n/);
  assert.deepEqual(e.mergeBody, { sha: MERGE, force: false });
  assert.equal(e.mergeConApiDePr, undefined);
  assert.match(e.comentario, /PUBLICADO en producción/);
  // El respaldo se crea ANTES del merge.
  assert.ok(e.llamadas.indexOf(`POST /neon/projects/${NP}/branches`) < e.llamadas.indexOf("PATCH /gh/repos/gsg/erp/git/refs/heads/main"));
});

test("simulación: revisa todo pero NO crea respaldo ni mergea", async () => {
  const e = escenario();
  const r = await recorrer(e, "simulacion");
  assert.equal(r.frenoEn, null, r.informe);
  assert.equal(e.respaldo, undefined);
  assert.equal(e.mergeBody, undefined);
  assert.match(e.comentario, /SIMULACIÓN OK/);
});

const sinMerge = (e) => {
  assert.equal(e.mergeBody, undefined, "no debía mergear");
  assert.equal(e.respaldo, undefined, "no debía crear respaldo");
  assert.match(e.comentario, /FRENADO/);
};

for (const [nombre, cambios, pasoEsperado] of [
  ["rojo nuevo en CI", { jobsPr: [{ name: "tsc", status: "completed", conclusion: "failure" }, { name: "lint", status: "completed", conclusion: "failure" }] }, "ci"],
  ["job que falta en el PR", { jobsPr: [{ name: "lint", status: "completed", conclusion: "failure" }] }, "ci"],
  ["migración con DROP", { sql: `ALTER TABLE "Client" DROP COLUMN "x";` }, "cambios"],
  ["migración con enum", { sql: `ALTER TYPE "Estado" ADD VALUE 'X';` }, "cambios"],
  ["migración fuera del lote", { lote: "# vacío\n" }, "cambios"],
  ["sin MIGRATE_DATABASE_URL en Vercel", { envVercel: [] }, "cambios"],
  ["el lote nombra una migración vieja de main que no es aditiva", { archivos: [{ filename: "src/x.ts", status: "modified" }], lote: "20261108120000_vieja\n", sqlVieja: 'ALTER TABLE "Client" DROP COLUMN "x";' }, "cambios"],
  ["el lote nombra una carpeta que no existe", { lote: "20261109120000_nueva\n../../etc\n" }, "cambios"],
  ["UPDATE que pisa una columna existente", { sql: `UPDATE "Client" SET "email" = NULL;` }, "cambios"],
  ["toca prisma.config.ts", { archivos: [{ filename: "prisma.config.ts", status: "modified" }] }, "cambios"],
  ["toca un workflow", { archivos: [{ filename: ".github/workflows/gates.yml", status: "modified" }] }, "cambios"],
  ["edita una migración existente", { archivos: [{ filename: "prisma/migrations/20261108120000_vieja/migration.sql", status: "modified" }] }, "cambios"],
  ["rama atrás de main", { behind: 2 }, "precondiciones"],
  ["etiqueta puesta por alguien sin write", { permiso: { permission: "read", role_name: "triage" } }, "precondiciones"],
  ["PR borrador", { pr: { ...escenario().pr, draft: true } }, "precondiciones"],
  ["PR de un fork", { pr: { ...escenario().pr, head: { sha: HEAD, repo: { full_name: "otro/erp" } } } }, "precondiciones"],
  ["producción con rojo vigente", { deploysAntes: [{ uid: "d2", state: "ERROR", created: 2 }, { uid: "d1", state: "READY", created: 1 }] }, "precondiciones"],
  ["deploy en curso (uno a la vez)", { deploysAntes: [{ uid: "d2", state: "BUILDING", created: 2 }] }, "precondiciones"],
]) {
  test(`frena antes del merge: ${nombre}`, async () => {
    const e = escenario(cambios);
    const r = await recorrer(e);
    assert.equal(r.frenoEn, pasoEsperado, r.informe);
    sinMerge(e);
  });
}

test("deploy de Vercel en ERROR después del merge → FRENADO y lo dice", async () => {
  const e = escenario({ deployMerge: "ERROR" });
  const r = await recorrer(e);
  assert.equal(r.frenoEn, "vercel");
  assert.match(e.comentario, /FRENADO/);
  assert.match(e.comentario, /El merge ya está en main/);
});

test("main se mueve entre la verificación y el merge → la rama no se toca y frena", async () => {
  const e = escenario({ mainSeMueve: true });
  const r = await recorrer(e);
  assert.equal(r.frenoEn, "merge", r.informe);
  assert.equal(e.mergeBody, undefined, "main no debía moverse");
  assert.equal(e.mergeConApiDePr, undefined);
  assert.match(e.comentario, /No se mergeó nada/);
});

test("los ids de proyecto de Neon/Vercel no salen en el comentario aunque un error los traiga", async () => {
  const e = escenario({ vercelEnvFalla: true });
  const r = await recorrer(e);
  assert.equal(r.frenoEn, "cambios", r.informe);
  assert.ok(!e.comentario.includes(VP), e.comentario);
  assert.ok(!e.comentario.includes(NP), e.comentario);
  assert.match(e.comentario, /\*\*\*/);
});
