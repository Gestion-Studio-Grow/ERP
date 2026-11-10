import { test } from "node:test";
import assert from "node:assert/strict";
import { compararJobs, ultimaPorEvento, elegirBaseMain } from "./lib/ci.mjs";

const j = (name, conclusion, status = "completed") => ({ name, status, conclusion });

const MAIN = [
  j("lint (no-bloqueante · deuda pre-existente)", "failure"),
  j("tsc (tipos)", "success"),
  j("tests (npm test)", "success"),
  j("build (next build)", "success"),
  j("visual (render real) · BLOQUEANTE", "success"),
];

test("todo verde y la deuda de lint heredada → sin rojos nuevos", () => {
  const r = compararJobs(MAIN.map((x) => ({ ...x })), MAIN);
  assert.deepEqual(r.nuevos, []);
  assert.equal(r.heredados.length, 1);
});

test("un job rojo que en main está verde → rojo nuevo", () => {
  const pr = MAIN.map((x) => (x.name.startsWith("tests") ? j(x.name, "failure") : x));
  const r = compararJobs(pr, MAIN);
  assert.equal(r.nuevos.length, 1);
  assert.match(r.nuevos[0], /tests/);
});

test("cancelled y timed_out cuentan como rojo", () => {
  for (const c of ["cancelled", "timed_out", "action_required", "startup_failure", null]) {
    const pr = MAIN.map((x) => (x.name.startsWith("tsc") ? j(x.name, c) : x));
    assert.equal(compararJobs(pr, MAIN).nuevos.length, 1, String(c));
  }
});

test("un job que corre en main y falta en el PR → rojo nuevo", () => {
  const pr = MAIN.filter((x) => !x.name.startsWith("visual"));
  const r = compararJobs(pr, MAIN);
  assert.equal(r.nuevos.length, 1);
  assert.match(r.nuevos[0], /no aparece en el PR/);
});

test("un job salteado en el PR que en main corre verde → rojo nuevo (mismo evento)", () => {
  const pr = MAIN.map((x) => (x.name.startsWith("visual") ? j(x.name, "skipped") : x));
  assert.equal(compararJobs(pr, MAIN).nuevos.length, 1);
  // En la corrida pull_request (otro evento que main) un salteado no frena.
  assert.equal(compararJobs(pr, MAIN, { mismoEvento: false }).nuevos.length, 0);
});

test("un job rojo que no existe en main → rojo nuevo", () => {
  const r = compararJobs([...MAIN, j("gate-pr", "failure")], MAIN);
  assert.equal(r.nuevos.length, 1);
});

test("job en curso → pendiente, no veredicto", () => {
  const pr = MAIN.map((x) => (x.name.startsWith("build") ? j(x.name, null, "in_progress") : x));
  const r = compararJobs(pr, MAIN);
  assert.deepEqual(r.pendientes, ["build (next build)"]);
  assert.deepEqual(r.nuevos, []);
});

test("nombres duplicados en el PR → rojo (no se compara a ciegas)", () => {
  const r = compararJobs([...MAIN, j("tsc (tipos)", "success")], MAIN);
  assert.equal(r.nuevos.length, 1);
  assert.match(r.nuevos[0], /mismo nombre/);
});

test("rojo en main que en el PR es verde → no frena", () => {
  const main = MAIN.map((x) => (x.name.startsWith("tsc") ? j(x.name, "failure") : x));
  assert.deepEqual(compararJobs(MAIN, main).nuevos, []);
});

test("ultimaPorEvento: la más nueva de cada evento, sólo del sha pedido", () => {
  const c = [
    { id: 1, event: "push", head_sha: "a", created_at: "2026-11-08T10:00:00Z" },
    { id: 2, event: "push", head_sha: "a", created_at: "2026-11-08T11:00:00Z" },
    { id: 3, event: "pull_request", head_sha: "a", created_at: "2026-11-08T10:30:00Z" },
    { id: 4, event: "push", head_sha: "b", created_at: "2026-11-08T12:00:00Z" },
    { id: 5, event: "workflow_dispatch", head_sha: "a", created_at: "2026-11-08T12:00:00Z" },
  ];
  assert.deepEqual(ultimaPorEvento(c, "a").map((x) => x.id).sort(), [2, 3]);
});

test("elegirBaseMain: la del commit de main; si corre, esperar; si no hay, la última con aviso", () => {
  const runs = [
    { id: 1, event: "push", head_sha: "m1", status: "completed", created_at: "2026-11-08T09:00:00Z" },
    { id: 2, event: "push", head_sha: "m2", status: "in_progress", created_at: "2026-11-08T10:00:00Z" },
  ];
  assert.equal(elegirBaseMain(runs, "m1").corrida.id, 1);
  assert.equal(elegirBaseMain(runs, "m2").esperar, true);
  const r = elegirBaseMain(runs, "m3");
  assert.equal(r.corrida.id, 1);
  assert.ok(r.aviso);
  assert.equal(elegirBaseMain([], "m").corrida, null);
});
