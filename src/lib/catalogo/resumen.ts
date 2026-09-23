// ============================================================================
// RESUMEN DEL CATÁLOGO — "3 sin precio · 5 sin costo", el mismo número en el botón y en la
// pantalla.
// ============================================================================
//
// Sin precio de venta, el mostrador no lo puede cobrar; sin costo, no hay margen ni valuación.
// El costo es el VIGENTE de src/lib/stock/costo.ts (el mismo de Stock y Margen): el cargado a
// mano si lo hay y, si no, el del último ingreso con costo. Se cuentan los productos activos y
// no borrados: uno pausado no se vende hoy.
//
// PURO: lo usan la página del Catálogo y el número del botón (src/apps/kpis/precios.server.ts).

import { precioDeVenta } from "./aumento-core";

/** El `where` de los productos que cuenta el resumen: activos y no borrados. */
export function whereCatalogoActivo(tenantId: string) {
  return { tenantId, deletedAt: null, active: true };
}

export type ResumenCatalogo = { activos: number; sinPrecio: number; sinCosto: number };

export function resumirCatalogo(
  productos: readonly { id: string; saleUnit: string; price: number | null; pricePerKg: number | null }[],
  costos: Readonly<Record<string, number | null>>,
): ResumenCatalogo {
  let sinPrecio = 0;
  let sinCosto = 0;
  for (const p of productos) {
    const saleUnit = p.saleUnit === "WEIGHT" ? "WEIGHT" : "UNIT";
    if (precioDeVenta({ saleUnit, price: p.price, pricePerKg: p.pricePerKg }) === null) sinPrecio++;
    const costo = costos[p.id];
    if (costo == null || !(costo > 0)) sinCosto++;
  }
  return { activos: productos.length, sinPrecio, sinCosto };
}
