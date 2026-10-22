// ============================================================================
// COMBOS EN LA BASE — ¿está la tabla de ítems? y leer los ítems de los turnos, sin caerse.
// ============================================================================
//
// Reingeniería CH, Tanda 3 · 3-B. Los turnos con varias zonas (camino B) se guardan en
// `AppointmentItem`, que crea la migración M3 (20261024120200_ch_appointment_items), ESCRITA y SIN
// APLICAR en producción (Gate 2). Mientras no esté:
//   · `combosHabilitados()` contesta `false` y el alta ofrece una zona por turno (camino A: el combo
//     que la dueña cargó en Catálogo → Combos es un servicio más) y lo dice;
//   · `itemsDeTurnos()` contesta vacío (todo turno es de un servicio, como siempre);
//   · si igual llega un alta con varias zonas, la escritura falla con tabla ausente adentro de la
//     transacción (no queda nada a medias) y `faltaLaTablaDeItems(e)` la reconoce para rechazar con
//     `MENSAJE_COMBOS_SIN_ACTIVAR`.
//
// `combosHabilitados` lee el catálogo del sistema (`to_regclass`), sin datos de ningún negocio: por
// eso usa el cliente base. Falla CERRADO (`false`) y guarda la respuesta buena 60 s, como
// `mediosDePagoHabilitados`.

import "server-only";
import { basePrisma } from "@/lib/prisma-base";
import { prisma } from "@/lib/prisma";
import { isColumnMissing, isPrismaError } from "@/lib/prisma-errors";

const VIGENCIA_MS = 60_000;
let guardado: { valor: boolean; hasta: number } | null = null;

type ConsultaCruda = { $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T> };

/** ¿Esta base ya tiene la tabla de ítems de turno (M3)? */
export async function combosHabilitados(db: ConsultaCruda = basePrisma, ahora: number = Date.now()): Promise<boolean> {
  if (guardado && guardado.hasta > ahora) return guardado.valor;
  try {
    const [fila] = await db.$queryRaw<{ existe: boolean }[]>`
      SELECT to_regclass(format('%I.%I', current_schema(), 'AppointmentItem')) IS NOT NULL AS existe`;
    const valor = fila?.existe === true;
    guardado = { valor, hasta: ahora + VIGENCIA_MS };
    return valor;
  } catch {
    return false;
  }
}

/** Sólo para tests: olvida lo guardado. */
export function olvidarCombosHabilitados(): void {
  guardado = null;
}

/**
 * ¿El error es «la tabla de ítems (o su columna) todavía no existe»? Con el adaptador pg de Prisma 7
 * una tabla ausente llega como P2021 («The table `public.AppointmentItem` does not exist») y una
 * columna como P2022 (`isColumnMissing`). También el texto crudo de Postgres (42P01), por si viene
 * envuelto como DriverAdapterError.
 */
export function faltaLaTablaDeItems(e: unknown): boolean {
  if (isPrismaError(e, "P2021")) return true;
  if (isColumnMissing(e, "AppointmentItem") || isColumnMissing(e, "groupId")) return true;
  const m = e instanceof Error ? e.message : String(e ?? "");
  return /AppointmentItem/.test(m) && /does not exist|no existe|42P01/i.test(m);
}

export type ItemLeido = { appointmentId: string; servicio: string; serviceId: string; order: number; durationMin: number; priceAtBooking: number };

/**
 * Los ítems de esos turnos, por turno y en orden (`tenantId` escrito además de RLS). Sin la tabla
 * (M3 sin aplicar) o sin ids, vacío: nadie se cae por no tener combos.
 */
export async function itemsDeTurnos(tenantId: string, appointmentIds: readonly string[]): Promise<Map<string, ItemLeido[]>> {
  const porTurno = new Map<string, ItemLeido[]>();
  if (appointmentIds.length === 0) return porTurno;
  if (!(await combosHabilitados())) return porTurno;
  try {
    const filas = await prisma.appointmentItem.findMany({
      where: { tenantId, appointmentId: { in: [...new Set(appointmentIds)] } },
      select: { appointmentId: true, serviceId: true, order: true, durationMin: true, priceAtBooking: true, service: { select: { name: true } } },
      orderBy: [{ appointmentId: "asc" }, { order: "asc" }],
    });
    for (const f of filas) {
      const lista = porTurno.get(f.appointmentId) ?? [];
      lista.push({
        appointmentId: f.appointmentId,
        servicio: f.service.name,
        serviceId: f.serviceId,
        order: f.order,
        durationMin: f.durationMin,
        priceAtBooking: Number(f.priceAtBooking),
      });
      porTurno.set(f.appointmentId, lista);
    }
  } catch (e) {
    if (!faltaLaTablaDeItems(e)) throw e;
  }
  return porTurno;
}
