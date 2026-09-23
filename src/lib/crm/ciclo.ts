// ============================================================================
// CICLO DE VISITA — cada cuánto vuelve una clienta. PURO.
// ============================================================================
//
// El ciclo es la base de "por recuperar": no se puede decir que alguien "dejó de venir" sin
// saber cada cuánto venía. Tres fuentes, en orden, y la pantalla dice cuál se usó:
//   1. PROPIO: la MEDIANA de los días entre sus visitas. Mediana y no promedio: una clienta
//      que viene cada 30 días y una vez faltó 4 meses por un viaje sigue siendo de 30 días.
//   2. DEL SERVICIO: si tiene una sola visita, la mediana de lo que tardan en volver las demás
//      clientas que se hicieron ese mismo servicio (con un mínimo de casos para confiar).
//   3. POR DEFECTO: 45 días (PROVISIONAL, CRM_REGLAS).

import { diasEntre } from "./fechas";
import { CRM_REGLAS, type ReglasCrm } from "./reglas";

/** Mediana de una lista de números, o `null` si está vacía. Con cantidad par, el promedio de los dos del medio. */
export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 1 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

/** Una visita que cuenta para el ciclo: un turno completado o un pedido, en el día del negocio. */
export type VisitaCiclo = { fecha: string; servicioId: string | null };

/**
 * Días entre visitas consecutivas. Espera las visitas en orden y sin días repetidos (dos
 * turnos el mismo día son UNA visita: se juntan al armar la persona).
 */
export function intervalos(visitas: readonly VisitaCiclo[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < visitas.length; i++) {
    const d = diasEntre(visitas[i - 1].fecha, visitas[i].fecha);
    if (d > 0) out.push(d);
  }
  return out;
}

/**
 * El ciclo de cada servicio: mediana de los días entre dos visitas CONSECUTIVAS de la misma
 * clienta en las que las dos fueron de ese servicio. Sólo los servicios con suficientes casos
 * (`intervalosMinimosPorServicio`): con uno solo, una casualidad pasaría por regla.
 */
export function ciclosPorServicio(
  historias: readonly (readonly VisitaCiclo[])[],
  reglas: Pick<ReglasCrm, "intervalosMinimosPorServicio"> = CRM_REGLAS,
): Map<string, number> {
  const muestras = new Map<string, number[]>();
  for (const visitas of historias) {
    for (let i = 1; i < visitas.length; i++) {
      const a = visitas[i - 1];
      const b = visitas[i];
      if (!a.servicioId || a.servicioId !== b.servicioId) continue;
      const d = diasEntre(a.fecha, b.fecha);
      if (d <= 0) continue;
      muestras.set(a.servicioId, [...(muestras.get(a.servicioId) ?? []), d]);
    }
  }
  const out = new Map<string, number>();
  for (const [servicioId, dias] of muestras) {
    if (dias.length < reglas.intervalosMinimosPorServicio) continue;
    const m = mediana(dias);
    if (m !== null) out.set(servicioId, m);
  }
  return out;
}

export type FuenteCiclo = "propio" | "servicio" | "defecto";

export type Ciclo = { dias: number; fuente: FuenteCiclo };

function acotar(dias: number, reglas: Pick<ReglasCrm, "cicloMinimoDias" | "cicloMaximoDias">): number {
  return Math.min(reglas.cicloMaximoDias, Math.max(reglas.cicloMinimoDias, Math.round(dias)));
}

/**
 * El ciclo de UNA persona: propio si tiene al menos un intervalo; si no, el del servicio de su
 * última visita; si no, el de defecto. Siempre acotado a [mínimo, máximo].
 */
export function cicloPersonal(
  visitas: readonly VisitaCiclo[],
  porServicio: ReadonlyMap<string, number>,
  reglas: Pick<ReglasCrm, "cicloMinimoDias" | "cicloMaximoDias" | "cicloPorDefectoDias"> = CRM_REGLAS,
): Ciclo {
  const propio = mediana(intervalos(visitas));
  if (propio !== null) return { dias: acotar(propio, reglas), fuente: "propio" };
  const ultimo = visitas.at(-1)?.servicioId;
  const delServicio = ultimo ? porServicio.get(ultimo) : undefined;
  if (delServicio !== undefined) return { dias: acotar(delServicio, reglas), fuente: "servicio" };
  return { dias: reglas.cicloPorDefectoDias, fuente: "defecto" };
}

/** La explicación del ciclo en palabras, para que la regla se lea en pantalla. */
export function explicarCiclo(c: Ciclo): string {
  if (c.fuente === "propio") return `vuelve cada ${c.dias} días (según sus visitas)`;
  if (c.fuente === "servicio") return `se toma ${c.dias} días (lo que tardan en volver las demás por ese servicio)`;
  return `se toma ${c.dias} días (todavía no hay visitas para calcularlo)`;
}
