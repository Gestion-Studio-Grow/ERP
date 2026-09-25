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
  discriminaIva,
  informaIvaWsfe,
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
      cuit: 20304050609,
      condicionIva: CondicionIva.ResponsableInscripto,
      puntoVenta: 3,
      regimenFacturaA: "A",
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
        docNro: 30712345671,
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

test("emisor RI + receptor monotributo ⇒ Factura A (RG 5003/2021, con la leyenda de la Ley 27.618)", () => {
  const c = construirComprobante(
    evento({
      receptor: {
        docTipo: TipoDocumento.CUIT,
        docNro: 20111111112,
        condicionIva: CondicionIva.Monotributo,
      },
    }),
  );
  assert.equal(c.tipo, TipoComprobante.FacturaA);
  assert.ok(c.leyendas?.some((l) => l.codigo === "RG5003_MONOTRIBUTISTA"));
});

test("emisor monotributo ⇒ Factura C (sin importar el receptor)", () => {
  const c = construirComprobante(
    evento({
      emisor: { cuit: 20304050609, condicionIva: CondicionIva.Monotributo, puntoVenta: 3 },
    }),
  );
  assert.equal(c.tipo, TipoComprobante.FacturaC);
});

test("emisor exento ⇒ Factura C", () => {
  const c = construirComprobante(
    evento({
      emisor: { cuit: 20304050609, condicionIva: CondicionIva.Exento, puntoVenta: 3 },
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
    /no emite facturas/,
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

test("totalIva suma al centavo, como viaja ImpIVA: $0,10 + $0,20 da $0,30 y no 0,30000000000000004 (ENG-109)", () => {
  const comp: ComprobanteArca = construirComprobante(
    evento({
      iva: [
        { alicuotaId: AlicuotaIvaId.VeintiUno, base: 0.48, importe: 0.1 },
        { alicuotaId: AlicuotaIvaId.DiezCinco, base: 1.9, importe: 0.2 },
      ],
      neto: 2.38,
      total: 2.68,
    }),
  );
  assert.equal(0.1 + 0.2 === 0.3, false, "la suma en binario no da 0,30");
  assert.equal(totalIva(comp), 0.3);
});

test("totalIva de un comprobante sin IVA es 0", () => {
  // Un total de $0 no se construye (la decisión lo frena): se mira sólo la suma sobre un comprobante sin alícuotas.
  const comp = { ...construirComprobante(evento()), iva: [] };
  assert.equal(totalIva(comp), 0);
});

// ── informaIvaWsfe: A y B informan IVA en WSFEv1; solo C no (fix Factura B) ───

test("informaIvaWsfe: A y B informan IVA (ImpIVA + <Iva>); C no", () => {
  // A y B (emisor Responsable Inscripto) → informan IVA en el payload de WSFEv1.
  for (const t of [TipoComprobante.FacturaA, TipoComprobante.NotaDebitoA, TipoComprobante.NotaCreditoA,
                   TipoComprobante.FacturaB, TipoComprobante.NotaDebitoB, TipoComprobante.NotaCreditoB]) {
    assert.equal(informaIvaWsfe(t), true, `${TipoComprobante[t]} debe informar IVA`);
  }
  // C (emisor Monotributo/Exento) → NO informa IVA.
  for (const t of [TipoComprobante.FacturaC, TipoComprobante.NotaDebitoC, TipoComprobante.NotaCreditoC]) {
    assert.equal(informaIvaWsfe(t), false, `${TipoComprobante[t]} NO informa IVA`);
  }
});

test("informaIvaWsfe ⊃ discriminaIva: B informa IVA aunque NO discrimine (regla receptor-CUIT es solo-A)", () => {
  // El bug latente: usar discriminaIva (solo A) para armar el <Iva> dejaba a B sin IVA.
  assert.equal(discriminaIva(TipoComprobante.FacturaB), false);
  assert.equal(informaIvaWsfe(TipoComprobante.FacturaB), true);
});
