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
 *
 * PR5 · AUTOMÁTICO (sin migración: el rastro va a `AuditLog`, entidad `DevolucionMP`, por la clave
 * `mp:refund:<id>`):
 *   · C3 · TOPE POR COBRO: lo acreditado por devoluciones de UN pago nunca pasa lo que ese pago
 *     aportó a su factura (`CobroFacturado.importe` de `mp:<pago>`). El saldo de la factura sola no
 *     alcanza: una factura puede cubrir varios cobros. Cada nota acreditada deja un
 *     `devolucion_acreditada` con el pago y la nota; se suman las notas vivas (no rechazadas).
 *   · C2 / esperar_cae · la devolución que llega ANTES que la factura (`sin_factura`) o antes del
 *     CAE (`esperar_cae`) queda anotada como `devolucion_pendiente`, una sola vez.
 *     `reintentarDevolucionesPendientes` la vuelve a probar (lo llama el cron de ARCA, después de
 *     drenar, que es cuando aparecen los CAE). Si termina rechazada, se cierra
 *     (`devolucion_pendiente_cerrada`) y deja de probarse. Ventana: 30 días.
 */

import { Prisma } from "@/generated/prisma/client";
import { tenantTransaction } from "@/lib/rls";
import { idsDeLosNegocios } from "@/lib/cron/negocios";
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
  if (!factura) {
    await anotarPendienteInTx(tx, tenantId, claveDevolucion, { refundId, paymentId, importe, por: "sin_factura" });
    return { estado: "sin_factura" };
  }

  const estado = await tx.invoice.findFirst({ where: { id: factura.invoiceId, tenantId }, select: { status: true } });
  if (estado?.status === "PENDING") {
    await anotarPendienteInTx(tx, tenantId, claveDevolucion, { refundId, paymentId, importe, por: "esperar_cae" });
    return { estado: "esperar_cae", facturaId: factura.invoiceId };
  }

  // C3 · tope por cobro: lo ya acreditado por devoluciones de ESTE pago + esta ≤ lo que el pago facturó.
  // Certificación PR5 · todo rechazo deja rastro (`devolucion_rechazada`, una vez por devolución): la
  // plata ya salió de MP y alguien tiene que verlo. La pendiente se CIERRA sólo si el rechazo es
  // definitivo (tope, factura sin saldo); lo demás (datos del envío, configuración) se sigue probando.
  const rechazar = async (motivo: string, definitivo: boolean): Promise<ResultadoDevolucion> => {
    await registrarRechazoInTx(tx, tenantId, claveDevolucion, { refundId, paymentId, importe, motivo, definitivo });
    if (definitivo) await cerrarPendienteInTx(tx, tenantId, claveDevolucion, motivo);
    return { estado: "rechazada", motivo };
  };
  const fila = await tx.cobroFacturado.findFirst({ where: { tenantId, clave: clavePago }, select: { importe: true } });
  const topeC = centavosDe(Number(fila?.importe ?? 0));
  let yaC = await acreditadoDelPagoInTx(tx, tenantId, paymentId);
  // Si la factura cubre SÓLO este cobro, cuentan también las notas vivas que no vinieron de una
  // devolución (una NC manual de lo mismo): el tope nunca queda por debajo de lo ya anulado.
  const cobrosDeLaFactura = await tx.cobroFacturado.count({ where: { tenantId, invoiceId: factura.invoiceId } });
  if (cobrosDeLaFactura === 1) {
    const notas = await tx.invoice.findMany({
      where: { tenantId, comprobanteAsociadoId: factura.invoiceId, status: { in: ["PENDING", "AUTHORIZED"] } },
      select: { total: true },
    });
    yaC = Math.max(yaC, notas.reduce((a, n) => a + centavosDe(Number(n.total)), 0));
  }
  if (yaC + centavosDe(importe) > topeC) {
    return rechazar(
      `La devolución ${refundId} (${pesos(centavosDe(importe))}) supera lo que queda por acreditar del pago ${paymentId}: ` +
        `facturado ${pesos(topeC)}, ya acreditado ${pesos(yaC)}. Revisalo en Mercado Pago.`,
      true,
    );
  }

  const fecha = d.fecha ?? fechaFiscalDelDia();
  const nota = await crearNotaDeCreditoInTx(tx, {
    tenantId,
    facturaId: factura.invoiceId,
    importe,
    motivo: `devolución de Mercado Pago ${refundId} del pago ${paymentId}`,
    fecha,
    fechaDeEnvio: fecha,
  });
  if (!nota.ok) return rechazar(nota.error, /ya está anulada entera|No se puede anular/.test(nota.error));

  await vincularCobroInTx(tx, tenantId, { clave: claveDevolucion, importe, appointmentId: null }, nota.invoiceId);
  await tx.auditLog.create({
    data: {
      tenantId,
      actor: "system",
      action: ACCION_ACREDITADA,
      entity: ENTIDAD_DEVOLUCION_MP,
      entityId: claveDevolucion,
      channel: "mercadopago",
      changes: { refundId, paymentId, importe, notaId: nota.invoiceId, facturaId: factura.invoiceId },
    },
  });
  await cerrarPendienteInTx(tx, tenantId, claveDevolucion, "nota emitida");
  return { estado: "nota_emitida", invoiceId: nota.invoiceId, yaExistia: false };
}

// ─── PR5 · rastro de devoluciones (AuditLog, sin migración) ─────────────────────

export const ENTIDAD_DEVOLUCION_MP = "DevolucionMP";
const ACCION_ACREDITADA = "devolucion_acreditada";
const ACCION_PENDIENTE = "devolucion_pendiente";
const ACCION_CERRADA = "devolucion_pendiente_cerrada";
/** Rastro visible de una devolución que no se pudo acreditar (la plata salió de MP sin nota). */
export const ACCION_RECHAZADA = "devolucion_rechazada";
/** Una devolución pendiente se deja de reintentar después de esto (la mira una persona). */
export const VENTANA_PENDIENTES_DIAS = 30;

const pesos = (c: number) => `$${(c / 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Σ en centavos de las notas VIVAS (no rechazadas) acreditadas por devoluciones del pago. */
async function acreditadoDelPagoInTx(tx: InvoiceTx, tenantId: string, paymentId: string): Promise<number> {
  const filas = await tx.auditLog.findMany({
    where: { tenantId, entity: ENTIDAD_DEVOLUCION_MP, action: ACCION_ACREDITADA, changes: { path: ["paymentId"], equals: paymentId } },
    select: { changes: true },
  });
  const ids = [
    ...new Set(
      filas
        .map((f) => (f.changes as { notaId?: unknown } | null)?.notaId)
        .filter((x): x is string => typeof x === "string" && x.length > 0),
    ),
  ];
  if (ids.length === 0) return 0;
  const notas = await tx.invoice.findMany({
    where: { tenantId, id: { in: ids }, status: { not: "REJECTED" } },
    select: { total: true },
  });
  return notas.reduce((a, n) => a + centavosDe(Number(n.total)), 0);
}

async function anotarPendienteInTx(
  tx: InvoiceTx,
  tenantId: string,
  claveDevolucion: string,
  d: { refundId: string; paymentId: string; importe: number; por: "sin_factura" | "esperar_cae" },
): Promise<void> {
  // Bajo el candado de la devolución (lo tomó quien llama): una sola anotación aunque el aviso se repita.
  const ya = await tx.auditLog.findFirst({
    where: { tenantId, entity: ENTIDAD_DEVOLUCION_MP, entityId: claveDevolucion, action: { in: [ACCION_PENDIENTE, ACCION_CERRADA] } },
    select: { action: true },
  });
  if (ya) return;
  await tx.auditLog.create({
    data: { tenantId, actor: "system", action: ACCION_PENDIENTE, entity: ENTIDAD_DEVOLUCION_MP, entityId: claveDevolucion, channel: "mercadopago", changes: d },
  });
}

async function registrarRechazoInTx(
  tx: InvoiceTx,
  tenantId: string,
  claveDevolucion: string,
  d: { refundId: string; paymentId: string; importe: number; motivo: string; definitivo: boolean },
): Promise<void> {
  const ya = await tx.auditLog.findFirst({
    where: { tenantId, entity: ENTIDAD_DEVOLUCION_MP, entityId: claveDevolucion, action: ACCION_RECHAZADA },
    select: { id: true },
  });
  if (ya) return;
  await tx.auditLog.create({
    data: { tenantId, actor: "system", action: ACCION_RECHAZADA, entity: ENTIDAD_DEVOLUCION_MP, entityId: claveDevolucion, channel: "mercadopago", changes: d },
  });
}

async function cerrarPendienteInTx(tx: InvoiceTx, tenantId: string, claveDevolucion: string, motivo: string): Promise<void> {
  const filas = await tx.auditLog.findMany({
    where: { tenantId, entity: ENTIDAD_DEVOLUCION_MP, entityId: claveDevolucion, action: { in: [ACCION_PENDIENTE, ACCION_CERRADA] } },
    select: { action: true },
  });
  if (!filas.some((f) => f.action === ACCION_PENDIENTE) || filas.some((f) => f.action === ACCION_CERRADA)) return;
  await tx.auditLog.create({
    data: { tenantId, actor: "system", action: ACCION_CERRADA, entity: ENTIDAD_DEVOLUCION_MP, entityId: claveDevolucion, channel: "mercadopago", changes: { motivo } },
  });
}

export interface ResumenPendientes {
  probadas: number;
  emitidas: number;
  siguenPendientes: number;
  rechazadas: number;
  errores: number;
}

/**
 * C2 / esperar_cae · Vuelve a probar las devoluciones anotadas como pendientes del negocio (las
 * más viejas primero, hasta `limite`). Cada una corre en su transacción con los candados de
 * siempre: idempotente aunque dos corridas se pisen.
 */
export async function reintentarDevolucionesPendientes(
  tenantId: string,
  opciones: { limite?: number; ahora?: Date } = {},
): Promise<ResumenPendientes> {
  const limite = opciones.limite ?? 20;
  const desde = new Date((opciones.ahora ?? new Date()).getTime() - VENTANA_PENDIENTES_DIAS * 24 * 60 * 60 * 1000);
  const pendientes = await tenantTransaction(
    async (tx) => {
      const filas = await tx.auditLog.findMany({
        where: { tenantId, entity: ENTIDAD_DEVOLUCION_MP, action: ACCION_PENDIENTE, createdAt: { gte: desde } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 500,
        select: { entityId: true, changes: true },
      });
      const claves = filas.map((f) => f.entityId).filter((x): x is string => !!x);
      if (claves.length === 0) return [];
      const cerradas = await tx.auditLog.findMany({
        where: { tenantId, entity: ENTIDAD_DEVOLUCION_MP, action: ACCION_CERRADA, entityId: { in: claves } },
        select: { entityId: true },
      });
      const vivas = await cobrosYaFacturadosInTx(tx, tenantId, claves);
      const fuera = new Set([...cerradas.map((c) => c.entityId), ...vivas.map((v) => v.clave)]);
      const abiertas = filas.filter((f) => f.entityId && !fuera.has(f.entityId));
      // Certificación PR5 · las que nunca van a tener factura (pago no facturable, con dueño) no tapan a
      // las nuevas: cada corrida (cada 15 min) arranca en otro lugar de la lista y la recorre entera.
      if (abiertas.length <= limite) return abiertas;
      const inicio = (Math.floor((opciones.ahora ?? new Date()).getTime() / (15 * 60 * 1000)) * limite) % abiertas.length;
      return [...abiertas.slice(inicio), ...abiertas.slice(0, inicio)].slice(0, limite);
    },
    { tenantId },
  );

  const r: ResumenPendientes = { probadas: 0, emitidas: 0, siguenPendientes: 0, rechazadas: 0, errores: 0 };
  for (const p of pendientes) {
    const c = p.changes as { refundId?: unknown; paymentId?: unknown; importe?: unknown } | null;
    if (typeof c?.refundId !== "string" || typeof c.paymentId !== "string" || typeof c.importe !== "number") continue;
    r.probadas++;
    try {
      const res = await notaDeCreditoPorDevolucion(tenantId, { refundId: c.refundId, paymentId: c.paymentId, importe: c.importe });
      if (res.estado === "nota_emitida") r.emitidas++;
      else if (res.estado === "rechazada") r.rechazadas++;
      else r.siguenPendientes++;
    } catch {
      r.errores++;
    }
  }
  return r;
}

/** Todos los negocios, cada uno parado en el suyo (RLS). La falla de uno no frena a los demás. */
export async function reintentarDevolucionesDeLosNegocios(
  ids: () => Promise<readonly string[]> = idsDeLosNegocios,
): Promise<{ negocios: number; emitidas: number; siguenPendientes: number; rechazadas: number; errores: number }> {
  const total = { negocios: 0, emitidas: 0, siguenPendientes: 0, rechazadas: 0, errores: 0 };
  for (const tenantId of await ids()) {
    total.negocios++;
    try {
      const r = await reintentarDevolucionesPendientes(tenantId);
      total.emitidas += r.emitidas;
      total.siguenPendientes += r.siguenPendientes;
      total.rechazadas += r.rechazadas;
      total.errores += r.errores;
    } catch {
      total.errores++;
    }
  }
  return total;
}

// ─── C1 · lo que la ingesta de MP hace con las devoluciones y contracargos de un pago ───

export type MovimientoPosterior =
  | { tipo: "devolucion"; refundId: string; paymentId: string; importe: number }
  | { tipo: "contracargo"; paymentId: string; importe: number };

export interface ResumenPosteriores {
  notas: number;
  pendientes: number;
  rechazadas: number;
  casos: number;
  errores: number;
}

/**
 * Aplica cada movimiento: devolución → nota de crédito (o pendiente); contracargo → caso, SIN nota
 * (decisión del dueño). Una falla de uno no frena a los otros; idempotente por refund y por pago.
 */
export async function aplicarMovimientosPosterioresMP(
  tenantId: string,
  movimientos: readonly MovimientoPosterior[],
  deps: {
    devolucion: (tenantId: string, d: DevolucionMP) => Promise<ResultadoDevolucion>;
    contracargo: (tenantId: string, c: ContracargoMP) => Promise<ResultadoContracargo>;
  } = { devolucion: notaDeCreditoPorDevolucion, contracargo: abrirCasoDeContracargo },
): Promise<ResumenPosteriores> {
  const r: ResumenPosteriores = { notas: 0, pendientes: 0, rechazadas: 0, casos: 0, errores: 0 };
  for (const m of movimientos) {
    try {
      if (m.tipo === "contracargo") {
        const c = await deps.contracargo(tenantId, { paymentId: m.paymentId, importe: m.importe });
        if (c.estado === "caso_abierto") r.casos++;
        else r.rechazadas++;
        continue;
      }
      const d = await deps.devolucion(tenantId, { refundId: m.refundId, paymentId: m.paymentId, importe: m.importe });
      if (d.estado === "nota_emitida") r.notas++;
      else if (d.estado === "rechazada") r.rechazadas++;
      else r.pendientes++;
    } catch (e) {
      r.errores++;
      console.error("[mp] devolución/contracargo sin aplicar", m.tipo, m.paymentId, e instanceof Error ? e.message : e);
    }
  }
  return r;
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
