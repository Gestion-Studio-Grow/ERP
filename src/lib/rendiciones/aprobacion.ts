/**
 * RENDÍ — aprobación por legajo (Core, PURO). Plan §6.4: lo que el estándar de SAP no hace.
 *
 * La matriz es un dato (`ReglaAprobacion`): rango de importe, centro de costo opcional y niveles.
 * Nadie aprueba lo propio. Las suplencias tienen fecha y la fecha entra por parámetro.
 */

import type { Centavos, FechaISO, Persona, ReglaAprobacion, Rendicion, Suplencia } from "./tipos";

function unicos(xs: string[]): string[] {
  return [...new Set(xs)];
}

/**
 * Sube por la cadena de jefes desde el jefe de quien rinde y devuelve el primero que no sea quien
 * rinde ni apruebe ya en otro nivel. En el caso típico ("jefe" y después una lista fija que era quien
 * rinde) eso es el jefe del jefe, como pide el contrato; con un solo nivel es el jefe directo.
 */
function subirPorLaCadena(
  persona: Persona,
  jefeDe: Map<string, string | undefined>,
  yaAprueban: Set<string>,
): string | undefined {
  const vistos = new Set<string>();
  let actual = persona.jefeLegajo;
  while (actual && !vistos.has(actual)) {
    vistos.add(actual);
    if (actual !== persona.legajo && !yaAprueban.has(actual)) return actual;
    actual = jefeDe.get(actual);
  }
  return undefined;
}

/**
 * Niveles de aprobación de una rendición: un array de legajos por nivel (cualquiera del nivel aprueba).
 * - Toma la PRIMERA regla que matchea el importe (desde ≤ total < hasta) y el centro de costo.
 * - "jefe" = el jefe directo de quien rinde.
 * - A cada titular con suplencia vigente en `fecha` le suma el suplente en el mismo nivel.
 * - Separación de funciones: saca a quien rinde de todos los niveles; si un nivel queda vacío, sube
 *   por la cadena de jefes (ver `subirPorLaCadena`); si no hay nadie, el nivel queda vacío
 *   ("sin aprobador" en la pantalla).
 * - Sin regla que aplique: `[]`.
 */
export function nivelesDeAprobacion(
  total: Centavos,
  persona: Persona,
  personas: Persona[],
  reglas: ReglaAprobacion[],
  suplencias: Suplencia[],
  fecha: FechaISO,
): string[][] {
  const regla = reglas.find(
    (r) =>
      r.desde <= total &&
      (r.hasta === undefined || total < r.hasta) &&
      (r.centroCosto === undefined || r.centroCosto === persona.centroCosto),
  );
  if (!regla) return [];

  const jefeDe = new Map(personas.map((p) => [p.legajo, p.jefeLegajo] as const));
  const suplentesDe = (titular: string) =>
    suplencias
      .filter((s) => s.titularLegajo === titular && s.desde <= fecha && fecha <= s.hasta)
      .map((s) => s.suplenteLegajo);
  const armarNivel = (titulares: string[]) =>
    unicos([...titulares, ...titulares.flatMap(suplentesDe)]).filter((l) => l !== persona.legajo);

  const niveles = regla.niveles.map((n) =>
    armarNivel(n === "jefe" ? (persona.jefeLegajo ? [persona.jefeLegajo] : []) : [...n]),
  );

  for (let i = 0; i < niveles.length; i++) {
    if (niveles[i].length > 0) continue;
    const escalado = subirPorLaCadena(persona, jefeDe, new Set(niveles.flat()));
    if (escalado) niveles[i] = armarNivel([escalado]);
  }
  return niveles;
}

/** Puede aprobar si la rendición está en aprobación, el actor está en el nivel en curso y no es suya. */
export function puedeAprobar(actorLegajo: string, r: Rendicion, niveles: string[][]): boolean {
  return (
    r.estado === "en_aprobacion" &&
    actorLegajo !== r.legajo &&
    (niveles[r.nivelActual] ?? []).includes(actorLegajo)
  );
}
