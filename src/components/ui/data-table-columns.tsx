import { fmtMoneyARS, fmtNumberAR } from "./format";
import { fmtShortDate } from "@/lib/datetime";
import { Badge, type BadgeTone } from "./Badge";
import type { DataTableColumn } from "./DataTable";

// Bloques de presentación reutilizables SOBRE DataTable — para que las
// pantallas de datos del producto (cuentas a pagar/cobrar, libros,
// inventario, devoluciones…) arme sus columnas sin reinventar formato de
// moneda/fecha/estado ni la alineación numérica cada vez. Cada helper es una
// FÁBRICA que devuelve un `DataTableColumn<T>` ya armado: el llamador solo
// dice CÓMO sacar el valor de su fila (`get`), no cómo se ve.
//
// Sin lógica de negocio ni de schema: no sabe qué es una "cuenta vencida" ni
// importa Prisma. El mapeo de columna→valor (`get`) y el significado de cada
// estado (qué tono le corresponde a "PAGADA" vs "VENCIDA") los define cada
// pantalla — eso SÍ es negocio de esa entidad.
//
// El formateo puro (testeado) vive en `format.ts`; acá solo se envuelve en
// JSX + se compone con `DataTable` (align, sortable). Reusa `fmtShortDate`
// de `@/lib/datetime` para fechas — no reinventa Intl.DateTimeFormat acá.

type ColumnOpts = {
  sortable?: boolean;
  className?: string;
};

/** Columna de texto simple — azúcar sintáctico para no mezclar objetos crudos con las demás fábricas. */
export function textColumn<T>(
  key: string,
  header: React.ReactNode,
  get: (row: T) => React.ReactNode,
  opts?: ColumnOpts,
): DataTableColumn<T> {
  return { key, header, cell: get, sortable: opts?.sortable, className: opts?.className };
}

/**
 * Columna de monto en pesos ("$1.234,50"), alineada a la derecha. Sirve
 * también para SALDOS (deudor/acreedor): negativos muestran "-$…" (ver
 * `fmtMoneyARS`). `get` puede devolver `number | string | null | undefined`
 * (un `Decimal` del server ya convertido, o su `.toString()`).
 */
export function moneyColumn<T>(
  key: string,
  header: React.ReactNode,
  get: (row: T) => number | string | null | undefined,
  opts?: ColumnOpts,
): DataTableColumn<T> {
  return {
    key,
    header,
    align: "right",
    cell: (row) => fmtMoneyARS(get(row)),
    sortable: opts?.sortable,
    className: opts?.className,
  };
}

/**
 * Columna numérica simple (cantidades, conteos — sin "$"), alineada a la
 * derecha. `decimals` fuerza decimales cuando la cantidad es fraccionaria
 * (ej. kg).
 */
export function numberColumn<T>(
  key: string,
  header: React.ReactNode,
  get: (row: T) => number | string | null | undefined,
  opts?: ColumnOpts & { decimals?: number },
): DataTableColumn<T> {
  return {
    key,
    header,
    align: "right",
    cell: (row) => fmtNumberAR(get(row), opts?.decimals ?? 0),
    sortable: opts?.sortable,
    className: opts?.className,
  };
}

/**
 * Columna de fecha corta ("DD/MM/AAAA"), en la zona horaria del negocio
 * (`fmtShortDate`, `@/lib/datetime` — no reinventa el formato). `get` puede
 * devolver `null` (ej. "fecha de pago" de una cuenta todavía impaga) -> "—".
 */
export function dateColumn<T>(
  key: string,
  header: React.ReactNode,
  get: (row: T) => Date | string | null | undefined,
  opts?: ColumnOpts,
): DataTableColumn<T> {
  return {
    key,
    header,
    cell: (row) => {
      const value = get(row);
      return value == null ? "—" : fmtShortDate(value);
    },
    sortable: opts?.sortable,
    className: opts?.className,
  };
}

/**
 * Columna de estado — envuelve el `Badge` YA existente (D6), no reinventa el
 * pill. Default `tone: "neutral"` (canal neutro, D5 por extensión): cada
 * pantalla decide si un estado puntual amerita semáforo (ej. "Vencida" en
 * `danger`) pasando `tone` desde su propio mapa estado→tono — ESE mapeo es
 * negocio de la entidad, no de este helper.
 */
export function statusColumn<T>(
  key: string,
  header: React.ReactNode,
  get: (row: T) => { label: string; tone?: BadgeTone },
  opts?: ColumnOpts,
): DataTableColumn<T> {
  return {
    key,
    header,
    cell: (row) => {
      const { label, tone } = get(row);
      return <Badge tone={tone ?? "neutral"}>{label}</Badge>;
    },
    sortable: opts?.sortable,
    className: opts?.className,
  };
}
