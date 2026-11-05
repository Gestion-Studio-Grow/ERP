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
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { puedeCobrarEsteTurno } from "@/lib/turnos/cobro-mostrador";
import { fmtTime } from "@/lib/datetime";
import { seniasAProfesional, seniasPedidas } from "@/lib/turnos/senia-actions";
import { nailArtistDelNegocio } from "@/cambios/interruptores.server";
import { seniaDeLaProfesional } from "@/lib/turnos/senia-profesional";
import { horariosDelDia } from "@/lib/turnos/horario-del-dia.server";
import { turnoDelDia, type TurnoDelDia } from "./agenda-core";
import { bloqueosDelDia, bloqueosPorHorario, type BloqueoDelDia } from "./grilla";

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
  collections?: readonly { id?: string; amount: number; method: string; note?: string | null; createdAt?: Date; collectedBy?: string }[];
};

/** Proyecta la agenda cruda a lo que se muestra, con el veredicto de cobro de quien mira. */
export function proyectarAgenda(
  cruda: AgendaCruda,
  quien: { role: string; professionalId?: string | null },
  /** Lo que se lee aparte (`extrasDeLaAgenda`): turno → cuándo se pidió la seña. */
  extras?: {
    seniasPedidas?: Readonly<Record<string, string>>;
    /** Box «Nail Artist»: turno → la cuenta de la profesional para la seña (sólo servicios marcados). */
    seniasAProfesional?: Readonly<Record<string, NonNullable<TurnoDelDia["seniaAProfesional"]>>>;
    /** Agenda interactiva: actor del cobro («user:<id>») → nombre de quien cobró (sección «Pagos»). */
    quienCobro?: Readonly<Record<string, string>>;
  },
): AgendaDelDia {
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
          // Con los nombres de quién cobró (agenda interactiva), cada cobro lleva `quien`; el actor
          // crudo («user:<id>») no cruza al navegador.
          collections: extras?.quienCobro
            ? a.collections?.map(({ collectedBy, ...c }) => {
                const quien = collectedBy ? extras.quienCobro?.[collectedBy] : undefined;
                return quien ? { ...c, quien } : c;
              })
            : a.collections, // `turnoDelDia` copia campo por campo: el actor no pasa
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
    .map((t) => (extras?.seniasPedidas?.[t.id] ? { ...t, seniaPedidaEl: extras.seniasPedidas[t.id] } : t))
    .map((t) => (extras?.seniasAProfesional?.[t.id] ? { ...t, seniaAProfesional: extras.seniasAProfesional[t.id] } : t))
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

/**
 * Lo que la agenda lee ADEMÁS del loader del día (Tanda 2), en paralelo y una vez por día:
 *   · la marca «seña pedida» de los Reservados del día (`seniasPedidas`: AuditLog, por `tenantId`);
 *   · el horario de trabajo de las profesionales (`horariosDelDia`: WorkingHours, por `tenantId`),
 *     como bloqueos de la grilla junto con las ausencias.
 * Si una de las dos falla, la agenda se dibuja igual sin eso (no se cae por una marca).
 */
export async function extrasDeLaAgenda(
  cruda: AgendaCruda,
  dia: string,
  /** `quienCobro`: agenda interactiva prendida → también los nombres de quién cobró (una lectura). */
  o: { quienCobro?: boolean } = {},
): Promise<{
  seniasPedidas: Record<string, string>;
  bloqueos: BloqueoDelDia[];
  quienCobro?: Record<string, string>;
  seniasAProfesional?: Record<string, NonNullable<TurnoDelDia["seniaAProfesional"]>>;
}> {
  const reservados = cruda.appointments.filter((a) => a.status === "PENDING").map((a) => a.id);
  const profesionales = cruda.professionals.map((p) => p.id);
  const [senias, horarios, quienCobro, aProfesional] = await Promise.all([
    reservados.length > 0 ? seniasPedidas(reservados).catch(() => ({})) : Promise.resolve({}),
    profesionales.length > 0 ? horariosDelDia(dia, profesionales).catch(() => null) : Promise.resolve(null),
    o.quienCobro ? nombresDeQuienCobro(cruda).catch(() => ({})) : Promise.resolve(undefined),
    reservados.length > 0 ? cuentasDeSeniaProfesional(reservados).catch(() => ({})) : Promise.resolve({}),
  ]);
  return {
    seniasPedidas: senias,
    bloqueos: [...bloqueosDelDia(cruda.blocksToday), ...bloqueosPorHorario(dia, profesionales, horarios)],
    ...(quienCobro ? { quienCobro } : {}),
    ...(Object.keys(aProfesional).length > 0 ? { seniasAProfesional: aProfesional } : {}),
  };
}

/**
 * Box «Nail Artist»: de los Reservados dados, los de servicios marcados `depositToProfessional`, con la
 * cuenta de la seña. Manda la CONGELADA al pedirla (si es de la misma profesional del turno); si no, la
 * ficha de la profesional DEL TURNO. Interruptor apagado = `{}` sin tocar la base (ni la columna).
 */
async function cuentasDeSeniaProfesional(ids: string[]): Promise<Record<string, NonNullable<TurnoDelDia["seniaAProfesional"]>>> {
  if (!(await nailArtistDelNegocio())) return {};
  const tenantId = await getCurrentTenantId();
  const [filas, congeladas] = await Promise.all([
    prisma.appointment.findMany({
      where: { tenantId, id: { in: ids }, service: { depositToProfessional: true } },
      select: { id: true, professionalId: true, professional: { select: { id: true, aliasCbu: true, titularCuenta: true, cuitTitular: true } } },
    }),
    seniasAProfesional(ids),
  ]);
  const out: Record<string, NonNullable<TurnoDelDia["seniaAProfesional"]>> = {};
  for (const f of filas) {
    const c = congeladas[f.id];
    if (c && c.professionalId === f.professionalId) {
      out[f.id] = { cuenta: { alias: c.alias, titular: c.titular, cuit: c.cuit } };
      continue;
    }
    const r = seniaDeLaProfesional({ nailArtist: true, depositToProfessional: true, appointment: f, profesional: f.professional, monto: 0 });
    out[f.id] = { cuenta: r.aplica && r.ok ? { alias: r.snapshot.alias, titular: r.snapshot.titular, cuit: r.snapshot.cuit } : null };
  }
  return out;
}

/** Actor de los cobros del día («user:<id>») → nombre. UNA consulta por día, con `tenantId`. */
async function nombresDeQuienCobro(cruda: AgendaCruda): Promise<Record<string, string>> {
  const leidos: readonly TurnoDeLaBase[] = cruda.appointments;
  const ids = new Set<string>();
  for (const a of leidos) {
    for (const c of a.collections ?? []) if (c.collectedBy?.startsWith("user:")) ids.add(c.collectedBy.slice(5));
  }
  if (ids.size === 0) return {};
  const tenantId = await getCurrentTenantId();
  const usuarios = await prisma.user.findMany({ where: { tenantId, id: { in: [...ids] } }, select: { id: true, name: true } });
  return Object.fromEntries(usuarios.filter((u) => u.name).map((u) => [`user:${u.id}`, u.name as string]));
}
