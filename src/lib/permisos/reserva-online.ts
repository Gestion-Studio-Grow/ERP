// Casilla 1 de la matriz: «Disponible para reserva online» (PLAN permisos §3 y §6).
//
// NO es `Professional.active`. Apagarla graba la excepción `booking:online = no` en
// `UserPermissionOverride` del USUARIO vinculado a la ficha; la ficha sigue activa, en la grilla y en
// «Dar turno». Este módulo es lo que leen SÓLO los caminos públicos (`/reserva`, el modal de la
// vidriera, los huecos públicos y las acciones de reservar online) para sacarla de la reserva online.
//
// Todos los roles traen `booking:online` prendida: la única excepción posible es «no». Sin la tabla
// (migración sin aplicar, Gate 2) no hay excepciones: el conjunto vacío, nadie queda afuera.
// Cualquier otro error sube (no se adivina).

import { prisma } from "@/lib/prisma";
import { esTablaAusente } from "@/lib/permisos-overrides";

export const CAPACIDAD_RESERVA_ONLINE = "booking:online" as const;

/** Lo que lee la clienta si intenta reservar con una profesional que no toma turnos online. */
export const FUERA_DE_RESERVA_ONLINE =
  "Esa profesional no toma turnos online. Elegí otra profesional o escribinos por WhatsApp y te lo reservamos.";

/**
 * Los `professionalId` cuyo usuario vinculado tiene la casilla 1 apagada en este negocio. La firma es
 * la que consume la sesión de links por profesional.
 */
export async function profesionalesFueraDeReservaOnline(tenantId: string): Promise<Set<string>> {
  try {
    const filas = await prisma.userPermissionOverride.findMany({
      where: {
        tenantId,
        capability: CAPACIDAD_RESERVA_ONLINE,
        allowed: false,
        user: { tenantId, deletedAt: null, professionalId: { not: null } },
      },
      select: { user: { select: { professionalId: true } } },
    });
    return idsFueraDeReservaOnline(filas);
  } catch (e) {
    if (esTablaAusente(e)) return new Set();
    throw e;
  }
}

/** Puro: de las filas leídas, el conjunto de fichas que quedan afuera. */
export function idsFueraDeReservaOnline(filas: ReadonlyArray<{ user: { professionalId: string | null } }>): Set<string> {
  const ids = new Set<string>();
  for (const f of filas) if (f.user.professionalId) ids.add(f.user.professionalId);
  return ids;
}

/** Puro: la lista pública sin las profesionales que quedaron afuera. */
export function sinLasDeFuera<T extends { id: string }>(lista: readonly T[], fuera: ReadonlySet<string>): T[] {
  return fuera.size === 0 ? [...lista] : lista.filter((p) => !fuera.has(p.id));
}
