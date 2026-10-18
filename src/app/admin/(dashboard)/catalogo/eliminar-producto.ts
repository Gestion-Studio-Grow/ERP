// ============================================================================
// ELIMINAR UN PRODUCTO — lo que pasa de verdad, dicho antes del «Sí, eliminar».
// ============================================================================
//
// Sale de `deleteProduct` (catalog-actions.ts): es un borrado LÓGICO (`deletedAt`). El producto
// deja de aparecer en todo lo que lee sólo los no borrados (catálogo, Vender, la tienda), pero su
// fila sigue: las ventas, compras y movimientos de stock que lo nombran quedan como estaban, y su
// código/PLU sigue ocupado (el índice único por negocio no mira `deletedAt`). En el panel no hay
// botón para recuperarlo.
//
// PURO: lo usan los dos catálogos de mostrador (CortesSection y CatalogoRenglon) y su test.

export function consecuenciasDeEliminar(p: { name: string; codigo?: string | null }): string[] {
  return [
    "Deja de verse en el catálogo, en Vender y en la tienda.",
    "Las ventas, compras y movimientos de stock donde aparece quedan como estaban.",
    ...(p.codigo ? [`Su código ${p.codigo} sigue ocupado: no se lo vas a poder dar a otro producto.`] : []),
    "No se puede deshacer desde el panel.",
  ];
}

export function preguntaDeEliminar(p: { name: string }): string {
  return `¿Eliminar «${p.name}»?`;
}
