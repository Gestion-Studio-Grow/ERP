// ============================================================================
// TURNOS PASADOS SIN CERRAR — el loader de la bandeja «Cerrar lo pendiente» (servidor).
// ============================================================================
//
// Reingeniería CH, Tanda 1 (B8): «Todos los turnos» traía 365 días con 5 joins por fila para
// encontrar los pasados sin cerrar. Esto trae SÓLO esos: `status IN (PENDING, CONFIRMED) AND
// startsAt < ahora`, con el predicado `tenantId` (además de RLS) que enciende el índice
// `[tenantId, startsAt]`, y SIN tope de días: un pasado sin cerrar de hace 4 meses también tiene
// que aparecer (CH-044). Proyección mínima: lo que la bandeja dibuja, ni un campo de más.
//
// Cada turno viene con su VEREDICTO de cobro (`puedeCobrarEsteTurno`, la misma regla que aplica el
// servidor al cobrar): la pantalla no ofrece medios en un turno que después se rechazaría (Vero).
//
// `server-only`: detrás está el valor `prisma`.

import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { isDemoSandbox } from "@/lib/demo-flag";
import { isColumnMissing } from "@/lib/prisma-errors";
import { dateStrInBusinessTz, todayInBusinessTz } from "@/lib/datetime";
import { lastClosedDay } from "@/lib/caja/frontera-cierre";
import { isFrozenDay } from "@/lib/caja/cierre-diario";
import { contarTurnosSinCerrar } from "@/apps/kpis/turnos-sin-cerrar.server";
import { cobrosDetalladosPorTurno } from "./anulacion";
import { puedeCobrarEsteTurno } from "./cobro-mostrador";
import { permisosDeRol, turnoSinCerrar, type BandejaSinCerrar, type FilaDeTurno } from "./cierre-lote";

/** Cuántos trae la bandeja de una vez (un mes muy atrasado entra; más es otra conversación). */
export const TOPE_DE_LA_BANDEJA = 300;

type Filtro =
  /** Los turnos de estos ids, en cualquier estado (el lote: un turno ya cerrado dice por qué). */
  | { ids: readonly string[] }
  /** Los pasados sin cerrar (la bandeja). */
  | { sinCerrarAntesDe: Date; professionalId?: string | null; tope: number };

const seleccion = (conFlag: boolean) =>
  ({
    id: true,
    clientId: true,
    startsAt: true,
    endsAt: true,
    status: true,
    priceAtBooking: true,
    professionalId: true,
    client: { select: { name: true, phone: true } },
    service: { select: { name: true, price: true, depositAmount: true } },
    professional: { select: conFlag ? { name: true, cobraEnMostrador: true } : { name: true } },
    box: { select: { name: true } },
    payment: { select: { status: true, amount: true } },
  }) as const;

/**
 * Lee turnos de ESTE negocio (predicado `tenantId` + RLS) con sus cobros. Un id de otro negocio
 * no vuelve. Tolera la columna `cobraEnMostrador` sin migrar (rige el default), como el resto.
 */
export async function leerFilasDeTurnos(tenantId: string, filtro: Filtro): Promise<FilaDeTurno[]> {
  const where: Prisma.AppointmentWhereInput =
    "ids" in filtro
      ? { tenantId, id: { in: [...filtro.ids] } }
      : {
          tenantId,
          status: { in: ["PENDING" as const, "CONFIRMED" as const] },
          startsAt: { lt: filtro.sinCerrarAntesDe },
          ...(filtro.professionalId ? { professionalId: filtro.professionalId } : {}),
        };
  if ("ids" in filtro && filtro.ids.length === 0) return [];
  const pagina: Pick<Prisma.AppointmentFindManyArgs, "orderBy" | "take"> =
    "ids" in filtro ? {} : { orderBy: { startsAt: "desc" }, take: filtro.tope };

  type Cruda = {
    id: string;
    clientId: string;
    startsAt: Date;
    endsAt: Date;
    status: string;
    priceAtBooking: number | null;
    professionalId: string;
    client: { name: string; phone: string };
    service: { name: string; price: number; depositAmount: number | null };
    professional: { name: string; cobraEnMostrador?: boolean };
    box: { name: string } | null;
    payment: { status: string; amount: number } | null;
  };
  let crudas: Cruda[];
  try {
    crudas = await prisma.appointment.findMany({ where, select: seleccion(true), ...pagina });
  } catch (err) {
    if (!isColumnMissing(err, "cobraEnMostrador")) throw err;
    crudas = await prisma.appointment.findMany({ where, select: seleccion(false), ...pagina });
  }

  const cobros = await cobrosDetalladosPorTurno(
    prisma,
    tenantId,
    crudas.map((c) => c.id),
  );
  return crudas.map((c) => ({
    ...c,
    // `clientId` puede venir nulo en filas viejas; la bandeja sólo lo usa para enlazar la ficha.
    clientId: c.clientId ?? "",
    collections: (cobros.get(c.id) ?? []).map((x) => ({ id: x.id, amount: x.amount, method: x.method, note: x.note ?? null })),
  }));
}

/**
 * De quién son los pasados sin cerrar que ve este usuario: una PROFESIONAL, sólo los suyos
 * (fail-closed sin `professionalId`: un id que no existe no trae nada); el resto, todo el negocio.
 */
function soloDeQuienMira(user: { role: string; professionalId?: string | null }): string | null {
  return user.role === "PROFESSIONAL" ? user.professionalId ?? "__no_professional__" : null;
}

/**
 * CUÁNTOS pasados sin cerrar ve quien mira: el chip «Sin cerrar N» de la agenda del día. El mismo
 * criterio y los mismos permisos que la bandeja (`turnosSinCerrar`: `agenda:read`, la profesional
 * sólo los suyos, el negocio en el `where`), pero UN `count` en vez del loader entero (5 relaciones
 * + cobros, hasta 301 filas) para pintar un número (cert CH Tanda 1, O-4). Sin tope: es el número
 * exacto, no «300+».
 */
export async function contarSinCerrarDeQuienMira(): Promise<number> {
  const user = await requireCapability("agenda:read");
  if (isDemoSandbox()) return 0;
  const tenantId = await getCurrentTenantId();
  return contarTurnosSinCerrar(prisma, tenantId, new Date(), soloDeQuienMira(user));
}

/**
 * La bandeja «Cerrar lo pendiente»: los turnos pasados sin cerrar de este negocio, del más reciente
 * al más viejo, cada uno con su veredicto de cobro; más los permisos de quien mira y si la caja de
 * hoy ya está cerrada. Una PROFESIONAL ve sólo los suyos (fail-closed sin `professionalId`).
 */
export async function turnosSinCerrar(): Promise<BandejaSinCerrar> {
  const user = await requireCapability("agenda:read");
  const permisos = permisosDeRol(user.role);
  if (isDemoSandbox()) return { turnos: [], permisos, hayMas: false, cajaDeHoyCerrada: false };

  const tenantId = await getCurrentTenantId();
  const soloDe = soloDeQuienMira(user);
  const [filas, cerradoHasta] = await Promise.all([
    leerFilasDeTurnos(tenantId, { sinCerrarAntesDe: new Date(), professionalId: soloDe, tope: TOPE_DE_LA_BANDEJA + 1 }),
    lastClosedDay(tenantId),
  ]);
  const hayMas = filas.length > TOPE_DE_LA_BANDEJA;
  const turnos = filas.slice(0, TOPE_DE_LA_BANDEJA).map((f) =>
    turnoSinCerrar(
      f,
      puedeCobrarEsteTurno({
        rol: user.role,
        professionalIdDelUsuario: user.professionalId,
        professionalIdDelTurno: f.professionalId,
        nombreProfesional: f.professional.name,
        cobraEnMostrador: f.professional.cobraEnMostrador,
      }),
      dateStrInBusinessTz(f.startsAt),
    ),
  );
  return { turnos, permisos, hayMas, cajaDeHoyCerrada: isFrozenDay(todayInBusinessTz(), cerradoHasta) };
}
