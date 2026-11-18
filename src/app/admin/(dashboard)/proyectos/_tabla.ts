// Piezas compartidas de las tablas de proyectos: el importe con el helper único y la tabla que a menos de 768 px se
// vuelve tarjetas apiladas. Sin estado propio; sirve a componentes de servidor y de cliente.
//
// Tarjetas: cada fila es una tarjeta y cada celda un renglón «etiqueta · valor»; la etiqueta sale del `data-label` de
// la celda. Nada se esconde: importes, estado y botones quedan a la vista en el teléfono (MIA-50 § 2.2 bis, V2).

import { pesos } from "@/lib/proyectos/core";
import { enMonedaDeVenta, plataEn } from "@/lib/proyectos/gestion-core";

/** Un importe en su moneda. En pesos, siempre `pesos` (core); en otra moneda no hay helper de pesos que sirva. */
export function importe(monto: number, moneda = "ARS"): string {
  return moneda === "ARS" ? pesos(monto) : plataEn(monto, moneda);
}

/** Un importe guardado en pesos, mostrado en la moneda de venta del evento (sin cambio cargado, en pesos). */
export function importeDeVenta(enPesos: number, moneda = "ARS", cambio = 1): string {
  return moneda === "ARS" || !(cambio > 0) ? pesos(enPesos) : plataEn(enMonedaDeVenta(enPesos, cambio), moneda);
}

/** `<table>`: en el teléfono deja de ser tabla. Su ancho mínimo de escritorio va con `md:` (p. ej. `md:min-w-[920px]`). */
export const tablaMovil = "max-md:block";
/** `<thead>`: en el teléfono la etiqueta va en cada celda. */
export const cabezaMovil = "max-md:hidden";
/** `<tbody>`. */
export const cuerpoMovil = "max-md:block";
/** `<tr>`: una tarjeta. */
export const filaMovil = "max-md:grid max-md:gap-1 max-md:py-3";
/** `<td>` con `data-label`: «etiqueta · valor» en dos columnas. */
export const celdaMovil =
  "max-md:grid max-md:grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] max-md:items-center max-md:gap-x-3 max-md:py-0.5 max-md:pr-0 max-md:text-left max-md:whitespace-normal max-md:before:text-xs max-md:before:font-medium max-md:before:text-muted max-md:before:content-[attr(data-label)]";
/** `<td>` de botones: a todo el ancho de la tarjeta, sin etiqueta. */
export const accionesMovil = "max-md:block max-md:pt-2 max-md:pr-0";

/**
 * Las mismas tarjetas para una tabla que no se toca desde acá (la de ítems de la ficha, que es de otra tanda): el
 * envoltorio lleva `data-tarjetas={ambito}` y este CSS, y las etiquetas van por posición de la celda. Una etiqueta
 * vacía es la celda de botones: a todo el ancho. Deuda: cuando la tabla lleve `data-label`, esto se borra.
 */
export function cssTarjetas(ambito: string, etiquetas: readonly string[]): string {
  const s = `[data-tarjetas="${ambito.replace(/[^\w-]/g, "")}"]`;
  const texto = (e: string) => JSON.stringify(e).replace(/</g, "\\3c ");
  const rotulos = etiquetas
    .map((e, n) => (e ? `${s} td:nth-child(${n + 1})::before{content:${texto(e)}}` : `${s} td:nth-child(${n + 1}){display:block;padding-top:.5rem}`))
    .join("");
  return (
    `@media (width < 48rem){` +
    `${s} table,${s} tbody,${s} th{display:block;min-width:0}${s} thead{display:none}` +
    `${s} tr{display:grid;gap:.25rem}${s} tr:has(>td){padding-block:.75rem}` +
    `${s} td{display:grid;grid-template-columns:minmax(0,7.5rem) minmax(0,1fr);align-items:center;column-gap:.75rem;min-width:0;padding:.125rem 0;text-align:left;white-space:normal}` +
    `${s} td>*{grid-column:2}${s} td>label,${s} td>a{justify-content:flex-start}` +
    `${s} td::before{font-size:.75rem;font-weight:500;color:var(--color-muted)}` +
    rotulos +
    `}`
  );
}

type ColumnasFicha = { costoUnit: boolean; costoTotal: boolean; recargo: boolean; margen: boolean };

/** Las etiquetas de las tarjetas del teléfono, en el orden de las columnas de `TablaFicha` (_tabla-ficha.tsx:95-110). */
export function etiquetasFicha(c: ColumnasFicha, editable: boolean, moneda: string): string[] {
  const m = moneda === "USD" ? "US$" : "$";
  return [
    "Descripción", "Proveedor", "Cant.",
    ...(c.costoUnit ? ["Costo u.", "Moneda"] : []),
    ...(c.recargo ? ["Recargo %"] : []),
    ...(c.costoTotal ? [`Costo ${m}`, "Costo real $"] : []),
    `Venta u. ${m}`, `Venta ${m}`,
    ...(c.margen ? ["Margen"] : []),
    "Fecha límite", "Estado", "Visible", "Adjuntos",
    ...(editable ? [""] : []),
  ];
}
