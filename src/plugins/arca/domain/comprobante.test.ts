// Tests de `construirComprobante` y `totalIva` (ADR-026 · plugin ARCA, ADR-022).
// Dominio puro: arma el ComprobanteArca a partir del evento del Core (mapea
// condición→tipo, traslada montos, NO calcula IVA). Sin DB ni red.
// (Archivo propio del squad Calidad; NO toca soap.ts ni el código de prod.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { construirComprobante, totalIva } from "./comprobante";
import type { ComprobanteArca } from "./comprobante";
import type { InvoiceCreatedEvent } from "../core-contract";
import {
  AlicuotaIvaId,
  CondicionIva,
  Concepto,
  TipoComprobante,
  TipoDocumento,
} from "./catalogos";

// Evento base del Core: emisor RI, receptor consumidor final, concepto Productos,
// 100 @ 21% = 21 IVA, total 121.
function evento(over: Partial<InvoiceCreatedEvent> = {}): InvoiceCreatedEvent {
  return {
    invoiceId: "inv-1",
    tenantId: "t-1",
    concepto: Concepto.Productos,
    fecha: "20260705",
    emisor: {
      cuit: 20304050607,
      condicionIva: CondicionIva.ResponsableInscripto,
      puntoVenta: 3,
    },
    receptor: {
      docTipo: TipoDocumento.ConsumidorFinal,
      docNro: 0,
      condicionIva: CondicionIva.ConsumidorFinal,
    },
    neto: 100,
    iva: [{ alicuotaId: AlicuotaIvaId.VeintiUno, base: 100, importe: 21 }],
    total: 121,
    ...over,
  };
}

test("traslada los campos base del evento sin tocarlos", () => {
  const c = construirComprobante(evento());
  assert.equal(c.invoiceId, "inv-1");
  assert.equal(c.tenantId, "t-1");
  assert.equal(c.puntoVenta, 3);
  assert.equal(c.fecha, "20260705");
  assert.equal(c.concepto, Concepto.Productos);
  assert.equal(c.docTipo, TipoDocumento.ConsumidorFinal);
  assert.equal(c.docNro, 0);
});

test("traslada los montos calculados por el Core sin recalcular", () => {
  const c = construirComprobante(evento());
  assert.equal(c.neto, 100);
  assert.equal(c.total, 121);
  assert.deepEqual(c.iva, [{ id: AlicuotaIvaId.VeintiUno, baseImponible: 100, importe: 21 }]);
});

test("mapea el desglose de IVA por alícuota (varias líneas)", () => {
  const c = construirComprobante(
    evento({
      iva: [
        { alicuotaId: AlicuotaIvaId.VeintiUno, base: 100, importe: 21 },
        { alicuotaId: AlicuotaIvaId.DiezCinco, base: 200, importe: 21 },
      ],
      neto: 300,
      total: 342,
    }),
  );
  assert.equal(c.iva.length, 2);
  assert.deepEqual(c.iva[1], { id: AlicuotaIvaId.DiezCinco, baseImponible: 200, importe: 21 });
});

// --- elección del tipo de comprobante (condición emisor/receptor) -----------

test("emisor RI + receptor RI ⇒ Factura A", () => {
  const c = construirComprobante(
    evento({
      receptor: {
        docTipo: TipoDocumento.CUIT,
        docNro: 27111222333,
        condicionIva: CondicionIva.ResponsableInscripto,
      },
    }),
  );
  assert.equal(c.tipo, TipoComprobante.FacturaA);
});

test("emisor RI + receptor consumidor final ⇒ Factura B", () => {
  const c = construirComprobante(evento());
  assert.equal(c.tipo, TipoComprobante.FacturaB);
});

test("emisor RI + receptor monotributo ⇒ Factura B (no A)", () => {
  const c = construirComprobante(
    evento({
      receptor: {
        docTipo: TipoDocumento.CUIT,
        docNro: 20999888777,
        condicionIva: CondicionIva.Monotributo,
      },
    }),
  );
  assert.equal(c.tipo, TipoComprobante.FacturaB);
});

test("emisor monotributo ⇒ Factura C (sin importar el receptor)", () => {
  const c = construirComprobante(
    evento({
      emisor: { cuit: 20304050607, condicionIva: CondicionIva.Monotributo, puntoVenta: 3 },
    }),
  );
  assert.equal(c.tipo, TipoComprobante.FacturaC);
});

test("emisor exento ⇒ Factura C", () => {
  const c = construirComprobante(
    evento({
      emisor: { cuit: 20304050607, condicionIva: CondicionIva.Exento, puntoVenta: 3 },
    }),
  );
  assert.equal(c.tipo, TipoComprobante.FacturaC);
});

test("emisor consumidor final no puede emitir: lanza", () => {
  assert.throws(
    () =>
      construirComprobante(
        evento({
          emisor: {
            cuit: 0,
            condicionIva: CondicionIva.ConsumidorFinal,
            puntoVenta: 3,
          },
        }),
      ),
    /no puede emitir/,
  );
});

// --- fechas de servicio (opcionales) ---------------------------------------

test("traslada las fechas de servicio cuando vienen en el evento", () => {
  const c = construirComprobante(
    evento({
      concepto: Concepto.Servicios,
      servicioDesde: "20260701",
      servicioHasta: "20260705",
      vencimientoPago: "20260710",
    }),
  );
  assert.equal(c.servicioDesde, "20260701");
  assert.equal(c.servicioHasta, "20260705");
  assert.equal(c.vencimientoPago, "20260710");
});

test("sin fechas de servicio en el evento, quedan undefined", () => {
  const c = construirComprobante(evento());
  assert.equal(c.servicioDesde, undefined);
  assert.equal(c.servicioHasta, undefined);
  assert.equal(c.vencimientoPago, undefined);
});

test("numero no lo pone construirComprobante: lo resuelve el cliente contra ARCA", () => {
  const c = construirComprobante(evento());
  assert.equal(c.numero, undefined);
});

// --- totalIva ---------------------------------------------------------------

test("totalIva suma los importes de todas las alícuotas", () => {
  const comp: ComprobanteArca = construirComprobante(
    evento({
      iva: [
        { alicuotaId: AlicuotaIvaId.VeintiUno, base: 100, importe: 21 },
        { alicuotaId: AlicuotaIvaId.DiezCinco, base: 200, importe: 21 },
      ],
      neto: 300,
      total: 342,
    }),
  );
  assert.equal(totalIva(comp), 42);
});

test("totalIva de un comprobante sin IVA es 0", () => {
  const comp = construirComprobante(evento({ iva: [], neto: 0, total: 0 }));
  assert.equal(totalIva(comp), 0);
});
