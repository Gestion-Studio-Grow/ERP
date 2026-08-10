/**
 * Configuración fiscal del Core (semilla del Tax Engine, ADR-006 / ADR-024).
 *
 * El Core es dueño del cálculo de impuestos y del perfil fiscal del emisor; los
 * plugins (ARCA, MP) solo integran. Los valores son PROVISIONALES a confirmar
 * (no hay alta fiscal real todavía) y hoy viven en código; el destino es la
 * config por tenant del manifiesto del plugin + el flag por tenant de ADR-006.
 */

import { prisma } from "@/lib/prisma";
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

/** Condiciones válidas de un EMISOR (Consumidor Final no puede facturar). */
const CONDICIONES_EMISOR: readonly CondicionIva[] = [
  "MONOTRIBUTO",
  "RESPONSABLE_INSCRIPTO",
  "EXENTO",
];

/**
 * Códigos `CondicionIVAReceptorId` de ARCA (RG 5616). Copia local del Core
 * (parallel al catálogo del plugin, ADR-002: el Core no importa el plugin) para
 * poder PERSISTIR la condición del receptor en la factura. Se mantiene en sync
 * con `src/plugins/arca/domain/catalogos.ts::condicionReceptorId`.
 */
export function condicionReceptorId(cond: CondicionIva): number {
  switch (cond) {
    case "RESPONSABLE_INSCRIPTO":
      return 1;
    case "EXENTO":
      return 4;
    case "CONSUMIDOR_FINAL":
      return 5;
    case "MONOTRIBUTO":
      return 6;
    default:
      return 5; // fallback conservador: Consumidor Final
  }
}

/**
 * Inverso de `condicionReceptorId`: del código ARCA a la condición del Core. Se
 * usa al emitir una nota de crédito, que reconstruye el receptor de la factura
 * origen (que persiste el código, no el string). Fallback: Consumidor Final.
 */
export function condicionDesdeReceptorId(codigo: number | null | undefined): CondicionIva {
  switch (codigo) {
    case 1:
      return "RESPONSABLE_INSCRIPTO";
    case 4:
      return "EXENTO";
    case 6:
      return "MONOTRIBUTO";
    case 5:
    default:
      return "CONSUMIDOR_FINAL";
  }
}

/**
 * Perfil fiscal PROVISIONAL (fallback): Monotributo (Factura C), CUIT y punto de
 * venta placeholder. Se usa cuando el tenant no tiene cargada su condición fiscal
 * real. PURO (sin DB) — la variante que lee el tenant es `resolverPerfilFiscal`.
 */
export function getFiscalProfile(_tenantId: string): FiscalProfile {
  return {
    cuit: 20000000000, // provisional a confirmar
    condicionIva: "MONOTRIBUTO",
    puntoVenta: 1,
    provisional: true,
  };
}

/**
 * Resuelve el perfil fiscal REAL del emisor leyendo la config del tenant
 * (`arcaCondicionIva`/`arcaCuit`/`arcaPuntoVenta`, migración fiscal). Es lo que
 * define la RAMA de facturación por tipo de contribuyente: un tenant Monotributo
 * emite C; uno Responsable Inscripto emite A/B. Si el tenant no tiene la
 * condición cargada, cae al perfil PROVISIONAL (`getFiscalProfile`) — así el
 * comportamiento no cambia hasta que el dueño complete el alta fiscal.
 */
export async function resolverPerfilFiscal(
  tenantId: string,
): Promise<FiscalProfile> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      arcaCuit: true,
      arcaPuntoVenta: true,
      arcaCondicionIva: true,
    },
  });

  const condicion = t?.arcaCondicionIva as CondicionIva | null | undefined;
  const condicionValida =
    condicion && CONDICIONES_EMISOR.includes(condicion) ? condicion : null;

  if (!t || !condicionValida || !t.arcaCuit) {
    // Sin alta fiscal completa → perfil provisional (no cambia el comportamiento).
    return getFiscalProfile(tenantId);
  }

  return {
    cuit: Number(t.arcaCuit),
    condicionIva: condicionValida,
    puntoVenta: t.arcaPuntoVenta ?? 1,
    provisional: false,
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
