/**
 * Motor de facturación · R1 «UNA FACTURA POR COBRO» (Challenger, 22/10/2026).
 *
 * Había cuatro disparadores de factura que no se hablaban: el aviso de Mercado Pago, completar
 * el turno, el extracto del banco y la sincronización de MP. Una seña de $5.000 podía terminar
 * con 0, 1 o 2 facturas. La regla del motor:
 *
 *   · Cada COBRO tiene una clave (`mp:<pago>`, `turno:<turno>`, `banco:<movimiento>`) y queda
 *     anotado en `CobroFacturado` con la factura que lo cubre. El índice único (tenantId, clave)
 *     es el árbitro: dos disparadores a la vez sobre el mismo cobro → uno solo factura (DB-4).
 *   · Cada disparador factura SÓLO lo que de ese cobro todavía no está facturado:
 *       - el aviso de MP de un turno factura ese pago (la seña), no el turno entero;
 *       - completar el turno factura lo cobrado MENOS lo que ya facturó MP para ese turno;
 *       - el extracto reconoce un cobro ya facturado por su clave o por la referencia del pago
 *         de MP, no sólo por el total.
 *   · Un cobro cuya factura quedó RECHAZADA no cuenta como facturado.
 *
 * Una factura puede cubrir varios cobros (el resto del turno); un cobro, una sola factura.
 */

import { Prisma } from "@/generated/prisma/client";
import { tenantTransaction } from "@/lib/rls";
import { centavosDe } from "@/lib/dinero/redondeo";
import { createInvoiceInTx, type CreateInvoiceInput, type InvoiceTx } from "@/lib/invoice-core";

// ─── Claves ─────────────────────────────────────────────────────────────────────

/** Un pago de Mercado Pago (aviso, sincronización o el link de un turno). */
export const claveCobroMP = (paymentId: string) => `mp:${paymentId}`;
/** Lo que un turno facturó al completarse: el resto de sus cobros. */
export const claveCobroTurno = (appointmentId: string) => `turno:${appointmentId}`;
/** Un crédito del extracto bancario (su hash idempotente). */
export const claveCobroBanco = (hash: string) => `banco:${hash}`;

/** Un cobro que entra a una factura. */
export interface CobroAFacturar {
  clave: string;
  /** Lo que ese cobro aporta a la factura, en pesos. */
  importe: number;
  /** El turno al que pertenece, si es de un turno. */
  appointmentId?: string | null;
}

// ─── La cuenta del turno (PURA) ─────────────────────────────────────────────────

/**
 * Lo que le queda por facturar a un turno al completarse.
 *
 *   base     = lo cobrado en el libro del turno (`Payment.amount`), o el precio si no hay cobros.
 *   cubierto = lo que Mercado Pago ya facturó por pagos de ESTE turno (la seña por link),
 *              hasta lo que el libro tiene cobrado por Mercado Pago: si la recepción anotó la
 *              seña en el libro, ese peso ya está facturado y no se suma de nuevo; si no la
 *              anotó, el libro no la tiene y no hay nada que restar. Sin libro (precio), todo lo
 *              facturado por MP es parte del precio.
 *   pendiente = base − cubierto (nunca negativo).
 *
 * Todo en centavos (ADR-100).
 */
export function pendienteDelTurno(x: {
  /** `Payment.amount` del turno; `null` si el turno no tiene cobros. */
  cobrado: number | null;
  /** priceAtBooking ?? service.price. */
  precio: number;
  /** Σ de los cobros del libro del turno con medio Mercado Pago (netos de anulaciones). */
  cobradoPorMP: number;
  /** Σ de lo que ya facturaron pagos de MP de este turno (facturas no rechazadas). */
  facturadoPorMP: number;
}): { base: number; cubierto: number; pendiente: number } {
  const base = centavosDe(x.cobrado ?? x.precio);
  const tope = x.cobrado == null ? base : Math.max(0, centavosDe(x.cobradoPorMP));
  const cubierto = Math.min(tope, Math.max(0, centavosDe(x.facturadoPorMP)), base);
  return { base: base / 100, cubierto: cubierto / 100, pendiente: Math.max(0, base - cubierto) / 100 };
}

// ─── Lectura / escritura del libro de cobros facturados ─────────────────────────

/** Los cobros (de esas claves) que ya tienen una factura viva (no rechazada). */
export async function cobrosYaFacturadosInTx(
  tx: InvoiceTx,
  tenantId: string,
  claves: readonly string[],
): Promise<{ clave: string; invoiceId: string }[]> {
  if (claves.length === 0) return [];
  const filas = await tx.cobroFacturado.findMany({
    where: { tenantId, clave: { in: [...claves] } },
    select: { clave: true, invoiceId: true, invoice: { select: { status: true } } },
  });
  return filas.filter((f) => f.invoice.status !== "REJECTED").map((f) => ({ clave: f.clave, invoiceId: f.invoiceId }));
}

/**
 * Anota que `cobro` está cubierto por la factura `invoiceId` (que ya existe). Si el cobro ya
 * estaba anotado con una factura viva, no cambia nada y devuelve ESA factura; si estaba con una
 * rechazada, pasa a apuntar a ésta.
 */
export async function vincularCobroInTx(
  tx: InvoiceTx,
  tenantId: string,
  cobro: CobroAFacturar,
  invoiceId: string,
): Promise<string> {
  const [vivo] = await cobrosYaFacturadosInTx(tx, tenantId, [cobro.clave]);
  if (vivo) return vivo.invoiceId;
  const actualizadas = await tx.cobroFacturado.updateMany({
    where: { tenantId, clave: cobro.clave },
    data: { invoiceId, importe: cobro.importe },
  });
  if (actualizadas.count === 0) {
    await tx.cobroFacturado.create({
      data: { tenantId, clave: cobro.clave, invoiceId, importe: cobro.importe, appointmentId: cobro.appointmentId ?? null },
    });
  }
  return invoiceId;
}

/**
 * Factura `cobros` con el comprobante `input`, dentro de la transacción del llamador. Si
 * ALGUNO de esos cobros ya tiene una factura viva, no crea nada y devuelve esa factura (el
 * llamador tiene que haber sacado antes lo que no quiere refacturar). Si no, crea la factura
 * (`createInvoiceInTx`, con su idempotencia por origen) y anota cada cobro.
 */
export async function facturarCobrosInTx(
  tx: InvoiceTx,
  input: CreateInvoiceInput,
  cobros: readonly CobroAFacturar[],
): Promise<string> {
  if (cobros.length === 0) throw new Error("facturarCobros: sin cobros no hay factura.");
  const [vivo] = await cobrosYaFacturadosInTx(tx, input.tenantId, cobros.map((c) => c.clave));
  if (vivo) return vivo.invoiceId;
  const invoiceId = await createInvoiceInTx(tx, input);
  for (const c of cobros) await vincularCobroInTx(tx, input.tenantId, c, invoiceId);
  return invoiceId;
}

/**
 * `facturarCobrosInTx` en su propia transacción, parada en el negocio. Si otro disparador ganó
 * la carrera por el mismo cobro (o por el mismo origen), el índice único corta a éste (P2002):
 * se vuelve a intentar UNA vez y ahí se encuentra la factura del ganador.
 */
export async function facturarCobros(input: CreateInvoiceInput, cobros: readonly CobroAFacturar[]): Promise<string> {
  const correr = () => tenantTransaction((tx) => facturarCobrosInTx(tx, input, cobros), { tenantId: input.tenantId });
  try {
    return await correr();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return correr();
    throw e;
  }
}

/** `vincularCobroInTx` en su propia transacción (mismo reintento ante la carrera). */
export async function vincularCobro(tenantId: string, cobro: CobroAFacturar, invoiceId: string): Promise<string> {
  const correr = () => tenantTransaction((tx) => vincularCobroInTx(tx, tenantId, cobro, invoiceId), { tenantId });
  try {
    return await correr();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return correr();
    throw e;
  }
}

/** Las facturas vivas que ya cubren alguna de esas claves (sin transacción del llamador). */
export async function cobrosYaFacturados(tenantId: string, claves: readonly string[]) {
  return tenantTransaction((tx) => cobrosYaFacturadosInTx(tx, tenantId, claves), { tenantId });
}

/**
 * Lo que Mercado Pago ya facturó por pagos de un turno (`mp:*` con ese `appointmentId`, facturas
 * vivas), y la factura viva más reciente del turno (la de completarlo o la de un pago de MP).
 */
export async function facturadoDelTurnoInTx(
  tx: InvoiceTx,
  tenantId: string,
  appointmentId: string,
): Promise<{ facturadoPorMP: number; ultimaFactura: string | null }> {
  const filas = await tx.cobroFacturado.findMany({
    where: { tenantId, appointmentId },
    select: { clave: true, importe: true, invoiceId: true, createdAt: true, invoice: { select: { status: true } } },
    orderBy: { createdAt: "desc" },
  });
  const vivas = filas.filter((f) => f.invoice.status !== "REJECTED");
  const porMP = vivas.filter((f) => f.clave.startsWith("mp:")).reduce((a, f) => a + centavosDe(Number(f.importe)), 0);
  return { facturadoPorMP: porMP / 100, ultimaFactura: vivas[0]?.invoiceId ?? null };
}
