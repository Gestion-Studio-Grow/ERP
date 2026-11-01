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
