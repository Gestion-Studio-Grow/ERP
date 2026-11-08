/**
 * Nómina · tipos del núcleo de liquidación (fase 1: recibo mensual de un mensualizado).
 * Diseño: docs/nomina/diseno-motor.md. Casos de referencia: docs/nomina/casos-comercio-130-75.md.
 *
 * Toda la plata es `number` en pesos con dos decimales; las cuentas pasan por
 * src/lib/dinero/redondeo.ts (centavos enteros, medio centavo hacia arriba, una vez por línea).
 */

/**
 * R = remunerativo (suma a la base de aportes) · N = no remunerativo ·
 * A = aporte o descuento del empleado (resta del neto) · C = contribución patronal (no toca el neto).
 */
export type TipoConcepto = "R" | "N" | "A" | "C";

/** Período mensual «AAAA-MM». */
export type Periodo = `${number}-${number}`;

export interface LineaRecibo {
  /** Código interno estable del concepto (es la clave del concepto propio en el Libro de Sueldos Digital). */
  codigo: string;
  descripcion: string;
  tipo: TipoConcepto;
  /** Base sobre la que se aplicó el porcentaje o la proporción; null si el importe es fijo. */
  base: number | null;
  /** Porcentaje con dos decimales (8,33 → 8.33) o null. */
  porcentaje: number | null;
  /** Cantidad (días, horas, años) o null. */
  cantidad: number | null;
  /**
   * Importe con signo según el efecto en su grupo: los descuentos dentro de lo remunerativo
   * (ausencias) van negativos; los aportes (tipo A) van POSITIVOS y se restan al calcular el neto.
   */
  importe: number;
  /** Concepto de ARCA asociado (LSD). null = asociación pendiente de verificar con la tabla oficial. */
  conceptoArca: string | null;
}

export interface TotalesRecibo {
  remunerativo: number;
  noRemunerativo: number;
  /** Base de aportes SIPA/INSSJP/OS: min(remunerativo, tope del período). */
  baseAportes: number;
  aportes: number;
  neto: number;
  contribuciones: number;
}

/** Fase 1 sólo liquida «mensual»; el resto se prevé para no reescribir el snapshot (SAC, final, retroactivos). */
export type TipoLiquidacion = "mensual" | "sac" | "final" | "complementaria";

export interface Recibo {
  periodo: Periodo;
  tipoLiquidacion: TipoLiquidacion;
  convenio: string;
  /** Versión de las reglas de cálculo con que se liquidó: queda en el snapshot y no se recalcula. */
  versionReglas: string;
  /** Identificador de la tabla de parámetros (escala + ley) que se usó. */
  versionParametros: string;
  /**
   * Los VALORES de parámetros usados (escala, sumas, alícuotas, tope), no sólo su id: el snapshot
   * guardado tiene que permitir auditar y reimprimir el recibo años después sin depender del código.
   */
  parametros: Record<string, number | string | boolean>;
  /** Novedades y datos del legajo con que se liquidó, explícitos (no sólo como cantidades de las líneas). */
  novedades: {
    ausenciasInjustificadas: number;
    horasExtra50: number;
    horasExtra100: number;
    antiguedadAnios: number;
    afiliadoSindical: boolean;
  };
  lineas: LineaRecibo[];
  totales: TotalesRecibo;
  /** Advertencias para quien revisa (datos provisionales, valores de ejemplo, etc.). */
  advertencias: string[];
}
