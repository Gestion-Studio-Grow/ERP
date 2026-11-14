// T8 · Datos demo de Magra: el plan (puro) y la guarda. La corrida contra base: demo-datos-postgres.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AVISO_GATE2_FRIO,
  AVISO_GATE2_LOTES,
  CORTES_DEMO,
  LECTURAS_DEMO,
  LOTES_DEMO,
  describirPlan,
  leerArgsDemo,
  planDemoMagra,
  planVacio,
  rechazoDeLaGuarda,
  type EstadoDemo,
} from "./demo-datos";

const vacio: EstadoDemo = { cortes: [], etiquetaGuardada: false, rangoGuardado: false, lotes: [], equiposConLecturaDemo: [] };

test("negocio vacío con migraciones: el plan lo trae todo", () => {
  const p = planDemoMagra(vacio);
  assert.equal(p.cortes.length, CORTES_DEMO.length);
  assert.equal(p.lotes.length, LOTES_DEMO.length);
  assert.equal(p.lecturas.length, LECTURAS_DEMO.length);
  assert.ok(p.etiqueta && p.rango);
  assert.deepEqual(p.avisos, []);
  assert.equal(planVacio(p), false);
});

test("sin migraciones: lotes y lecturas se saltean con aviso Gate 2", () => {
  const p = planDemoMagra({ ...vacio, lotes: null, equiposConLecturaDemo: null });
  assert.deepEqual(p.lotes, []);
  assert.deepEqual(p.lecturas, []);
  assert.deepEqual(p.avisos, [AVISO_GATE2_LOTES, AVISO_GATE2_FRIO]);
  assert.ok(describirPlan(p).some((l) => l.includes("Gate 2 pendiente")));
});

test("sólo agrega lo que falta (nombre sin distinguir mayúsculas) y no pisa config guardada", () => {
  const p = planDemoMagra({
    cortes: ["LOMO", "vacío"],
    etiquetaGuardada: true,
    rangoGuardado: true,
    lotes: ["DEMO-L-001"],
    equiposConLecturaDemo: ["Cámara 1"],
  });
  assert.ok(!p.cortes.some((c) => c.name === "Lomo" || c.name === "Vacío"));
  assert.equal(p.cortes.length, CORTES_DEMO.length - 2);
  assert.equal(p.etiqueta, null);
  assert.equal(p.rango, null);
  assert.ok(!p.lotes.some((l) => l.codigo === "DEMO-L-001"));
  assert.ok(!p.lecturas.some((l) => l.equipo === "Cámara 1"));
});

test("todo presente: plan vacío", () => {
  const p = planDemoMagra({
    cortes: CORTES_DEMO.map((c) => c.name),
    etiquetaGuardada: true,
    rangoGuardado: true,
    lotes: LOTES_DEMO.map((l) => l.codigo),
    equiposConLecturaDemo: LECTURAS_DEMO.map((l) => l.equipo),
  });
  assert.equal(planVacio(p), true);
  assert.ok(describirPlan(p).some((l) => l.startsWith("Nada que agregar")));
});

test("ningún lote demo nace vencido y todos apuntan a un corte demo", () => {
  for (const l of LOTES_DEMO) {
    assert.ok(l.venceEnDias > 0, l.codigo);
    assert.ok(CORTES_DEMO.some((c) => c.name === l.corte), l.codigo);
  }
});

test("guarda: sólo el slug exacto magra; escribir exige --aplicar y CONFIRMO_TENANT=magra", () => {
  assert.equal(rechazoDeLaGuarda(leerArgsDemo([], undefined)), null);
  assert.deepEqual(leerArgsDemo([], undefined), { slug: "magra", aplicar: false, confirmo: undefined });
  for (const slug of ["beauty-spa", "magra-demo", "Magra", "", " magra"]) {
    assert.ok(rechazoDeLaGuarda(leerArgsDemo(["--tenant", slug], "magra")), slug);
  }
  assert.ok(rechazoDeLaGuarda(leerArgsDemo(["--tenant"], "magra")));
  assert.ok(rechazoDeLaGuarda(leerArgsDemo(["--aplicar"], undefined)));
  assert.ok(rechazoDeLaGuarda(leerArgsDemo(["--aplicar"], "beauty-spa")));
  assert.equal(rechazoDeLaGuarda(leerArgsDemo(["--aplicar"], "magra")), null);
});

test("el plan impreso no lleva URLs", () => {
  for (const l of describirPlan(planDemoMagra(vacio))) assert.ok(!/:\/\//.test(l), l);
});
