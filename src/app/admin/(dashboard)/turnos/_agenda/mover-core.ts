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
//   · agenda interactiva (T2): `veredictoDeDuracion` (estirar), `destinoPorTeclado` (M + flechas),
//     `finEstirado` y `textoMovido` (el aviso de 8 s).
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

// ── Agenda interactiva (AGENDA-INTERACCION.md §2.2 y §2.3, T2; sólo con `permisos.interaccion`) ──

/** Paso del estiramiento (minutos): manija y Shift+flechas. El servidor exige el mismo. */
export const PASO_DURACION_MIN = 15;
const MIN_MS = 60_000;

/** Un turno de la misma profesional, para anticipar con quién se pisa al estirar. */
export type TurnoVecino = { id: string; inicio: string; fin: string; estado: string; clienta: string };

export type VeredictoDeDuracion = { tipo: "ok" } | { tipo: "igual" } | { tipo: "no"; motivo: string };

/**
 * El fin del turno después de estirarlo `pasos` de 15' (negativos acortan), con la duración en
 * pasos de 15' contados desde el inicio, nunca menos de 15' ni más allá de `tope` (fin del día de
 * la grilla). Con 0 pasos, el fin de siempre (aunque no sea múltiplo: no se toca lo que no se movió).
 */
export function finEstirado(inicio: string, fin: string, pasos: number, tope: string | null): string {
  if (pasos === 0) return fin;
  const desde = new Date(inicio).getTime();
  const paso = PASO_DURACION_MIN * MIN_MS;
  let duracion = Math.round((new Date(fin).getTime() - desde) / paso) * paso + pasos * paso;
  if (tope !== null) duracion = Math.min(duracion, Math.floor((new Date(tope).getTime() - desde) / paso) * paso);
  return new Date(desde + Math.max(paso, duracion)).toISOString();
}

/**
 * ¿Se puede dejar `turno` terminando en `finNuevo`? Lo anticipa la pantalla con lo que ve; la
 * verdad es `cambiarDuracionDelTurno` (src/lib/turnos/duracion-actions.ts), con la misma regla:
 *   · `vecinos`: los otros turnos de la misma profesional ese día (los no vivos no cuentan).
 *   · `tope`: el fin del día de la grilla (ISO); null = sin tope.
 *   · `margenMin`: el margen de limpieza entre turnos (`BUFFER_MIN`, el mismo del servidor).
 */
export function veredictoDeDuracion(input: {
  turno: Pick<TurnoParaMover, "id" | "inicio" | "estado"> & { fin: string };
  finNuevo: string;
  vecinos: readonly TurnoVecino[];
  tope: string | null;
  margenMin?: number;
  /** Si se pasa, un turno que ya empezó no se estira (el mismo criterio del servidor). */
  ahora?: Date;
}): VeredictoDeDuracion {
  const { turno, finNuevo, vecinos, tope, margenMin = 0, ahora } = input;
  const desde = new Date(turno.inicio).getTime();
  const hasta = new Date(finNuevo).getTime();
  if (hasta === new Date(turno.fin).getTime()) return { tipo: "igual" };
  if (!sePuedeMover(turno)) return { tipo: "no", motivo: "Sólo se cambia la duración de un turno reservado o confirmado." };
  if (ahora && desde <= ahora.getTime()) return { tipo: "no", motivo: "Ese turno ya empezó: no se le cambia la duración desde la agenda." };
  const minutos = (hasta - desde) / MIN_MS;
  if (minutos < PASO_DURACION_MIN) return { tipo: "no", motivo: `Lo mínimo es ${PASO_DURACION_MIN} minutos.` };
  if (minutos % PASO_DURACION_MIN !== 0) return { tipo: "no", motivo: `La duración va de a ${PASO_DURACION_MIN} minutos.` };
  if (tope !== null && hasta > new Date(tope).getTime()) return { tipo: "no", motivo: `No puede terminar después de las ${fmtTime(tope)}.` };
  const margen = margenMin * MIN_MS;
  const pisa = vecinos
    .filter((v) => v.id !== turno.id && sePuedeMover(v))
    .filter((v) => new Date(v.inicio).getTime() < hasta + margen && new Date(v.fin).getTime() > desde - margen)
    .sort((x, y) => new Date(x.inicio).getTime() - new Date(y.inicio).getTime())[0];
  if (pisa) return { tipo: "no", motivo: `Se pisa con ${pisa.clienta} a las ${fmtTime(pisa.inicio)}.` };
  return { tipo: "ok" };
}

export type TeclaDeMover = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

/**
 * Mover con el teclado (turno «levantado» con M): ↑↓ corren `paso` minutos (la media hora de la
 * grilla), ←→ cambian de columna. Nunca se sale de la grilla: arriba hasta `desde`, abajo hasta que
 * el turno entero quepa antes de `hasta`, de costado entre la primera y la última columna.
 */
export function destinoPorTeclado(input: {
  minuto: number;
  columna: number;
  tecla: TeclaDeMover;
  columnas: number;
  desde: number;
  hasta: number;
  duracionMin: number;
  paso: number;
}): { minuto: number; columna: number } {
  const { minuto, columna, tecla, columnas, desde, hasta, duracionMin, paso } = input;
  const ultimo = Math.max(desde, hasta - Math.max(paso, duracionMin));
  const acotar = (m: number) => Math.min(ultimo, Math.max(desde, m));
  const acotarColumna = (c: number) => Math.min(Math.max(0, columnas - 1), Math.max(0, c));
  if (tecla === "ArrowUp") return { minuto: acotar(minuto - paso), columna };
  if (tecla === "ArrowDown") return { minuto: acotar(minuto + paso), columna };
  if (tecla === "ArrowLeft") return { minuto, columna: acotarColumna(columna - 1) };
  return { minuto, columna: acotarColumna(columna + 1) };
}

/** «Movido a 17:00 con Caro» — el aviso de 8 s después de soltar. */
export function textoMovido(d: Destino, diaDeLaGrilla: string): string {
  const dia = dateStrInBusinessTz(new Date(d.inicio));
  return `Movido a ${dia === diaDeLaGrilla ? "" : `${fechaCorta(dia)} `}${fmtTime(d.inicio)} con ${d.profesional}`;
}

/** Lo que dice la manija mientras se estira: «10:00–11:15 · 1 h 15'». */
export function rotuloDeDuracion(inicio: string, fin: string): string {
  const minutos = Math.round((new Date(fin).getTime() - new Date(inicio).getTime()) / MIN_MS);
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  const cuanto = h === 0 ? `${m}'` : m === 0 ? `${h} h` : `${h} h ${m}'`;
  return `${fmtTime(inicio)}–${fmtTime(fin)} · ${cuanto}`;
}
