/**
 * Configuración fiscal del Core (semilla del Tax Engine, ADR-006 / ADR-024).
 *
 * El Core es dueño del cálculo de impuestos y del perfil fiscal del emisor; los
 * plugins (ARCA, MP) solo integran. Los valores son PROVISIONALES a confirmar
 * (no hay alta fiscal real todavía) y hoy viven en código; el destino es la
 * config por tenant del manifiesto del plugin + el flag por tenant de ADR-006.
 */

import type { SubtotalIva } from "@/lib/invoice-core";

/**
 * Feature flag maestro de facturación (ADR-024 §2.b). OFF por default: la
 * migración de Invoice/OutboxEvent NO está aplicada, así que sin esto llamar a
 * `createInvoice` rompería `completeAppointment` en prod. Se prende (env
 * `ARCA_INVOICING_ENABLED=true`) recién con la migración aplicada.
 */
export function isInvoicingEnabled(): boolean {
  return process.env.ARCA_INVOICING_ENABLED === "true";
}

/** Condición del emisor frente al IVA (mismos valores que el catálogo del plugin). */
export type CondicionIva =
  | "RESPONSABLE_INSCRIPTO"
  | "MONOTRIBUTO"
  | "EXENTO"
  | "CONSUMIDOR_FINAL";

/** Perfil fiscal del emisor (por tenant). PROVISIONAL a confirmar. */
export interface FiscalProfile {
  cuit: number;
  condicionIva: CondicionIva;
  puntoVenta: number;
  /** Marca de que estos datos son placeholder, no un alta fiscal real. */
  provisional: boolean;
}

// Ids de alícuota de IVA de ARCA (ver src/plugins/arca/domain/catalogos.ts).
const IVA_0 = 3; // 0%
const IVA_21 = 5; // 21%

/**
 * Perfil fiscal por tenant. Hoy: ch estética = Monotributo (Factura C).
 * PROVISIONAL — CUIT y punto de venta son placeholder hasta el alta real.
 */
export function getFiscalProfile(_tenantId: string): FiscalProfile {
  return {
    cuit: 20000000000, // provisional a confirmar
    condicionIva: "MONOTRIBUTO",
    puntoVenta: 1,
    provisional: true,
  };
}

export interface Impuestos {
  neto: number;
  iva: SubtotalIva[];
  total: number;
}

// Redondeo fiscal EPSILON-safe (corrige la frontera binaria de x.xx5). Difiere a propósito del
// `round2` del POS (src/lib/round.ts) — unificar ambos es una decisión pendiente (R4, docs/arquitectura).
function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula neto + IVA + total a partir del monto bruto que paga el cliente y la
 * condición del emisor. Simplificado a propósito (ADR-024 §2.e):
 *  - Monotributo / Exento (Factura C): no discrimina IVA → una línea al 0%,
 *    neto = total = monto.
 *  - Responsable Inscripto (Factura A/B): el monto es IVA-incluido al 21% →
 *    neto = monto / 1,21; IVA = monto − neto.
 */
export function calcularImpuestos(
  emisor: CondicionIva,
  montoBruto: number,
): Impuestos {
  if (emisor === "RESPONSABLE_INSCRIPTO") {
    const neto = redondear(montoBruto / 1.21);
    const importe = redondear(montoBruto - neto);
    return {
      neto,
      iva: [{ alicuotaId: IVA_21, base: neto, importe }],
      total: redondear(neto + importe),
    };
  }
  // Monotributo / Exento / (fallback): Factura C, sin IVA discriminado.
  const neto = redondear(montoBruto);
  return {
    neto,
    iva: [{ alicuotaId: IVA_0, base: neto, importe: 0 }],
    total: neto,
  };
}
