// LA GRILLA DE LA AGENDA — qué horas, qué columnas, qué hueco se toca y a dónde lleva. PURO.
//
// Client-safe: sin Prisma ni servidor. Lo usan la planilla del día (`_agenda/PorProfesional.tsx`,
// la misma en la agenda nueva y en la de siempre vía `CalendarGrid.tsx`) y sus tests.
//
// Las horas se cuentan en MINUTOS DESDE LA MEDIANOCHE de pared del negocio (Buenos Aires), nunca en
// la hora del navegador de quien mira: una recepcionista con la compu en otra zona ve lo mismo.
//
// Historia: la grilla era fija de 9 a 19 h y un turno de las 8 o de las 20 no aparecía aunque
// existiera (UAT de CH, 18/10). Ahora se estira hasta cubrir todos los turnos del día; sin turnos
// raros, sigue siendo de 9 a 19 como siempre.

import { businessWallTimeToUtc, dateStrInBusinessTz, wallHourMinuteInBusinessTz } from "@/lib/datetime";
import type { TipoMarca } from "@/components/ui/Marca";
import { hrefTurnoEnHueco } from "./pasos";

export const HORA_DESDE = 9;
export const HORA_HASTA = 19;
/** Cada renglón de la grilla es media hora (el mismo paso con que el servidor ofrece horarios). */
export const PASO_MIN = 30;

/** Minutos desde la medianoche (hora de pared del negocio) de cada turno: inicio y fin. */
export interface TurnoEnMinutos {
  desde: number;
  hasta: number;
}

export function horasDeLaGrilla(turnos: readonly TurnoEnMinutos[]): { desde: number; hasta: number } {
  let desde = HORA_DESDE;
  let hasta = HORA_HASTA;
  for (const t of turnos) {
    desde = Math.min(desde, Math.floor(t.desde / 60));
    // Un turno que termina pasada la medianoche se corta a las 24 (la grilla es de un día).
    const fin = t.hasta < t.desde ? 24 * 60 : t.hasta;
    hasta = Math.max(hasta, Math.ceil(fin / 60));
  }
  return { desde: Math.max(0, desde), hasta: Math.min(24, hasta) };
}

/** Minutos desde la medianoche, en la hora de pared del negocio, de un instante ISO. */
export function minutosDelDia(iso: string | Date): number {
  const { hour, minute } = wallHourMinuteInBusinessTz(new Date(iso));
  return hour * 60 + minute;
}

/** 870 → «14:30». */
export function horaDeMinuto(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Inicio y fin de un turno en minutos del día (el fin, cortado a las 24 si cruza la medianoche). */
export function enMinutos(t: { inicio: string; fin: string }): TurnoEnMinutos {
  const desde = minutosDelDia(t.inicio);
  const hasta = minutosDelDia(t.fin);
  return { desde, hasta: hasta <= desde ? 24 * 60 : hasta };
}

// ── Columnas: por profesional o por box ──────────────────────────────────────

export type VerPor = "profesional" | "box";

/** `?por=box` en la URL; cualquier otra cosa, por profesional. */
export function leerVerPor(raw: string | null | undefined): VerPor {
  return raw === "box" ? "box" : "profesional";
}

export type ColumnaDeLaGrilla = {
  /** Lo que identifica la columna: el id de la profesional, o el nombre del box. */
  clave: string;
  titulo: string;
  /** Segunda línea del encabezado: el box de la profesional, o quiénes atienden en ese box. */
  detalle: string | null;
  /** Quiénes atienden en esta columna (por profesional: una sola). */
  profesionalIds: string[];
  /**
   * La profesional a la que se le da el turno al tocar un hueco de esta columna, si se sabe sin
   * dudar: por profesional, ella; por box, la única que atiende ahí (si son dos, el alta pregunta).
   */
  profesionalId: string | null;
};

export const SIN_BOX = "Sin box";

type ProfesionalDeLaGrilla = { id: string; nombre: string; box: string | null };

export function columnasDeLaGrilla(
  verPor: VerPor,
  profesionales: readonly ProfesionalDeLaGrilla[],
  turnos: readonly { box: string }[] = [],
): ColumnaDeLaGrilla[] {
  if (verPor === "profesional") {
    return profesionales.map((p) => ({ clave: p.id, titulo: p.nombre, detalle: p.box, profesionalIds: [p.id], profesionalId: p.id }));
  }
  const porBox = new Map<string, ProfesionalDeLaGrilla[]>();
  for (const p of profesionales) {
    if (!p.box) continue;
    porBox.set(p.box, [...(porBox.get(p.box) ?? []), p]);
  }
  // Un turno en un box que ya no tiene profesional asignada (o sin box) igual se ve: su columna va
  // al final, para que nada desaparezca de la grilla por un cambio del catálogo.
  const extras = [...new Set(turnos.map((t) => t.box || SIN_BOX))].filter((b) => !porBox.has(b)).sort((a, b) => a.localeCompare(b, "es"));
  return [
    ...[...porBox].map(([box, ps]) => ({
      clave: box,
      titulo: box,
      detalle: ps.map((p) => p.nombre).join(" · "),
      profesionalIds: ps.map((p) => p.id),
      profesionalId: ps.length === 1 ? ps[0].id : null,
    })),
    ...extras.map((box) => ({ clave: box, titulo: box, detalle: null, profesionalIds: [], profesionalId: null })),
  ];
}

/** En qué columna cae un turno. */
export function columnaDelTurno(verPor: VerPor, t: { profesionalId: string; box: string }): string {
  return verPor === "profesional" ? t.profesionalId : t.box || SIN_BOX;
}

// ── Superposiciones: carriles y choques ──────────────────────────────────────

type TurnoConHorario = { id: string; inicio: string; fin: string; estado: string };

const VIVO = new Set(["PENDING", "CONFIRMED"]);

/**
 * Cómo se reparten los turnos que se pisan dentro de UNA columna: cada uno con su carril y cuántos
 * carriles hay en su grupo (se dibujan uno al lado del otro, ninguno tapa a otro). Además, qué
 * turnos vivos (Reservado / Confirmado) se pisan con otro vivo: un CHOQUE (por box: dos camillas
 * en el mismo box a la misma hora), que se marca con forma + palabra.
 */
export function carrilesDeLaColumna(turnos: readonly TurnoConHorario[]): {
  carriles: Map<string, { carril: number; de: number }>;
  choques: Set<string>;
} {
  const orden = [...turnos].sort((a, b) => enMinutos(a).desde - enMinutos(b).desde || enMinutos(a).hasta - enMinutos(b).hasta);
  const carriles = new Map<string, { carril: number; de: number }>();
  const choques = new Set<string>();
  let grupo: { id: string; carril: number }[] = [];
  let finDelGrupo = -1;
  let finPorCarril: number[] = [];
  const cerrarGrupo = () => {
    const de = Math.max(1, finPorCarril.length);
    for (const g of grupo) carriles.set(g.id, { carril: g.carril, de });
    grupo = [];
    finPorCarril = [];
  };
  for (const t of orden) {
    const m = enMinutos(t);
    if (m.desde >= finDelGrupo) cerrarGrupo();
    let carril = finPorCarril.findIndex((fin) => fin <= m.desde);
    if (carril === -1) {
      carril = finPorCarril.length;
      finPorCarril.push(m.hasta);
    } else finPorCarril[carril] = m.hasta;
    grupo.push({ id: t.id, carril });
    finDelGrupo = Math.max(finDelGrupo, m.hasta);
  }
  cerrarGrupo();
  const vivos = orden.filter((t) => VIVO.has(t.estado));
  for (let i = 0; i < vivos.length; i++) {
    for (let j = i + 1; j < vivos.length; j++) {
      const a = enMinutos(vivos[i]);
      const b = enMinutos(vivos[j]);
      if (b.desde >= a.hasta) continue;
      if (a.desde < b.hasta) {
        choques.add(vivos[i].id);
        choques.add(vivos[j].id);
      }
    }
  }
  return { carriles, choques };
}

// ── Los huecos: qué celda se toca para dar un turno ──────────────────────────

export type BloqueoDelDia = {
  profesionalId: string;
  desde: string;
  hasta: string;
  motivo: string;
  /** `horario`: fuera del horario de trabajo (WorkingHours), no una ausencia cargada. */
  tipo?: "ausencia" | "horario";
};

/** El horario de trabajo de una profesional ESE día (una fila de WorkingHours), hora de pared. */
export type HorarioDelDia = { profesionalId: string; desde: string; hasta: string };

/** Lo que dice la celda / la cabecera cuando la profesional no trabaja (provisional a confirmar). */
export const FUERA_DE_HORARIO = "fuera de horario";
export const NO_TRABAJA_ESE_DIA = "no trabaja ese día";

const HORA_DE_PARED = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * El horario de trabajo como bloqueos de la grilla: antes de que entre y después de que se va, la
 * celda no es hueco («fuera de horario»); quien no tiene horario ese día, el día entero («no trabaja
 * ese día») — la misma regla que el motor de turnos (sin fila de WorkingHours para ese día, no hay
 * horarios). `horarios === null` = no se pudo leer: no se marca nada (el alta igual valida).
 */
export function bloqueosPorHorario(dia: string, profesionalIds: readonly string[], horarios: readonly HorarioDelDia[] | null): BloqueoDelDia[] {
  if (!horarios || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return [];
  const inicioDelDia = businessWallTimeToUtc(dia, "00:00").toISOString();
  const finDelDia = businessWallTimeToUtc(diaSiguiente(dia), "00:00").toISOString();
  const out: BloqueoDelDia[] = [];
  for (const id of profesionalIds) {
    const h = horarios.find((x) => x.profesionalId === id);
    if (!h || !HORA_DE_PARED.test(h.desde) || !HORA_DE_PARED.test(h.hasta) || h.desde >= h.hasta) {
      out.push({ profesionalId: id, desde: inicioDelDia, hasta: finDelDia, motivo: NO_TRABAJA_ESE_DIA, tipo: "horario" });
      continue;
    }
    if (h.desde > "00:00") out.push({ profesionalId: id, desde: inicioDelDia, hasta: businessWallTimeToUtc(dia, h.desde).toISOString(), motivo: FUERA_DE_HORARIO, tipo: "horario" });
    out.push({ profesionalId: id, desde: businessWallTimeToUtc(dia, h.hasta).toISOString(), hasta: finDelDia, motivo: FUERA_DE_HORARIO, tipo: "horario" });
  }
  return out;
}

function diaSiguiente(dia: string): string {
  const d = new Date(`${dia}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Lo que dice la cabecera de una columna de una sola profesional: la ausencia cargada (franco,
 * médico) o, si no trabaja ese día, eso. Fuera de horario a la mañana o a la noche no se dice ahí.
 */
export function ausenciaDeLaColumna(profesionalIds: readonly string[], bloqueos: readonly BloqueoDelDia[]): BloqueoDelDia | undefined {
  if (profesionalIds.length !== 1) return undefined;
  const id = profesionalIds[0];
  return (
    bloqueos.find((b) => b.profesionalId === id && b.tipo !== "horario") ??
    bloqueos.find((b) => b.profesionalId === id && b.tipo === "horario" && b.motivo === NO_TRABAJA_ESE_DIA)
  );
}

/**
 * Los bloqueos (franco, médico, vacaciones) que trae el loader del día, en la forma de la grilla.
 * La agenda de muestra no los trae con horario: se descartan sin romper.
 */
export function bloqueosDelDia(
  crudos: readonly { professionalId?: string; startsAt?: Date | string; endsAt?: Date | string; reason: string }[],
): BloqueoDelDia[] {
  const out: BloqueoDelDia[] = [];
  for (const b of crudos) {
    if (!b.professionalId || !b.startsAt || !b.endsAt) continue;
    out.push({ profesionalId: b.professionalId, desde: new Date(b.startsAt).toISOString(), hasta: new Date(b.endsAt).toISOString(), motivo: b.reason });
  }
  return out;
}

/** Qué es una celda de la grilla (una media hora de una columna). */
export type EstadoDeLaCelda =
  | { tipo: "hueco"; href: string; etiqueta: string }
  | { tipo: "ocupada" }
  | { tipo: "bloqueada"; motivo: string }
  | { tipo: "pasada" }
  | { tipo: "sin-permiso" };

/**
 * ¿Qué es la celda [minuto, minuto + 30) de una columna? Un HUECO (se toca y abre «Dar turno» con
 * la profesional, el día y la hora puestos) sólo si: quien mira da turnos, el día no pasó, la
 * media hora todavía no empezó, ningún turno la pisa y la profesional no está bloqueada.
 *
 * El horario de trabajo entra como bloqueos (`bloqueosPorHorario`, una lectura por día en la agenda):
 * fuera de su horario la celda no se ofrece. El alta igual lo re-valida al buscar horarios.
 */
export function estadoDeLaCelda(input: {
  dia: string;
  hoy: string;
  /** Minutos del día de «ahora» (sólo cuenta si `dia === hoy`). */
  ahoraMin: number;
  minuto: number;
  columna: ColumnaDeLaGrilla;
  /** Los turnos de ESTA columna, en minutos. */
  ocupados: readonly TurnoEnMinutos[];
  bloqueos: readonly BloqueoDelDia[];
  puedeDarTurno: boolean;
  nombreDe?: (profesionalId: string) => string | undefined;
}): EstadoDeLaCelda {
  const { dia, hoy, ahoraMin, minuto, columna, ocupados, bloqueos, puedeDarTurno } = input;
  const fin = minuto + PASO_MIN;
  if (ocupados.some((t) => t.desde < fin && t.hasta > minuto)) return { tipo: "ocupada" };
  // Bloqueada si TODAS las que atienden en la columna están bloqueadas en esa media hora (por
  // profesional es una sola; por box con dos, el box sigue sirviendo si una atiende).
  const bloqueosDeLaCelda = columna.profesionalIds.map((id) => bloqueos.find((b) => b.profesionalId === id && cubre(b, minuto, fin, dia)));
  const bloqueo = bloqueosDeLaCelda.length > 0 && bloqueosDeLaCelda.every(Boolean) ? bloqueosDeLaCelda[0] : undefined;
  if (bloqueo) return { tipo: "bloqueada", motivo: bloqueo.motivo };
  if (!puedeDarTurno) return { tipo: "sin-permiso" };
  if (dia < hoy || (dia === hoy && minuto <= ahoraMin)) return { tipo: "pasada" };
  const hora = horaDeMinuto(minuto);
  const nombre = columna.profesionalId ? (input.nombreDe?.(columna.profesionalId) ?? columna.titulo) : null;
  return {
    tipo: "hueco",
    href: hrefNuevoTurnoEnHueco(dia, columna.profesionalId, minuto),
    etiqueta: nombre ? `Dar un turno a las ${hora} con ${nombre}` : `Dar un turno a las ${hora} en ${columna.titulo}`,
  };
}

/** ¿El bloqueo pisa la media hora [desde, hasta) de ese día? (un bloqueo de varios días también). */
function cubre(b: BloqueoDelDia, desde: number, hasta: number, dia: string): boolean {
  const diaDesde = diaDe(b.desde);
  const diaHasta = diaDe(b.hasta);
  const ini = diaDesde < dia ? 0 : diaDesde > dia ? 24 * 60 : minutosDelDia(b.desde);
  const fin = diaHasta > dia ? 24 * 60 : diaHasta < dia ? 0 : minutosDelDia(b.hasta);
  return ini < hasta && fin > desde;
}

const diaDe = (iso: string) => dateStrInBusinessTz(new Date(iso));

/**
 * El enlace de un hueco: «Dar turno» con el día, la profesional y la hora puestos. Es
 * `hrefTurnoEnHueco` (pasos.ts, el contrato con el alta que lee `leerHuecoDelAlta`) con la hora
 * sacada del minuto de la celda (hora de pared del negocio, 24 h, múltiplo de 30).
 */
export function hrefNuevoTurnoEnHueco(dia: string, profesionalId: string | null, minuto: number): string {
  const hora = Number.isInteger(minuto) && minuto >= 0 && minuto < 24 * 60 ? horaDeMinuto(minuto) : null;
  return hrefTurnoEnHueco(dia, profesionalId, hora);
}

// ── La raya de «ahora» ───────────────────────────────────────────────────────

/** Cuántos minutos después del comienzo de la grilla va la raya de «ahora» (sólo hoy y dentro del tramo). */
export function rayaDeAhora(input: { dia: string; hoy: string; ahoraMin: number; desde: number; hasta: number }): number | null {
  const { dia, hoy, ahoraMin, desde, hasta } = input;
  if (dia !== hoy || ahoraMin < desde || ahoraMin >= hasta) return null;
  return ahoraMin - desde;
}

// ── La leyenda: los cinco estados, con forma + palabra (como se ven en la grilla) ──

export const LEYENDA_DE_LA_GRILLA: readonly { tipo: TipoMarca; palabra: string }[] = [
  { tipo: "pendiente", palabra: "Reservado" },
  { tipo: "hecho", palabra: "Confirmado o terminado" },
  { tipo: "medias", palabra: "En su horario" },
  { tipo: "atencion", palabra: "Sin cerrar o ya pasó la hora" },
  { tipo: "anulado", palabra: "No vino o cancelado" },
];
