// El período de Reportes: los rangos móviles de siempre (30, 90, 180 días, 1 año) y los dos que se
// piensan por mes: «Este mes» y «Mes pasado». PURO: `hoy` se inyecta, no se lee el reloj.
//
// Cualquier período se reduce a lo mismo que ya usaban las lecturas: un último día y una cantidad de
// días. «Mes pasado» de un 15 de marzo es «28 días terminando el 28 de febrero». Así no hay un segundo
// camino para los bordes: todos pasan por `bordesDelPeriodo`.

import { DEFAULT_REPORT_RANGE_DAYS, REPORT_RANGE_DAYS } from "./report-config";
import { diaMas } from "./report-ingresos";

export type PeriodoPedido = number | "mes" | "mes-pasado";

export type PeriodoReporte = {
  etiqueta: string;
  /** Último día del período, en días del negocio (YYYY-MM-DD). */
  ultimoDia: string;
  dias: number;
  /** Ya terminó: ningún día del período sigue vendiendo. */
  cerrado: boolean;
  /** Cómo se pide por URL: `periodo=mes` o `dias=30`. */
  query: string;
  /** El tramo de igual largo que termina justo antes. */
  anterior: { ultimoDia: string; dias: number };
};

function armar(etiqueta: string, ultimoDia: string, dias: number, cerrado: boolean, query: string): PeriodoReporte {
  return { etiqueta, ultimoDia, dias, cerrado, query, anterior: { ultimoDia: diaMas(ultimoDia, -dias), dias } };
}

/** Un pedido que no es de la lista cae al período por defecto: el rango sigue siendo obligatorio (ADR-023 F3). */
export function resolverPeriodo(pedido: PeriodoPedido, hoy: string): PeriodoReporte {
  if (pedido === "mes") return armar("Este mes", hoy, Number(hoy.slice(8, 10)), false, "periodo=mes");
  if (pedido === "mes-pasado") {
    const ultimo = diaMas(`${hoy.slice(0, 7)}-01`, -1);
    return armar("Mes pasado", ultimo, Number(ultimo.slice(8, 10)), true, "periodo=mes-pasado");
  }
  const dias = (REPORT_RANGE_DAYS as readonly number[]).includes(pedido) ? pedido : DEFAULT_REPORT_RANGE_DAYS;
  return armar(dias === 365 ? "1 año" : `${dias} días`, hoy, dias, false, `dias=${dias}`);
}

/** Lo que pide la URL. `?dias=` sigue andando: hay enlaces guardados. */
export function periodoDeLaUrl(params: { dias?: string | null; periodo?: string | null }): PeriodoPedido {
  if (params.periodo === "mes" || params.periodo === "mes-pasado") return params.periodo;
  return Number(params.dias);
}

/** Las opciones del selector, en el orden en que se muestran. */
export function opcionesDePeriodo(hoy: string): PeriodoReporte[] {
  return (["mes", "mes-pasado", ...REPORT_RANGE_DAYS] as const).map((p) => resolverPeriodo(p, hoy));
}

/** «06/05 al 03/08»: el tramo contra el que se compara. */
export function rangoDelAnterior(periodo: PeriodoReporte): string {
  const { ultimoDia, dias } = periodo.anterior;
  const desde = diaMas(ultimoDia, 1 - dias);
  // Si el tramo cruza de año, sin el año «07/11 al 05/05» parece ir para atrás.
  const conAnio = desde.slice(0, 4) !== ultimoDia.slice(0, 4);
  const corto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}${conAnio ? `/${d.slice(2, 4)}` : ""}`;
  return dias === 1 ? corto(ultimoDia) : `${corto(desde)} al ${corto(ultimoDia)}`;
}

export type Comparacion = { texto: string; tono: "sube" | "baja" | "igual" };

/** «12 % más» o «12 % menos». Sin nada antes no hay porcentaje honesto: `null`. */
export function contraElAnterior(actual: number, anterior: number): Comparacion | null {
  if (!(anterior > 0)) return null;
  const cambio = Math.round(((actual - anterior) / anterior) * 100); // no-es-plata: porcentaje entero para leer
  if (cambio === 0) return { texto: "Igual", tono: "igual" };
  return { texto: `${Math.abs(cambio)} % ${cambio > 0 ? "más" : "menos"}`, tono: cambio > 0 ? "sube" : "baja" };
}
