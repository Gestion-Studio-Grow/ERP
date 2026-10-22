/**
 * Facturación directa de un pago de Mercado Pago (ADR-025) — camino STANDALONE:
 * una venta MP no es un turno del ERP, se factura como venta directa. Es el
 * comando `facturarPagoMP` que la ingesta (webhook + backfill) invoca por cada
 * pago acreditado. Reusa el cálculo fiscal del Core (ADR-006).
 *
 * Gateado en el llamador por `isInvoicingEnabled()` (la migración de Invoice no
 * está aplicada). El Core es dueño del impuesto; el plugin MP solo detecta.
 */

import { createInvoice } from "@/lib/invoice-core";
import { calcularImpuestos, getFiscalProfile } from "@/lib/fiscal";
import { procesarEnviosDelNegocio } from "@/lib/arca-dispatch";
import type { PagoMP } from "@/plugins/mercadopago";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";
import { tenantTransaction } from "@/lib/rls";
import { claveCobroMP, facturarCobros, vincularCobro } from "@/lib/facturacion/cobros-facturados";

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
  /** R1 · Factura anotando el cobro `mp:<pago>`. Opcional: sin él (tests viejos), `createInvoice`. */
  facturarCobros?: typeof facturarCobros;
  /**
   * R1 · La factura que el EXTRACTO del banco ya emitió para este pago (movimiento con la
   * referencia del pago y factura viva), o `null`. Opcional.
   */
  facturaDelExtracto?: (tenantId: string, paymentId: string) => Promise<string | null>;
  vincularCobro?: typeof vincularCobro;
}

/** El extracto ya facturó un crédito con la referencia de este pago (y la factura sigue viva). */
async function facturaDelExtractoPrisma(tenantId: string, paymentId: string): Promise<string | null> {
  return tenantTransaction(
    async (tx) => {
      const mov = await tx.movimientoImportado.findFirst({
        where: { tenantId, referencia: paymentId, invoiceId: { not: null } },
        select: { invoiceId: true },
      });
      if (!mov?.invoiceId) return null;
      const f = await tx.invoice.findFirst({ where: { tenantId, id: mov.invoiceId, status: { not: "REJECTED" } }, select: { id: true } });
      return f?.id ?? null;
    },
    { tenantId },
  );
}

const DEPS: DepsFacturarPagoMP = {
  getFiscalProfile,
  createInvoice,
  procesarEnviosDelNegocio,
  facturarCobros,
  facturaDelExtracto: facturaDelExtractoPrisma,
  vincularCobro,
};

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
  const cobro = { clave: claveCobroMP(pago.id), importe: pago.monto, appointmentId: opciones.appointmentId ?? null };

  // R1 · Si el extracto del banco ya facturó este mismo pago (por su referencia), no se emite otra:
  // el cobro queda anotado contra esa factura.
  const delExtracto = deps.facturaDelExtracto ? await deps.facturaDelExtracto(tenantId, pago.id) : null;
  if (delExtracto && deps.vincularCobro) return deps.vincularCobro(tenantId, cobro, delExtracto);

  const perfil = await deps.getFiscalProfile(tenantId);
  const { neto, iva, total } = calcularImpuestos(perfil.condicionIva, pago.monto);
  // Sin fecha de acreditación de MP, el día del NEGOCIO (no el del servidor, que a las 21
  // argentinas ya está en el día siguiente): ver libros/fecha-fiscal.ts.
  const fecha = pago.fechaAcreditacion ?? fechaFiscalDelDia();

  const comprobante = {
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
    // MISMA, en vez de emitir una segunda factura por el mismo cobro. Antes iba SIN origin →
    // el dedupe estaba deshabilitado y cada reintento facturaba de nuevo.
    origin: { type: "MP_PAYMENT" as const, id: pago.id },
  };
  // R1 · UNA FACTURA POR COBRO: la clave `mp:<pago>` con índice único. Si otro disparador ya lo
  // facturó (el extracto, un aviso duplicado), devuelve esa factura.
  const invoiceId = deps.facturarCobros ? await deps.facturarCobros(comprobante, [cobro]) : await deps.createInvoice(comprobante);

  await deps.procesarEnviosDelNegocio(tenantId);
  return invoiceId;
}
