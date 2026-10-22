/**
 * Facturación directa de un pago de Mercado Pago (ADR-025) — camino STANDALONE:
 * una venta MP no es un turno del ERP, se factura como venta directa. Es el
 * comando `facturarPagoMP` que la ingesta (webhook + backfill) invoca por cada
 * pago acreditado. Reusa el cálculo fiscal del Core (ADR-006).
 *
 * Gateado en el llamador por `isInvoicingEnabled()` (la migración de Invoice no
 * está aplicada). El Core es dueño del impuesto; el plugin MP solo detecta.
 */

import { createInvoice, type CreateInvoiceInput, type InvoiceTx } from "@/lib/invoice-core";
import { calcularImpuestos, getFiscalProfile } from "@/lib/fiscal";
import { procesarEnviosDelNegocio } from "@/lib/arca-dispatch";
import type { PagoMP } from "@/plugins/mercadopago";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";
import {
  claveCobroMP,
  cobrosYaFacturadosInTx,
  enLaTransaccionDelCobro,
  facturarCobrosInTx,
  vincularCobroInTx,
} from "@/lib/facturacion/cobros-facturados";

// Códigos de catálogo ARCA (ver src/plugins/arca/domain/catalogos.ts).
const CONCEPTO_PRODUCTOS = 1; // venta de productos/servicios sueltos, sin fechas de servicio
const DOC_CONSUMIDOR_FINAL = 99;

/**
 * Lo que el facturador usa de afuera. Es un parámetro (con los reales por defecto) para que
 * el test lo EJECUTE con el reloj fijo y sin base: sin fecha de acreditación, la del día del
 * negocio, y eso se prueba corriendo `facturarPagoMP`, no sólo la función de la fecha.
 */
export interface DepsFacturarPagoMP {
  getFiscalProfile: typeof getFiscalProfile;
  createInvoice: typeof createInvoice;
  procesarEnviosDelNegocio: typeof procesarEnviosDelNegocio;
  /**
   * R1 · `true` = el motor de cobros (una transacción, clave `mp:<pago>` con índice único, y la
   * factura que el extracto ya emitió por la referencia del pago). Sin él (tests viejos sin
   * base): `createInvoice` a secas.
   */
  porCobros?: boolean;
}

const DEPS: DepsFacturarPagoMP = { getFiscalProfile, createInvoice, procesarEnviosDelNegocio, porCobros: true };

type Perfil = Awaited<ReturnType<typeof getFiscalProfile>>;

/** El comprobante de un pago de MP (Factura del emisor a consumidor final, por el monto del pago). */
function comprobanteDelPago(pago: PagoMP, tenantId: string, perfil: Perfil): CreateInvoiceInput {
  const { neto, iva, total } = calcularImpuestos(perfil.condicionIva, pago.monto);
  // Sin fecha de acreditación de MP, el día del NEGOCIO (no el del servidor, que a las 21
  // argentinas ya está en el día siguiente): ver libros/fecha-fiscal.ts.
  const fecha = pago.fechaAcreditacion ?? fechaFiscalDelDia();
  return {
    tenantId,
    concepto: CONCEPTO_PRODUCTOS,
    fecha,
    emisor: { cuit: perfil.cuit, condicionIva: perfil.condicionIva, puntoVenta: perfil.puntoVenta },
    // Venta MP a consumidor final (el pagador no está identificado con CUIT).
    receptor: { docTipo: DOC_CONSUMIDOR_FINAL, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
    neto,
    iva,
    total,
    // A-6 — IDEMPOTENCIA por pago: la clave es el `payment_id` del gateway. Un webhook MP
    // duplicado (MP reintenta las notificaciones) vuelve a llamar acá con el mismo `pago.id` →
    // `createInvoice` encuentra la factura ya creada (o el @@unique la frena) y devuelve la
    // MISMA, en vez de emitir una segunda factura por el mismo cobro.
    origin: { type: "MP_PAYMENT", id: pago.id },
  };
}

/**
 * R1 · Factura el pago DENTRO de la transacción del llamador (que puede tener el turno tomado):
 * clave `mp:<pago>`. Si el extracto del banco ya facturó ese mismo pago (un crédito con su
 * referencia y factura viva), no emite otra: el cobro queda anotado contra esa factura.
 */
export async function facturarPagoMPInTx(
  tx: InvoiceTx,
  pago: PagoMP,
  tenantId: string,
  perfil: Perfil,
  opciones: { appointmentId?: string | null } = {},
): Promise<string> {
  const cobro = { clave: claveCobroMP(pago.id), importe: pago.monto, appointmentId: opciones.appointmentId ?? null };
  const [vivo] = await cobrosYaFacturadosInTx(tx, tenantId, [cobro.clave]);
  if (vivo) return vivo.invoiceId;
  const mov = await tx.movimientoImportado.findFirst({
    where: { tenantId, referencia: pago.id, invoiceId: { not: null } },
    select: { invoiceId: true },
  });
  if (mov?.invoiceId) {
    const delExtracto = await tx.invoice.findFirst({
      where: { tenantId, id: mov.invoiceId, status: { not: "REJECTED" } },
      select: { id: true },
    });
    if (delExtracto) return vincularCobroInTx(tx, tenantId, cobro, delExtracto.id);
  }
  return facturarCobrosInTx(tx, comprobanteDelPago(pago, tenantId, perfil), [cobro]);
}

/**
 * Crea la Factura C de un pago MP y la despacha al plugin ARCA (tick del
 * simulador). Devuelve el `invoiceId`, o `null` si el pago no es facturable.
 */
export async function facturarPagoMP(
  pago: PagoMP,
  tenantId: string,
  deps: DepsFacturarPagoMP = DEPS,
  opciones: { appointmentId?: string } = {},
): Promise<string | null> {
  if (pago.estado !== "approved" || !(pago.monto > 0)) return null;
  const perfil = await deps.getFiscalProfile(tenantId);
  // R1 · UNA FACTURA POR COBRO: la clave `mp:<pago>` con índice único. Si otro disparador ya lo
  // facturó (el extracto, un aviso duplicado), devuelve esa factura.
  const invoiceId = deps.porCobros
    ? await enLaTransaccionDelCobro(tenantId, (tx) => facturarPagoMPInTx(tx, pago, tenantId, perfil, opciones))
    : await deps.createInvoice(comprobanteDelPago(pago, tenantId, perfil));

  await deps.procesarEnviosDelNegocio(tenantId);
  return invoiceId;
}
