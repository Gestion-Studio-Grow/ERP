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
 * Monto en pesos argentinos: "$1.234,50" (canónico: signo pegado, SIN espacio
 * tras el "$"). Acepta `number` o `string` (el `.toString()`/`.toFixed()` de un
 * `Prisma.Decimal` ya convertido en el borde de lectura del server, ADR-057 —
 * este módulo no importa Prisma: es capa de presentación, portable).
 * `null`/`undefined`/no-numérico -> "—".
 * Negativos: el signo va ANTES del "$" ("-$1.234,50"), no después.
 * `decimals` (default 2, grado contable) permite 0 para KPIs headline
 * ("$1.234.567") — las TABLAS siguen en 2 decimales (ADR-057 intacto).
 */
export function fmtMoneyARS(value: number | string | null | undefined, decimals = 2): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n).toLocaleString("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sign}$${abs}`;
}

/**
 * CUIT/CUIL legible: "20376833098" → "20-37683309-8" (XX-XXXXXXXX-X).
 * Acepta el número con o sin guiones/espacios; si no tiene 11 dígitos lo
 * devuelve tal cual (no inventa formato). `null`/`undefined`/vacío -> "—".
 */
export function fmtCuit(cuit: string | null | undefined): string {
  if (!cuit) return "—";
  const d = cuit.replace(/\D/g, "");
  if (d.length !== 11) return cuit;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
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
