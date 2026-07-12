// ============================================================================
// TEST — GATING POR-URL DEL PRODUCTO COMERCIANTE (mapa ruta → módulo). PURO.
// ============================================================================
//
// Valla de la deuda que cerró el frente identidad-por-producto: un OWNER de
// Comerciante no debe entrar por tecleo a un módulo que no tiene (turnos, caja,
// catálogo…). El mapeo sale de `ALL_ITEMS` (misma lista que pinta la nav) — sin DB.

import { test } from "node:test";
import assert from "node:assert/strict";
import { navItemForPath, rutaPermitidaParaModulos } from "./admin-nav-items";

// Set de módulos REAL del Comerciante (arca/bancos/mercadopago/clients/reports).
const COMERCIANTE = ["arca", "bancos", "mercadopago", "clients", "reports"];

// ── navItemForPath: match por segmento, más específico primero ───────────────

test("navItemForPath: Inicio solo matchea /admin exacto (no absorbe sub-rutas)", () => {
  assert.equal(navItemForPath("/admin")?.href, "/admin");
  assert.equal(navItemForPath("/admin/turnos")?.href, "/admin/turnos");
});

test("navItemForPath: sub-ruta cae en su ítem padre", () => {
  assert.equal(navItemForPath("/admin/facturacion/bancos")?.href, "/admin/facturacion");
  assert.equal(navItemForPath("/admin/facturacion/bancos/configuracion")?.href, "/admin/facturacion");
  assert.equal(navItemForPath("/admin/clientes/123")?.href, "/admin/clientes");
});

test("navItemForPath: query/hash no rompen el match", () => {
  assert.equal(navItemForPath("/admin/facturacion/bancos#cola-revision")?.href, "/admin/facturacion");
  assert.equal(navItemForPath("/admin?foo=1")?.href, "/admin");
});

test("navItemForPath: ruta fuera del set del backoffice no matchea", () => {
  // Nota: /admin/inventario·/lotes·/despiece SÍ existen (ítems de rubro carnicería, ADR-096),
  // así que no sirven de "ruta inexistente". Usamos rutas realmente ausentes del set.
  assert.equal(navItemForPath("/admin/libros"), undefined);
  assert.equal(navItemForPath("/admin/inexistente"), undefined);
});

// ── rutaPermitidaParaModulos: whitelist derivada de ALL_ITEMS ────────────────

test("Comerciante: Inicio y config (sin módulo) SIEMPRE permitidos", () => {
  for (const p of ["/admin", "/admin/auditoria", "/admin/usuarios", "/admin/localizacion", "/admin/apariencia", "/admin/modulos"]) {
    assert.equal(rutaPermitidaParaModulos(p, COMERCIANTE), true, p);
  }
});

test("Comerciante: rutas de SUS módulos permitidas (facturación/clientes/reportes)", () => {
  assert.equal(rutaPermitidaParaModulos("/admin/facturacion", COMERCIANTE), true);
  assert.equal(rutaPermitidaParaModulos("/admin/facturacion/bancos", COMERCIANTE), true);
  assert.equal(rutaPermitidaParaModulos("/admin/clientes", COMERCIANTE), true);
  assert.equal(rutaPermitidaParaModulos("/admin/reportes", COMERCIANTE), true);
});

test("Comerciante: módulos que NO tiene → bloqueados (la deuda del UAT)", () => {
  for (const p of ["/admin/turnos", "/admin/caja", "/admin/pedidos", "/admin/catalogo", "/admin/compras", "/admin/espera", "/admin/resenas", "/admin/recordatorios"]) {
    assert.equal(rutaPermitidaParaModulos(p, COMERCIANTE), false, p);
  }
});

test("Comerciante: ruta fuera del backoffice (inventario/libros) → bloqueada", () => {
  assert.equal(rutaPermitidaParaModulos("/admin/inventario", COMERCIANTE), false);
  assert.equal(rutaPermitidaParaModulos("/admin/libros", COMERCIANTE), false);
});
