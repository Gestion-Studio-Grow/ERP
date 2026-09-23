// ============================================================================
// LINK DE PAGO DE UN PEDIDO — cuándo se ofrece y cómo se lee lo que ya se mandó, EJECUTADO.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  linkDePagoDisponible,
  simulacionDisponible,
  simuladorDeAvisosEncendido,
  textoDelLinkDePago,
  tieneMercadoPago,
  ultimosLinks,
} from "./link-de-pago";

test("sin Mercado Pago conectado no se ofrece un link de mentira; con el simulador, sí (marcado de prueba)", () => {
  const con = { moduloMercadoPago: true };
  assert.equal(linkDePagoDisponible({ modo: "stub", simulador: false, ...con }), false);
  assert.equal(linkDePagoDisponible({ modo: "stub", simulador: true, ...con }), true);
  assert.equal(linkDePagoDisponible({ modo: "test", simulador: false, ...con }), true);
  assert.equal(linkDePagoDisponible({ modo: "real", simulador: false, ...con }), true);
  // «Simular que pagó» nunca con Mercado Pago de verdad conectado.
  assert.equal(simulacionDisponible({ modo: "real", simulador: true, ...con }), false);
  assert.equal(simulacionDisponible({ modo: "test", simulador: true, ...con }), false);
  assert.equal(simulacionDisponible({ modo: "stub", simulador: true, ...con }), true);
  assert.equal(simuladorDeAvisosEncendido({ MP_SIMULAR_AVISOS: "1" }), true);
  assert.equal(simuladorDeAvisosEncendido({}), false);
});

test("sin el módulo de Mercado Pago en el negocio no hay link, aunque el despliegue tenga Mercado Pago real", () => {
  // El token es uno por despliegue: un comercio sin el módulo generaría links que cobran en la
  // cuenta de otro. Las filas de `Tenant.modules` tal cual están en la base de QA.
  const magraQa = ["arca", "campanias", "catalog", "clients", "inventario", "libros", "pos", "reports"];
  assert.equal(tieneMercadoPago(magraQa), false);
  assert.equal(tieneMercadoPago([...magraQa, "mercadopago"]), true);
  assert.equal(tieneMercadoPago([]), false, "CH: sin asignación");
  assert.equal(tieneMercadoPago(null), false);
  for (const modo of ["stub", "test", "real"] as const) {
    for (const simulador of [true, false]) {
      assert.equal(linkDePagoDisponible({ modo, simulador, moduloMercadoPago: tieneMercadoPago(magraQa) }), false, `${modo}/${simulador}`);
      assert.equal(simulacionDisponible({ modo, simulador, moduloMercadoPago: false }), false, `${modo}/${simulador}`);
    }
  }
  assert.equal(linkDePagoDisponible({ modo: "real", simulador: false, moduloMercadoPago: tieneMercadoPago(["pos", "mercadopago"]) }), true);
});

test("el último link de cada pedido sale de la auditoría; una fila rara no tira nada", () => {
  const links = ultimosLinks([
    { entityId: "ord_1", createdAt: new Date("2026-09-23T12:00:00Z"), changes: { url: "https://mp/a", monto: 20000, modo: "test" } },
    { entityId: "ord_1", createdAt: new Date("2026-09-23T13:00:00Z"), changes: { url: "https://mp/b", monto: 23500, modo: "real" } },
    { entityId: "ord_2", createdAt: new Date("2026-09-23T13:00:00Z"), changes: { url: 7 } },
    { entityId: null, createdAt: new Date(), changes: {} },
  ]);
  assert.deepEqual(links.get("ord_1"), { url: "https://mp/b", monto: 23500, prueba: false });
  assert.equal(links.has("ord_2"), false);
});

test("el WhatsApp del link dice el pedido, el monto y el link", () => {
  const t = textoDelLinkDePago({ negocio: "MAGRA Canning", code: 77, monto: 23500, url: "https://mp/x" });
  assert.match(t, /pedido #77 de MAGRA Canning \(\$\s?23\.500,00\)/);
  assert.match(t, /https:\/\/mp\/x$/);
});
