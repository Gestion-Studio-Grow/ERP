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
//   · la lista de espera (waitlist-actions.ts) crea el turno: con la regla en contra lo crea
//     Reservado (`estadoInicialSinCobro`) en vez de rechazar al anotado.
// «Confirmar sin seña» (sena-obligatoria-actions.ts) es la excepción y NO pasa por acá.
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
import { decidirConfirmacionConSenia, type VeredictoSenia } from "./sena-obligatoria-core";

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

/** El veredicto sin tirar (para tests y para quien quiera decidir otra cosa que rechazar). */
export async function veredictoSeniaParaConfirmar(
  tx: TxDeSenia,
  p: { tenantId: string; appointmentId: string },
): Promise<VeredictoSenia> {
  if (!(await senaObligatoriaEnTx(tx, p.tenantId))) return { ok: true };
  const a = await tx.appointment.findFirst({
    where: { id: p.appointmentId, tenantId: p.tenantId },
    select: {
      priceAtBooking: true,
      service: { select: { price: true, depositAmount: true } },
      payment: { select: { status: true, amount: true } },
    },
  });
  // Sin turno no hay qué confirmar: el `updateMany` del llamador ya contestó «cambió recién».
  if (!a) return { ok: true };
  const precio = a.priceAtBooking ?? a.service.price;
  const senia = seniaDelServicio({ depositAmount: a.service.depositAmount, precio });
  const cobros = (await cobrosDetalladosPorTurno(tx, p.tenantId, [p.appointmentId])).get(p.appointmentId) ?? [];
  return decidirConfirmacionConSenia({ prendida: true, senia, cobros, pagoLegado: a.payment });
}

/**
 * LA guarda: con el interruptor prendido, rechaza dejar CONFIRMED un turno que pide seña y no tiene
 * un cobro vigente. Tira `RechazoDeDominio` (la transacción vuelve atrás). Apagado, no hace nada más
 * que leer el interruptor.
 */
export async function exigirSeniaParaConfirmar(tx: TxDeSenia, p: { tenantId: string; appointmentId: string }): Promise<void> {
  const v = await veredictoSeniaParaConfirmar(tx, p);
  if (!v.ok) throw new RechazoDeDominio(v.motivo);
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
  return decidirConfirmacionConSenia({ prendida, senia, cobros: [] }).ok ? "CONFIRMED" : "PENDING";
}
