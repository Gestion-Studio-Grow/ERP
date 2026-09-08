// ============================================================================
// TEST — GATING POR-URL DEL PRODUCTO COMERCIANTE (mapa ruta → módulo). PURO.
// ============================================================================
//
// Valla de la deuda que cerró el frente identidad-por-producto: un OWNER de
// Comerciante no debe entrar por tecleo a un módulo que no tiene (turnos, caja,
// catálogo…). El mapeo sale de `ALL_ITEMS` (misma lista que pinta la nav) — sin DB.

import { test } from "node:test";
import assert from "node:assert/strict";
import { navItemForPath, rutaPermitidaParaModulos, ALL_ITEMS } from "./admin-nav-items";

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
  for (const p of ["/admin/turnos", "/admin/pedidos", "/admin/catalogo", "/admin/compras", "/admin/espera", "/admin/resenas", "/admin/recordatorios"]) {
    assert.equal(rutaPermitidaParaModulos(p, COMERCIANTE), false, p);
  }
});

// `/admin/caja` SALIÓ de esa lista, con las otras dos cajas. No es una filtración: el
// Comerciante ya podía entrar al libro y al cierre desde que se les sacó `module: "pos"`
// (e28d98d), y las tres son la misma cosa —la plata del negocio, que un comerciante con
// facturación también maneja—. Lo que las acota es el rol (`orders:read`), no el módulo:
// `getCajaData` y `getCierreDiarioData` lo exigen antes de devolver una fila.
test("Comerciante: las tres cajas pasan el gate de módulos (son core, como Ajustes)", () => {
  for (const p of ["/admin/caja", "/admin/caja/libro", "/admin/caja/cierre"]) {
    assert.equal(rutaPermitidaParaModulos(p, COMERCIANTE), true, p);
  }
});

test("Comerciante: ruta fuera del backoffice (inventario/libros) → bloqueada", () => {
  assert.equal(rutaPermitidaParaModulos("/admin/inventario", COMERCIANTE), false);
  assert.equal(rutaPermitidaParaModulos("/admin/libros", COMERCIANTE), false);
});

// ── La bomba de tiempo del gating por módulo ─────────────────────────────────
//
// El libro de caja y el cierre del día se crearon copiando `/admin/caja`, que lleva
// `module: "pos"`. El preset de un negocio de SERVICIOS no incluye `pos`
// ("SIN pos (no es mostrador)", src/blueprints/presets-meta.ts:37), así que el día que se
// encienda el registro de módulos, la dueña perdería del menú justo las dos pantallas que
// reemplazan la planilla. Esto lo fija: son core, como Ajustes.

test("las tres cajas NO se gatean por módulo: todo negocio maneja plata", () => {
  for (const href of ["/admin/caja", "/admin/caja/libro", "/admin/caja/cierre"]) {
    const item = ALL_ITEMS.find((i) => i.href === href);
    assert.ok(item, `falta el ítem ${href}`);
    assert.equal(
      item.module,
      undefined,
      `${href} quedó atado a un módulo: un tenant de servicios lo perdería del menú`,
    );
    assert.equal(item.cap, "orders:read", `${href} se acota por rol, no por módulo`);
  }
});

// La Caja NO es retailOnly. Lo que es de mostrador es el TURNO DE CAJERO que vive adentro,
// y eso lo decide la propia pantalla (`tieneCajonFisico`), no el menú: gatear el ítem sacaba
// la pantalla entera —resumen por medio, movimientos del día, alta de gastos— a un negocio
// de servicios, que es justo el que la usa todos los días.
test("la Caja la ven los tres rubros: no lleva retailOnly", () => {
  const item = ALL_ITEMS.find((i) => i.href === "/admin/caja");
  assert.ok(item);
  assert.equal(item.retailOnly, undefined, "gatear el ítem le saca la pantalla del día a servicios");
  assert.equal(item.carniceriaOnly, undefined);
});

// El alias "arqueo" tiene que devolver UN resultado, y el que cuenta los tres medios. Si la
// Caja se lo vuelve a apropiar, buscar "arqueo" en CH devuelve el que sólo ve efectivo.
test("buscar \"arqueo\" lleva al cierre del día, no a la Caja", () => {
  const conArqueo = ALL_ITEMS.filter((i) =>
    (i.alias ?? []).some((a) => a.toLowerCase().includes("arqueo")),
  );
  assert.deepEqual(
    conArqueo.map((i) => i.href),
    ["/admin/caja/cierre"],
    `más de un ítem responde a "arqueo": ${conArqueo.map((i) => i.href).join(", ")}`,
  );
});

test("los tres ítems de caja no comparten el mismo ícono", () => {
  const iconos = ["/admin/caja", "/admin/caja/libro", "/admin/caja/cierre"].map(
    (h) => ALL_ITEMS.find((i) => i.href === h)?.icon,
  );
  assert.equal(new Set(iconos).size > 1, true, `tres ítems seguidos con el mismo ícono: ${iconos.join(", ")}`);
});
