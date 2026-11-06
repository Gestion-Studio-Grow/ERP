// PR5 · C1 (puro): `normalizarPago` trae las devoluciones/contracargo y la ingesta las aplica aunque
// el pago ya esté procesado; una falla ahí no frena la factura. `aplicarMovimientosPosterioresMP`
// manda cada uno a su lugar (contracargo → caso, nunca nota) y sigue aunque uno falle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarPago } from "./http";
import { facturarPagoSiCorresponde, type IngestaDeps, type ResumenIngesta } from "./ingest";
import type { PagoMP } from "./port";
import { aplicarMovimientosPosterioresMP } from "@/lib/facturacion/devoluciones-mp";

const resumen = (): ResumenIngesta => ({ leidos: 0, facturados: 0, noFacturables: 0, aRevisar: 0, rechazados: 0, saltados: 0, errores: 0 });

test("normalizarPago: devoluciones aprobadas y contracargo en `posteriores`; sin nada, no aparece", () => {
  const conRefund = normalizarPago({
    id: 77, status: "approved", transaction_amount: 1000,
    refunds: [{ id: 1, amount: 300, status: "approved" }, { id: 2, amount: 50, status: null }],
  } as never);
  assert.deepEqual(conRefund.posteriores, [{ tipo: "devolucion", refundId: "1", paymentId: "77", importe: 300 }]);
  const cc = normalizarPago({ id: 78, status: "charged_back", transaction_amount: 500 } as never);
  assert.deepEqual(cc.posteriores, [{ tipo: "contracargo", paymentId: "78", importe: 500 }]);
  assert.equal("posteriores" in normalizarPago({ id: 79, status: "approved", transaction_amount: 10 } as never), false);
});

function deps(over: Partial<IngestaDeps>, llamadas: string[]): IngestaDeps {
  return {
    tenantId: "t1",
    client: {} as never,
    clasificador: { clasificar: async () => ({ clasificacion: "NO_FACTURABLE", motivo: "x" }) } as never,
    reconciliacion: {
      yaProcesado: async () => true,
      marcarNoFacturable: async () => {}, marcarRevisar: async () => {}, marcarFacturado: async () => {},
      marcarRechazado: async () => {}, marcarError: async () => 1,
    } as never,
    facturar: async () => { llamadas.push("facturar"); return "inv"; },
    aplicarPosteriores: async (pago) => { llamadas.push(`posteriores:${pago.id}`); },
    ...over,
  };
}

const pagoConRefund: PagoMP = {
  id: "90", estado: "refunded", monto: 1000, externalReference: "", operacion: "venta",
  posteriores: [{ tipo: "devolucion", refundId: "r1", paymentId: "90", importe: 1000 }],
} as PagoMP;

test("ingesta: la devolución de un pago YA procesado se aplica igual (antes la idempotencia la tiraba)", async () => {
  const llamadas: string[] = [];
  const r = resumen();
  await facturarPagoSiCorresponde(pagoConRefund, deps({}, llamadas), r);
  assert.deepEqual(llamadas, ["posteriores:90"]);
  assert.equal(r.saltados, 1);
});

test("ingesta: si aplicar la devolución falla, el pago sigue su camino", async () => {
  const llamadas: string[] = [];
  const r = resumen();
  await facturarPagoSiCorresponde(
    { ...pagoConRefund, estado: "approved" },
    deps({ reconciliacion: { ...deps({}, []).reconciliacion, yaProcesado: async () => false } as never, aplicarPosteriores: async () => { throw new Error("db"); } }, llamadas),
    r,
  );
  assert.equal(r.noFacturables, 1);
});

test("aplicarMovimientosPosterioresMP: contracargo → caso, devolución → nota/pendiente; una falla no frena el resto", async () => {
  const visto: string[] = [];
  const r = await aplicarMovimientosPosterioresMP(
    "t1",
    [
      { tipo: "contracargo", paymentId: "1", importe: 10 },
      { tipo: "devolucion", refundId: "a", paymentId: "2", importe: 5 },
      { tipo: "devolucion", refundId: "b", paymentId: "2", importe: 5 },
      { tipo: "devolucion", refundId: "c", paymentId: "3", importe: 5 },
    ],
    {
      contracargo: async (_t, c) => { visto.push(`caso:${c.paymentId}`); return { estado: "caso_abierto", casoId: "k", yaExistia: false, facturaId: null }; },
      devolucion: async (_t, d) => {
        visto.push(`nc:${d.refundId}`);
        if (d.refundId === "b") throw new Error("boom");
        return d.refundId === "a" ? { estado: "nota_emitida", invoiceId: "n", yaExistia: false } : { estado: "sin_factura" };
      },
    },
  );
  assert.deepEqual(visto, ["caso:1", "nc:a", "nc:b", "nc:c"]);
  assert.deepEqual(r, { notas: 1, pendientes: 1, rechazadas: 0, casos: 1, errores: 1 });
});
