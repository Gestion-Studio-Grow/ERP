// MOVER UN TURNO — las reglas de la pantalla, puras y con test.
//
// Mover NUNCA crea un turno: es `rescheduleAppointment` (el mismo turno, otra hora y quizás otra
// profesional), que vuelve a validar el choque en el servidor (`assertSlotAvailable`, en una
// transacción del negocio). Lo de acá sólo decide qué ofrecer y qué decir ANTES de ir al
// servidor, para que la pantalla no ofrezca soltar donde después se rechaza:
//
//   · `veredictoDelDestino`: ¿se puede soltar el turno en esa celda? Y si no, por qué, en criollo.
//   · `destinoDelArrastre`: a qué profesional va el turno según la columna donde se soltó.
//   · `diasParaMover`: los chips de días del cajón (hoy + 6).
//   · `huecosParaOfrecer`: los horarios del cajón (sin los pasados ni el que ya tiene el turno).
//   · el WhatsApp «Te pasamos el turno al …» es `mensajeMover` (src/lib/turnos/mensajes-whatsapp.ts).
//
// Client-safe: sin Prisma ni servidor.

import { diaMas, fechaCorta } from "../agenda-core";
import { dateStrInBusinessTz, fmtTime } from "@/lib/datetime";
import type { ColumnaDeLaGrilla } from "../grilla";

/** Lo mínimo de un turno que hace falta para moverlo. */
export type TurnoParaMover = {
  id: string;
  inicio: string;
  estado: string;
  clienta: string;
  servicio: string;
  profesionalId: string;
};

/** ¿Se puede mover? Sólo un turno vivo (Reservado o Confirmado): la misma regla que el servidor. */
export function sePuedeMover(t: Pick<TurnoParaMover, "estado">): boolean {
  return t.estado === "PENDING" || t.estado === "CONFIRMED";
}

export type Destino = { profesionalId: string; profesional: string; inicio: string };

export type VeredictoDelDestino =
  | { tipo: "ok" }
  | { tipo: "igual" }
  | { tipo: "buscando"; motivo: string }
  | { tipo: "no"; motivo: string };

/**
 * ¿Se puede soltar `t` en `destino`?
 *   · `hacen`: ids de las profesionales que hacen el servicio (null = todavía se está buscando).
 *   · `huecos`: los inicios libres (ISO) de esa profesional ese día, sin contar el propio turno
 *     (`getAvailableSlots(…, excludeAppointmentId)`, el mismo motor que valida al guardar);
 *     undefined = todavía se está buscando.
 */
export function veredictoDelDestino(input: {
  turno: TurnoParaMover;
  destino: Destino;
  ahora: Date;
  hacen: ReadonlySet<string> | null;
  huecos: readonly string[] | undefined;
}): VeredictoDelDestino {
  const { turno, destino, ahora, hacen, huecos } = input;
  const inicio = new Date(destino.inicio).getTime();
  if (destino.profesionalId === turno.profesionalId && inicio === new Date(turno.inicio).getTime()) return { tipo: "igual" };
  if (!sePuedeMover(turno)) return { tipo: "no", motivo: "Sólo se mueve un turno reservado o confirmado." };
  if (inicio <= ahora.getTime()) return { tipo: "no", motivo: "Ese horario ya pasó. Soltalo más adelante." };
  if (hacen === null) return { tipo: "buscando", motivo: "Me fijo si está libre…" };
  if (!hacen.has(destino.profesionalId)) return { tipo: "no", motivo: `${destino.profesional} no hace ${turno.servicio}.` };
  if (huecos === undefined) return { tipo: "buscando", motivo: "Me fijo si está libre…" };
  if (!huecos.some((h) => new Date(h).getTime() === inicio)) {
    return {
      tipo: "no",
      motivo: `A las ${fmtTime(destino.inicio)} ${destino.profesional} no tiene lugar para ${turno.servicio}: se pisa con otro turno, está bloqueada o no atiende a esa hora.`,
    };
  }
  return { tipo: "ok" };
}

/**
 * A qué profesional va el turno si se suelta en esa columna. Por profesional, ella. Por box: la
 * única que atiende ahí, o la misma del turno si atiende en ese box; si no, no se sabe (null).
 */
export function destinoDelArrastre(columna: ColumnaDeLaGrilla, t: Pick<TurnoParaMover, "profesionalId">): string | null {
  if (columna.profesionalId) return columna.profesionalId;
  return columna.profesionalIds.includes(t.profesionalId) ? t.profesionalId : null;
}

/** Los días que ofrece «Mover»: hoy y los 6 que siguen (el día del turno, si es más adelante, también). */
export function diasParaMover(hoy: string, diaDelTurno: string, cuantos = 7): string[] {
  const dias = Array.from({ length: cuantos }, (_, i) => diaMas(hoy, i));
  if (diaDelTurno > dias[dias.length - 1]) dias.push(diaDelTurno);
  return dias;
}

/**
 * Los horarios que ofrece el cajón para mover `turno` a `profesionalId`: los que vienen (no los que ya
 * pasaron) y, con la misma profesional, NO el horario que ya tiene. Los huecos llegan pedidos sin
 * contar el propio turno (`excludeAppointmentId`), así que su hora vuelve como libre; ofrecerla era
 * «mover» al mismo lugar, borrar «avisada» y mandar un WhatsApp absurdo (cert CH T2, F-3).
 */
export function huecosParaOfrecer(
  huecos: readonly string[],
  turno: Pick<TurnoParaMover, "inicio" | "profesionalId">,
  profesionalId: string,
  ahora: Date,
): string[] {
  const propio = profesionalId === turno.profesionalId ? new Date(turno.inicio).getTime() : null;
  return huecos.filter((h) => {
    const ms = new Date(h).getTime();
    return ms > ahora.getTime() && ms !== propio;
  });
}

/** «¿Mover a jue 24 16:30 con Caro?» */
export function preguntaDeMover(d: Destino): string {
  return `¿Mover a ${fechaCorta(dateStrInBusinessTz(new Date(d.inicio)))} ${fmtTime(d.inicio)} con ${d.profesional}?`;
}
