// ============================================================================
// RENTABILIDAD / MARGEN por producto — cálculo PURO.
// ============================================================================
//
// Dos preguntas, las dos de la app Margen (/admin/reportes/margen):
//   · "¿algún producto se vende HOY por debajo de lo que me cuesta?": precio de lista contra
//     el COSTO VIGENTE (stock/costo.ts: el mismo número que Stock y el Catálogo). El botón del
//     Inicio cuenta los que tienen el precio de lista por debajo del costo (margen-lectura.ts).
//     También la muestra Reportes en la edición Empresa, como antes.
//   · "¿cuánto dejó cada producto en el mes?": lo vendido al precio al que se vendió, con el
//     costo GUARDADO en cada venta (`margenDeLoVendido`, más abajo).
// Para un Responsable Inscripto los precios van SIN IVA: el IVA del precio no es suyo.
//
// Sin schema nuevo y sin Prisma: el loader arma los datos; acá sólo la aritmética.
//
// Gating por DATO: sólo tienen margen los productos con precio Y costo. Un negocio de
// servicios sin productos con costo no tiene filas.

import { round2 } from "@/lib/round";
import { ALICUOTA_GENERAL } from "./resultado";
import type { LineaCosteada } from "./costo-vendido";

export type SaleUnit = "UNIT" | "WEIGHT";

export interface MarginProductInput {
  id: string;
  name: string;
  saleUnit: SaleUnit;
  /** Precio de venta por unidad (saleUnit=UNIT). */
  price: number | null;
  /** Precio de venta por kilo (saleUnit=WEIGHT). */
  pricePerKg: number | null;
}

export interface MarginRow {
  id: string;
  name: string;
  /** "u." o "kg" según cómo se vende. */
  unitLabel: string;
  price: number;
  cost: number;
  /** Margen bruto por unidad vendida (precio − costo). Puede ser negativo (vende a pérdida). */
  margin: number;
  /** Margen sobre precio (margin/price), en fracción [.. ]. Negativo si vende a pérdida. */
  marginPct: number;
}

/**
 * Calcula el margen por producto para los que tienen precio de venta Y costo conocido.
 * Ordena por margen % descendente (lo más rentable primero). PURA — no muta las entradas.
 * Los productos sin precio o sin costo se OMITEN (no se puede calcular margen sin ambos).
 */
export function computeProductMargins(
  products: readonly MarginProductInput[],
  costByProduct: Readonly<Record<string, number>>,
  opts: { sinIva?: boolean } = {},
): MarginRow[] {
  const rows: MarginRow[] = [];
  for (const p of products) {
    const precioDeLista = p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price;
    // Un Responsable Inscripto compara SIN IVA: el IVA del precio no es suyo. Misma alícuota con
    // la que factura hoy el sistema (fiscal.ts), la de `netoDeIva` del resultado del mes.
    const price = precioDeLista && opts.sinIva ? round2(precioDeLista / (1 + ALICUOTA_GENERAL)) : precioDeLista;
    const cost = costByProduct[p.id];
    if (!price || price <= 0 || !cost || cost <= 0) continue;
    const margin = price - cost;
    rows.push({
      id: p.id,
      name: p.name,
      unitLabel: p.saleUnit === "WEIGHT" ? "kg" : "u.",
      price,
      cost,
      margin,
      marginPct: margin / price,
    });
  }
  return rows.sort((a, b) => b.marginPct - a.marginPct);
}

/** Resumen del panel de margen: promedio ponderado por... nada aún — margen % simple promedio. */
export interface MarginSummary {
  /** Cantidad de productos con margen calculable. */
  count: number;
  /** Margen % promedio (simple) sobre los productos con margen. 0 si no hay ninguno. */
  avgMarginPct: number;
  /** Cuántos venden a pérdida (margen < 0) — foco de atención. */
  belowCostCount: number;
}

/** Resumen agregado de las filas de margen. PURA. */
export function summarizeMargins(rows: readonly MarginRow[]): MarginSummary {
  if (rows.length === 0) return { count: 0, avgMarginPct: 0, belowCostCount: 0 };
  const sum = rows.reduce((s, r) => s + r.marginPct, 0);
  const belowCostCount = rows.filter((r) => r.margin < 0).length;
  return { count: rows.length, avgMarginPct: sum / rows.length, belowCostCount };
}

/** Cuántos productos se venden hoy por debajo del costo (el número del botón de Margen). PURA. */
export function productosBajoCosto(rows: readonly MarginRow[]): number {
  return rows.filter((r) => r.margin < 0).length;
}

// ============================================================================
// MARGEN DE LO VENDIDO — cuánto dejó cada producto en el mes, con el costo GUARDADO.
// ============================================================================
//
// La lista de arriba compara el precio de HOY con el costo de HOY: sirve para corregir un
// precio. Ésta mira lo que efectivamente se vendió en el mes, al precio al que se vendió y
// con el costo que se guardó en cada venta (costo-vendido.ts). Las dos preguntas son
// distintas y la pantalla las muestra separadas.

export interface MargenVendidoRow {
  clave: string;
  nombre: string;
  cantidad: number;
  porKilo: boolean;
  /** Lo vendido (sin IVA para un inscripto), antes del descuento del pedido. */
  ventas: number;
  costo: number;
  /** `null` si alguna línea del producto no tiene costo: no se inventa un margen. */
  margen: number | null;
  margenPct: number | null;
  /** Alguna línea se costeó con el costo de hoy (la venta no lo guardó). */
  conCostoDeHoy: boolean;
}

/** Lo vendido en el mes, por producto, con su margen. De mayor a menor venta. PURA. */
export function margenDeLoVendido(lineas: readonly LineaCosteada[], opts: { sinIva: boolean }): MargenVendidoRow[] {
  const acc = new Map<string, MargenVendidoRow & { sinCosto: boolean }>();
  for (const l of lineas) {
    if (l.fuente === "sin-producto") continue;
    const clave = l.productId ?? l.nombre;
    const r =
      acc.get(clave) ??
      { clave, nombre: l.nombre, cantidad: 0, porKilo: l.saleUnit === "WEIGHT", ventas: 0, costo: 0, margen: null, margenPct: null, conCostoDeHoy: false, sinCosto: false };
    r.cantidad += Math.abs(l.cantidad);
    r.ventas += opts.sinIva ? l.importe / (1 + ALICUOTA_GENERAL) : l.importe;
    r.costo += l.costo;
    if (l.fuente === "costo-de-hoy") r.conCostoDeHoy = true;
    if (l.fuente === "sin-costo") r.sinCosto = true;
    acc.set(clave, r);
  }
  return [...acc.values()]
    .map(({ sinCosto, ...r }) => {
      const ventas = round2(r.ventas);
      const costo = round2(r.costo);
      const margen = sinCosto ? null : round2(ventas - costo);
      return {
        ...r,
        cantidad: Math.round(r.cantidad * 1000) / 1000,
        ventas,
        costo,
        margen,
        margenPct: margen === null || ventas <= 0 ? null : margen / ventas,
      };
    })
    .sort((a, b) => b.ventas - a.ventas);
}
