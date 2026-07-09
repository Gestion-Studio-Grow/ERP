// Formateo de valores para las pantallas de datos del producto (cuentas a
// pagar/cobrar, libros, inventario, devoluciones…) — helpers PUROS y
// testeados, sin lógica de negocio ni de schema. Mismo patrón que
// data-table-sort.ts/profile-labels.ts: la aritmética/formato vive acá,
// testeable sin renderizar nada; `data-table-columns.tsx` solo la envuelve
// en JSX para usarla como `cell` de una `DataTableColumn`.
//
// Moneda: sigue la convención YA vigente en el producto ("$" + agrupador
// es-AR, ver dashboard/BookingForm/ServicesAccordion) en vez de
// `Intl.NumberFormat({style:"currency"})`, que en algunos entornos ICU
// renderiza "$ 1.234,50" (espacio) o "ARS 1.234,50" — distinto a lo que el
// resto del producto ya muestra. La diferencia real: acá se FUERZAN siempre
// 2 decimales (grado contable, `Decimal(14,2)` de ADR-057) — los usos
// ad-hoc existentes no lo garantizan (ej. `9900.5.toLocaleString("es-AR")`
// muestra 1 decimal, no 2).

/**
 * Monto en pesos argentinos: "$1.234,50". Acepta `number` o `string`
 * (el `.toString()`/`.toFixed()` de un `Prisma.Decimal` ya convertido en el
 * borde de lectura del server, ADR-057 — este módulo no importa Prisma:
 * es capa de presentación, portable). `null`/`undefined`/no-numérico -> "—".
 * Negativos: el signo va ANTES del "$" ("-$1.234,50"), no después.
 */
export function fmtMoneyARS(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}$${abs}`;
}

/**
 * Número simple agrupado es-AR (sin "$"), para cantidades/conteos en columnas
 * numéricas (ej. "días de mora", "unidades"). Sin decimales por default —
 * `decimals` los fuerza cuando la cantidad es fraccionaria (venta por kg).
 * `null`/`undefined`/no-numérico -> "—".
 */
export function fmtNumberAR(value: number | string | null | undefined, decimals = 0): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
