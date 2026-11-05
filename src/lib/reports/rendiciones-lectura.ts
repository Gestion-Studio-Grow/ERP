// Lecturas de la rendición recibida (NAIL-ARTIST.md §5). Reciben el cliente (prisma o la tx) y el
// `tenantId`, que va en CADA where además de RLS. Tocan columnas y la tabla de la migración
// `20261105120000_nail_artist`: sólo se llaman con el interruptor `nail-artist` prendido, que exige
// la migración aplicada.

import type { Prisma } from "@/generated/prisma/client";
import { estadoDesdeFilas, filtroDeFilasValidas } from "@/cambios/interruptores-core";
import { NAIL_ARTIST, nailArtistPrendido } from "@/cambios/interruptores";
import {
  cobradoPorLaProfesional,
  cobrosDeLaProfesional,
  tieneRendicion,
  type CobroConDestino,
  type ConfigDeRendicion,
  type PeriodoMensual,
  type TurnoRendible,
} from "./rendiciones";

type Db = Prisma.TransactionClient;

export type ProfesionalConRendicion = { id: string; name: string; phone: string | null } & ConfigDeRendicion;

const aNumero = (v: { toNumber(): number } | number | null | undefined): number | null =>
  v == null ? null : typeof v === "number" ? v : v.toNumber();

/** Las profesionales activas del negocio con alquiler o % cargado. */
export async function leerProfesionalesConRendicion(db: Db, tenantId: string): Promise<ProfesionalConRendicion[]> {
  const filas = await db.professional.findMany({
    where: { tenantId, deletedAt: null, OR: [{ boxRentAmount: { gt: 0 } }, { rentPercent: { gt: 0 } }] },
    select: { id: true, name: true, phone: true, boxRentAmount: true, rentPercent: true },
    orderBy: { name: "asc" },
  });
  return filas
    .map((p) => ({ id: p.id, name: p.name, phone: p.phone, boxRentAmount: aNumero(p.boxRentAmount), rentPercent: p.rentPercent }))
    .filter(tieneRendicion);
}

/** Todas las profesionales activas con su config (para cargarla en la pestaña). */
export async function leerConfigDeProfesionales(db: Db, tenantId: string): Promise<ProfesionalConRendicion[]> {
  const filas = await db.professional.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, name: true, phone: true, boxRentAmount: true, rentPercent: true },
    orderBy: { name: "asc" },
  });
  return filas.map((p) => ({ id: p.id, name: p.name, phone: p.phone, boxRentAmount: aNumero(p.boxRentAmount), rentPercent: p.rentPercent }));
}

const SELECT_COBROS_CON_DESTINO = {
  select: { id: true, amount: true, note: true, cashMovements: { select: { id: true }, take: 1 } },
} as const;

type FilaCobro = { id: string; amount: { toNumber(): number }; note: string | null; cashMovements: { id: string }[] };
const conDestino = (c: FilaCobro): CobroConDestino => ({ id: c.id, amount: c.amount.toNumber(), note: c.note, conAsientoEnCaja: c.cashMovements.length > 0 });

/**
 * Los turnos COMPLETADOS de la profesional en el período con los cobros que fueron A ELLA
 * (`cobrosDeLaProfesional`: por el destino del cobro, no por la marca actual del servicio). Lo que
 * entró a la caja de CH nunca suma. Un turno sin cobros de ella no entra.
 */
export async function leerTurnosRendibles(db: Db, tenantId: string, professionalId: string, periodo: PeriodoMensual): Promise<TurnoRendible[]> {
  const turnos = await db.appointment.findMany({
    where: { tenantId, professionalId, status: "COMPLETED", startsAt: { gte: periodo.desde, lt: periodo.hasta } },
    select: {
      id: true,
      service: { select: { depositToProfessional: true } },
      collections: { ...SELECT_COBROS_CON_DESTINO, where: { tenantId } },
    },
    orderBy: { startsAt: "asc" },
  });
  return turnos
    .map((t) => ({ id: t.id, cobros: cobrosDeLaProfesional(t.collections.map(conDestino), t.service.depositToProfessional === true) }))
    .filter((t) => t.cobros.length > 0);
}

/**
 * Cuánto del turno cobró la profesional (no entró a la caja de CH): lo que la factura del negocio
 * NO incluye. Lee una columna de la migración `nail_artist`: si falta, 0 (nadie pudo cobrar a su cuenta).
 */
export async function leerCobradoPorLaProfesional(db: Db, tenantId: string, appointmentId: string): Promise<number> {
  const t = await db.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    select: {
      service: { select: { depositToProfessional: true } },
      collections: { ...SELECT_COBROS_CON_DESTINO, where: { tenantId } },
    },
  });
  if (!t) return 0;
  return cobradoPorLaProfesional(t.collections.map(conDestino), t.service.depositToProfessional === true);
}

/**
 * De los turnos dados, cuánto cobró la profesional en cada uno (sólo los que tienen algo de ella), con
 * la regla única `cobradoPorLaProfesional`. Una lectura, con `tenantId`. Columna de la migración
 * `nail_artist`: llamar sólo con el interruptor prendido.
 */
export async function leerCobradoPorLasProfesionales(db: Db, tenantId: string, appointmentIds: readonly string[]): Promise<Record<string, number>> {
  if (appointmentIds.length === 0) return {};
  const turnos = await db.appointment.findMany({
    where: { tenantId, id: { in: [...appointmentIds] } },
    select: {
      id: true,
      service: { select: { depositToProfessional: true } },
      collections: { ...SELECT_COBROS_CON_DESTINO, where: { tenantId } },
    },
  });
  const out: Record<string, number> = {};
  for (const t of turnos) {
    const deElla = cobradoPorLaProfesional(t.collections.map(conDestino), t.service.depositToProfessional === true);
    if (deElla > 0) out[t.id] = deElla;
  }
  return out;
}

/** ¿El negocio tiene prendido el box «Nail Artist»? Por `tenantId` (sin request): la misma regla que la consola. */
export async function nailArtistDe(db: Db, tenantId: string): Promise<boolean> {
  const filas = await db.auditLog.findMany({
    where: { ...filtroDeFilasValidas(tenantId), entityId: NAIL_ARTIST },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
    select: { id: true, entity: true, entityId: true, action: true, actor: true, channel: true, createdAt: true },
  });
  return nailArtistPrendido(estadoDesdeFilas(filas));
}

export type RendicionRegistrada = {
  id: string;
  professionalId: string;
  collectedTotal: number;
  percentAmount: number;
  rentAmount: number;
  amount: number;
  appointmentCount: number;
  /** El % congelado al registrar (`null` en una fila sin parte por %). */
  rentPercent: number | null;
  createdAt: Date;
  metodo: string | null;
};

/** Las rendiciones ya registradas del período, con el medio del asiento que dejaron. */
export async function leerRendicionesDelPeriodo(db: Db, tenantId: string, periodo: PeriodoMensual): Promise<RendicionRegistrada[]> {
  const filas = await db.professionalSettlement.findMany({
    where: { tenantId, periodStart: periodo.desde, periodEnd: periodo.hasta },
    orderBy: { createdAt: "asc" },
  });
  const ids = filas.map((f) => f.cashMovementId).filter((x): x is string => !!x);
  const asientos = ids.length
    ? await db.cashMovement.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, method: true } })
    : [];
  const medio = new Map(asientos.map((a) => [a.id, a.method as string]));
  return filas.map((f) => ({
    id: f.id,
    professionalId: f.professionalId,
    collectedTotal: f.collectedTotal.toNumber(),
    percentAmount: f.percentAmount.toNumber(),
    rentAmount: f.rentAmount.toNumber(),
    amount: f.amount.toNumber(),
    appointmentCount: f.appointmentCount,
    rentPercent: f.rentPercent,
    createdAt: f.createdAt,
    metodo: f.cashMovementId ? (medio.get(f.cashMovementId) ?? null) : null,
  }));
}
