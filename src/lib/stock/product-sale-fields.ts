// Campos de VENTA de un producto, parseados desde el FormData del catálogo: forma de
// venta (por unidad / por peso), precio de venta y control de stock. Lógica pura, sin DB.
//
// Vive acá y no en `catalog-actions.ts` porque ese archivo es `"use server"` y sólo puede
// exportar funciones async: lo puro que hay que testear tiene que salir de ahí.
//
// Regla de "sólo si el form lo manda": cada grupo se aplica ÚNICAMENTE cuando el form trae
// el campo. Así un form que no conoce estos campos (una integración vieja, un ABM parcial)
// no pisa el precio ni el flag de un producto existente. `undefined` = no tocar.

export type SaleUnit = "UNIT" | "WEIGHT";

export type ProductSaleFields = {
  saleUnit?: SaleUnit;
  price?: number | null;
  pricePerKg?: number | null;
  trackStock?: boolean;
};

// Precio válido = número finito > 0. Vacío, 0, negativo o basura → null ("no se vende").
function positivePriceOrNull(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Parsea los campos de venta del FormData.
//
// - `saleUnit` presente → se fija la forma de venta y el precio QUE CORRESPONDE a esa forma;
//   el otro precio se anula para que el producto nunca quede incoherente (saleUnit=UNIT con
//   sólo pricePerKg cargado aparecía en la caja a $0 y la venta se rechazaba: el callejón
//   sin salida que esto cierra).
// - `trackStock` presente → el form manda un hidden "off" y el checkbox "on"; con que
//   aparezca un "on" el control queda activo. Ausente → no se toca.
export function parseSaleFields(formData: FormData): ProductSaleFields {
  const out: ProductSaleFields = {};

  if (formData.has("saleUnit")) {
    const saleUnit: SaleUnit =
      String(formData.get("saleUnit") || "").trim() === "WEIGHT" ? "WEIGHT" : "UNIT";
    out.saleUnit = saleUnit;
    out.price = saleUnit === "UNIT" ? positivePriceOrNull(formData.get("price")) : null;
    out.pricePerKg = saleUnit === "WEIGHT" ? positivePriceOrNull(formData.get("pricePerKg")) : null;
  }

  if (formData.has("trackStock")) {
    out.trackStock = formData
      .getAll("trackStock")
      .some((v) => String(v) === "on" || String(v) === "true");
  }

  return out;
}

// Precio de venta vigente según la forma de venta (null = no se vende por caja).
// Misma regla que `sellPrice` de order-core, duplicada acá para que la UI (cliente)
// no arrastre el módulo de órdenes (que importa Prisma).
export function salePriceOf(p: {
  saleUnit: SaleUnit;
  price: number | null;
  pricePerKg: number | null;
}): number | null {
  const v = p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price;
  return v != null && v > 0 ? v : null;
}
