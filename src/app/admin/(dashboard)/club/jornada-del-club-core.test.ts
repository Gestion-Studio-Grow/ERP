import { test } from "node:test";
import assert from "node:assert/strict";
import { clubRealEnBlanco } from "./almacen";
import { dueniosDelClub, NEGOCIOS_CON_JORNADA_REAL, relojDelClub } from "./jornada-del-club-core";

test("Break Point abre la jornada real", () => {
  assert.deepEqual(NEGOCIOS_CON_JORNADA_REAL, ["breakpoint", "wpe-pruebas"]);
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

test("GSG-PLAT-016: la jornada real de wpe-pruebas arranca con SU dueño, no con los de Break Point", () => {
  assert.equal(dueniosDelClub("breakpoint"), undefined);
  assert.equal(dueniosDelClub("constructor"), undefined);
  const duenios = dueniosDelClub("wpe-pruebas");
  assert.ok(duenios && duenios.length > 0);
  const wpe = clubRealEnBlanco("2026-11-16", duenios).usuarios.map((u) => u.nombre);
  assert.deepEqual(wpe, ["Dueño de prueba"]);
  // Break Point, sin cambios: los suyos por defecto.
  assert.deepEqual(clubRealEnBlanco("2026-11-16").usuarios.map((u) => u.nombre), ["Roberto Ronco", "Majo Gimenez"]);
});
