// ============================================================================
// SEÑA POR MERCADO PAGO · el aviso de pago de un turno con la seña obligatoria prendida
// ============================================================================
//
// Con el interruptor «sena-obligatoria» prendido, el aviso de MP de un pago cuyo dueño es un TURNO
// (external_reference → `duenoDelCobro` tipo "turno") hace lo mismo que «Llegó la seña», sin nadie
// en el mostrador:
//   · pago APROBADO → registra la seña como cobro del turno (`aplicarCobroTurnoInTx`, el mismo
//     escritor de todos los cobros) y, si lo cobrado vigente cubre la seña y el turno está Reservado,
//     lo pasa a Confirmado (con la guarda `exigirSeniaParaConfirmar` y auditoría actor «Mercado Pago»);
//   · monto menor a la seña → queda la seña parcial y una fila de aviso (`senia_parcial_mp`); el turno
//     sigue «Pendiente de seña» en la agenda (`marcaDeSeniaDelTurno`);
//   · pendiente / rechazado / cancelado / en proceso → nada;
//   · devolución total o contracargo (MP lo informa como `refunded`) → anula el cobro
//     (`anularCobroTurnoInTx`, la misma anulación de la seña) y `volverAReservadoSiFaltaLaSenia`;
//   · devolución PARCIAL (el pago sigue `approved` con `posteriores`) → anula el cobro y registra el
//     neto, en la misma tx.
// Apagado, no hace nada (comportamiento de siempre: el aviso sólo factura).
//
// IDEMPOTENCIA por id de pago de MP, con dos capas:
//   (1) la NOTA del cobro lleva el id del pago (`notaSeniaMP`): se busca en las filas del turno antes
//       de escribir. Funciona aunque la columna `idempotencyKey` no esté migrada (Neon);
//   (2) la clave `mpturno:<pago>` (con `withSchema`), árbitro de la carrera de dos avisos a la vez,
//       además de la tx Serializable del llamador (senia-mp.server.ts).
// Un cobro de ese pago que alguien anuló a mano NO se vuelve a registrar por un reenvío del aviso.
//
// Todo dentro del `tx` del negocio que recibe: `tenantId` explícito en cada WHERE además de RLS.
// Sin "use server": no es un endpoint.

import type { Prisma } from "@/generated/prisma/client";
import type { PagoMP } from "@/plugins/mercadopago";
import { round2 } from "@/lib/round";
import { isFrozenDay, type DayKey } from "@/lib/caja/cierre-diario";
import { cobroTurnoDetail } from "@/lib/caja/cobro-turno";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { AnulacionRechazada, anularCobroTurnoInTx, claseDeCobro, cobroAnuladoPor, cobrosDetalladosPorTurno, mensajeAnulacionRechazada } from "./anulacion";
import { CobroTurnoRechazado, aplicarCobroTurnoInTx } from "./cobro-turno-repo";
import { seniaDelServicio } from "./cobros";
import { ACCION_CONFIRMAR, ACCION_VOLVIO_A_RESERVADO, seniaQueFaltaParaConfirmar } from "./sena-obligatoria-core";
import { confirmadoPorExcepcion, exigirSeniaParaConfirmar, senaObligatoriaEnTx, volverAReservadoSiFaltaLaSenia } from "./sena-obligatoria";

/** Quién firma en la auditoría y en el cobro lo que hace el aviso de MP. */
export const ACTOR_MP = "Mercado Pago";
export const ACCION_SENIA_MP = "collect_payment";
export const ACCION_SENIA_PARCIAL_MP = "senia_parcial_mp";
export const ACCION_SENIA_MP_NO_REGISTRADA = "senia_mp_no_registrada";
export const ACCION_SENIA_MP_DEVUELTA_SIN_ANULAR = "senia_mp_devuelta_sin_anular";

const PREFIJO_NOTA = "Seña por Mercado Pago · pago ";

/** La nota del cobro de ESTE pago: es la capa de idempotencia que no depende de la migración. */
export function notaSeniaMP(paymentId: string): string {
  return `${PREFIJO_NOTA}${paymentId}`;
}

/** La clave de idempotencia del cobro (con la columna migrada). El neto de un ajuste lleva sus centavos. */
export function claveSeniaMP(paymentId: string, netoAjustado?: number): string {
  return netoAjustado === undefined ? `mpturno:${paymentId}` : `mpturno:${paymentId}:${Math.round(netoAjustado * 100)}`;
}

/**
 * La plata de ese pago que sigue en pie. PURA.
 *   · `refunded` (devolución total o contracargo) → 0;
 *   · `approved` → monto − devoluciones parciales aprobadas (− contracargo, si viniera);
 *   · cualquier otro estado → null (no cambia nada).
 */
export function netoDelPagoMP(pago: Pick<PagoMP, "estado" | "monto" | "posteriores">): number | null {
  if (pago.estado === "refunded") return 0;
  if (pago.estado !== "approved") return null;
  if (!Number.isFinite(pago.monto) || !(pago.monto > 0)) return null;
  const devuelto = (pago.posteriores ?? []).reduce((n, m) => n + (Number.isFinite(m.importe) && m.importe > 0 ? m.importe : 0), 0);
  return round2(Math.max(0, pago.monto - devuelto));
}

export type PlanSeniaMP =
  | { tipo: "nada"; motivo: string }
  | { tipo: "registrar"; monto: number }
  | { tipo: "ajustar"; anular: string; monto: number }
  | { tipo: "devolver"; anular: string };

/**
 * Qué hacer con el aviso, según el neto del pago y lo que el turno ya tiene de ESE pago. PURA.
 * `vigente` = el cobro de este pago que sigue en pie; `huboCobro` = existe alguna fila de este pago
 * (vigente o anulada).
 */
export function planSeniaMP(e: { neto: number | null; estado: string; vigente: { id: string; amount: number } | null; huboCobro: boolean }): PlanSeniaMP {
  if (e.neto === null) return { tipo: "nada", motivo: `estado ${e.estado}` };
  if (e.vigente) {
    const registrado = round2(e.vigente.amount);
    if (e.neto === registrado) return { tipo: "nada", motivo: "ya registrado" };
    if (e.neto <= 0) return { tipo: "devolver", anular: e.vigente.id };
    if (e.neto < registrado) return { tipo: "ajustar", anular: e.vigente.id, monto: e.neto };
    return { tipo: "nada", motivo: "el pago dice más de lo registrado: revisar a mano" };
  }
  if (e.huboCobro) return { tipo: "nada", motivo: "el cobro de este pago ya se anuló: no se vuelve a registrar" };
  if (e.neto <= 0) return { tipo: "nada", motivo: "devuelto sin cobro registrado" };
  return { tipo: "registrar", monto: e.neto };
}

export type ResultadoSeniaMP =
  | { accion: "apagada" | "sin-turno" | "sin-cambios" | "ya-registrado"; motivo?: string }
  | { accion: "registrado"; cobroId: string; monto: number }
  | { accion: "confirmado"; cobroId: string; monto: number }
  | { accion: "senia-parcial"; cobroId: string; monto: number; falta: number }
  | { accion: "devuelto"; volvioAReservado: boolean }
  | { accion: "ajustado"; cobroId: string; monto: number; volvioAReservado: boolean }
  | { accion: "rechazado"; motivo: string };

/** Un rechazo después de escribir algo: el llamador deshace la tx y deja el aviso en otra. */
export class SeniaMPRechazada extends Error {
  constructor(readonly motivo: string) {
    super(motivo);
    this.name = "SeniaMPRechazada";
  }
}

export type DepsSeniaMPTx = {
  aplicarCobro: typeof aplicarCobroTurnoInTx;
  anularCobro: typeof anularCobroTurnoInTx;
  ahora: Date;
  cerradoHasta: DayKey | null;
  /** true = columnas de cobros parciales migradas (clave + libro de caja). */
  withSchema: boolean;
};

export const DEPS_SENIA_MP: Pick<DepsSeniaMPTx, "aplicarCobro" | "anularCobro"> = {
  aplicarCobro: aplicarCobroTurnoInTx,
  anularCobro: anularCobroTurnoInTx,
};

type Tx = Prisma.TransactionClient;

/** Una fila de auditoría del aviso, en el `tx` (queda o se va con la operación). */
export async function auditarAvisoMPEnTx(
  tx: Pick<Tx, "auditLog">,
  e: { tenantId: string; appointmentId: string; action: string; changes: Record<string, unknown> },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: e.tenantId,
      actor: ACTOR_MP,
      action: e.action,
      entity: "Appointment",
      entityId: e.appointmentId,
      changes: JSON.parse(JSON.stringify(e.changes)),
      channel: "webhook",
    },
  });
}

/**
 * El aviso de un pago de MP de un turno, dentro de la tx del negocio. Ver el encabezado.
 * Tira `SeniaMPRechazada` sólo si algo falla DESPUÉS de escribir (el ajuste de una devolución parcial).
 */
export async function aplicarPagoMPDelTurnoEnTx(
  tx: Tx,
  tenantId: string,
  appointmentId: string,
  pago: PagoMP,
  deps: DepsSeniaMPTx,
): Promise<ResultadoSeniaMP> {
  const neto = netoDelPagoMP(pago);
  if (neto === null) return { accion: "sin-cambios", motivo: `estado ${pago.estado}` };
  if (!(await senaObligatoriaEnTx(tx, tenantId))) return { accion: "apagada" };

  const a = await tx.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    select: {
      status: true,
      startsAt: true,
      priceAtBooking: true,
      service: { select: { name: true, price: true, depositAmount: true } },
      client: { select: { name: true } },
      payment: { select: { status: true, amount: true } },
    },
  });
  if (!a) return { accion: "sin-turno" };
  const precio = a.priceAtBooking ?? a.service.price;
  const senia = seniaDelServicio({ depositAmount: a.service.depositAmount, precio });

  const cobros = (await cobrosDetalladosPorTurno(tx, tenantId, [appointmentId])).get(appointmentId) ?? [];
  const nota = notaSeniaMP(pago.id);
  const delPago = cobros.filter((c) => c.note === nota && claseDeCobro(c.note) === "cobro" && c.amount > 0);
  const anulados = new Set(cobros.map((c) => cobroAnuladoPor(c.note)).filter((x): x is string => Boolean(x)));
  const vigente = delPago.find((c) => c.id && !anulados.has(c.id)) ?? null;
  const plan = planSeniaMP({
    neto,
    estado: pago.estado,
    vigente: vigente?.id ? { id: vigente.id, amount: vigente.amount } : null,
    huboCobro: delPago.length > 0,
  });

  const pagoMP = { id: pago.id, estado: pago.estado, monto: pago.monto, neto };
  const argsCobro = (monto: number, clave: string) => ({
    appointmentId,
    status: a.status,
    precio,
    monto,
    method: "MERCADOPAGO" as const,
    note: nota,
    actor: ACTOR_MP,
    detail: cobroTurnoDetail({ serviceName: a.service.name, clientName: a.client?.name ?? "" }),
    idempotencyKey: clave,
    withSchema: deps.withSchema,
    cerradoHasta: deps.cerradoHasta,
    camino: "cobro" as const,
  });
  const argsAnular = (collectionId: string, motivo: string) => ({
    collectionId,
    appointmentId,
    precio,
    motivo,
    actor: ACTOR_MP,
    diaCerradoHasta: deps.cerradoHasta,
    esDiaCerrado: isFrozenDay,
    diaDe: (d: Date) => dateStrInBusinessTz(d),
    withSchema: deps.withSchema,
  });

  switch (plan.tipo) {
    case "nada":
      return { accion: plan.motivo === "ya registrado" ? "ya-registrado" : "sin-cambios", motivo: plan.motivo };

    case "registrar": {
      let r;
      try {
        r = await deps.aplicarCobro(tx, tenantId, argsCobro(plan.monto, claveSeniaMP(pago.id)));
      } catch (e) {
        if (!(e instanceof CobroTurnoRechazado)) throw e;
        // Nada se escribió (la validación y el día cerrado van antes de crear): queda el aviso.
        await auditarAvisoMPEnTx(tx, { tenantId, appointmentId, action: ACCION_SENIA_MP_NO_REGISTRADA, changes: { pagoMP, motivo: e.message } });
        return { accion: "rechazado", motivo: e.message };
      }
      if (!r.applied) return { accion: "ya-registrado" };
      await auditarAvisoMPEnTx(tx, {
        tenantId,
        appointmentId,
        action: ACCION_SENIA_MP,
        changes: { tipo: "senia", cobroId: r.collectionId, method: "MERCADOPAGO", amount: r.monto, pagoMP, saldo: r.estado.saldo },
      });
      if (a.status !== "PENDING") return { accion: "registrado", cobroId: r.collectionId, monto: r.monto };

      const despues = (await cobrosDetalladosPorTurno(tx, tenantId, [appointmentId])).get(appointmentId) ?? [];
      const falta = seniaQueFaltaParaConfirmar({ senia, precio, cobros: despues, pagoLegado: a.payment ?? undefined });
      if (falta > 0) {
        await auditarAvisoMPEnTx(tx, {
          tenantId,
          appointmentId,
          action: ACCION_SENIA_PARCIAL_MP,
          changes: { cobroId: r.collectionId, amount: r.monto, senia, seniaQueFalta: falta, pagoMP },
        });
        return { accion: "senia-parcial", cobroId: r.collectionId, monto: r.monto, falta };
      }
      const { count } = await tx.appointment.updateMany({
        where: { id: appointmentId, tenantId, status: "PENDING" },
        data: { status: "CONFIRMED" },
      });
      if (count !== 1) return { accion: "registrado", cobroId: r.collectionId, monto: r.monto };
      // La misma guarda de todo camino a CONFIRMED (con la seña recién registrada, pasa).
      await exigirSeniaParaConfirmar(tx, { tenantId, appointmentId });
      await auditarAvisoMPEnTx(tx, {
        tenantId,
        appointmentId,
        action: ACCION_CONFIRMAR,
        changes: { status: { from: "PENDING", to: "CONFIRMED" }, porSenia: true, cobroId: r.collectionId, pagoMP },
      });
      return { accion: "confirmado", cobroId: r.collectionId, monto: r.monto };
    }

    case "devolver":
    case "ajustar": {
      const porque =
        plan.tipo === "devolver"
          ? `Mercado Pago devolvió la seña (pago ${pago.id})`
          : `Mercado Pago devolvió parte de la seña (pago ${pago.id}): queda ${plan.monto}`;
      try {
        await deps.anularCobro(tx, tenantId, argsAnular(plan.anular, porque));
      } catch (e) {
        if (!(e instanceof AnulacionRechazada)) throw e;
        // No se pudo anular (factura emitida o día cerrado): nada se escribió. La plata ya no está
        // en pie, así que el turno igual vuelve a Reservado si el neto no cubre la seña, y queda el
        // aviso para que la dueña regularice el cobro.
        const motivo = mensajeAnulacionRechazada(e.motivo);
        await auditarAvisoMPEnTx(tx, { tenantId, appointmentId, action: ACCION_SENIA_MP_DEVUELTA_SIN_ANULAR, changes: { pagoMP, motivo, cobroId: plan.anular } });
        const volvio = neto < senia ? await forzarReservado(tx, { tenantId, appointmentId, porque: `${porque}; el cobro no se pudo anular: ${motivo}`, ahora: deps.ahora, falta: round2(senia - neto) }) : false;
        return { accion: "devuelto", volvioAReservado: volvio };
      }
      let cobroId = "";
      if (plan.tipo === "ajustar") {
        try {
          const r = await deps.aplicarCobro(tx, tenantId, argsCobro(plan.monto, claveSeniaMP(pago.id, plan.monto)));
          cobroId = r.collectionId;
        } catch (e) {
          // La anulación ya se escribió: se deshace todo y el llamador deja el aviso.
          if (e instanceof CobroTurnoRechazado) throw new SeniaMPRechazada(e.message);
          throw e;
        }
      }
      await auditarAvisoMPEnTx(tx, { tenantId, appointmentId, action: "senia_mp_devuelta", changes: { pagoMP, cobroAnulado: plan.anular, cobroNeto: cobroId || null } });
      const volvio = await volverAReservadoSiFaltaLaSenia(tx, { tenantId, appointmentId, actor: ACTOR_MP, porque, ahora: deps.ahora });
      return plan.tipo === "devolver"
        ? { accion: "devuelto", volvioAReservado: volvio }
        : { accion: "ajustado", cobroId, monto: plan.monto, volvioAReservado: volvio };
    }
  }
}

/**
 * La seña volvió a MP pero el cobro no se pudo anular: el Confirmado que todavía no empezó vuelve a
 * Reservado igual (salvo la excepción de la dueña), con la misma acción de auditoría que
 * `volverAReservadoSiFaltaLaSenia`.
 */
async function forzarReservado(
  tx: Tx,
  p: { tenantId: string; appointmentId: string; porque: string; ahora: Date; falta: number },
): Promise<boolean> {
  const t = await tx.appointment.findFirst({ where: { id: p.appointmentId, tenantId: p.tenantId }, select: { status: true, startsAt: true } });
  if (!t || t.status !== "CONFIRMED" || t.startsAt.getTime() <= p.ahora.getTime()) return false;
  if (await confirmadoPorExcepcion(tx, p.tenantId, p.appointmentId)) return false;
  const { count } = await tx.appointment.updateMany({
    where: { id: p.appointmentId, tenantId: p.tenantId, status: "CONFIRMED" },
    data: { status: "PENDING" },
  });
  if (count !== 1) return false;
  await auditarAvisoMPEnTx(tx, {
    tenantId: p.tenantId,
    appointmentId: p.appointmentId,
    action: ACCION_VOLVIO_A_RESERVADO,
    changes: { status: { from: "CONFIRMED", to: "PENDING" }, motivo: p.porque, seniaQueFalta: p.falta },
  });
  return true;
}
