// ============================================================================
// COMPROBANTE DE LIQUIDACIÓN POR WHATSAPP — el texto y el link `wa.me`. PURO.
// ============================================================================
//
// Spec: docs/producto/comisiones/LIQUIDACION.md §2 («Comprobante WhatsApp») y §5-T1. Es un LINK:
// Caro lo toca, se abre su WhatsApp con el texto escrito y lo manda ella. Nada se manda solo.
// Sin un celular usable cargado no hay link (`null`): no se abre un chat con un número que no es
// el de la profesional. Plata en centavos enteros, mostrada en pesos sin centavos si son cero.

import { waLinkClienta } from "@/lib/whatsapp-cta";

export interface DatosDelComprobante {
  profesional: string;
  negocio: string;
  /** «01/10 al 31/10» o la etiqueta del período. */
  periodo: string;
  turnos: number;
  /** Lo cobrado sobre lo que se calculó, en centavos. */
  baseCents: number;
  /** Lo liquidado (lo congelado en el payout), en centavos. */
  comisionCents: number;
  /** Ajustes con signo, en centavos. T1: siempre 0 (llegan con T2). */
  ajustesCents?: number;
  /** «Efectivo», «Transferencia»… o null si no se sabe. */
  medio: string | null;
  /** «05/11/2026». */
  fecha: string;
}

/** $ 12.345 / $ 12.345,50 — formato argentino, sin depender del Intl del entorno. */
export function pesosDeCentavos(cents: number): string {
  const negativo = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const enteros = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const resto = abs % 100;
  return `${negativo ? "-" : ""}$ ${enteros}${resto ? `,${String(resto).padStart(2, "0")}` : ""}`;
}

/** El texto del comprobante, en criollo claro. PURO. */
export function textoDelComprobante(d: DatosDelComprobante): string {
  const ajustes = d.ajustesCents ?? 0;
  const neto = d.comisionCents + ajustes;
  const nombre = d.profesional.trim().split(/\s+/)[0] || d.profesional;
  const lineas = [
    `Hola ${nombre}, te paso el comprobante de tu liquidación en ${d.negocio}.`,
    `Período: ${d.periodo}`,
    `Turnos: ${d.turnos}`,
    `Cobrado: ${pesosDeCentavos(d.baseCents)}`,
    `Comisión: ${pesosDeCentavos(d.comisionCents)}`,
  ];
  if (ajustes !== 0) lineas.push(`Ajustes: ${pesosDeCentavos(ajustes)}`);
  lineas.push(`Total: ${pesosDeCentavos(neto)}`);
  if (d.medio) lineas.push(`Pagado por: ${d.medio}`);
  lineas.push(`Fecha: ${d.fecha}`);
  return lineas.join("\n");
}

/**
 * El link `wa.me` con el comprobante, o `null` si la profesional no tiene un celular usable
 * cargado (no se abre un chat al voleo). PURO.
 */
export function linkDelComprobante(telefono: string | null | undefined, d: DatosDelComprobante): string | null {
  if (!String(telefono ?? "").trim()) return null;
  return waLinkClienta(telefono, textoDelComprobante(d));
}

const MEDIOS: Record<string, string> = {
  EFECTIVO: "Efectivo",
  MP: "Mercado Pago",
  TRANSFERENCIA: "Transferencia",
  TARJETA: "Tarjeta",
};

/** El medio del egreso del libro, en criollo. `null` si no hay egreso o no se reconoce. */
export function nombreDelMedio(method: string | null | undefined): string | null {
  return method ? (MEDIOS[method] ?? null) : null;
}
