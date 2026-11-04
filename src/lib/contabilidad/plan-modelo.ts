/**
 * Planes de cuentas modelo por rubro (Contabilidad, ola 1 — docs/producto/contabilidad/PLAN.md §5).
 *
 * [A VALIDAR con contador matriculado] Estructura y nombres son un punto de partida razonable para
 * una pyme argentina (RT 8/9 FACPCE en lo grueso), NO un plan aprobado. Hasta que un contador
 * matriculado lo revise, todo lo que se siembre con esto se muestra como «provisional».
 *
 * Códigos jerárquicos: 1 Activo · 2 Pasivo · 3 Patrimonio neto · 4 Ingresos · 5 Egresos.
 * Los nodos con hijos AGRUPAN (no imputables); las hojas son imputables. PURO: sin base.
 */

import type { TipoCuenta } from "./asiento";

/** [A VALIDAR con contador matriculado] */
export const PLAN_MODELO_PROVISIONAL = true;

export type RubroContable = "comercio" | "servicios" | "club" | "agencia";
export const RUBROS_CONTABLES: readonly RubroContable[] = ["comercio", "servicios", "club", "agencia"];

export interface CuentaModelo {
  codigo: string;
  nombre: string;
  tipo: TipoCuenta;
  /** `null` en las cinco raíces. */
  padreCodigo: string | null;
  imputable: boolean;
}

type Hoja = [codigo: string, nombre: string];

/** Hojas comunes a todos los rubros, por agrupador. */
const AGRUPADORES: ReadonlyArray<{ codigo: string; nombre: string; padre: string }> = [
  { codigo: "1.1", nombre: "Activo corriente", padre: "1" },
  { codigo: "1.1.1", nombre: "Caja y bancos", padre: "1.1" },
  { codigo: "1.1.2", nombre: "Créditos por ventas", padre: "1.1" },
  { codigo: "1.1.3", nombre: "Créditos fiscales", padre: "1.1" },
  { codigo: "1.1.4", nombre: "Bienes de cambio", padre: "1.1" },
  { codigo: "1.2", nombre: "Activo no corriente", padre: "1" },
  { codigo: "1.2.1", nombre: "Bienes de uso", padre: "1.2" },
  { codigo: "2.1", nombre: "Pasivo corriente", padre: "2" },
  { codigo: "2.1.1", nombre: "Deudas comerciales", padre: "2.1" },
  { codigo: "2.1.2", nombre: "Deudas fiscales", padre: "2.1" },
  { codigo: "2.1.3", nombre: "Deudas sociales", padre: "2.1" },
  { codigo: "3.1", nombre: "Capital", padre: "3" },
  { codigo: "3.2", nombre: "Resultados acumulados", padre: "3" },
  { codigo: "4.1", nombre: "Ingresos operativos", padre: "4" },
  { codigo: "4.2", nombre: "Otros ingresos", padre: "4" },
  { codigo: "5.1", nombre: "Costos", padre: "5" },
  { codigo: "5.2", nombre: "Gastos de administración y comercialización", padre: "5" },
  { codigo: "5.3", nombre: "Gastos financieros e impuestos", padre: "5" },
];

const HOJAS_COMUNES: Readonly<Record<string, readonly Hoja[]>> = {
  "1.1.1": [["1.1.1.01", "Caja"], ["1.1.1.02", "Banco cuenta corriente"], ["1.1.1.03", "Mercado Pago y billeteras"]],
  "1.1.2": [["1.1.2.01", "Deudores por ventas"], ["1.1.2.02", "Tarjetas a cobrar"]],
  "1.1.3": [
    ["1.1.3.01", "IVA crédito fiscal"],
    ["1.1.3.02", "Percepciones IIBB sufridas"],
    ["1.1.3.03", "Retenciones IIBB sufridas"],
    ["1.1.3.04", "Percepciones y retenciones IVA sufridas"],
  ],
  "1.2.1": [["1.2.1.01", "Muebles y útiles"], ["1.2.1.02", "Equipos de computación"]],
  "2.1.1": [["2.1.1.01", "Proveedores"]],
  "2.1.2": [["2.1.2.01", "IVA débito fiscal"], ["2.1.2.02", "IVA a pagar"], ["2.1.2.03", "IIBB a pagar"], ["2.1.2.04", "Ganancias a pagar"]],
  "2.1.3": [["2.1.3.01", "Sueldos a pagar"], ["2.1.3.02", "Cargas sociales a pagar"]],
  "3.1": [["3.1.01", "Capital"]],
  "3.2": [["3.2.01", "Resultados no asignados"], ["3.2.02", "Resultado del ejercicio"]],
  "4.2": [["4.2.01", "Intereses ganados"], ["4.2.02", "Otros ingresos"]],
  "5.2": [
    ["5.2.01", "Sueldos y cargas sociales"],
    ["5.2.02", "Alquileres"],
    ["5.2.03", "Servicios (luz, gas, internet)"],
    ["5.2.04", "Honorarios profesionales"],
    ["5.2.05", "Publicidad"],
    ["5.2.06", "Gastos varios"],
  ],
  "5.3": [["5.3.01", "Gastos bancarios y comisiones"], ["5.3.02", "Impuesto sobre los ingresos brutos"], ["5.3.03", "Impuesto a los débitos y créditos bancarios"]],
};

/** Lo propio de cada rubro: ingresos operativos, costos y bienes de cambio. */
const HOJAS_POR_RUBRO: Readonly<Record<RubroContable, Readonly<Record<string, readonly Hoja[]>>>> = {
  comercio: {
    "1.1.4": [["1.1.4.01", "Mercaderías"]],
    "4.1": [["4.1.01", "Ventas"]],
    "5.1": [["5.1.01", "Costo de mercaderías vendidas (CMV)"], ["5.1.02", "Fletes y acarreos"]],
  },
  servicios: {
    "4.1": [["4.1.01", "Ventas de servicios"]],
    "5.1": [["5.1.01", "Costo de los servicios prestados"]],
  },
  club: {
    "1.1.4": [["1.1.4.01", "Mercaderías (buffet y tienda)"]],
    "4.1": [["4.1.01", "Cuotas sociales"], ["4.1.02", "Alquiler de instalaciones"], ["4.1.03", "Ventas de buffet y tienda"]],
    "5.1": [["5.1.01", "Costo de mercaderías vendidas (CMV)"], ["5.1.02", "Mantenimiento de instalaciones"]],
  },
  agencia: {
    "4.1": [["4.1.01", "Ventas de servicios"], ["4.1.02", "Fees de gestión de pauta"]],
    "5.1": [["5.1.01", "Costo de pauta de terceros"], ["5.1.02", "Costo de producción y freelancers"]],
  },
};

const RAICES: ReadonlyArray<{ codigo: string; nombre: string; tipo: TipoCuenta }> = [
  { codigo: "1", nombre: "Activo", tipo: "ACTIVO" },
  { codigo: "2", nombre: "Pasivo", tipo: "PASIVO" },
  { codigo: "3", nombre: "Patrimonio neto", tipo: "PATRIMONIO" },
  { codigo: "4", nombre: "Ingresos", tipo: "RESULTADO_POSITIVO" },
  { codigo: "5", nombre: "Egresos", tipo: "RESULTADO_NEGATIVO" },
];

const TIPO_POR_RAIZ = new Map(RAICES.map((r) => [r.codigo, r.tipo]));
const tipoDe = (codigo: string): TipoCuenta => TIPO_POR_RAIZ.get(codigo.split(".")[0])!;

/**
 * Plan modelo del rubro, plano y ORDENADO (cada padre antes que sus hijos): se puede sembrar en
 * ese orden resolviendo `padreCodigo`. Los agrupadores que en el rubro no tienen hojas
 * (p. ej. «Bienes de cambio» en servicios) no se incluyen.
 */
export function planModelo(rubro: RubroContable): CuentaModelo[] {
  const hojas: Record<string, readonly Hoja[]> = { ...HOJAS_COMUNES, ...HOJAS_POR_RUBRO[rubro] };
  const plan: CuentaModelo[] = RAICES.map((r) => ({ codigo: r.codigo, nombre: r.nombre, tipo: r.tipo, padreCodigo: null, imputable: false }));

  // Un agrupador entra si él o algún descendiente tiene hojas.
  const tieneHojas = (codigo: string): boolean =>
    (hojas[codigo]?.length ?? 0) > 0 || AGRUPADORES.some((a) => a.padre === codigo && tieneHojas(a.codigo));

  for (const a of AGRUPADORES) {
    if (!tieneHojas(a.codigo)) continue;
    plan.push({ codigo: a.codigo, nombre: a.nombre, tipo: tipoDe(a.codigo), padreCodigo: a.padre, imputable: false });
  }
  for (const a of AGRUPADORES) {
    for (const [codigo, nombre] of hojas[a.codigo] ?? []) {
      plan.push({ codigo, nombre, tipo: tipoDe(codigo), padreCodigo: a.codigo, imputable: true });
    }
  }
  // Orden jerárquico por código (segmentos numéricos): padres antes que hijos.
  return plan.sort((x, y) => compararCodigos(x.codigo, y.codigo));
}

export function compararCodigos(a: string, b: string): number {
  const sa = a.split(".").map(Number);
  const sb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    if (sa[i] === undefined) return -1;
    if (sb[i] === undefined) return 1;
    if (sa[i] !== sb[i]) return sa[i] - sb[i];
  }
  return 0;
}
