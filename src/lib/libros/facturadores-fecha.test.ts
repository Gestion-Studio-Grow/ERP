// Los TRES facturadores, EJECUTADOS con reloj fijo: una venta cobrada a las 23:30 del 31/08
// (hora argentina) sale con fecha 20260831. En UTC ya es 1/09, y con la hora del servidor el
// comprobante caía en el período fiscal de septiembre.
//
// No alcanza con probar `fechaFiscalDelDia`: si un facturador vuelve a armar la fecha con la
// hora del servidor, sólo lo ve un test que corra el facturador. Se corren con dependencias
// falsas (sin base ni ARCA) y se mira qué fecha le llega a `createInvoice`.

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { facturarOrden, type DepsFacturarOrden } from "@/lib/invoice-from-order";
import { facturarAppointment, type DepsFacturarTurno } from "@/lib/invoice-from-appointment";
import { facturarPagoMP, type DepsFacturarPagoMP } from "@/lib/invoice-from-mp";
import type { CreateInvoiceInput } from "@/lib/invoice-core";
import type { FiscalProfile } from "@/lib/fiscal";

// El servidor (Vercel) corre en UTC: el test también, sea cual sea la zona de la máquina que
// lo corre. Así la hora del servidor da 20260901 y un facturador que la use falla acá
// (probado: con la fecha armada como antes, el primer test da rojo).
process.env.TZ = "UTC";

/** 31/08/2026 23:30 en Buenos Aires = 01/09/2026 02:30 UTC. */
const ULTIMA_MEDIA_HORA_DE_AGOSTO = new Date("2026-09-01T02:30:00.000Z");

const PERFIL: FiscalProfile = {
  cuit: 20123456786,
  condicionIva: "MONOTRIBUTO",
  puntoVenta: 2,
  homologacion: true,
  condicionIvaAsumida: false,
};

/** Lo común a los tres: el perfil, el alta que anota qué le llegó, y el despacho. */
function comunes() {
  const emitidas: CreateInvoiceInput[] = [];
  return {
    emitidas,
    deps: {
      getFiscalProfile: async () => PERFIL,
      createInvoice: async (input: CreateInvoiceInput) => {
        emitidas.push(input);
        return "inv-1";
      },
      procesarEnviosDelNegocio: async () => ({ procesados: 0 }) as unknown as Awaited<ReturnType<DepsFacturarOrden["procesarEnviosDelNegocio"]>>,
    },
  };
}

async function conReloj<T>(ahora: Date, correr: () => Promise<T>): Promise<T> {
  mock.timers.enable({ apis: ["Date"], now: ahora });
  try {
    return await correr();
  } finally {
    mock.timers.reset();
  }
}

test("facturarOrden: la venta de las 23:30 del 31/08 sale con fecha 20260831", async () => {
  const { emitidas, deps } = comunes();
  const d: DepsFacturarOrden = { ...deps, leerOrden: async () => ({ total: 12100 }) };
  const id = await conReloj(ULTIMA_MEDIA_HORA_DE_AGOSTO, () => facturarOrden("o-1", "t-1", d));
  assert.equal(id, "inv-1");
  assert.equal(emitidas.length, 1);
  assert.equal(emitidas[0].fecha, "20260831");
  assert.equal(emitidas[0].vencimientoPago, "20260831");
  assert.deepEqual(emitidas[0].origin, { type: "ORDER", id: "o-1" });
});

test("facturarAppointment: el turno cobrado a las 23:30 del 31/08 sale con fecha y servicio del 31/08", async () => {
  const { emitidas, deps } = comunes();
  const marcados: string[] = [];
  const d: DepsFacturarTurno = {
    ...deps,
    leerTurno: async () => ({
      priceAtBooking: 23000,
      service: { price: 23000 },
      payment: { id: "pay-1", amount: 23000, status: "APPROVED", comprobanteNro: null },
    }),
    marcarPago: async (paymentId, invoiceId) => {
      marcados.push(`${paymentId}→${invoiceId}`);
    },
  };
  await conReloj(ULTIMA_MEDIA_HORA_DE_AGOSTO, () => facturarAppointment("a-1", "t-1", d));
  assert.equal(emitidas[0].fecha, "20260831");
  assert.equal(emitidas[0].servicioDesde, "20260831");
  assert.equal(emitidas[0].servicioHasta, "20260831");
  assert.deepEqual(marcados, ["pay-1→inv-1"], "el pago queda marcado con su comprobante (idempotencia)");
});

test("facturarPagoMP: sin fecha de acreditación, el día del negocio; con fecha, la de Mercado Pago", async () => {
  const pago = { id: "mp-1", estado: "approved" as const, monto: 5000, externalReference: "" };

  const sinFecha = comunes();
  await conReloj(ULTIMA_MEDIA_HORA_DE_AGOSTO, () => facturarPagoMP(pago, "t-1", sinFecha.deps as DepsFacturarPagoMP));
  assert.equal(sinFecha.emitidas[0].fecha, "20260831");

  const conFecha = comunes();
  await conReloj(ULTIMA_MEDIA_HORA_DE_AGOSTO, () =>
    facturarPagoMP({ ...pago, fechaAcreditacion: "20260830" }, "t-1", conFecha.deps as DepsFacturarPagoMP),
  );
  assert.equal(conFecha.emitidas[0].fecha, "20260830");
});

test("a la medianoche argentina ya es el día siguiente", async () => {
  const unaDelPrimero = new Date("2026-09-01T03:00:00.000Z"); // 01/09 00:00 ART
  const orden = comunes();
  await conReloj(unaDelPrimero, () => facturarOrden("o-1", "t-1", { ...orden.deps, leerOrden: async () => ({ total: 100 }) }));
  assert.equal(orden.emitidas[0].fecha, "20260901");
});
