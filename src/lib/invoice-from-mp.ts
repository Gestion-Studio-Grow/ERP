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
import { PagoARevisarError, type PagoMP } from "@/plugins/mercadopago";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";
import { tenantTransaction } from "@/lib/rls";
import { claveCobroMP, facturarCobros, vincularCobro } from "@/lib/facturacion/cobros-facturados";
import { facturarPagoMPDelTurno } from "@/lib/facturacion/factura-por-cobro";
import {
  ajustarFechaAutomatica,
  conceptoDeLaEmision,
  fechasDeServicio,
  mismoCobroQueElPagoMP,
  motivoFueraDeVentanaArca,
} from "@/lib/facturacion/fecha-emision-automatica";

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
  facturaDelExtracto?: (tenantId: string, paymentId: string, pago?: { importe: number; fecha: string }) => Promise<string | null>;
  /**
   * GSG-FACT-011 · X1 · La misma mirada, dentro de la transacción de la factura y con el candado del
   * cupo tomado (`facturarCobros(…, { facturaPrevia })`): el lote del extracto factura el mismo pago
   * con otra clave (`banco:<hash>`), y el índice único no los arbitra. Opcional (dobles de test).
   */
  facturaDelExtractoEnTx?: typeof facturaDelExtractoEnTx;
  vincularCobro?: typeof vincularCobro;
  /**
   * Pago de un TURNO: decide (factura del turno, factura del cobro del libro o factura propia) y
   * factura en una transacción bajo el candado del turno (`factura-por-cobro.ts`). Opcional: sin él,
   * `facturarCobros`.
   */
  facturarPagoDelTurno?: typeof facturarPagoMPDelTurno;
}

/**
 * El extracto ya facturó un crédito con la referencia de este pago (y la factura sigue viva).
 * GSG-FACT-011 · H8: una importación de Mercado Pago trae ids de pago en la referencia; la de un
 * banco («123» de una transferencia) no es el pago «123» de MP. R8: salvo que coincidan el importe y
 * la fecha con el pago (`mismoCobroQueElPagoMP`): un export de MP con una columna de más cae en la
 * heurística del mapeador y queda «banco», y sin esto el aviso lo facturaba otra vez.
 */
async function facturaDelExtractoPrisma(
  tenantId: string,
  paymentId: string,
  pago?: { importe: number; fecha: string },
): Promise<string | null> {
  return tenantTransaction((tx) => facturaDelExtractoEnTx(tx, tenantId, paymentId, pago), { tenantId });
}

/** `facturaDelExtractoPrisma` dentro de la transacción del llamador (X1: bajo el candado del cupo). */
export async function facturaDelExtractoEnTx(
  tx: Pick<InvoiceTx, "movimientoImportado" | "invoice">,
  tenantId: string,
  paymentId: string,
  pago?: { importe: number; fecha: string },
): Promise<string | null> {
  const movs = await tx.movimientoImportado.findMany({
    where: { tenantId, referencia: paymentId, invoiceId: { not: null } },
    select: { invoiceId: true, monto: true, fecha: true, importacion: { select: { origen: true } } },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  for (const mov of movs) {
    const esElPago =
      mov.importacion.origen === "mercadopago" ||
      (pago != null && mismoCobroQueElPagoMP({ importe: Number(mov.monto), fecha: mov.fecha }, pago));
    if (!esElPago || !mov.invoiceId) continue;
    const f = await tx.invoice.findFirst({ where: { tenantId, id: mov.invoiceId, status: { not: "REJECTED" } }, select: { id: true } });
    if (f) return f.id;
  }
  return null;
}

const DEPS: DepsFacturarPagoMP = {
  getFiscalProfile,
  createInvoice,
  procesarEnviosDelNegocio,
  facturarCobros,
  facturaDelExtracto: facturaDelExtractoPrisma,
  facturaDelExtractoEnTx,
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
    /**
     * GSG-FACT-011 · H4 en Mercado Pago · El reloj de la emisión automática (aviso y sincronización).
     * Con él, la factura del pago suelto se fecha como el lote: máx(acreditación, última factura no
     * rechazada del punto de venta y tipo), leída bajo el candado del cupo; y si la acreditación cae
     * fuera de la ventana de ARCA, no se emite: el pago va a revisión (`PagoARevisarError`).
     */
    ahora?: Date;
  } = {},
): Promise<string | null> {
  if (pago.estado !== "approved" || !(pago.monto > 0)) return null;
  const cobro = { clave: claveCobroMP(pago.id), importe: pago.monto, appointmentId: opciones.appointmentId ?? null };

  // R1 · Si el extracto del banco ya facturó este mismo pago (por su referencia), no se emite otra:
  // el cobro queda anotado contra esa factura.
  // Sin fecha de acreditación de MP, el día del NEGOCIO (no el del servidor, que a las 21
  // argentinas ya está en el día siguiente): ver libros/fecha-fiscal.ts.
  const fecha = pago.fechaAcreditacion ?? fechaFiscalDelDia();
  const delExtracto = deps.facturaDelExtracto ? await deps.facturaDelExtracto(tenantId, pago.id, { importe: pago.monto, fecha }) : null;
  if (delExtracto && deps.vincularCobro) return deps.vincularCobro(tenantId, cobro, delExtracto);

  const perfil = await deps.getFiscalProfile(tenantId);
  const { neto, iva, total } = calcularImpuestos(perfil.condicionIva, pago.monto);
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
      ? await deps.facturarPagoDelTurno(comprobante, { ...cobro, appointmentId: turno }, {
          // X1-T · La mirada de arriba, repetida bajo el candado del cupo (turno → cupo): si el lote
          // del extracto facturó este pago mientras el aviso esperaba el turno, se ata a esa factura.
          ...(deps.facturaDelExtractoEnTx
            ? { facturaPrevia: (tx: InvoiceTx) => deps.facturaDelExtractoEnTx!(tx, tenantId, pago.id, { importe: pago.monto, fecha }) }
            : {}),
        })
      : deps.facturarCobros
        ? await deps.facturarCobros(comprobante, [cobro], {
            ...(opciones.verificarCupo ? { verificarCupo: opciones.verificarCupo } : {}),
            ...(opciones.ahora ? { ajustarComprobante: ajustarConVentana(fecha, fechaFiscalDelDia(opciones.ahora)) } : {}),
            // X1 · La mirada de arriba (`facturaDelExtracto`), repetida bajo el candado del cupo: si el
            // lote del extracto facturó este pago mientras éste esperaba, se ata a esa factura.
            ...(deps.facturaDelExtractoEnTx
              ? { facturaPrevia: (tx: InvoiceTx) => deps.facturaDelExtractoEnTx!(tx, tenantId, pago.id, { importe: pago.monto, fecha }) }
              : {}),
          })
        : await deps.createInvoice(comprobante);

  await deps.procesarEnviosDelNegocio(tenantId);
  return invoiceId;
}

/**
 * H4 en Mercado Pago · Dentro de la transacción de la factura y con el candado del cupo tomado (sólo
 * se llama si el pago todavía no tiene factura viva): fuera de la ventana de ARCA corta con
 * `PagoARevisarError` (se deshace todo y el pago va a revisión con el motivo); si no, la fecha
 * correlativa del punto de venta y, con servicios, período y vencimiento.
 */
function ajustarConVentana(fechaCobro: string, hoy: string) {
  const ajustar = ajustarFechaAutomatica(fechaCobro);
  return async (tx: InvoiceTx, input: Parameters<typeof ajustar>[1]) => {
    const fuera = motivoFueraDeVentanaArca(fechaCobro, hoy, input.concepto);
    if (fuera) throw new PagoARevisarError(fuera);
    return ajustar(tx, input);
  };
}
