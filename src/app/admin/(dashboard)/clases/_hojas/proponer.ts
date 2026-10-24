// Lo puro de las hojas (Cancelar, Se suspende, Editar): qué clases caen en lo que se suspende, los
// chips de motivo, elegir hasta 3 horarios para ofrecer, si una duración nueva pisa la clase de al
// lado y cómo se dice cada propuesta. Lo prueba proponer.test.ts.

import { businessWallTimeToUtc } from "@/lib/datetime";
import { diaHoraCorta, horaHumana, type MotivoCancel } from "@/lib/padel/core";

export type ClaseDelDia = { id: string; nombre: string; empiezaEn: Date | string; terminaEn: Date | string; estado: string };

const VIVAS = ["PEDIDA", "CONFIRMADA"];

/**
 * Las clases que se suspenden: pedidas o confirmadas que todavía no empezaron y que se cruzan con
 * la ventana `desde`–`hasta` (hora de pared) de ese día. La misma regla que el servidor
 * (clasesAfectadas en lib/padel/acciones.ts), para mostrar «6 clases afectadas» ANTES de tocar nada.
 */
export function afectadasEnVentana<C extends ClaseDelDia>(clases: readonly C[], fecha: string, desde: string, hasta: string, ahora: Date): C[] {
  const ini = businessWallTimeToUtc(fecha, desde || "00:00").getTime();
  const fin = businessWallTimeToUtc(fecha, hasta || "23:59").getTime();
  return clases
    .filter((c) => VIVAS.includes(c.estado))
    .filter((c) => {
      const e = new Date(c.empiezaEn).getTime();
      const t = new Date(c.terminaEn).getTime();
      return e >= ahora.getTime() && e < fin && t > ini;
    })
    .sort((a, b) => new Date(a.empiezaEn).getTime() - new Date(b.empiezaEn).getTime());
}

/** Los chips de «¿Por qué la cancelás?», en la voz del profe. */
export const MOTIVOS_CHIP: readonly { valor: MotivoCancel; etiqueta: string }[] = [
  { valor: "LLUVIA", etiqueta: "Lluvia" },
  { valor: "ENFERMEDAD", etiqueta: "Me enfermé" },
  { valor: "CLUB_CERRADO", etiqueta: "Club cerrado" },
  { valor: "ALUMNO_AVISO", etiqueta: "El alumno avisó" },
  { valor: "OTRO", etiqueta: "Otro" },
];

/** Los motivos de «Se suspende» (lo que suspende el día entero no es «me enfermé»). */
export const MOTIVOS_SUSPENDER: readonly { valor: MotivoCancel; etiqueta: string }[] = [
  { valor: "LLUVIA", etiqueta: "🌧 Lluvia" },
  { valor: "CLUB_CERRADO", etiqueta: "Club cerrado" },
  { valor: "ENFERMEDAD", etiqueta: "Me enfermé" },
  { valor: "OTRO", etiqueta: "Otro" },
];

/** Prender o apagar un horario para ofrecer; como mucho `max` (3), en orden de hora. */
export function alternarHorario(elegidos: readonly string[], iso: string, max = 3): string[] {
  if (elegidos.includes(iso)) return elegidos.filter((x) => x !== iso);
  if (elegidos.length >= max) return [...elegidos];
  return [...elegidos, iso].sort();
}

const OCUPAN = ["PEDIDA", "CONFIRMADA", "DADA"];

/**
 * Con la duración nueva, ¿pisa otra clase del día? Devuelve la primera que pisa (para decir «pisa
 * la de las 19:00 de Ana») o null. Bordes estrictos, como el servidor: 18–19 y 19–20 no se pisan.
 */
export function pisaOtra<C extends ClaseDelDia>(
  clase: { id: string; empiezaEn: Date | string },
  duracionMin: number,
  otras: readonly C[],
): C | null {
  const ini = new Date(clase.empiezaEn).getTime();
  const fin = ini + duracionMin * 60_000;
  return (
    [...otras]
      .filter((o) => o.id !== clase.id && OCUPAN.includes(o.estado))
      .sort((a, b) => new Date(a.empiezaEn).getTime() - new Date(b.empiezaEn).getTime())
      .find((o) => new Date(o.empiezaEn).getTime() < fin && new Date(o.terminaEn).getTime() > ini) ?? null
  );
}

/** «17:00 Lucía → vie 24/10 18:00», o «17:00 Lucía · no hay hueco» para moverla a mano. */
export function textoPropuesta(p: { nombre: string; desde: string; propuesta: string | null }): string {
  const de = `${horaHumana(new Date(p.desde))} ${p.nombre.trim().split(/\s+/)[0] || ""}`.trim();
  return p.propuesta ? `${de} → ${diaHoraCorta(new Date(p.propuesta))}` : `${de} · no hay hueco cerca`;
}

/** «Desde las 18:00» → la ventana que se suspende; «Todo el día» → 00:00–23:59. */
export function ventanaDeSuspension(modo: "todo" | "desde", desdeHora: string): { desde: string; hasta: string } {
  return modo === "desde" && /^([01]\d|2[0-3]):[0-5]\d$/.test(desdeHora) ? { desde: desdeHora, hasta: "23:59" } : { desde: "00:00", hasta: "23:59" };
}
