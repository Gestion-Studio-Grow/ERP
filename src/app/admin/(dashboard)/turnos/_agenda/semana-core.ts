// ============================================================================
// LA SEMANA — ocupación por profesional y huecos de 30′ o más. PURO (sin base ni render).
// ============================================================================
//
// Reingeniería CH, Tanda 3 (§2.2 «Semana», CH-036). Una fila por profesional, una columna por día
// (lunes a sábado; el domingo sólo si alguien trabaja o tiene turnos ese día), y en cada celda:
//
//   · % de OCUPACIÓN = minutos con turno ÷ minutos de trabajo. Los minutos de trabajo salen del
//     horario de ese día (`WorkingHours`) MENOS los bloqueos (franco, médico, vacaciones). El horario
//     entra con la MISMA regla que la grilla del día (`bloqueosPorHorario`, turnos/grilla.ts): fuera
//     de horario no es tiempo disponible, y quien no tiene fila ese día «no trabaja ese día». Un
//     turno fuera de horario no empuja la ocupación por encima del 100 %.
//   · HUECOS de 30′ o más que todavía se pueden dar (de un día pasado, ninguno; de hoy, desde ahora).
//   · tocar la celda → «Dar turno» con esa profesional y ese día (`hrefTurnoEnHueco`, el contrato
//     del alta); tocar el día → la agenda de ese día.
//
// Qué cuenta como ocupado: todo turno que no se canceló (el loader ya no trae los cancelados). Un
// «no vino» de un día pasado ocupó el lugar: cuenta (provisional a confirmar con la dueña).
//
// Las horas son de PARED del negocio (minutos desde la medianoche, como la grilla), nunca las del
// navegador. Lo prueba semana-core.test.ts.

import { dateStrInBusinessTz } from "@/lib/datetime";
import { bloqueosPorHorario, enMinutos, minutosDelDia, NO_TRABAJA_ESE_DIA, type BloqueoDelDia, type HorarioDelDia } from "../grilla";
import { hrefDiaDeLaAgenda, hrefTurnoEnHueco, esFechaDeCalendario } from "../pasos";

/** Un hueco que vale la pena ofrecer: entra el servicio típico de depilación (provisional). */
export const HUECO_MINIMO_MIN = 30;

const DIA_MIN = 24 * 60;

// ── Lo que trae el loader (src/lib/turnos/agenda-rango.server.ts) ─────────────

export type ProfesionalDeLaSemana = { id: string; nombre: string; box: string | null };

export type TurnoDeLaSemana = {
  id: string;
  profesionalId: string;
  /** ISO. */
  inicio: string;
  fin: string;
  estado: string;
  /** El precio congelado del turno (o el del servicio, si no tiene). */
  precio: number;
};

/** Una fila de `WorkingHours`: el horario de un día de la semana (0 = domingo … 6 = sábado). */
export type HorarioSemanal = { profesionalId: string; diaSemana: number; desde: string; hasta: string };

export type AgendaDeLaSemana = {
  /** El lunes de la semana (AAAA-MM-DD). */
  lunes: string;
  profesionales: ProfesionalDeLaSemana[];
  turnos: TurnoDeLaSemana[];
  /** Ausencias cargadas (franco, médico) que tocan la semana, en la forma de la grilla. */
  ausencias: BloqueoDelDia[];
  /** `null` = no se pudo leer el horario (demo): no se calcula ocupación, se dice «—». */
  horarios: HorarioSemanal[] | null;
};

// ── Días ─────────────────────────────────────────────────────────────────────

const alMediodia = (dia: string) => new Date(`${dia}T12:00:00.000Z`);

/** Suma días a una fecha de calendario (anclada al mediodía UTC: nunca cruza la medianoche). */
export function masDias(dia: string, n: number): string {
  const d = alMediodia(dia);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado. */
export function diaDeLaSemana(dia: string): number {
  return alMediodia(dia).getUTCDay();
}

/** El lunes de la semana de `dia` (el domingo es el último día de su semana, como en el mostrador). */
export function lunesDe(dia: string): string {
  return masDias(dia, -((diaDeLaSemana(dia) + 6) % 7));
}

/** `?desde=` de la URL: cualquier día válido lleva a SU lunes; lo raro, a esta semana. */
export function leerSemana(raw: string | string[] | null | undefined, hoy: string): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return lunesDe(esFechaDeCalendario(v) ? v : hoy);
}

const CORTO = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", weekday: "short", day: "numeric" });
const LARGO = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", weekday: "long", day: "numeric" });
const MES = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", month: "long" });

/** «lun 20». */
export function tituloCorto(dia: string): string {
  return CORTO.format(alMediodia(dia)).replace(".", "").replace(",", "");
}

/** «lunes 20» (para el lector de pantalla). */
export function tituloLargo(dia: string): string {
  return LARGO.format(alMediodia(dia)).replace(",", "");
}

/** «Semana del 20 al 25 de octubre» · «Semana del 27 de octubre al 1 de noviembre». */
export function tituloDeLaSemana(dias: readonly string[]): string {
  if (dias.length === 0) return "Semana";
  const a = dias[0];
  const b = dias[dias.length - 1];
  const dA = Number(a.slice(8, 10));
  const dB = Number(b.slice(8, 10));
  const mA = MES.format(alMediodia(a));
  const mB = MES.format(alMediodia(b));
  return mA === mB ? `Semana del ${dA} al ${dB} de ${mB}` : `Semana del ${dA} de ${mA} al ${dB} de ${mB}`;
}

/**
 * Los días que se muestran: lunes a sábado, y el domingo sólo si alguien trabaja ese día (tiene
 * horario) o hay turnos. Un negocio que no abre los domingos no ve una columna vacía.
 */
export function diasDeLaSemana(agenda: Pick<AgendaDeLaSemana, "lunes" | "turnos" | "horarios">): string[] {
  const dias = Array.from({ length: 6 }, (_, i) => masDias(agenda.lunes, i));
  const domingo = masDias(agenda.lunes, 6);
  const trabajaDomingo = (agenda.horarios ?? []).some((h) => h.diaSemana === 0);
  const turnosDomingo = agenda.turnos.some((t) => dateStrInBusinessTz(new Date(t.inicio)) === domingo);
  return trabajaDomingo || turnosDomingo ? [...dias, domingo] : dias;
}

// ── Tramos (minutos del día, [desde, hasta)) ─────────────────────────────────

export type Tramo = { desde: number; hasta: number };

/** Une tramos que se pisan o se tocan. */
export function unir(tramos: readonly Tramo[]): Tramo[] {
  const ordenados = tramos.filter((t) => t.hasta > t.desde).sort((a, b) => a.desde - b.desde);
  const out: Tramo[] = [];
  for (const t of ordenados) {
    const ultimo = out[out.length - 1];
    if (ultimo && t.desde <= ultimo.hasta) ultimo.hasta = Math.max(ultimo.hasta, t.hasta);
    else out.push({ ...t });
  }
  return out;
}

/** `base` menos `quitar`. */
export function restar(base: readonly Tramo[], quitar: readonly Tramo[]): Tramo[] {
  let out = unir(base);
  for (const q of unir(quitar)) {
    out = out.flatMap((t) => {
      if (q.hasta <= t.desde || q.desde >= t.hasta) return [t];
      const partes: Tramo[] = [];
      if (q.desde > t.desde) partes.push({ desde: t.desde, hasta: q.desde });
      if (q.hasta < t.hasta) partes.push({ desde: q.hasta, hasta: t.hasta });
      return partes;
    });
  }
  return out;
}

const largo = (tramos: readonly Tramo[]) => tramos.reduce((s, t) => s + (t.hasta - t.desde), 0);

/** Minutos de `a` que también están en `b`. */
function minutosEnComun(a: readonly Tramo[], b: readonly Tramo[]): number {
  return largo(a) - largo(restar(a, b));
}

/** La parte de un bloqueo (que puede durar varios días) que cae en `dia`, en minutos de pared. */
function tramoDelBloqueo(b: Pick<BloqueoDelDia, "desde" | "hasta">, dia: string): Tramo | null {
  const diaDesde = dateStrInBusinessTz(new Date(b.desde));
  const diaHasta = dateStrInBusinessTz(new Date(b.hasta));
  if (diaHasta < dia || diaDesde > dia) return null;
  const desde = diaDesde < dia ? 0 : minutosDelDia(b.desde);
  const hasta = diaHasta > dia ? DIA_MIN : minutosDelDia(b.hasta);
  return hasta > desde ? { desde, hasta } : null;
}

// ── Una celda: una profesional, un día ───────────────────────────────────────

export type CeldaDeLaSemana = {
  dia: string;
  profesionalId: string;
  /** Minutos de trabajo del día (horario − bloqueos). `null` = no se sabe (sin horario leído). */
  minutosDeTrabajo: number | null;
  minutosOcupados: number;
  /** 0-100, o `null` si no trabaja ese día o no se sabe. */
  porcentaje: number | null;
  /** Huecos de 30′ o más que todavía se pueden dar. */
  huecos: Tramo[];
  turnos: number;
  /** Por qué no trabaja: la ausencia cargada («médico») o «no trabaja ese día». */
  motivo: string | null;
  /** «Dar turno» con la profesional y el día; `null` si no se ofrece. */
  hrefDarTurno: string | null;
};

export type Contexto = {
  hoy: string;
  /** Minutos de pared de «ahora» (cuenta sólo para hoy). */
  ahoraMin: number;
  puedeDarTurno: boolean;
};

/** Los tramos en que la profesional trabaja ese día (horario − bloqueos), o `null` si no se sabe. */
export function tramosDeTrabajo(
  dia: string,
  profesionalId: string,
  horarios: readonly HorarioSemanal[] | null,
  ausencias: readonly BloqueoDelDia[],
): Tramo[] | null {
  if (!horarios) return null;
  const delDia: HorarioDelDia[] = horarios
    .filter((h) => h.profesionalId === profesionalId && h.diaSemana === diaDeLaSemana(dia))
    .map((h) => ({ profesionalId: h.profesionalId, desde: h.desde, hasta: h.hasta }));
  // El horario como bloqueos, con la regla de la grilla del día (una sola definición de «fuera de horario»).
  const bloqueos = [...bloqueosPorHorario(dia, [profesionalId], delDia), ...ausencias.filter((b) => b.profesionalId === profesionalId)];
  const quitar = bloqueos.flatMap((b) => {
    const t = tramoDelBloqueo(b, dia);
    return t ? [t] : [];
  });
  return restar([{ desde: 0, hasta: DIA_MIN }], quitar);
}

export function celdaDeLaSemana(
  agenda: Pick<AgendaDeLaSemana, "turnos" | "ausencias" | "horarios">,
  dia: string,
  profesionalId: string,
  ctx: Contexto,
): CeldaDeLaSemana {
  const trabajo = tramosDeTrabajo(dia, profesionalId, agenda.horarios, agenda.ausencias);
  const turnos = agenda.turnos.filter((t) => t.profesionalId === profesionalId && t.estado !== "CANCELLED" && dateStrInBusinessTz(new Date(t.inicio)) === dia);
  const ocupados = unir(turnos.map((t) => enMinutos(t)));
  const minutosDeTrabajo = trabajo ? largo(trabajo) : null;
  const minutosOcupados = trabajo ? minutosEnComun(trabajo, ocupados) : 0;
  const porcentaje = minutosDeTrabajo ? Math.min(100, Math.round((minutosOcupados / minutosDeTrabajo) * 100)) : null;

  // Huecos que todavía se pueden dar: un día pasado no tiene; hoy, desde ahora.
  const desdeMin = dia < ctx.hoy ? DIA_MIN : dia === ctx.hoy ? ctx.ahoraMin : 0;
  const huecos = trabajo
    ? restar(trabajo, [...ocupados, { desde: 0, hasta: desdeMin }]).filter((t) => t.hasta - t.desde >= HUECO_MINIMO_MIN)
    : [];

  let motivo: string | null = null;
  if (minutosDeTrabajo === 0) {
    const ausencia = agenda.ausencias.find((b) => b.profesionalId === profesionalId && b.tipo !== "horario" && tramoDelBloqueo(b, dia));
    motivo = ausencia?.motivo ?? NO_TRABAJA_ESE_DIA;
  }
  const trabaja = minutosDeTrabajo === null || minutosDeTrabajo > 0;
  const hrefDarTurno = ctx.puedeDarTurno && dia >= ctx.hoy && trabaja ? hrefTurnoEnHueco(dia, profesionalId, null) : null;

  return { dia, profesionalId, minutosDeTrabajo, minutosOcupados, porcentaje, huecos, turnos: turnos.length, motivo, hrefDarTurno };
}

// ── La semana entera ─────────────────────────────────────────────────────────

export type DiaDeLaSemana = {
  dia: string;
  titulo: string;
  tituloLargo: string;
  esHoy: boolean;
  /** La agenda de ese día (vista por profesional). */
  href: string;
  turnos: number;
  sinConfirmar: number;
};

export type FilaDeLaSemana = { profesional: ProfesionalDeLaSemana; celdas: CeldaDeLaSemana[]; huecos: number };

export type Semana = {
  lunes: string;
  titulo: string;
  dias: DiaDeLaSemana[];
  filas: FilaDeLaSemana[];
  totales: { turnos: number; sinConfirmar: number; esperado: number; huecos: number };
  anterior: string;
  siguiente: string;
};

const vivo = (estado: string) => estado !== "CANCELLED" && estado !== "NO_SHOW";

export function armarSemana(agenda: AgendaDeLaSemana, ctx: Contexto & { ahora: Date }): Semana {
  const dias = diasDeLaSemana(agenda);
  const filas = agenda.profesionales.map((p) => {
    const celdas = dias.map((d) => celdaDeLaSemana(agenda, d, p.id, ctx));
    return { profesional: p, celdas, huecos: celdas.reduce((s, c) => s + c.huecos.length, 0) };
  });
  const enLaSemana = agenda.turnos.filter((t) => t.estado !== "CANCELLED" && dias.includes(dateStrInBusinessTz(new Date(t.inicio))));
  const sinConfirmar = (t: TurnoDeLaSemana) => t.estado === "PENDING" && new Date(t.inicio).getTime() >= ctx.ahora.getTime();
  return {
    lunes: agenda.lunes,
    titulo: tituloDeLaSemana(dias),
    dias: dias.map((d) => {
      const delDia = enLaSemana.filter((t) => dateStrInBusinessTz(new Date(t.inicio)) === d);
      return {
        dia: d,
        titulo: tituloCorto(d),
        tituloLargo: tituloLargo(d),
        esHoy: d === ctx.hoy,
        href: hrefDiaDeLaAgenda(d, ctx.hoy, { vista: "profesionales" }),
        turnos: delDia.length,
        sinConfirmar: delDia.filter(sinConfirmar).length,
      };
    }),
    filas,
    totales: {
      turnos: enLaSemana.length,
      sinConfirmar: enLaSemana.filter(sinConfirmar).length,
      esperado: enLaSemana.filter((t) => vivo(t.estado)).reduce((s, t) => s + (Number.isFinite(t.precio) ? t.precio : 0), 0),
      huecos: filas.reduce((s, f) => s + f.huecos, 0),
    },
    anterior: masDias(agenda.lunes, -7),
    siguiente: masDias(agenda.lunes, 7),
  };
}

/** El enlace a otra semana (esta semana, sin parámetro). */
export function hrefDeLaSemana(lunes: string, hoy: string): string {
  return lunes === lunesDe(hoy) ? "/admin/turnos/semana" : `/admin/turnos/semana?desde=${lunes}`;
}

/** Lo que lee el lector de pantalla en una celda. */
export function etiquetaDeLaCelda(c: CeldaDeLaSemana, nombre: string): string {
  const quien = `${nombre}, ${tituloLargo(c.dia)}`;
  if (c.motivo) return `${quien}: ${c.motivo}`;
  const ocupacion = c.porcentaje === null ? "ocupación sin datos de horario" : `${c.porcentaje} % ocupado`;
  const huecos = c.huecos.length === 0 ? "sin huecos de 30 minutos o más" : c.huecos.length === 1 ? "1 hueco de 30 minutos o más" : `${c.huecos.length} huecos de 30 minutos o más`;
  return `${quien}: ${ocupacion}, ${huecos}${c.hrefDarTurno ? ". Dar turno" : ""}`;
}
