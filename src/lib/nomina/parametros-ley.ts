/**
 * Nómina · parámetros de ley con vigencia (SIPA, INSSJP, obra social, tope ANSES).
 *
 * En fase 1 viven en código; en fase 2 pasan a una tabla global de parámetros con vigencia
 * (docs/nomina/diseno-motor.md §4). Un período sin parámetros cargados es un ERROR, nunca se
 * usa el último valor conocido: liquidar con un tope viejo es plata mal calculada.
 */
import type { Periodo } from "./tipos";

export interface ParametrosLey {
  /** Primer y último período (inclusive) en que rige. */
  desde: Periodo;
  hasta: Periodo;
  id: string;
  /** Base imponible máxima de aportes (ANSES). Las contribuciones no tienen tope. */
  topeBaseAportes: number;
  aporteJubilacion: number;
  aporteLey19032: number;
  aporteObraSocial: number;
  contribucionObraSocial: number;
  provisional: boolean;
  fuente: string;
}

export const PARAMETROS_LEY: readonly ParametrosLey[] = [
  {
    id: "ley-2026-11",
    desde: "2026-11",
    hasta: "2026-11",
    // Res. ANSES 304/2026 — provisional a confirmar en el Boletín Oficial.
    topeBaseAportes: 4_861_685.38,
    aporteJubilacion: 11,
    aporteLey19032: 3,
    aporteObraSocial: 3,
    contribucionObraSocial: 6,
    provisional: true,
    fuente: "Res. ANSES 304/2026 (a verificar en B.O.); Ley 24.241, Ley 19.032, Ley 23.660",
  },
];

/** Compara períodos «AAAA-MM» (orden lexicográfico = orden temporal con mes de dos cifras). */
export function validarPeriodo(periodo: string): Periodo {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
    throw new RangeError(`Período inválido: «${periodo}» (se espera AAAA-MM).`);
  }
  return periodo as Periodo;
}

export function vigenteEn<T extends { desde: Periodo; hasta: Periodo }>(
  tablas: readonly T[],
  periodo: Periodo,
  que: string,
): T {
  const vigentes = tablas.filter((t) => t.desde <= periodo && periodo <= t.hasta);
  if (vigentes.length !== 1) {
    throw new RangeError(
      vigentes.length === 0
        ? `No hay ${que} cargados para ${periodo}.`
        : `Hay ${vigentes.length} tablas de ${que} superpuestas para ${periodo}.`,
    );
  }
  return vigentes[0];
}

export function parametrosLeyDe(periodo: Periodo): ParametrosLey {
  return vigenteEn(PARAMETROS_LEY, periodo, "parámetros de ley");
}
