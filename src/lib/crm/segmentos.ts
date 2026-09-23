// ============================================================================
// SEGMENTOS — en qué situación está cada clienta, con la regla a la vista. PURO.
// ============================================================================
//
// Sin puntajes: cada segmento sale de dos números que la pantalla muestra tal cual, los días
// desde su última visita y su ciclo (ciclo.ts). "Hace 80 días que no viene y suele volver cada
// 40" se entiende; "riesgo 0,73" no.
//
//   sin-visitas  → no tiene ninguna visita en la ventana de historial.
//   nueva        → una sola visita, y todavía no pasó 1,5 ciclos sin volver.
//   frecuente    → dos o más visitas, y todavía no pasó 1,5 ciclos sin volver.
//   en-riesgo    → entre 1,5 y 3 ciclos sin volver (los dos bordes adentro).
//   perdida      → más de 3 ciclos sin volver.
// Quien ya tiene un turno reservado NUNCA está en riesgo ni perdida: está volviendo.
//
// El VALOR que se pierde si no vuelve es su gasto por visita (el promedio) por las visitas que
// haría en un año con su ciclo. Es una estimación y la pantalla lo dice.

import { diasEntre } from "./fechas";
import { cicloPersonal, type Ciclo } from "./ciclo";
import type { Persona } from "./personas";
import { CRM_REGLAS, type ReglasCrm } from "./reglas";

export const SEGMENTOS = ["nueva", "frecuente", "en-riesgo", "perdida", "sin-visitas"] as const;
export type Segmento = (typeof SEGMENTOS)[number];

/**
 * Cómo se lee cada segmento en pantalla. Sin género: el mismo sistema lo usan una estética
 * ("clientas") y una carnicería ("clientes").
 */
export const SEGMENTO_ETIQUETA: Record<Segmento, string> = {
  nueva: "Primera vez",
  frecuente: "Frecuente",
  "en-riesgo": "En riesgo",
  perdida: "No volvió",
  "sin-visitas": "Sin visitas",
};

export function esSegmento(v: unknown): v is Segmento {
  return typeof v === "string" && (SEGMENTOS as readonly string[]).includes(v);
}

export type Evaluacion = {
  segmento: Segmento;
  ciclo: Ciclo;
  /** Días desde la última visita, o null si no tiene visitas. */
  diasSinVenir: number | null;
  /** Días sin venir divididos por el ciclo, con un decimal. */
  ciclosSinVenir: number | null;
  ultimaVisita: string | null;
  cantidadVisitas: number;
  ticketPromedio: number;
  /** Estimación de lo que gasta por año con su ciclo. */
  valorAnual: number;
  conTurno: boolean;
};

/** El segmento a partir de los números. Separado para probar los bordes sin armar personas. */
export function segmentoPorNumeros(
  input: { cantidadVisitas: number; ciclosSinVenir: number | null; conTurno: boolean },
  reglas: Pick<ReglasCrm, "riesgoDesdeCiclos" | "perdidaDespuesDeCiclos"> = CRM_REGLAS,
): Segmento {
  if (input.cantidadVisitas === 0 || input.ciclosSinVenir === null) return "sin-visitas";
  const ritmo: Segmento = input.cantidadVisitas === 1 ? "nueva" : "frecuente";
  if (input.conTurno) return ritmo;
  if (input.ciclosSinVenir > reglas.perdidaDespuesDeCiclos) return "perdida";
  if (input.ciclosSinVenir >= reglas.riesgoDesdeCiclos) return "en-riesgo";
  return ritmo;
}

export function evaluarPersona(
  p: Persona,
  hoy: string,
  porServicio: ReadonlyMap<string, number>,
  reglas: ReglasCrm = CRM_REGLAS,
): Evaluacion {
  const ciclo = cicloPersonal(p.visitas, porServicio, reglas);
  const ultimaVisita = p.visitas.at(-1)?.fecha ?? null;
  const diasSinVenir = ultimaVisita ? Math.max(0, diasEntre(ultimaVisita, hoy)) : null;
  // Un decimal: es lo que se muestra, y el borde (1,5) se decide con el mismo número que se ve.
  const ciclosSinVenir = diasSinVenir === null ? null : Math.round((diasSinVenir / ciclo.dias) * 10) / 10;
  const total = p.visitas.reduce((s, v) => s + v.monto, 0);
  const ticketPromedio = p.visitas.length > 0 ? total / p.visitas.length : 0;
  const conTurno = p.proximoTurno !== null;
  return {
    segmento: segmentoPorNumeros({ cantidadVisitas: p.visitas.length, ciclosSinVenir, conTurno }, reglas),
    ciclo,
    diasSinVenir,
    ciclosSinVenir,
    ultimaVisita,
    cantidadVisitas: p.visitas.length,
    ticketPromedio,
    valorAnual: Math.round(ticketPromedio * (365 / ciclo.dias)),
    conTurno,
  };
}

/** Todas las personas evaluadas, con el ciclo de cada servicio calculado sobre la base entera. */
export function evaluarBase(
  personas: readonly Persona[],
  hoy: string,
  porServicio: ReadonlyMap<string, number>,
  reglas: ReglasCrm = CRM_REGLAS,
): { persona: Persona; ev: Evaluacion }[] {
  return personas.map((persona) => ({ persona, ev: evaluarPersona(persona, hoy, porServicio, reglas) }));
}

/** "En riesgo" ordenadas por lo que valen al año (lo más caro de perder, arriba). */
export function porRecuperar<T extends { ev: Evaluacion }>(evaluadas: readonly T[]): T[] {
  return evaluadas
    .filter((x) => x.ev.segmento === "en-riesgo")
    .sort((a, b) => b.ev.valorAnual - a.ev.valorAnual || (b.ev.diasSinVenir ?? 0) - (a.ev.diasSinVenir ?? 0));
}

/** La explicación del segmento en una línea, con los números de la regla. */
export function explicarSegmento(ev: Evaluacion): string {
  if (ev.diasSinVenir === null) return "Todavía no tiene visitas.";
  const base = `Última visita hace ${ev.diasSinVenir} ${ev.diasSinVenir === 1 ? "día" : "días"}; su ciclo es de ${ev.ciclo.dias} días`;
  if (ev.conTurno) return `${base}. Ya tiene turno reservado.`;
  return `${base} (${String(ev.ciclosSinVenir ?? 0).replace(".", ",")} ciclos sin volver).`;
}
