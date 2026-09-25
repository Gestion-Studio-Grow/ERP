// ENG-024 · «Un responsable inscripto no factura con un 21 % parejo sobre el total»: la regla vive
// en el plugin fiscal, no en una pantalla (antes sólo la aplicaba `ventas/factura.ts:94` y los
// otros 5 caminos emitían una B con IVA plano). Ejecuta la regla pura y `procesarInvoiceCreated`
// con el simulador en memoria (StubAfipClient); sin base ni red.

import { test } from "node:test";
import assert from "node:assert/strict";
import { procesarInvoiceCreated, ComprobanteInvalidoError, type HandlerDeps } from "./handler";
import { StubAfipClient } from "./afip/stub";
import type { InvoiceCreatedEvent } from "./core-contract";
import { AlicuotaIvaId, CondicionIva, Concepto, TipoComprobante, TipoDocumento } from "./domain/catalogos";
import { MOTIVO_IVA_SIN_ALICUOTA_POR_PRODUCTO, ivaSinAlicuotaPorProducto } from "./domain/iva-por-producto";

const HOY = "20260925";

function eventoInscripto(over: Partial<InvoiceCreatedEvent> = {}): InvoiceCreatedEvent {
  return {
    invoiceId: "inv-ri",
    tenantId: "t-ri",
    concepto: Concepto.Productos,
    fecha: HOY,
    emisor: { cuit: 20304050609, condicionIva: CondicionIva.ResponsableInscripto, puntoVenta: 3 },
    receptor: { docTipo: TipoDocumento.ConsumidorFinal, docNro: 0, condicionIva: CondicionIva.ConsumidorFinal },
    neto: 1000,
    iva: [{ alicuotaId: AlicuotaIvaId.VeintiUno, base: 1000, importe: 210 }],
    total: 1210,
    vencimientoPago: HOY,
    ...over,
  };
}

function eventoMonotributo(over: Partial<InvoiceCreatedEvent> = {}): InvoiceCreatedEvent {
  return eventoInscripto({
    invoiceId: "inv-mt",
    emisor: { cuit: 20304050609, condicionIva: CondicionIva.Monotributo, puntoVenta: 3 },
    neto: 1210,
    iva: [{ alicuotaId: AlicuotaIvaId.Cero, base: 1210, importe: 0 }],
    total: 1210,
    ...over,
  });
}

function deps() {
  let pedidosAArca = 0;
  let registrados = 0;
  const cliente = new StubAfipClient({ cuit: 20304050609, homologacion: true });
  const d: HandlerDeps = {
    clientePara: () => {
      pedidosAArca++;
      return cliente;
    },
    registrar: async () => {
      registrados++;
    },
    anotarIntento: async () => {},
    numeroUsadoPorOtraFactura: async () => false,
    fechaDeEnvio: () => HOY,
  };
  return { d, pedidos: () => pedidosAArca, registrados: () => registrados };
}

test("inscripto con el IVA como tasa pareja sobre el total (sin alícuota por producto): la regla lo frena con el motivo", () => {
  const e = ivaSinAlicuotaPorProducto(eventoInscripto());
  assert.ok(e);
  assert.equal(e.campo, "iva");
  assert.equal(e.mensaje, MOTIVO_IVA_SIN_ALICUOTA_POR_PRODUCTO);
  // Declarar `false` es lo mismo que no declararlo.
  assert.ok(ivaSinAlicuotaPorProducto(eventoInscripto({ ivaPorProducto: false })));
});

test("inscripto con el IVA armado desde la alícuota de cada producto: la regla no lo frena", () => {
  assert.equal(ivaSinAlicuotaPorProducto(eventoInscripto({ ivaPorProducto: true })), null);
});

test("monotributo y exento no discriminan IVA: la regla no los toca aunque no declaren alícuota por producto", () => {
  assert.equal(ivaSinAlicuotaPorProducto(eventoMonotributo()), null);
  assert.equal(
    ivaSinAlicuotaPorProducto(
      eventoMonotributo({ emisor: { cuit: 20304050609, condicionIva: CondicionIva.Exento, puntoVenta: 3 } }),
    ),
    null,
  );
});

test("despacho: un inscripto sin alícuota por producto no emite, devuelve el motivo y no se le pide nada a ARCA", async () => {
  const { d, pedidos, registrados } = deps();
  await assert.rejects(
    procesarInvoiceCreated(eventoInscripto(), d),
    (e: unknown) =>
      e instanceof ComprobanteInvalidoError &&
      e.errores.some((x) => x.campo === "iva" && x.mensaje === MOTIVO_IVA_SIN_ALICUOTA_POR_PRODUCTO),
  );
  assert.equal(pedidos(), 0);
  assert.equal(registrados(), 0);
});

test("despacho: el mismo inscripto con alícuota por producto emite su Factura B a consumidor final", async () => {
  const { d, registrados } = deps();
  const r = await procesarInvoiceCreated(eventoInscripto({ ivaPorProducto: true }), d);
  assert.equal(r.tipo, TipoComprobante.FacturaB);
  assert.equal(registrados(), 1);
});

test("despacho: un monotributista (como CH) sigue emitiendo su Factura C sin declarar alícuota por producto", async () => {
  const { d, registrados } = deps();
  const r = await procesarInvoiceCreated(eventoMonotributo(), d);
  assert.equal(r.tipo, TipoComprobante.FacturaC);
  assert.equal(registrados(), 1);
});
