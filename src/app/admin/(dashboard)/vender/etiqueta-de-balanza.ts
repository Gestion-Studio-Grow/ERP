// LA ETIQUETA QUE DICE OTRO IMPORTE QUE EL SISTEMA (Magra, MG-023 · F-1 de la certificación T1).
//
// La balanza imprime el importe en la etiqueta con SU precio por kilo; el sistema cobra kilos ×
// el precio del catálogo. Si no coinciden (la balanza quedó con el precio viejo, o se cargó otro
// en el catálogo), el renglón entra al precio del SISTEMA y la diferencia queda escrita en el
// renglón —«Etiqueta $X · Sistema $Y»—, no sólo anunciada una vez al pasar la etiqueta.
//
// «Cobrar el de la etiqueta» es del Dueño: convierte el renglón en una línea a PRECIO A MANO con
// el importe del papel y el motivo «etiqueta de balanza». El nombre de la línea es el del
// producto, a propósito: el alta la pasa por `controlarPreciosAManoEnTx` (order-core.ts) con el
// tope que sale del ROL de la sesión, y para quien tiene tope un producto por kilo con precio NO
// se carga a mano («se vende por kilo… con tu usuario no se carga a mano»). Si alguien sin el rol
// forjara la línea, el servidor la rechaza y no graba nada. La pantalla sólo ofrece el chip con la
// MISMA regla (`puedeCobrarElDeLaEtiqueta`, el tope `null` del Dueño).
//
// Lo que se resigna (anotado): la línea a mano no descuenta stock (no tiene producto, como toda
// línea a mano). Es una decisión del Dueño, renglón por renglón, y queda marcada en Ventas del día.
//
// PURO: lo usan la pantalla (VenderForm) y los tests.

import { fmtMoneyARS } from "@/components/ui/format";
import { formatearCantidad } from "@/lib/pos-peso";
import type { TopePrecioAMano } from "@/lib/venta-reglas";

/** El motivo con el que queda la línea a mano (y la palabra que la distingue en la auditoría). */
export const MOTIVO_ETIQUETA_DE_BALANZA = "etiqueta de balanza";

/** La leyenda del chip, la que pide el diseño (MG-023). */
export const COBRAR_EL_DE_LA_ETIQUETA = "Cobrar el de la etiqueta";

/** Redondeo al centavo, como el servidor (`buildOrderLines`). */
function alCentavo(n: number): number {
  return Math.round(n * 100) / 100;
}

/** ¿El papel dice otro importe que el sistema? Al centavo. PURA. */
export function etiquetaDistinta(importeEtiqueta: number | null | undefined, importeSistema: number): boolean {
  return (
    importeEtiqueta != null &&
    Number.isFinite(importeEtiqueta) &&
    importeEtiqueta > 0 &&
    Math.abs(alCentavo(importeEtiqueta) - alCentavo(importeSistema)) >= 0.01
  );
}

/** «Etiqueta $18.538 · Sistema $17.732» — lo que queda escrito bajo el renglón. PURA. */
export function textoEtiquetaDistinta(importeEtiqueta: number, importeSistema: number): string {
  return `Etiqueta ${fmtMoneyARS(importeEtiqueta)} · Sistema ${fmtMoneyARS(importeSistema)}`;
}

/**
 * ¿Quien vende puede cobrar el de la etiqueta? Sólo quien no tiene tope de precio a mano (el
 * Dueño: `topeDePrecioAMano(role)` da null). El servidor decide igual, con el rol de la sesión.
 */
export function puedeCobrarElDeLaEtiqueta(tope: TopePrecioAMano | null | undefined): boolean {
  return tope === null;
}

export type LineaAManoDeLaEtiqueta = { nombre: string; importeText: string; motivo: string };

/**
 * El renglón convertido en línea a mano: el nombre del producto, el importe del papel y el motivo
 * «etiqueta de balanza (0,62 kg; el sistema daba $17.732)». PURA.
 */
export function lineaAManoDeLaEtiqueta(d: {
  nombre: string;
  kg: number;
  importeEtiqueta: number;
  importeSistema: number;
}): LineaAManoDeLaEtiqueta {
  return {
    nombre: d.nombre,
    importeText: fmtMoneyARS(alCentavo(d.importeEtiqueta)),
    motivo: `${MOTIVO_ETIQUETA_DE_BALANZA} (${formatearCantidad(d.kg)} kg; el sistema daba ${fmtMoneyARS(alCentavo(d.importeSistema))})`,
  };
}
