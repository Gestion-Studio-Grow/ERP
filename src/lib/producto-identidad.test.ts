// ============================================================================
// TEST — IDENTIDAD POR PRODUCTO (derivación + ruteo). Un motor, tres productos.
// ============================================================================
//
// Valla de la capa que hace que los tres productos NO se perciban como el mismo
// backoffice: la derivación del producto desde el dato maestro del tenant y el
// ruteo/gating por área. PURO: sin DB, sin request.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  derivarProducto,
  identidadProducto,
  productoHome,
  rutaPermitidaParaProducto,
  type Producto,
} from "./producto-identidad";

// ── Derivación por dato maestro del tenant ──────────────────────────────────

test("facturita se deriva por blueprintId, sin importar los módulos", () => {
  assert.equal(derivarProducto({ blueprintId: "facturita", modules: ["arca", "clients"] }), "facturita");
  // El blueprint gana aunque (hipotéticamente) tuviera cartera.
  assert.equal(derivarProducto({ blueprintId: "facturita", modules: ["cartera"] }), "facturita");
});

test("contador se deriva por el módulo cartera asignado (ADR-055)", () => {
  assert.equal(
    derivarProducto({ blueprintId: "generico", modules: ["cartera", "arca", "bancos", "clients"] }),
    "contador",
  );
});

test("comerciante = blueprint generico sin cartera", () => {
  assert.equal(
    derivarProducto({ blueprintId: "generico", modules: ["arca", "bancos", "mercadopago", "clients", "reports"] }),
    "comerciante",
  );
});

test("los verticales tradicionales caen en 'vertical' (comportamiento legado)", () => {
  for (const bp of ["servicios", "carniceria", "padel", "gastronomia", "oficios", null]) {
    assert.equal(
      derivarProducto({ blueprintId: bp, modules: ["agenda", "catalog", "pos"] }),
      "vertical",
      `blueprint ${bp} debería ser vertical`,
    );
  }
});

// ── Identidad ───────────────────────────────────────────────────────────────

test("cada producto con marca tiene identidad; vertical no", () => {
  for (const p of ["comerciante", "contador", "facturita"] as Producto[]) {
    const id = identidadProducto(p);
    assert.ok(id, `${p} debería tener identidad`);
    assert.equal(id!.producto, p);
    assert.ok(id!.nombre.length > 0);
    assert.ok(id!.login.titulo.length > 0);
  }
  assert.equal(identidadProducto("vertical"), null);
});

test("los tres productos tienen acentos distintos (se ven de familias distintas)", () => {
  const acentos = (["comerciante", "contador", "facturita"] as Producto[]).map(
    (p) => identidadProducto(p)!.acento,
  );
  assert.equal(new Set(acentos).size, 3);
});

// ── Casa (ruteo post-login) ─────────────────────────────────────────────────

test("cada producto entra a SU casa; vertical al /admin de siempre", () => {
  assert.equal(productoHome("comerciante"), "/admin");
  assert.equal(productoHome("contador"), "/contador");
  assert.equal(productoHome("facturita"), "/facturita/app");
  assert.equal(productoHome("vertical"), "/admin");
});

// ── Área / gating por producto ──────────────────────────────────────────────

test("una URL corresponde solo al área de su producto", () => {
  // Contador NO puede ir a /admin ni a /facturita/app.
  assert.equal(rutaPermitidaParaProducto("contador", "/contador"), true);
  assert.equal(rutaPermitidaParaProducto("contador", "/admin/clientes"), false);
  assert.equal(rutaPermitidaParaProducto("contador", "/facturita/app"), false);

  // Facturita solo su emisor.
  assert.equal(rutaPermitidaParaProducto("facturita", "/facturita/app"), true);
  assert.equal(rutaPermitidaParaProducto("facturita", "/facturita/app/facturas"), true);
  assert.equal(rutaPermitidaParaProducto("facturita", "/admin"), false);

  // Comerciante y vertical poseen /admin.
  assert.equal(rutaPermitidaParaProducto("comerciante", "/admin/facturacion"), true);
  assert.equal(rutaPermitidaParaProducto("vertical", "/admin/turnos"), true);
});

test("el match de área es por segmento (no por prefijo de string) y tolera query/slash", () => {
  assert.equal(rutaPermitidaParaProducto("vertical", "/administracion"), false);
  assert.equal(rutaPermitidaParaProducto("contador", "/contador/"), true);
  assert.equal(rutaPermitidaParaProducto("contador", "/contador?tab=x"), true);
});
