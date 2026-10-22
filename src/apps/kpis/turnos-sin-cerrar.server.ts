// ============================================================================
// TURNOS SIN CERRAR — el número de la Agenda con su aviso, y el conteo de «Todos los turnos».
// ============================================================================
//
// Un turno «sin cerrar» es un Reservado o Confirmado cuya hora ya pasó: un cobro que no se
// registró o una ausencia sin marcar. Se cuenta SIN tope de días (un pasado de hace 4 meses
// también pide cerrarse) y siempre con el negocio en el `where` (cuatro negocios, una base).
//
// Dos usos, una sola definición (`whereSinCerrar`):
//   · el número de la app Agenda en el Inicio: el de siempre («18 turnos hoy · …») MÁS el aviso
//     «4 de ayer sin cerrar», que sube a «Para atender hoy» como «Quedaron 4 sin cerrar» con la
//     tecla a /admin/turnos/cerrar (inicio/bandeja-core.ts). Cuenta los de días ANTERIORES: los
//     de hoy con la hora pasada se están atendiendo;
//   · el renglón «N pasados sin cerrar → [Cerrar lo pendiente]» de /admin/turnos/lista (B8),
//     que cuenta todo lo que ya pasó, hoy incluido.
//
// Mismas reglas que el resto de la carpeta: el `db` del contexto y UNA consulta por número.
// Reingeniería CH, Tanda 1, agente 1-D.

import type { Prisma } from "@/generated/prisma/client";
import { fmtNumberAR } from "@/components/ui/format";
import { rangoDelDia } from "@/lib/turnos/turno-abierto";
import { resumirAgenda } from "./comercial.server";
import type { DatoKpi, LoaderKpi } from "./nucleo.server";

/** Reservados y Confirmados de este negocio que empezaron antes de `antesDe`. PURO. */
export function whereSinCerrar(tenantId: string, antesDe: Date): Prisma.AppointmentWhereInput {
  return { tenantId, status: { in: ["PENDING", "CONFIRMED"] }, startsAt: { lt: antesDe } };
}

/** Lo único que necesita el conteo: el `db` de un loader o el `prisma` del request. */
type DbConteo = { appointment: { count(args: { where: Prisma.AppointmentWhereInput }): Promise<number> } };

/** Cuántos turnos quedaron sin cerrar antes de `antesDe` (una consulta, con el negocio). */
export function contarTurnosSinCerrar(db: DbConteo, tenantId: string, antesDe: Date): Promise<number> {
  return db.appointment.count({ where: whereSinCerrar(tenantId, antesDe) });
}

/** «AAAA-MM-DD» del día anterior, estable ante zonas (se ancla al mediodía UTC). */
function diaAnterior(dia: string): string {
  const d = new Date(`${dia}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

type Fila = { status: string; startsAt: Date };

/**
 * El número de la Agenda con el aviso de los sin cerrar de días anteriores. PURO.
 * `hoyDesde`/`ayerDesde`: bordes del día del negocio (para decir «de ayer» sólo si lo son todos).
 */
export function resumirAgendaConSinCerrar(filas: readonly Fila[], hoyDesde: Date, ayerDesde: Date): DatoKpi {
  const deHoy = filas.filter((f) => f.startsAt.getTime() >= hoyDesde.getTime());
  const pasados = filas.filter((f) => f.startsAt.getTime() < hoyDesde.getTime() && (f.status === "PENDING" || f.status === "CONFIRMED"));
  const porEstado = new Map<string, number>();
  for (const f of deHoy) porEstado.set(f.status, (porEstado.get(f.status) ?? 0) + 1);
  const base = resumirAgenda([...porEstado].map(([status, n]) => ({ status, _count: { _all: n } })));
  if (pasados.length === 0 || "sinDato" in base) return base;
  const todosDeAyer = pasados.every((f) => f.startsAt.getTime() >= ayerDesde.getTime());
  const n = pasados.length;
  const texto = todosDeAyer
    ? n === 1
      ? "turno de ayer sin cerrar"
      : "turnos de ayer sin cerrar"
    : n === 1
      ? "turno sin cerrar de días anteriores"
      : "turnos sin cerrar de días anteriores";
  return { ...base, alerta: { valor: fmtNumberAR(n), texto } };
}

/**
 * El loader de la app Agenda: reemplaza al de comercial.server.ts (mismo id, mismo número del
 * día) sumándole el aviso. UNA consulta: los turnos de hoy (menos cancelados, el `where` de
 * `getAgendaDay`) O los abiertos de antes de hoy, sólo con estado y hora.
 */
export const agendaConSinCerrar: LoaderKpi = async ({ db, tenantId, hoy }) => {
  const { desde, hasta } = rangoDelDia(hoy);
  const filas = await db.appointment.findMany({
    where: {
      tenantId,
      OR: [
        { startsAt: { gte: desde, lt: hasta }, status: { not: "CANCELLED" } },
        { startsAt: { lt: desde }, status: { in: ["PENDING", "CONFIRMED"] } },
      ],
    },
    select: { status: true, startsAt: true },
  });
  return resumirAgendaConSinCerrar(filas, desde, rangoDelDia(diaAnterior(hoy)).desde);
};

export const LOADERS_TURNOS_SIN_CERRAR: Readonly<Record<string, LoaderKpi>> = {
  agenda: agendaConSinCerrar,
};
