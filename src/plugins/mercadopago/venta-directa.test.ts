// ============================================================================
// DOBLE FACTURA de un pago de pedido — la clasificación del sincronizado, EJECUTADA.
// ============================================================================
//
// Lo que pasaba: `sincronizarMercadoPago` (el sincronizado de la historia de la cuenta) pasa
// cada pago por `facturarPagoSiCorresponde` con el `ClasificadorPorReglas`. Un pago aprobado de
// un link de pedido ("pedido:<id>") caía en la regla "pago-cobro" → FACTURABLE → factura suelta,
// sin pedido. Después «Facturar» en Ventas del día emitía otra por la misma venta. El aviso
// (webhook) ya no lo mandaba al camino suelto; el sincronizado sí.
//
// Acá se corre el pipeline real del plugin (`sincronizarPagos` → clasificador real →
// conciliación en memoria) con un facturador que cuenta, y el aviso real, con el MISMO criterio.

import { test } from "node:test";
import assert from "node:assert/strict";
import { StubMercadoPagoClient } from "./stub";
import { ClasificadorPorReglas, AprendizajeEnMemoria, REGLAS_DEFAULT, type ClasificadorPort } from "./classifier";
import { ReconciliacionEnMemoria } from "./reconciliation";
import { sincronizarPagos } from "./ingest";
import { procesarNotificacionPago } from "./handler";
import { esVentaDirecta, referenciaDePedido } from "./core-contract";

function cuenta() {
  const mp = new StubMercadoPagoClient();
  mp.simularPago({ id: "mp_pedido", estado: "approved", monto: 15500, externalReference: referenciaDePedido("ord_1") });
  mp.simularPago({ id: "mp_turno", estado: "approved", monto: 20000, externalReference: "appt_9" });
  mp.simularPago({ id: "mp_suelta", estado: "approved", monto: 3000, externalReference: "" });
  return mp;
}

test("el sincronizado NO factura suelto un pago de pedido ni uno de turno; la venta directa, sí", async () => {
  const facturados: string[] = [];
  const reconciliacion = new ReconciliacionEnMemoria();
  const r = await sincronizarPagos({
    tenantId: "t_magra",
    client: cuenta(),
    clasificador: new ClasificadorPorReglas({ aprendizaje: new AprendizajeEnMemoria() }),
    reconciliacion,
    facturar: async (pago) => (facturados.push(pago.id), `inv_${pago.id}`),
  });
  assert.deepEqual(facturados, ["mp_suelta"], "antes salían tres facturas sueltas, dos de ventas que tienen la suya");
  assert.equal(r.facturados, 1);
  assert.equal(r.noFacturables, 2);
  // Quedan marcados (idempotencia): correr otra vez no los vuelve a mirar.
  const otra = await sincronizarPagos({
    tenantId: "t_magra",
    client: cuenta(),
    clasificador: new ClasificadorPorReglas(),
    reconciliacion,
    facturar: async (pago) => (facturados.push(pago.id), "x"),
  });
  assert.equal(otra.saltados, 3);
  assert.deepEqual(facturados, ["mp_suelta"]);
});

test("ni una corrección aprendida ni una regla del comercio pueden facturar suelto un pago de pedido", async () => {
  const aprendizaje = new AprendizajeEnMemoria();
  await aprendizaje.registrar({ operacion: "pago", clasificacion: "FACTURABLE" });
  const clasificador: ClasificadorPort = new ClasificadorPorReglas({
    aprendizaje,
    config: { reglasExtra: [{ id: "todo", descripcion: "todo se factura", cuando: () => true, clasificacion: "FACTURABLE" }] },
  });
  const pedido = await clasificador.clasificar(
    { id: "p", estado: "approved", monto: 1, externalReference: referenciaDePedido("ord_2"), operacion: "pago" },
    "t",
  );
  assert.deepEqual([pedido.clasificacion, pedido.reglaId], ["NO_FACTURABLE", "cobro-con-referencia"]);
  assert.match(pedido.motivo, /Ventas del día/);
  // El array de reglas pelado (compat) también pasa por el paso 0.
  const compatible: ClasificadorPort = new ClasificadorPorReglas(REGLAS_DEFAULT);
  const compat = await compatible.clasificar(
    { id: "q", estado: "approved", monto: 1, externalReference: "appt_1" },
    "t",
  );
  assert.equal(compat.clasificacion, "NO_FACTURABLE");
});

test("el aviso usa el MISMO criterio: sólo la venta directa sale marcada para el camino suelto", async () => {
  const mp = cuenta();
  const aviso = (paymentId: string) =>
    procesarNotificacionPago({ type: "payment", paymentId, tenantId: "t" }, { clientePara: () => mp, facturar: async () => null });
  assert.equal((await aviso("mp_suelta")).ventaDirecta, true);
  assert.equal((await aviso("mp_pedido")).ventaDirecta, undefined);
  assert.equal((await aviso("mp_turno")).ventaDirecta, undefined);
  assert.equal(esVentaDirecta("   "), true);
  assert.equal(esVentaDirecta(null), true);
  assert.equal(esVentaDirecta("pedido:ord_1"), false);
});
