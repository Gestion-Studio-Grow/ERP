// STUB 1-B: lo reemplaza 1-A
// ============================================================================
// LOS TURNOS SIN CERRAR — loader de la bandeja «Cerrar lo pendiente» (/admin/turnos/cerrar).
// ============================================================================
//
// Misma firma que `turnosSinCerrar()` de la rama `reing-ch-t1a` (1-A):
// `() => Promise<BandejaSinCerrar>` (cierre-lote.ts). Versión mínima para que la bandeja compile y
// se pueda recorrer en su rama: los Reservados o Confirmados cuya hora ya pasó, del más reciente
// al más viejo, con el veredicto de cobro de quien mira (`puedeCobrarEsteTurno`), la plata con las
// reglas de la agenda (`turnoDelDia`) y si la caja de hoy ya se cerró. Predicado `tenantId`
// explícito además del RLS. Sin tope de días; tope de filas `TOPE_DE_LA_BANDEJA`. El loader de 1-A
// (sin pasar por agenda-core) gana al integrar.

import "server-only";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { isDemoSandbox } from "@/lib/demo-flag";
import { dateStrInBusinessTz, todayInBusinessTz } from "@/lib/datetime";
import { lastClosedDay } from "@/lib/caja/frontera-cierre";
import { isFrozenDay, type DayKey } from "@/lib/caja/cierre-diario";
import { cobrosDetalladosPorTurno } from "@/lib/turnos/anulacion";
import { puedeCobrarEsteTurno } from "@/lib/turnos/cobro-mostrador";
import { turnoDelDia } from "@/app/admin/(dashboard)/turnos/agenda-core";
import { permisosDeRol, type BandejaSinCerrar } from "./cierre-lote";

/** Cuántos trae la bandeja de una vez (un mes muy atrasado entra; más es otra conversación). */
export const TOPE_DE_LA_BANDEJA = 300;

export async function turnosSinCerrar(): Promise<BandejaSinCerrar> {
  const user = await requireCapability("agenda:read");
  const permisos = permisosDeRol(user.role);
  if (isDemoSandbox()) return { turnos: [], permisos, hayMas: false, cajaDeHoyCerrada: false };
  const tenantId = await getCurrentTenantId();
  const ahora = new Date();
  // Una profesional ve sólo los suyos (ADR-017 §2.b); sin `professionalId`, nada (fail-closed).
  const soloDe = user.role === "PROFESSIONAL" ? (user.professionalId ?? "__sin_profesional__") : null;
  const filas = await prisma.appointment.findMany({
    where: {
      tenantId,
      status: { in: ["PENDING", "CONFIRMED"] },
      startsAt: { lt: ahora },
      ...(soloDe ? { professionalId: soloDe } : {}),
    },
    orderBy: { startsAt: "desc" },
    take: TOPE_DE_LA_BANDEJA + 1,
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
  const hayMas = filas.length > TOPE_DE_LA_BANDEJA;
  const [cobros, cerradoHasta] = await Promise.all([
    cobrosDetalladosPorTurno(
      prisma,
      tenantId,
      filas.slice(0, TOPE_DE_LA_BANDEJA).map((f) => f.id),
    ),
    lastClosedDay(tenantId),
  ]);
  const turnos = filas.slice(0, TOPE_DE_LA_BANDEJA).map((a) => {
    const t = turnoDelDia(
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
    );
    return {
      id: t.id,
      clienteId: t.clienteId,
      inicio: t.inicio,
      fin: t.fin,
      dia: dateStrInBusinessTz(a.startsAt),
      estado: a.status === "CONFIRMED" ? ("CONFIRMED" as const) : ("PENDING" as const),
      clienta: t.clienta,
      telefono: t.telefono,
      servicio: t.servicio,
      profesional: t.profesional,
      profesionalId: t.profesionalId,
      box: t.box,
      precio: t.precio,
      cobrado: t.cobrado,
      saldo: t.saldo,
      senia: t.senia,
      cobros: t.cobros.map((c) => ({ amount: c.amount, method: c.method, note: c.note ?? null })),
      veredicto: t.veredicto,
    };
  });
  return { turnos, permisos, hayMas, cajaDeHoyCerrada: isFrozenDay(todayInBusinessTz() as DayKey, cerradoHasta) };
}
