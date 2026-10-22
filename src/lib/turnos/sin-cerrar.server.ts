// STUB 1-B: lo reemplaza 1-A
// ============================================================================
// LOS TURNOS SIN CERRAR — loader de la bandeja «Cerrar lo pendiente» (/admin/turnos/cerrar).
// ============================================================================
//
// Versión mínima para que la bandeja (agente 1-B) compile y se pueda recorrer en su rama. El
// loader de verdad lo escribe 1-A con la misma firma; al integrar gana el suyo. Lo que la pantalla
// necesita de acá (y nada más):
//   · `turnosSinCerrar()` → `{ turnos, permisos }`: los turnos Reservados o Confirmados cuya hora ya
//     pasó, proyectados a `TurnoDelDia` (agenda-core.ts) con el veredicto de cobro de quien mira
//     (`puedeCobrarEsteTurno`, la misma regla que aplica el cobro);
//   · `Permisos`: lo que puede quien mira (capacidades);
//   · `ResultadoAccion`: el de siempre (actions.ts).
//
// Predicado `tenantId` explícito además del RLS. Ventana de 90 días hacia atrás (no 365).

import "server-only";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { roleHasCapability } from "@/lib/capabilities";
import { isDemoSandbox } from "@/lib/demo-flag";
import { cobrosDetalladosPorTurno } from "@/lib/turnos/anulacion";
import { puedeCobrarEsteTurno } from "@/lib/turnos/cobro-mostrador";
import { turnoDelDia, type Permisos as PermisosDeLaAgenda, type TurnoDelDia } from "@/app/admin/(dashboard)/turnos/agenda-core";

export type { ResultadoAccion } from "@/lib/actions";

/** Lo que puede quien mira. `perdonar` = `agenda:forgive` (dar de baja un saldo; lo suma 1-A). */
export type Permisos = PermisosDeLaAgenda & { perdonar: boolean };

export type TurnosSinCerrar = { turnos: TurnoDelDia[]; permisos: Permisos };

const VENTANA_DIAS = 90;

export async function turnosSinCerrar(): Promise<TurnosSinCerrar> {
  const user = await requireCapability("agenda:complete");
  const permisos: Permisos = {
    gestionar: roleHasCapability(user.role, "agenda:manage"),
    cobrar: roleHasCapability(user.role, "agenda:collect"),
    terminar: roleHasCapability(user.role, "agenda:complete"),
    perdonar: user.role === "OWNER",
  };
  if (isDemoSandbox()) return { turnos: [], permisos };
  const tenantId = await getCurrentTenantId();
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - VENTANA_DIAS * 24 * 60 * 60 * 1000);
  // Una profesional ve sólo los suyos (ADR-017 §2.b); sin `professionalId`, nada (fail-closed).
  const soloDe = user.role === "PROFESSIONAL" ? (user.professionalId ?? "__sin_profesional__") : null;
  const filas = await prisma.appointment.findMany({
    where: {
      tenantId,
      status: { in: ["PENDING", "CONFIRMED"] },
      startsAt: { gte: desde, lt: ahora },
      ...(soloDe ? { professionalId: soloDe } : {}),
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      clientId: true,
      startsAt: true,
      endsAt: true,
      status: true,
      notes: true,
      priceAtBooking: true,
      reminderSentAt: true,
      professionalId: true,
      serviceId: true,
      client: { select: { name: true, phone: true } },
      service: { select: { name: true, price: true, depositAmount: true } },
      professional: { select: { name: true, cobraEnMostrador: true } },
      box: { select: { name: true } },
      payment: { select: { status: true, amount: true } },
    },
  });
  const cobros = await cobrosDetalladosPorTurno(prisma, tenantId, filas.map((f) => f.id));
  const turnos = filas.map((a) =>
    turnoDelDia(
      {
        id: a.id,
        clientId: a.clientId,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        status: a.status,
        notes: a.notes,
        priceAtBooking: a.priceAtBooking == null ? null : Number(a.priceAtBooking),
        reminderSentAt: a.reminderSentAt,
        professionalId: a.professionalId,
        serviceId: a.serviceId,
        client: { name: a.client.name, phone: a.client.phone },
        service: {
          name: a.service.name,
          price: Number(a.service.price),
          depositAmount: a.service.depositAmount == null ? null : Number(a.service.depositAmount),
        },
        professional: { name: a.professional.name },
        box: a.box ? { name: a.box.name } : null,
        payment: a.payment ? { status: a.payment.status, amount: Number(a.payment.amount) } : null,
        collections: cobros.get(a.id) ?? [],
      },
      puedeCobrarEsteTurno({
        rol: user.role,
        professionalIdDelUsuario: user.professionalId,
        professionalIdDelTurno: a.professionalId,
        nombreProfesional: a.professional.name,
        cobraEnMostrador: a.professional.cobraEnMostrador,
      }),
    ),
  );
  return { turnos, permisos };
}
