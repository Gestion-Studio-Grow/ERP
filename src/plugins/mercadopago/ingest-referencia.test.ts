/**
 * La sincronización de Mercado Pago no factura como venta suelta un cobro que ya tiene dueño.
 *
 * El cobro de un link de turno (external_reference = id del turno) lo factura el aviso de Mercado
 * Pago por el turno (origen APPOINTMENT). El de un link de pedido ("pedido:<id>") lo cobra el
 * pedido y la factura sale de la venta con «Facturar» (origen ORDER). Si la sincronización del
 * historial los tomaba como venta suelta, emitía otra Factura C por el mismo cobro (origen
 * MP_PAYMENT, otra clave de unicidad): dos CAE por un solo ingreso. Acá se ejecuta la ingesta
 * real (`sincronizarPagos`, `facturarPagoSiCorresponde`) con el clasificador real.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { StubMercadoPagoClient } from "./stub";
import { ReconciliacionEnMemoria } from "./reconciliation";
import { AprendizajeEnMemoria, ClasificadorPorReglas } from "./classifier";
import { facturarPagoSiCorresponde, sincronizarPagos, type IngestaDeps, type ResumenIngesta } from "./ingest";
import { duenoDelCobro, referenciaDePedido } from "./core-contract";
import type { PagoMP } from "./port";

function entorno(pagos: PagoMP[]) {
  const client = new StubMercadoPagoClient();
  for (const p of pagos) client.simularPago(p);
  const reconciliacion = new ReconciliacionEnMemoria();
  const facturados: string[] = [];
  const deps: IngestaDeps = {
    tenantId: "t-1",
    client,
    clasificador: new ClasificadorPorReglas({ aprendizaje: new AprendizajeEnMemoria() }),
    reconciliacion,
    facturar: async (pago) => {
      facturados.push(pago.id);
      return `inv-${pago.id}`;
    },
  };
  return { deps, reconciliacion, facturados };
}

const cobro = (id: string, externalReference: string): PagoMP => ({
  id,
  estado: "approved",
  monto: 18000,
  externalReference,
  fechaAcreditacion: "20260924",
});

const vacio = (): ResumenIngesta => ({
  leidos: 0, facturados: 0, noFacturables: 0, aRevisar: 0, rechazados: 0, saltados: 0, errores: 0,
});

test("sincronizar Mercado Pago: el cobro del link de un turno no se factura como venta suelta y queda anotado por qué", async () => {
  const e = entorno([cobro("mp-turno", "appt_123")]);
  const r = await sincronizarPagos(e.deps);
  assert.deepEqual(e.facturados, [], "la factura de ese cobro es la del turno: no puede salir otra");
  assert.equal(r.facturados, 0);
  assert.equal(r.noFacturables, 1);
  const [reg] = await e.reconciliacion.listar();
  assert.equal(reg.estado, "NO_FACTURABLE");
  assert.match(reg.motivo ?? "", /turno/);
});

test("sincronizar Mercado Pago: el cobro del link de un pedido no se factura como venta suelta (la factura sale del pedido)", async () => {
  const e = entorno([cobro("mp-pedido", referenciaDePedido("ord_77"))]);
  const r = await sincronizarPagos(e.deps);
  assert.deepEqual(e.facturados, []);
  assert.equal(r.noFacturables, 1);
  const [reg] = await e.reconciliacion.listar();
  assert.equal(reg.estado, "NO_FACTURABLE");
  assert.match(reg.motivo ?? "", /pedido/);
});

test("sincronizar Mercado Pago: la venta suelta (sin referencia) se sigue facturando, y una segunda sincronización no repite nada", async () => {
  const e = entorno([cobro("mp-suelta", ""), cobro("mp-turno", "appt_123"), cobro("mp-pedido", referenciaDePedido("ord_77"))]);
  const r1 = await sincronizarPagos(e.deps);
  assert.deepEqual(e.facturados, ["mp-suelta"]);
  assert.equal(r1.facturados, 1);
  assert.equal(r1.noFacturables, 2);
  const r2 = await sincronizarPagos(e.deps);
  assert.deepEqual(e.facturados, ["mp-suelta"], "la segunda corrida no emite nada");
  assert.equal(r2.saltados, 3);
});

test("el camino de un solo pago (aviso de venta directa) tampoco factura un cobro con dueño", async () => {
  const e = entorno([]);
  const r = vacio();
  await facturarPagoSiCorresponde(cobro("mp-turno", "appt_123"), e.deps, r);
  assert.deepEqual(e.facturados, []);
  assert.equal(r.noFacturables, 1);
});

test("dueño del cobro: la misma lectura de la referencia que usa el aviso de Mercado Pago", () => {
  assert.equal(duenoDelCobro(""), null);
  assert.equal(duenoDelCobro(null), null);
  assert.deepEqual(duenoDelCobro("appt_123"), { tipo: "turno", id: "appt_123" });
  assert.deepEqual(duenoDelCobro(referenciaDePedido("ord_77")), { tipo: "pedido", id: "ord_77" });
});
