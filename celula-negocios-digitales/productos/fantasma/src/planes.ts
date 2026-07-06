// Fantasma — pricing por uso: flat con TOPE + EXCEDENTE (blindaje de margen).
// El COGS es lineal (US$0,15–0,30/conversación) → NUNCA flat puro.

import type { Plan } from "./tipos.js";

export interface DefinicionPlan {
  plan: Plan;
  nombre: string;
  precioMensualUsd: number;
  conversacionesIncluidas: number; // solo off-hours
  excedentePorConvUsd: number; // > COGS máx (US$0,30) → cada extra es rentable
}

export const PLANES: Record<Plan, DefinicionPlan> = {
  BASICA: {
    plan: "BASICA",
    nombre: "Guardia Básica",
    precioMensualUsd: 120,
    conversacionesIncluidas: 100,
    excedentePorConvUsd: 1.0,
  },
  PRO: {
    plan: "PRO",
    nombre: "Guardia Pro",
    precioMensualUsd: 249,
    conversacionesIncluidas: 250,
    excedentePorConvUsd: 0.8,
  },
  FULL: {
    plan: "FULL",
    nombre: "Guardia Full",
    precioMensualUsd: 399,
    conversacionesIncluidas: 500,
    excedentePorConvUsd: 0.65,
  },
};

export interface FacturaMensual {
  plan: Plan;
  conversaciones: number;
  incluidas: number;
  excedenteCant: number;
  excedenteUsd: number;
  totalFacturadoUsd: number;
  cogsTotalUsd: number;
  margenBrutoUsd: number;
  margenBrutoPct: number;
}

/**
 * Calcula la factura del mes aplicando tope + excedente, y el margen real
 * contra el COGS medido. El excedente siempre supera el COGS/conv → sin trampa.
 */
export function calcularFactura(
  plan: Plan,
  conversacionesOffHours: number,
  cogsTotalUsd: number,
): FacturaMensual {
  const def = PLANES[plan];
  const excedenteCant = Math.max(0, conversacionesOffHours - def.conversacionesIncluidas);
  const excedenteUsd = excedenteCant * def.excedentePorConvUsd;
  const totalFacturadoUsd = def.precioMensualUsd + excedenteUsd;
  const margenBrutoUsd = totalFacturadoUsd - cogsTotalUsd;
  const margenBrutoPct = totalFacturadoUsd > 0 ? margenBrutoUsd / totalFacturadoUsd : 0;
  return {
    plan,
    conversaciones: conversacionesOffHours,
    incluidas: def.conversacionesIncluidas,
    excedenteCant,
    excedenteUsd,
    totalFacturadoUsd,
    cogsTotalUsd,
    margenBrutoUsd,
    margenBrutoPct,
  };
}
