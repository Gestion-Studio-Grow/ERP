/**
 * Motor de facturación · PR3 · DEVOLUCIONES Y CONTRACARGOS DE MERCADO PAGO.
 *
 * Devolución (reembolso total o parcial) → NOTA DE CRÉDITO asociada a la factura del pago, de la
 * MISMA letra (la decide `crearNotaDeCreditoInTx` con los datos con que viajó la factura: misma
 * letra, mismo receptor, nunca más que el saldo). IDEMPOTENTE por la clave `mp:refund:<id>` en el
 * libro de cobros: el mismo aviso dos veces (o dos a la vez) deja UNA nota viva. Si la nota quedó
 * rechazada, la devolución se puede volver a acreditar (contrato de estados v1).
 *
 * Contracargo → se ABRE UN CASO y NO se emite nota de crédito: el contracargo se puede disputar y
 * ganar; acreditar antes de saber sería anular una venta que quizás se cobra. El caso se guarda en
 * la auditoría (`AuditLog`, entidad `CasoContracargo`), idempotente por pago, hasta que haya una
 * tabla de casos (sería una migración: Gate 2, no se crea acá).
 *
 * Todo dentro de `tenantTransaction` (RLS del negocio) y con candado advisory por clave.
 */

import { Prisma } from "@/generated/prisma/client";
import { tenantTransaction } from "@/lib/rls";
import { centavosDe } from "@/lib/dinero/redondeo";
import { crearNotaDeCreditoInTx, type InvoiceTx } from "@/lib/invoice-core";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";
import { claveAlmacenada } from "@/lib/facturacion/clave-origen";
import { claveCobroMP, cobrosYaFacturadosInTx, tomarClaves, vincularCobroInTx } from "@/lib/facturacion/cobros-facturados";

export interface DevolucionMP {
  /** Id de la devolución en Mercado Pago (cada devolución parcial tiene el suyo). */
  refundId: string;
  /** El pago devuelto. */
  paymentId: string;
  /** Lo devuelto, en pesos (IVA incluido). */
  importe: number;
  /** Fecha de la nota (AAAAMMDD). Default: el día del negocio. */
  fecha?: string;
}

export type ResultadoDevolucion =
  /** La nota de crédito existe (recién creada o de un aviso anterior). */
  | { estado: "nota_emitida"; invoiceId: string; yaExistia: boolean }
  /** El pago no tiene factura viva: no hay nada que acreditar. */
  | { estado: "sin_factura" }
  /** La factura todavía no tiene CAE: volver a intentar cuando lo tenga (no es un error). */
  | { estado: "esperar_cae"; facturaId: string }
  /** No se puede acreditar con estos datos (supera el saldo, fecha, etc.): motivo en criollo. */
  | { estado: "rechazada"; motivo: string };

const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;

export async function notaDeCreditoPorDevolucionInTx(
  tx: InvoiceTx,
  tenantId: string,
  d: DevolucionMP,
): Promise<ResultadoDevolucion> {
  const refundId = String(d.refundId ?? "").trim();
  const paymentId = String(d.paymentId ?? "").trim();
  if (!ID_VALIDO.test(refundId) || !ID_VALIDO.test(paymentId)) {
    return { estado: "rechazada", motivo: "La devolución de Mercado Pago llegó sin un número de pago o de devolución válido." };
  }
  if (!Number.isFinite(d.importe) || centavosDe(d.importe) <= 0) {
    return { estado: "rechazada", motivo: "La devolución tiene que ser de un importe mayor a cero." };
  }
  const importe = centavosDe(d.importe) / 100;
  const claveDevolucion = claveAlmacenada({ tipo: "mp_refund", id: refundId });
  const clavePago = claveCobroMP(paymentId);

  // Candado por la devolución Y por el pago: dos devoluciones parciales del mismo pago se ordenan
  // (además del FOR UPDATE de la factura en crearNotaDeCreditoInTx).
  await tomarClaves(tx, tenantId, [claveDevolucion, clavePago]);

  const [notaViva] = await cobrosYaFacturadosInTx(tx, tenantId, [claveDevolucion]);
  if (notaViva) return { estado: "nota_emitida", invoiceId: notaViva.invoiceId, yaExistia: true };

  const [factura] = await cobrosYaFacturadosInTx(tx, tenantId, [clavePago]);
  if (!factura) return { estado: "sin_factura" };

  const estado = await tx.invoice.findFirst({ where: { id: factura.invoiceId, tenantId }, select: { status: true } });
  if (estado?.status === "PENDING") return { estado: "esperar_cae", facturaId: factura.invoiceId };

  const fecha = d.fecha ?? fechaFiscalDelDia();
  const nota = await crearNotaDeCreditoInTx(tx, {
    tenantId,
    facturaId: factura.invoiceId,
    importe,
    motivo: `devolución de Mercado Pago ${refundId} del pago ${paymentId}`,
    fecha,
    fechaDeEnvio: fecha,
  });
  if (!nota.ok) return { estado: "rechazada", motivo: nota.error };

  await vincularCobroInTx(tx, tenantId, { clave: claveDevolucion, importe, appointmentId: null }, nota.invoiceId);
  return { estado: "nota_emitida", invoiceId: nota.invoiceId, yaExistia: false };
}

/** En su propia transacción, parada en el negocio. Ante la carrera por el índice único, un reintento. */
export async function notaDeCreditoPorDevolucion(tenantId: string, d: DevolucionMP): Promise<ResultadoDevolucion> {
  const correr = () => tenantTransaction((tx) => notaDeCreditoPorDevolucionInTx(tx, tenantId, d), { tenantId });
  try {
    return await correr();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return correr();
    throw e;
  }
}

// ─── Contracargo ───────────────────────────────────────────────────────────────

export const ENTIDAD_CASO_CONTRACARGO = "CasoContracargo";

export interface ContracargoMP {
  paymentId: string;
  /** Lo contracargado, en pesos. */
  importe: number;
}

export type ResultadoContracargo =
  | { estado: "caso_abierto"; casoId: string; yaExistia: boolean; facturaId: string | null }
  | { estado: "rechazado"; motivo: string };

/** Qué hacer con el caso, en criollo: queda escrito en el caso. */
export const QUE_HACER_CONTRACARGO =
  "El comprador desconoció el pago ante su tarjeta. No se anuló la factura: si ganás la disputa en Mercado Pago, " +
  "la venta queda como está. Si la perdés, emití la nota de crédito desde la factura.";

export async function abrirCasoDeContracargoInTx(tx: InvoiceTx, tenantId: string, c: ContracargoMP): Promise<ResultadoContracargo> {
  const paymentId = String(c.paymentId ?? "").trim();
  if (!ID_VALIDO.test(paymentId)) return { estado: "rechazado", motivo: "El contracargo llegó sin un número de pago válido." };
  if (!Number.isFinite(c.importe) || centavosDe(c.importe) <= 0) {
    return { estado: "rechazado", motivo: "El contracargo tiene que ser de un importe mayor a cero." };
  }
  const entityId = claveCobroMP(paymentId);
  // Candado propio del caso (no el del cobro: un contracargo no factura ni acredita).
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`caso-contracargo:${tenantId}:${entityId}`}))`;

  const existente = await tx.auditLog.findFirst({
    where: { tenantId, entity: ENTIDAD_CASO_CONTRACARGO, entityId },
    select: { id: true, changes: true },
  });
  const [factura] = await cobrosYaFacturadosInTx(tx, tenantId, [entityId]);
  const facturaId = factura?.invoiceId ?? null;
  if (existente) return { estado: "caso_abierto", casoId: existente.id, yaExistia: true, facturaId };

  const caso = await tx.auditLog.create({
    data: {
      tenantId,
      actor: "system",
      action: "contracargo_abierto",
      entity: ENTIDAD_CASO_CONTRACARGO,
      entityId,
      channel: "mercadopago",
      changes: { estado: "abierto", paymentId, importe: centavosDe(c.importe) / 100, facturaId, queHacer: QUE_HACER_CONTRACARGO },
    },
    select: { id: true },
  });
  return { estado: "caso_abierto", casoId: caso.id, yaExistia: false, facturaId };
}

export async function abrirCasoDeContracargo(tenantId: string, c: ContracargoMP): Promise<ResultadoContracargo> {
  return tenantTransaction((tx) => abrirCasoDeContracargoInTx(tx, tenantId, c), { tenantId });
}
