// ============================================================================
// SEÑA OBLIGATORIA · la guarda del servidor (interruptor «sena-obligatoria»)
// ============================================================================
//
// `exigirSeniaParaConfirmar(tx, …)` es la ÚNICA guarda: la llama, DENTRO de su transacción y
// DESPUÉS de escribir, todo camino que deja un turno en CONFIRMED. Si rechaza, tira
// `RechazoDeDominio` y la transacción entera vuelve atrás (turno y cobro). Los caminos:
//   · `confirmarTurno` (actions.ts) — Reservado → Confirmado;
//   · `bookAppointment` con estado CONFIRMED (actions.ts) — el alta de mostrador, incluida la que
//     arma `decisionDeLaSenia` («Ya la mandó» cobra en la misma tx y pasa; «Ya confirmó» sin cobro,
//     no);
//   · `cobrarSeniaYConfirmar` (cobro-actions.ts) — registra el cobro y confirma: pasa siempre que
//     el cobro quede vigente;
//   · la edición (editar-actions.ts) que cambia servicio o precio de un Confirmado (la excepción de
//     la dueña se respeta);
//   · la lista de espera (waitlist-actions.ts) crea el turno: con la regla en contra lo crea
//     Reservado (`estadoInicialSinCobro`) en vez de rechazar al anotado.
// «Confirmar sin seña» (sena-obligatoria-actions.ts) es la excepción y NO pasa por acá.
//
// Y al revés: si la plata baja (se anula la seña) o la seña sube (se fija el precio de un turno «a
// definir»), `volverAReservadoSiFaltaLaSenia` devuelve a Reservado, en la misma tx y con auditoría,
// un Confirmado que todavía no empezó y al que ya no le alcanza la seña, salvo que lo haya confirmado
// la dueña por excepción.
//
// La regla (pura) está en sena-obligatoria-core.ts. Sin "use server": no es un endpoint.
//
// Dentro de una transacción de Postgres una consulta fallida aborta la transacción: no se atrapa el
// error de la lectura del interruptor (a diferencia de `arqueoCiegoDelNegocio`). Si falla, falla la
// confirmación entera, que es lo seguro con plata de por medio.

import type { Prisma } from "@/generated/prisma/client";
import { RechazoDeDominio } from "@/lib/rechazo-de-dominio";
import { SENA_OBLIGATORIA } from "@/cambios/interruptores";
import { estadoDesdeFilas, filtroDeFilasValidas, type FilaLeida } from "@/cambios/interruptores-core";
import { cobrosDetalladosPorTurno } from "./anulacion";
import { seniaDelServicio } from "./cobros";
import {
  ACCIONES_DE_CONFIRMACION,
  ACCION_CONFIRMAR_SIN_SENIA,
  ACCION_VOLVIO_A_RESERVADO,
  decidirConfirmacionConSenia,
  seniaQueFaltaParaConfirmar,
  type VeredictoSenia,
} from "./sena-obligatoria-core";

/** Lo que usa la guarda del cliente de la transacción (un `tx` de Prisma; en los tests, un doble). */
export type TxDeSenia = Pick<Prisma.TransactionClient, "auditLog" | "appointment" | "collection">;

/** ¿El negocio exige la seña para confirmar? Lee con el `tx` de la operación (misma foto). */
export async function senaObligatoriaEnTx(tx: TxDeSenia, tenantId: string): Promise<boolean> {
  const filas: FilaLeida[] = await tx.auditLog.findMany({
    where: { ...filtroDeFilasValidas(tenantId), entityId: SENA_OBLIGATORIA },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
    select: { id: true, entity: true, entityId: true, action: true, actor: true, channel: true, createdAt: true },
  });
  return estadoDesdeFilas(filas)[SENA_OBLIGATORIA]?.encendido === true;
}

/** Lo que la guarda lee del turno, con la seña que le falta (la regla única de la pantalla). */
async function leerTurno(tx: TxDeSenia, tenantId: string, appointmentId: string) {
  const a = await tx.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    select: {
      status: true,
      startsAt: true,
      priceAtBooking: true,
      service: { select: { price: true, depositAmount: true } },
      payment: { select: { status: true, amount: true } },
    },
  });
  if (!a) return null;
  const precio = a.priceAtBooking ?? a.service.price;
  const senia = seniaDelServicio({ depositAmount: a.service.depositAmount, precio });
  const cobros = (await cobrosDetalladosPorTurno(tx, tenantId, [appointmentId])).get(appointmentId) ?? [];
  return { status: a.status, startsAt: a.startsAt, senia, precio, cobros, pagoLegado: a.payment };
}

/**
 * ¿Este turno está confirmado por la EXCEPCIÓN de la dueña? Lo dice la última fila de confirmación de
 * su auditoría (confirm / confirm_sin_senia / unconfirm_falta_senia), escrita desde el panel por un
 * usuario. Si la última es «confirm_sin_senia», sí.
 */
export async function confirmadoPorExcepcion(tx: TxDeSenia, tenantId: string, appointmentId: string): Promise<boolean> {
  const ultima = await tx.auditLog.findFirst({
    where: {
      tenantId,
      entity: "Appointment",
      entityId: appointmentId,
      action: { in: [...ACCIONES_DE_CONFIRMACION] },
      channel: "admin",
      actor: { startsWith: "user:" },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { action: true },
  });
  return ultima?.action === ACCION_CONFIRMAR_SIN_SENIA;
}

/** Una fila de auditoría escrita con el `tx`: queda o se va con la operación (todo o nada). */
export async function auditarEnTx(
  tx: TxDeSenia,
  e: { tenantId: string; actor: string; action: string; appointmentId: string; changes: Record<string, unknown> },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: e.tenantId,
      actor: e.actor,
      action: e.action,
      entity: "Appointment",
      entityId: e.appointmentId,
      changes: JSON.parse(JSON.stringify(e.changes)),
      channel: "admin",
    },
  });
}

type PedidoDeGuarda = {
  tenantId: string;
  appointmentId: string;
  /** Un turno YA confirmado (edición): la excepción de la dueña vale. Al confirmar, no hace falta. */
  excepcionVale?: boolean;
  /** El texto del rechazo, si el camino tiene uno mejor (la edición). */
  motivo?: string;
};

/** El veredicto sin tirar (para tests y para quien quiera decidir otra cosa que rechazar). */
export async function veredictoSeniaParaConfirmar(tx: TxDeSenia, p: PedidoDeGuarda): Promise<VeredictoSenia> {
  if (!(await senaObligatoriaEnTx(tx, p.tenantId))) return { ok: true };
  const t = await leerTurno(tx, p.tenantId, p.appointmentId);
  // Sin turno no hay qué confirmar: el `updateMany` del llamador ya contestó «cambió recién».
  if (!t) return { ok: true };
  const v = decidirConfirmacionConSenia({ prendida: true, senia: t.senia, precio: t.precio, cobros: t.cobros, pagoLegado: t.pagoLegado });
  if (v.ok) return v;
  if (p.excepcionVale && (await confirmadoPorExcepcion(tx, p.tenantId, p.appointmentId))) return { ok: true };
  return p.motivo ? { ok: false, motivo: p.motivo } : v;
}

/**
 * LA guarda: con el interruptor prendido, rechaza dejar CONFIRMED un turno que pide seña y no la tiene
 * entera. Tira `RechazoDeDominio` (la transacción vuelve atrás). Apagado, no hace nada más que leer el
 * interruptor.
 */
export async function exigirSeniaParaConfirmar(tx: TxDeSenia, p: PedidoDeGuarda): Promise<void> {
  const v = await veredictoSeniaParaConfirmar(tx, p);
  if (!v.ok) throw new RechazoDeDominio(v.motivo);
}

/**
 * Después de que la plata baja o la seña sube: si el negocio exige la seña y un Confirmado que todavía
 * no empezó ya no la tiene entera, vuelve a Reservado en la MISMA tx, con su fila de auditoría.
 * Respeta la excepción de la dueña. Apagado, o turno en otro estado, o ya empezado: no toca nada.
 * Devuelve si lo volvió a Reservado.
 */
export async function volverAReservadoSiFaltaLaSenia(
  tx: TxDeSenia,
  p: { tenantId: string; appointmentId: string; actor: string; porque: string; ahora?: Date },
): Promise<boolean> {
  if (!(await senaObligatoriaEnTx(tx, p.tenantId))) return false;
  const t = await leerTurno(tx, p.tenantId, p.appointmentId);
  if (!t || t.status !== "CONFIRMED") return false;
  if (t.startsAt.getTime() <= (p.ahora ?? new Date()).getTime()) return false;
  const falta = seniaQueFaltaParaConfirmar(t);
  if (falta <= 0) return false;
  if (await confirmadoPorExcepcion(tx, p.tenantId, p.appointmentId)) return false;
  const { count } = await tx.appointment.updateMany({
    where: { id: p.appointmentId, tenantId: p.tenantId, status: "CONFIRMED" },
    data: { status: "PENDING" },
  });
  if (count !== 1) return false;
  await auditarEnTx(tx, {
    tenantId: p.tenantId,
    actor: p.actor,
    action: ACCION_VOLVIO_A_RESERVADO,
    appointmentId: p.appointmentId,
    changes: { status: { from: "CONFIRMED", to: "PENDING" }, motivo: p.porque, seniaQueFalta: falta },
  });
  return true;
}

/**
 * El estado con que nace un turno que se quería Confirmado y que no trae cobro (la lista de espera):
 * con la regla en contra, Reservado (queda «Pendiente de seña»). Misma regla que la guarda.
 */
export async function estadoInicialSinCobro(
  tx: TxDeSenia,
  p: { tenantId: string; depositAmount: number | null | undefined; precio: number },
): Promise<"CONFIRMED" | "PENDING"> {
  const prendida = await senaObligatoriaEnTx(tx, p.tenantId);
  const senia = seniaDelServicio({ depositAmount: p.depositAmount, precio: p.precio });
  return decidirConfirmacionConSenia({ prendida, senia, precio: p.precio, cobros: [] }).ok ? "CONFIRMED" : "PENDING";
}
