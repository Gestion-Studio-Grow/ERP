import { test } from "node:test";
import assert from "node:assert/strict";
import { clubRealEnBlanco } from "./almacen";
import { crearClubReal } from "@/lib/club/motor.mjs";
import { NEGOCIOS_CON_JORNADA_REAL, relojDelClub } from "./jornada-del-club-core";
import { arranqueDelClub } from "./jornada-del-club-core";

test("Break Point abre la jornada real", () => {
  assert.deepEqual(NEGOCIOS_CON_JORNADA_REAL, ["breakpoint"]);
  assert.equal(relojDelClub({ slug: "breakpoint", sandbox: false, demo: undefined }), "real");
  // Otro valor de `demo` no pide la demo (como el vanilla: sólo `?demo=1`).
  assert.equal(relojDelClub({ slug: "breakpoint", sandbox: false, demo: "0" }), "real");
});

test("Break Point con ?demo=1 abre la demo", () => {
  assert.equal(relojDelClub({ slug: "breakpoint", sandbox: false, demo: "1" }), "demo");
});

test("Break Point en el sandbox de preventa abre la demo (nunca la jornada real)", () => {
  assert.equal(relojDelClub({ slug: "breakpoint", sandbox: true, demo: undefined }), "demo");
});

test("otro negocio (o sin negocio) abre la demo", () => {
  assert.equal(relojDelClub({ slug: "adosmanos", sandbox: false, demo: undefined }), "demo");
  assert.equal(relojDelClub({ slug: "beauty-spa", sandbox: false, demo: "0" }), "demo");
  assert.equal(relojDelClub({ slug: null, sandbox: false, demo: undefined }), "demo");
});

test("el ambiente de pruebas de WPE abre su jornada real (GSG-PLAT-016); con ?demo=1 o en el sandbox, la demo", () => {
  assert.equal(relojDelClub({ slug: "wpe-pruebas", sandbox: false, demo: undefined }), "real");
  assert.equal(relojDelClub({ slug: "wpe-pruebas", sandbox: false, demo: "1" }), "demo");
  assert.equal(relojDelClub({ slug: "wpe-pruebas", sandbox: true, demo: undefined }), "demo");
  // El circuito del cliente (freeze) no abre ninguna jornada real.
  assert.equal(relojDelClub({ slug: "circuito-wpe", sandbox: false, demo: undefined }), "demo");
});

test("GSG-PLAT-016 (C10): wpe-pruebas arranca como «Gran Willy», 7 canchas C1…C7, SU dueño y sin productos de otro", () => {
  assert.equal(arranqueDelClub("breakpoint"), undefined);
  assert.equal(arranqueDelClub("constructor"), undefined);
  const e = clubRealEnBlanco("2026-11-16", arranqueDelClub("wpe-pruebas"));
  assert.equal(e.config.nombre, "Gran Willy");
  assert.deepEqual(e.canchas.map((c) => c.nombre), ["C1", "C2", "C3", "C4", "C5", "C6", "C7"]);
  assert.deepEqual(e.usuarios.map((u) => u.nombre), ["Dueño de prueba"]);
  assert.equal(e.productos.length, 0);
  assert.equal(e.config.modo, "real");
  assert.equal(e.config.configurado, false);
  // No comparte referencias con el arranque (cada jornada es suya).
  e.canchas[0].nombre = "x";
  assert.equal(arranqueDelClub("wpe-pruebas")!.canchas[0].nombre, "C1");
});

test("GSG-PLAT-016 (C11): sin arranque, Break Point queda idéntico a crearClubReal", () => {
  const sinArranque = clubRealEnBlanco("2026-11-16");
  const motor = crearClubReal("2026-11-16");
  assert.deepEqual(sinArranque, motor);
  assert.equal(motor.config.nombre, "Break Point Pádel");
});
