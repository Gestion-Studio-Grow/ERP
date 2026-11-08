/**
 * Nómina · Convenio Colectivo de Trabajo 130/75 (Empleados de Comercio, FAECYS).
 *
 * Escalas con vigencia por período. Los valores de noviembre 2026 son PROVISIONALES A CONFIRMAR:
 * salen de fuentes secundarias del acuerdo FAECYS–CAC/CAME/UDECA oct–dic 2026 (+5,7 % en tres
 * tramos, suma fija no remunerativa y bono en dos cuotas) y la homologación no está verificada.
 * Detalle y fuentes: docs/nomina/casos-comercio-130-75.md («Parámetros del período»).
 *
 * Sólo se cargan las categorías que tienen caso calculado a mano; sumar una categoría es sumar
 * una fila con su fuente, no tocar el motor.
 */
import type { Periodo } from "../tipos";

export const CONVENIO_COMERCIO = "CCT 130/75";

export type CategoriaComercio = "maestranza-a" | "administrativo-a" | "vendedor-b";

export const NOMBRE_CATEGORIA: Record<CategoriaComercio, string> = {
  "maestranza-a": "Maestranza A",
  "administrativo-a": "Administrativo A",
  "vendedor-b": "Vendedor B",
};

export interface SumaNoRemunerativa {
  codigo: string;
  descripcion: string;
  importe: number;
}

export interface EscalaComercio {
  id: string;
  desde: Periodo;
  hasta: Periodo;
  basicos: Record<CategoriaComercio, number>;
  /** Sumas del acuerdo: montos llenos para jornada completa, sin adicionales encima. */
  sumasNoRemunerativas: SumaNoRemunerativa[];
  provisional: boolean;
  fuente: string;
}

export const ESCALAS_COMERCIO: readonly EscalaComercio[] = [
  {
    id: "comercio-2026-11",
    desde: "2026-11",
    hasta: "2026-11",
    basicos: {
      "maestranza-a": 1_233_448,
      "administrativo-a": 1_246_664,
      "vendedor-b": 1_277_511,
    },
    sumasNoRemunerativas: [
      { codigo: "NR_SUMA_FIJA", descripcion: "Suma fija no rem. acuerdo", importe: 120_000 },
      { codigo: "NR_BONO", descripcion: "Bono extraordinario cuota 2/2", importe: 25_000 },
    ],
    provisional: true,
    fuente: "Acuerdo FAECYS oct–dic 2026 vía calcularsueldo.com.ar/?p=16350 — homologación a verificar",
  },
];

/**
 * Reglas del convenio (versión «comercio-v1»). Cambiar una regla = versión nueva, nunca editar
 * esta: las liquidaciones guardadas llevan la versión con que se calcularon.
 */
export const REGLAS_COMERCIO_V1 = {
  version: "comercio-v1",
  /** Adicional por antigüedad: % del básico por año cumplido. */
  antiguedadPorAnio: 1,
  /** Presentismo (asistencia y puntualidad): % sobre básico + antigüedad − ausencias; se pierde entero con ≥ 1 ausencia injustificada. */
  presentismo: 8.33,
  /** Mes comercial para el descuento por día. */
  diasMes: 30,
  /** Divisor del valor hora de un mensualizado de jornada completa. */
  divisorHora: 200,
  /** Cuota sindical (sólo afiliados) y aporte solidario FAECYS (todos), sobre rem. + no rem., sin tope. */
  cuotaSindical: 2,
  aporteSolidarioFaecys: 0.5,
} as const;
