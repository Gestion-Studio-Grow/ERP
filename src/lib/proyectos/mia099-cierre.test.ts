// GSG-MIA-099 · reglas puras del cierre del NO CUMPLE de MIA-094: Rentabilidad sin el perdido (decisión 1) y la ficha de un
// perdido con «Avance de cobro» contra la venta original (decisión 3). Decidió el dueño el 20/11 (MIA-224): D1 = A; D3 = B,
// provisional a confirmar con Ale.
import { test } from "node:test";
import assert from "node:assert/strict";
import { totalesDeRentabilidad } from "./empresa-core";
import { avanceDeCobro, perdidoAdmite } from "./ficha-core";

const fila = (neto: number, ganancia: number, perdido: boolean, porCobrar = 0) => ({
  perdidoEl: perdido ? new Date("2026-11-01T12:00:00Z") : null,
  t: { neto, ganancia },
  real: { gananciaReal: null, porPagar: 0 },
  porCobrar,
});

test("decisión 1 · un perdido no suma en «Vendido» ni en «Ganancia presupuestada» de Rentabilidad", () => {
  const r = totalesDeRentabilidad([fila(1000, 300, false, 605), fila(12_415_000, 3_515_000, true)]);
  assert.deepEqual({ neto: r.neto, ganancia: r.ganancia, porCobrar: r.porCobrar }, { neto: 1000, ganancia: 300, porCobrar: 605 });
});

test("decisión 3 = B (MIA-224) · la ficha de un perdido muestra lo cobrado contra la venta original; sin venta, nada", () => {
  assert.equal(avanceDeCobro({ cobrado: 605, aCobrar: 0, ventaOriginal: 1210 }, true), 50, "605 de 1.210, no 100 %");
  assert.equal(avanceDeCobro({ cobrado: 0, aCobrar: 0, ventaOriginal: 1210 }, true), 0);
  assert.equal(avanceDeCobro({ cobrado: 605, aCobrar: 0 }, true), null, "un perdido sin venta aprobada no tiene contra qué medir");
  assert.equal(avanceDeCobro({ cobrado: 605, aCobrar: 605 }, false), 50);
  assert.equal(avanceDeCobro(null, false), 0);
});

test("decisión 2 · en un perdido se paga a un proveedor y no se cobra: la misma regla en la pantalla y en el servidor", () => {
  assert.equal(perdidoAdmite("PAGO"), true);
  assert.equal(perdidoAdmite("COBRO"), false);
  // Par revisor MIA-099: falla cerrada. Un tipo que no es PAGO (desconocido, minúsculas, con espacios) no se admite.
  for (const raro of ["cobro", "COBRO ", "OTRO", ""]) assert.equal(perdidoAdmite(raro), false, `«${raro}» no es PAGO`);
});

test("decisión 2 (MIA-224) · qué cuotas del plan siguen: vivo todas; perdido sólo las del proveedor; cancelado ninguna", async () => {
  const { planQueSigue } = await import("./ficha-core");
  const plan = [{ clave: "c", tipo: "COBRO" }, { clave: "p", tipo: "PAGO" }];
  const perdidoEl = new Date("2026-11-20T12:00:00Z");
  assert.deepEqual(planQueSigue(plan, { perdidoEl: null, motivoPerdida: null }).map((c) => c.clave), ["c", "p"]);
  assert.deepEqual(planQueSigue(plan, { perdidoEl, motivoPerdida: "Eligió otro proveedor" }).map((c) => c.clave), ["p"]);
  assert.deepEqual(planQueSigue(plan, { perdidoEl, motivoPerdida: "Cancelado: el cliente suspendió" }), []);
});
