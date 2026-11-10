// Las palabras que en CH (estética) no van y en los demás rubros siguen igual (U13). Client-safe.
// Un solo corte, el de siempre: el slug `beauty-spa`. No cambia ninguna regla, sólo lo que se lee.

export function esEstetica(slug: string | null | undefined): boolean {
  return slug === "beauty-spa";
}

export type PalabrasDelNegocio = ReturnType<typeof palabrasDelNegocio>;

export function palabrasDelNegocio(slug: string | null | undefined) {
  return esEstetica(slug)
    ? {
        cobrarLaVenta: "Cobrar una venta",
        contarTodo: "Contar todo el stock",
        contarTodoDentro: "contar todo el stock",
        reabrirAviso: "un cobro o un gasto sin cargar",
        reabrirQueFalto: "un cobro o un gasto sin cargar",
        reabrirMotivo: "faltó cargar un cobro",
      }
    : {
        cobrarLaVenta: "Cobrar en el mostrador",
        contarTodo: "Contar una góndola entera",
        contarTodoDentro: "contar una góndola entera",
        reabrirAviso: "una venta del cuaderno, una rendición",
        reabrirQueFalto: "la venta del cuaderno, la rendición del cadete",
        reabrirMotivo: "faltó cargar una venta del cuaderno",
      };
}

/**
 * Los textos del mostrador que mandan a «Ventas del día», en un negocio que no tiene esa pantalla
 * (CH): sus ventas cobradas están en Vender, en «Cerrados». Va sobre el texto, y en un solo lugar,
 * para que los avisos de cobro —los comparten todos los rubros— sigan siendo uno. PURA.
 */
export function sinVentasDelDia(texto: string): string {
  return texto
    .replace(/el dueño,? desde Ventas del día/g, "la dueña")
    .replace(/queda marcado en Ventas del día/g, "queda registrado")
    .replace(/Ventas del día/g, "Vender, en «Cerrados»");
}

/** Cómo se llama el lugar donde se atiende (el modelo `Box`): en peluquería y barbería, «sillón». */
export type LugarDeAtencion = { singular: string; Singular: string; plural: string; Plural: string };

const BOX: LugarDeAtencion = { singular: "box", Singular: "Box", plural: "boxes", Plural: "Boxes" };
const SILLON: LugarDeAtencion = { singular: "sillón", Singular: "Sillón", plural: "sillones", Plural: "Sillones" };
const RUBROS_CON_SILLON = new Set(["peluqueria", "barberia"]);

/**
 * El nombre del lugar de atención según el rubro (`Tenant.blueprintId`). Sólo cambia lo que se
 * lee: el dato sigue siendo un `Box`. Cualquier otro rubro, o un tenant sin blueprint (CH), dice
 * «box» como siempre. PURA.
 */
export function lugarDeAtencion(blueprintId: string | null | undefined): LugarDeAtencion {
  return blueprintId && RUBROS_CON_SILLON.has(blueprintId) ? SILLON : BOX;
}
