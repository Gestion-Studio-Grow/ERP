// ============================================================================
// LA AGENDA DEL DÍA — lo que el servidor le manda al navegador («Renglón»).
// ============================================================================
//
// Lee con los MISMOS loaders de siempre (`getAgendaDay`, `getMananaConfirmar`): no cambia qué se
// consulta ni quién ve qué (el profesional sigue viendo sólo su agenda: lo decide el loader). Lo
// que cambia es CUÁNTO cruza al navegador: la pantalla vieja le pasaba a un componente cliente
// el turno entero con `client`, `professional`, `service`, `box` y `payment` completos colgados del
// `include` (tenantId, fechas de alta, email y notas de la clienta, descripción del servicio…).
// Acá cada turno se proyecta a `TurnoDelDia` (agenda-core.ts), campo por campo, sin spread.
//
// El veredicto de cobro de cada turno se calcula acá con `puedeCobrarEsteTurno`, la misma función
// que aplica `registrarCobroTurno`: la tecla «Cobrar» no aparece si el servidor la va a rechazar.
//
// `server-only`: detrás de los loaders está el valor `prisma`.

import "server-only";
import { getAgendaDay } from "@/lib/actions";
import { puedeCobrarEsteTurno } from "@/lib/turnos/cobro-mostrador";
import { fmtTime } from "@/lib/datetime";
import { turnoDelDia, type TurnoDelDia } from "./agenda-core";

type AgendaCruda = Awaited<ReturnType<typeof getAgendaDay>>;

export type ProfesionalDelDia = { id: string; nombre: string; box: string | null };
export type AusenciaDelDia = { profesional: string; motivo: string };

export type AgendaDelDia = {
  turnos: TurnoDelDia[];
  profesionales: ProfesionalDelDia[];
  ausencias: AusenciaDelDia[];
};

/**
 * Lo que se lee de cada turno del loader. Algunos campos son opcionales porque la agenda de muestra
 * (`getDemoAgendaDay`) no los trae: sin ficha no hay enlace, sin cobros el saldo es el precio.
 */
type TurnoDeLaBase = {
  id: string;
  clientId?: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  notes: string | null;
  priceAtBooking: number | null;
  reminderSentAt?: Date | null;
  professionalId: string;
  serviceId: string;
  client: { name: string; phone: string };
  service: { name: string; price: number; depositAmount?: number | null };
  professional: { name: string; cobraEnMostrador?: boolean | null };
  box: { name: string } | null;
  payment: { status?: string; amount?: number; method?: string } | null;
  collections?: readonly { id?: string; amount: number; method: string; note?: string | null; createdAt?: Date }[];
};

/** Proyecta la agenda cruda a lo que se muestra, con el veredicto de cobro de quien mira. */
export function proyectarAgenda(cruda: AgendaCruda, quien: { role: string; professionalId?: string | null }): AgendaDelDia {
  const leidos: readonly TurnoDeLaBase[] = cruda.appointments;
  const turnos = leidos
    .map((a) =>
      turnoDelDia(
        {
          id: a.id,
          clientId: a.clientId ?? "",
          startsAt: a.startsAt,
          endsAt: a.endsAt,
          status: a.status,
          notes: a.notes,
          priceAtBooking: a.priceAtBooking,
          reminderSentAt: a.reminderSentAt ?? null,
          professionalId: a.professionalId,
          serviceId: a.serviceId,
          client: { name: a.client.name, phone: a.client.phone },
          service: { name: a.service.name, price: a.service.price, depositAmount: a.service.depositAmount },
          professional: { name: a.professional.name },
          box: a.box ? { name: a.box.name } : null,
          payment: a.payment ? { status: a.payment.status, amount: a.payment.amount } : null,
          collections: a.collections,
        },
        puedeCobrarEsteTurno({
          rol: quien.role,
          professionalIdDelUsuario: quien.professionalId,
          professionalIdDelTurno: a.professionalId,
          nombreProfesional: a.professional.name,
          cobraEnMostrador: a.professional.cobraEnMostrador ?? undefined,
        }),
      ),
    )
    .sort((x, y) => new Date(x.inicio).getTime() - new Date(y.inicio).getTime());
  return {
    turnos,
    profesionales: cruda.professionals.map((p) => ({ id: p.id, nombre: p.name, box: p.box?.name ?? null })),
    ausencias: cruda.blocksToday.map((b) => ({ profesional: b.professional.name, motivo: b.reason })),
  };
}

/** «10:00 a 10:45» — para el lector de pantalla y el cajón. */
export function horario(t: Pick<TurnoDelDia, "inicio" | "fin">): string {
  return `${fmtTime(t.inicio)} a ${fmtTime(t.fin)}`;
}
