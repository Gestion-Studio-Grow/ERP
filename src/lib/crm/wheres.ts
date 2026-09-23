// ============================================================================
// LOS `where` DE LAS PANTALLAS COMERCIALES — uno por lista, compartido con su número. PURO.
// ============================================================================
//
// Regla del Inicio por apps: el número del botón y la pantalla salen del MISMO `where`. Si el
// tile dijera "7 sin avisar" y la pantalla listara 8, el Inicio mentiría. Por eso cada lista
// declara acá su filtro y lo importan las dos puntas: la pantalla (o su loader en actions.ts,
// que como es "use server" no puede exportarlo) y el loader del número (src/apps/kpis).
//
// Sólo TIPOS de Prisma: lo importan los tests y módulos que no pueden arrastrar el cliente.

import type { Prisma } from "@/generated/prisma/client";

/** Un turno se puede cancelar sólo mientras sigue vivo: Reservado o Confirmado. */
export const ESTADOS_CANCELABLES = ["PENDING", "CONFIRMED"] as const;

/**
 * ¿Este turno se puede cancelar? Un turno completado ya se prestó y se cobró (hay plata, factura
 * y comisión colgadas de él); uno ausente o ya cancelado no tiene nada que cancelar. La agenda
 * sólo ofrece el botón en los vivos, pero esconder un botón no protege: la acción es un
 * endpoint y se puede llamar directo.
 */
export function esCancelable(status: string): boolean {
  return (ESTADOS_CANCELABLES as readonly string[]).includes(status);
}

/** El turno `id` de este negocio, sólo si todavía se puede cancelar (el `where` de la cancelación). */
export function whereTurnoCancelable(tenantId: string, id: string): Prisma.AppointmentWhereInput {
  return { id, tenantId, status: { in: [...ESTADOS_CANCELABLES] } };
}

/** Los turnos del día en la agenda (`getAgendaDay` y el número de Agenda): todo menos cancelados. */
export function whereTurnosDelDia(tenantId: string, desde: Date, hasta: Date): Prisma.AppointmentWhereInput {
  return { tenantId, startsAt: { gte: desde, lt: hasta }, status: { not: "CANCELLED" } };
}

/**
 * Los turnos de mañana a confirmar (`getMananaConfirmar`, la app Confirmar mañana, su número y
 * la cobertura de Recordatorios): Reservados y Confirmados del día siguiente del negocio.
 */
export function whereTurnosDeManana(tenantId: string, desde: Date, hasta: Date): Prisma.AppointmentWhereInput {
  return { tenantId, startsAt: { gte: desde, lt: hasta }, status: { in: ["PENDING", "CONFIRMED"] } };
}

/** Los anotados que todavía esperan (`getWaitlist` y el número de Lista de espera). */
export function whereEsperando(tenantId: string): Prisma.WaitlistEntryWhereInput {
  return { tenantId, status: { in: ["WAITING", "NOTIFIED"] } };
}

/**
 * Las cancelaciones que pueden ser huecos: la fila de auditoría `cancel` de un turno, de las
 * últimas horas. Se lee la AUDITORÍA y no `updatedAt` del turno porque cualquier otra escritura
 * (unificar fichas, por ejemplo) movería esa fecha y un hueco viejo parecería nuevo.
 */
export function whereCancelacionesRecientes(tenantId: string, desde: Date): Prisma.AuditLogWhereInput {
  return { tenantId, entity: "Appointment", action: "cancel", createdAt: { gte: desde } };
}
