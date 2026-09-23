// ============================================================================
// TURNO ABIERTO — las reglas de mostrador sobre turnos que todavía no se cerraron. PURO.
// ============================================================================
//
// "Abierto" es un turno que sigue vivo en la agenda: Reservado (PENDING) o Confirmado
// (CONFIRMED). Un turno así cuya hora ya pasó es una de dos cosas, y las dos pasaban en
// silencio: una clienta atendida a la que no se le cobró el saldo (el turno nunca se
// completó) o una ausencia que nadie marcó. Ninguna pantalla lo mostraba: la lista lo
// tiraba en el Historial y el cierre de caja sólo mira el libro. Además la tasa de no-show
// de Reportes cuenta sólo turnos resueltos, así que el turno olvidado tampoco aparece ahí.
//
// Acá viven, sin DB ni tenant, las decisiones que usan la lista de turnos, el cierre de caja
// y la sección "Mañana: confirmar", para poder probarlas con reloj fijo
// (turno-abierto.test.ts). Hoy lo importan sólo módulos de servidor (lista/page.tsx,
// actions.ts, cierre-diario-actions.ts, notifications.ts y cron/reminder-sweep.ts); no importa
// Prisma ni nada de servidor, así que un componente cliente podría usarlo sin romper el build.
//
// También vive acá la regla del recordatorio ("¿cuenta como avisada?" y el texto que se le
// manda), porque es la otra cara del mismo turno abierto: el que hay que confirmar mañana.

import { businessWallTimeToUtc, dateStrInBusinessTz, fmtDateTime } from "@/lib/datetime";

type TurnoConHora = { status: string; startsAt: Date | string };

/** Reservado o Confirmado: el turno sigue vivo y alguien tiene que cerrarlo. */
export function estaAbierto(status: string): boolean {
  return status === "PENDING" || status === "CONFIRMED";
}

/**
 * ¿Este turno sigue abierto aunque su hora ya pasó?
 *
 * Se mira el INICIO y no el fin a propósito: es el mismo borde que usa el servidor para
 * dejar completar un turno (`puedeCompletarse`, startsAt <= ahora). Desde ese minuto el
 * turno ya se puede cerrar, así que desde ese minuto cuenta como pendiente de cierre.
 */
export function turnoAbiertoConHoraPasada(t: TurnoConHora, ahora: Date): boolean {
  if (!estaAbierto(t.status)) return false;
  const inicio = new Date(t.startsAt).getTime();
  return Number.isFinite(inicio) && inicio < ahora.getTime();
}

/**
 * Los turnos abiertos con hora pasada del DÍA `day` (YYYY-MM-DD en la zona del negocio),
 * ordenados por hora.
 *
 * Es el `day` que se está cerrando en la caja, no "hoy": el cierre acepta días anteriores, y
 * cerrar el martes tiene que avisar de los turnos del martes aunque se cierre el miércoles.
 * Un día futuro no devuelve nada (ningún turno suyo tiene la hora pasada).
 */
export function turnosSinCerrarDelDia<T extends TurnoConHora>(turnos: readonly T[], day: string, ahora: Date): T[] {
  return turnos
    .filter((t) => dateStrInBusinessTz(new Date(t.startsAt)) === day && turnoAbiertoConHoraPasada(t, ahora))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

export type SeccionLista = "sin-cerrar" | "a-confirmar" | "historial";

/**
 * En qué sección de /admin/turnos/lista cae un turno.
 *
 * Antes había una sola, "Reservados, pendientes de confirmar", que mezclaba el Reservado de
 * la semana que viene con el de ayer que nadie cerró, y los Confirmados de ayer se iban al
 * Historial como si estuvieran resueltos. Se PARTE en dos, sin sumar una tercera lista:
 *   - "sin-cerrar": abiertos con la hora pasada (Reservados y Confirmados) → completar,
 *     cobrar o marcar ausencia;
 *   - "a-confirmar": Reservados que todavía no llegaron;
 *   - el resto (Confirmados futuros y los ya resueltos) queda en el Historial como antes.
 */
export function seccionDeLista(t: TurnoConHora, ahora: Date): SeccionLista {
  if (turnoAbiertoConHoraPasada(t, ahora)) return "sin-cerrar";
  if (t.status === "PENDING") return "a-confirmar";
  return "historial";
}

/** "YYYY-MM-DD" del día siguiente, estable ante zonas (se ancla al mediodía UTC). */
export function diaSiguiente(day: string): string {
  const d = new Date(`${day}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Bordes UTC del día `day` del NEGOCIO: `[desde, hasta)`. "Mañana" es mañana en Buenos Aires,
 * no en el servidor: en Vercel (UTC) el día del servidor arranca a las 21:00 de acá, y los
 * turnos de la noche quedarían en el día equivocado.
 */
export function rangoDelDia(day: string): { desde: Date; hasta: Date } {
  return {
    desde: businessWallTimeToUtc(day, "00:00"),
    hasta: businessWallTimeToUtc(diaSiguiente(day), "00:00"),
  };
}

// ── Recordatorio: ¿cuenta como avisada? ───────────────────────────────────────
//
// El barrido del cron estampaba `reminderSentAt` después de llamar a los canales, sin mirar
// qué contestaron. Con el WhatsApp simulado (devuelve `sent:false` sin tirar error) y sin
// RESEND_API_KEY, el turno quedaba marcado como avisado sin que saliera nada, y además ya no
// volvía a entrar en ningún barrido. La regla ahora es una sola: se estampa si ALGÚN canal
// dijo que mandó.

export type ResultadoCanal = { sent: boolean; channel?: string; reason?: string };

export function debeEstamparRecordatorio(resultados: Readonly<Record<string, ResultadoCanal>>): boolean {
  return Object.values(resultados).some((r) => r.sent === true);
}

/** Por qué no salió por ningún canal, en una línea para el log del cron. */
export function motivoSinEnvio(resultados: Readonly<Record<string, ResultadoCanal>>): string {
  const partes = Object.entries(resultados).map(([canal, r]) => `${r.channel ?? canal}: ${r.reason ?? "no enviado"}`);
  return `ningún canal envió el recordatorio (${partes.join("; ")})`;
}

// ── Recordatorio: el texto ────────────────────────────────────────────────────

export const PLANTILLA_RECORDATORIO_POR_DEFECTO =
  "Hola {{clientName}}, te esperamos {{startsAt}} para {{serviceName}} con {{professionalName}}.";

export type DatosRecordatorio = {
  clientName: string;
  serviceName: string;
  professionalName: string;
  startsAt: Date | string;
};

/** Reemplaza `{{clave}}` por su valor; una clave que no existe queda vacía. */
export function interpolarPlantilla(plantilla: string, vars: Record<string, string>): string {
  return plantilla.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

/**
 * El texto del recordatorio, con la plantilla del panel (o la de siempre si no hay) y la
 * hora en la zona del NEGOCIO. Medido en este contenedor (TZ=UTC): el formateo sin zona que
 * usaba notifications.ts escribía un turno de las 16:00 de Buenos Aires como "7:00 p. m.";
 * con `fmtDateTime` sale "jueves, 24 de septiembre de 2026, 16:00".
 */
export function textoRecordatorio(plantilla: string | null | undefined, datos: DatosRecordatorio): string {
  return interpolarPlantilla(plantilla || PLANTILLA_RECORDATORIO_POR_DEFECTO, {
    clientName: datos.clientName,
    serviceName: datos.serviceName,
    professionalName: datos.professionalName,
    startsAt: fmtDateTime(datos.startsAt),
  });
}
