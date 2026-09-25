// COMPROBANTE (D4) · El despacho a ARCA emite sólo lo que la decisión fiscal dejó "lista", con el
// tipo que ella resolvió, y frena antes de pedirle nada a ARCA lo que no lo está. Ejecuta
// `procesarInvoiceCreated` con el simulador en memoria (StubAfipClient); sin base ni red.

import { test } from "node:test";
import assert from "node:assert/strict";
import { procesarInvoiceCreated, ComprobanteInvalidoError, type HandlerDeps } from "./handler";
import { StubAfipClient } from "./afip/stub";
import type { InvoiceCreatedEvent, RegisterFiscalDocumentInput } from "./core-contract";
import { AlicuotaIvaId, CondicionIva, Concepto, TipoComprobante, TipoDocumento } from "./domain/catalogos";

function evento(over: Partial<InvoiceCreatedEvent> = {}): InvoiceCreatedEvent {
  return {
    invoiceId: "inv-1",
    tenantId: "t-1",
    concepto: Concepto.Productos,
    fecha: "20260925",
    emisor: { cuit: 20304050609, condicionIva: CondicionIva.ResponsableInscripto, puntoVenta: 3, regimenFacturaA: "A" },
    receptor: { docTipo: TipoDocumento.CUIT, docNro: 20111111112, condicionIva: CondicionIva.Monotributo },
    neto: 1000,
    iva: [{ alicuotaId: AlicuotaIvaId.VeintiUno, base: 1000, importe: 210 }],
    total: 1210,
    ivaPorProducto: true, // ENG-024: IVA de cada producto; sin esto un inscripto no emite.
    ...over,
  };
}

function deps(hoy: string) {
  const registrados: RegisterFiscalDocumentInput[] = [];
  let pedidosAArca = 0;
  const cliente = new StubAfipClient({ cuit: 20304050609, homologacion: true });
  const d: HandlerDeps = {
    clientePara: () => {
      pedidosAArca++;
      return cliente;
    },
    registrar: async (input) => {
      registrados.push(input);
    },
    anotarIntento: async () => {},
    numeroUsadoPorOtraFactura: async () => false,
    fechaDeEnvio: () => hoy,
  };
  return { d, registrados, pedidos: () => pedidosAArca };
}

test("responsable inscripto a monotributista: el despacho pide y registra una Factura A (antes salía B)", async () => {
  const { d, registrados } = deps("20260925");
  const r = await procesarInvoiceCreated(evento(), d);
  assert.equal(r.tipo, TipoComprobante.FacturaA);
  assert.equal(registrados[0].tipoComprobante, TipoComprobante.FacturaA);
});

test("fecha del comprobante fuera de la ventana de ARCA: se rechaza con el motivo y no se le pide nada a ARCA", async () => {
  const { d, registrados, pedidos } = deps("20261020");
  await assert.rejects(
    procesarInvoiceCreated(evento(), d),
    (e: unknown) =>
      e instanceof ComprobanteInvalidoError &&
      e.errores.length > 0 &&
      /fecha/i.test(e.message),
  );
  assert.equal(pedidos(), 0);
  assert.equal(registrados.length, 0);
});

test("responsable inscripto sin la clase A cargada: no sale una A sola, se rechaza con el motivo y sin llamar a ARCA", async () => {
  const { d, pedidos } = deps("20260925");
  const ev = evento();
  ev.emisor = { ...ev.emisor, regimenFacturaA: null };
  await assert.rejects(procesarInvoiceCreated(ev, d), ComprobanteInvalidoError);
  assert.equal(pedidos(), 0);
});

test("servicios sin período: no se inventa con la fecha de la factura, se rechaza sin llamar a ARCA", async () => {
  const { d, pedidos } = deps("20260925");
  const ev = evento({ concepto: Concepto.Servicios });
  await assert.rejects(procesarInvoiceCreated(ev, d), ComprobanteInvalidoError);
  assert.equal(pedidos(), 0);
});
