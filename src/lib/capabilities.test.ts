import test from "node:test";
import assert from "node:assert/strict";
import { roleHasCapability, ROLE_CAPABILITIES, ALL_CAPABILITIES, alcanceDeAnulacion } from "./capabilities";

// ── Quién cobra (decisión del dueño, 2026-09-07) ─────────────────────────────
//
// "El profesional también cobra, y rinde la comisión luego". Cobrar quedó como capacidad
// PROPIA y no dentro de `agenda:manage`: si estuviera ahí, habilitársela al profesional le
// daría también crear, cancelar y reprogramar turnos ajenos. Esto lo fija.

test("el profesional cobra sus turnos, pero no gestiona la agenda", () => {
  assert.equal(roleHasCapability("PROFESSIONAL", "agenda:collect"), true);
  assert.equal(roleHasCapability("PROFESSIONAL", "agenda:complete"), true);
  assert.equal(roleHasCapability("PROFESSIONAL", "agenda:manage"), false, "cobrar no puede implicar crear ni cancelar turnos ajenos");
  assert.equal(roleHasCapability("PROFESSIONAL", "clients:manage"), false);
  assert.equal(roleHasCapability("PROFESSIONAL", "orders:manage"), false);
  assert.equal(roleHasCapability("PROFESSIONAL", "reports:read"), false);
});

test("recepción y dueño también cobran, y recepción lleva la caja entera", () => {
  for (const rol of ["RECEPTION", "OWNER"] as const) {
    assert.equal(roleHasCapability(rol, "agenda:collect"), true, rol);
    assert.equal(roleHasCapability(rol, "agenda:manage"), true, rol);
    assert.equal(roleHasCapability(rol, "orders:read"), true, `${rol} necesita ver el libro y el cierre`);
    assert.equal(roleHasCapability(rol, "orders:manage"), true, `${rol} necesita cerrar la caja`);
  }
});

test("el dueño tiene todo lo que la lista declara", () => {
  for (const cap of ALL_CAPABILITIES) {
    assert.equal(roleHasCapability("OWNER", cap), true, `falta ${cap} en OWNER`);
  }
});

test("recepción no ve reportes financieros ni edita el catálogo (ADR-017)", () => {
  assert.equal(roleHasCapability("RECEPTION", "reports:read"), false);
  assert.equal(roleHasCapability("RECEPTION", "catalog:manage"), false);
  assert.equal(roleHasCapability("RECEPTION", "users:manage"), false);
  assert.equal(roleHasCapability("RECEPTION", "commissions:manage"), false);
});

test("ningún rol tiene una capacidad que no esté declarada", () => {
  const declaradas = new Set<string>(ALL_CAPABILITIES);
  for (const [rol, caps] of Object.entries(ROLE_CAPABILITIES)) {
    for (const c of caps) {
      assert.ok(declaradas.has(c), `${rol} tiene "${c}", que no está en ALL_CAPABILITIES`);
    }
  }
});

// ── Capabilities nuevas del modelo por apps ─────────────────────────────────
//
// Se declaran todas juntas y el mapa de roles se decide una sola vez. Lo que se fija acá es
// QUIÉN tiene cada una; ninguna abre una pantalla hasta que una app la pida.

const NUEVAS = [
  "orders:void",
  "stock:read",
  "stock:receive",
  "stock:count",
  "stock:adjust",
  "purchasing:manage",
  "costs:read",
  "multilocal:manage",
  "traslados:manage",
] as const;

test("el dueño tiene todas las capabilities nuevas", () => {
  for (const cap of NUEVAS) {
    assert.ok(ALL_CAPABILITIES.includes(cap), `${cap} no está declarada`);
    assert.equal(roleHasCapability("OWNER", cap), true, `falta ${cap} en OWNER`);
  }
});

test("recepción es el encargado del local: anula, ve stock, recibe, cuenta y carga mermas", () => {
  for (const cap of ["orders:void", "stock:read", "stock:receive", "stock:count", "stock:adjust", "traslados:manage"] as const) {
    assert.equal(roleHasCapability("RECEPTION", cap), true, `RECEPTION necesita ${cap}`);
  }
});

test("recepción no ve costos ni maneja compras ni la red de locales", () => {
  assert.equal(roleHasCapability("RECEPTION", "costs:read"), false, "el encargado ve el stock SIN costos");
  assert.equal(roleHasCapability("RECEPTION", "purchasing:manage"), false);
  assert.equal(roleHasCapability("RECEPTION", "multilocal:manage"), false);
});

test("el profesional no recibe ninguna de las nuevas", () => {
  for (const cap of NUEVAS) {
    assert.equal(roleHasCapability("PROFESSIONAL", cap), false, `PROFESSIONAL no debería tener ${cap}`);
  }
});

// ── Hasta dónde anula cada rol ──────────────────────────────────────────────

test("el dueño anula cualquier día no cerrado, y el motivo le queda opcional", () => {
  assert.deepEqual(alcanceDeAnulacion("OWNER"), { soloHoy: false, motivoObligatorio: false });
});

test("recepción anula sólo lo cobrado hoy y siempre con motivo", () => {
  assert.deepEqual(alcanceDeAnulacion("RECEPTION"), { soloHoy: true, motivoObligatorio: true });
});

test("el profesional no anula", () => {
  assert.equal(alcanceDeAnulacion("PROFESSIONAL"), null);
});
