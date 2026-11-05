// Lecturas de la rendición recibida (NAIL-ARTIST.md §5). Reciben el cliente (prisma o la tx) y el
// `tenantId`, que va en CADA where además de RLS. Tocan columnas y la tabla de la migración
// `20261105120000_nail_artist`: sólo se llaman con el interruptor `nail-artist` prendido, que exige
// la migración aplicada.

import type { Prisma } from "@/generated/prisma/client";
import { tieneRendicion, type ConfigDeRendicion, type PeriodoMensual, type TurnoRendible } from "./rendiciones";

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

/**
 * Los turnos COMPLETADOS de la profesional en el período, de servicios cuya seña y cobro van a ella
 * (`depositToProfessional`), con sus cobros. Un servicio sin la marca no entra: esa plata es de CH.
 */
export async function leerTurnosRendibles(db: Db, tenantId: string, professionalId: string, periodo: PeriodoMensual): Promise<TurnoRendible[]> {
  const turnos = await db.appointment.findMany({
    where: {
      tenantId,
      professionalId,
      status: "COMPLETED",
      startsAt: { gte: periodo.desde, lt: periodo.hasta },
      service: { depositToProfessional: true },
    },
    select: { id: true, collections: { where: { tenantId }, select: { amount: true, note: true } } },
    orderBy: { startsAt: "asc" },
  });
  return turnos.map((t) => ({ id: t.id, cobros: t.collections.map((c) => ({ amount: c.amount.toNumber(), note: c.note })) }));
}

export type RendicionRegistrada = {
  id: string;
  professionalId: string;
  collectedTotal: number;
  percentAmount: number;
  rentAmount: number;
  amount: number;
  appointmentCount: number;
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
    createdAt: f.createdAt,
    metodo: f.cashMovementId ? (medio.get(f.cashMovementId) ?? null) : null,
  }));
}
