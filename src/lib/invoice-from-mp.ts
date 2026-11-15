/**
 * Facturación directa de un pago de Mercado Pago (ADR-025) — camino STANDALONE:
 * una venta MP no es un turno del ERP, se factura como venta directa. Es el
 * comando `facturarPagoMP` que la ingesta (webhook + backfill) invoca por cada
 * pago acreditado. Reusa el cálculo fiscal del Core (ADR-006).
 *
 * Gateado en el llamador por `isInvoicingEnabled()` (la migración de Invoice no
 * está aplicada). El Core es dueño del impuesto; el plugin MP solo detecta.
 */

import { createInvoice, type InvoiceTx } from "@/lib/invoice-core";
import { calcularImpuestos, getFiscalProfile } from "@/lib/fiscal";
import { procesarEnviosDelNegocio } from "@/lib/arca-dispatch";
import type { PagoMP } from "@/plugins/mercadopago";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";
import { tenantTransaction } from "@/lib/rls";
import { claveCobroMP, facturarCobros, vincularCobro } from "@/lib/facturacion/cobros-facturados";
import { facturarPagoMPDelTurno } from "@/lib/facturacion/factura-por-cobro";
import { conceptoDeLaEmision, fechasDeServicio } from "@/lib/facturacion/fecha-emision-automatica";

// Códigos de catálogo ARCA (ver src/plugins/arca/domain/catalogos.ts).
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
  /**
   * Pago de un TURNO: decide (factura del turno, factura del cobro del libro o factura propia) y
   * factura en una transacción bajo el candado del turno (`factura-por-cobro.ts`). Opcional: sin él,
   * `facturarCobros`.
   */
  facturarPagoDelTurno?: typeof facturarPagoMPDelTurno;
}

/**
 * El extracto DE MERCADO PAGO ya facturó un crédito con la referencia de este pago (y la factura
 * sigue viva). GSG-FACT-011 · H8: sólo una importación de Mercado Pago trae ids de pago en la
 * referencia; la de un banco («123» de una transferencia) no es el pago «123» de MP.
 */
async function facturaDelExtractoPrisma(tenantId: string, paymentId: string): Promise<string | null> {
  return tenantTransaction(
    async (tx) => {
      const mov = await tx.movimientoImportado.findFirst({
        where: { tenantId, referencia: paymentId, invoiceId: { not: null }, importacion: { origen: "mercadopago" } },
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
  facturarPagoDelTurno: facturarPagoMPDelTurno,
};

/**
 * Crea la Factura C de un pago MP y la despacha al plugin ARCA (tick del
 * simulador). Devuelve el `invoiceId`, o `null` si el pago no es facturable.
 */
export async function facturarPagoMP(
  pago: PagoMP,
  tenantId: string,
  deps: DepsFacturarPagoMP = DEPS,
  opciones: {
    appointmentId?: string;
    /**
     * GSG-FACT-011 · H2 · La emisión AUTOMÁTICA cuenta el cupo dentro de la transacción de la factura,
     * bajo su candado (`facturarCobros(…, { verificarCupo })`). Sólo para el pago suelto: el de un turno
     * no pasa por acá desde la ingesta automática (se marca no facturable antes).
     */
    verificarCupo?: (tx: InvoiceTx) => Promise<void>;
    /**
     * GSG-FACT-011 · H5 · El concepto habitual del negocio para lo que entra por MP
     * (`ConfigFacturacionMP.concepto`). Sin él (o inválido), productos (1). Con servicios (2 o 3),
     * período = mes del cobro y vencimiento = máx(cobro, factura). Provisional a confirmar.
     */
    concepto?: number | null;
  } = {},
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
  // H5 · El pago de MP no trae concepto: el del negocio, o productos.
  const concepto = conceptoDeLaEmision(opciones.concepto);

  const comprobante = {
    tenantId,
    concepto,
    fecha,
    ...fechasDeServicio(concepto, fecha, fecha),
    emisor: { cuit: perfil.cuit, condicionIva: perfil.condicionIva, puntoVenta: perfil.puntoVenta },
    // Venta MP a consumidor final (el pagador no está identificado con CUIT).
    receptor: { docTipo: DOC_CONSUMIDOR_FINAL, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
    neto,
    iva,
    total,
    // PR5 · C4: un cobro por Mercado Pago no es efectivo.
    medioDePago: "otro" as const,
    // A-6 — IDEMPOTENCIA por pago: la clave es el `payment_id` del gateway. Un webhook MP
    // duplicado (MP reintenta las notificaciones) vuelve a llamar acá con el mismo `pago.id` →
    // `createInvoice` encuentra la factura ya creada (o el @@unique la frena) y devuelve la
    // MISMA, en vez de emitir una segunda factura por el mismo cobro. Antes iba SIN origin →
    // el dedupe estaba deshabilitado y cada reintento facturaba de nuevo.
    origin: { type: "MP_PAYMENT" as const, id: pago.id },
  };
  // R1 · UNA FACTURA POR COBRO: la clave `mp:<pago>` con índice único. Si otro disparador ya lo
  // facturó (el extracto, un aviso duplicado), devuelve esa factura.
  const turno = cobro.appointmentId;
  const invoiceId =
    turno && deps.facturarPagoDelTurno
      ? await deps.facturarPagoDelTurno(comprobante, { ...cobro, appointmentId: turno })
      : deps.facturarCobros
        ? await deps.facturarCobros(comprobante, [cobro], opciones.verificarCupo ? { verificarCupo: opciones.verificarCupo } : {})
        : await deps.createInvoice(comprobante);

  await deps.procesarEnviosDelNegocio(tenantId);
  return invoiceId;
}
