// Reglas puras del POS alrededor del stock (sin DB, importables desde el cliente).
//
// 1. `stockShortfall`: aviso ANTICIPADO de faltante. Espeja la guarda anti-oversell del
//    ledger (`recordMovement`: sólo descuenta si `stock >= cantidad`, y si no alcanza aborta
//    TODA la venta). Sin este espejo el mostrador se enteraba recién al cobrar, con un error
//    genérico de servidor. Sólo aplica a productos con `trackStock`; los demás se venden sin
//    bloqueo, como siempre.
// 2. `posEmptyState`: qué decirle a la persona cuando la caja no tiene nada para vender. La
//    causa típica NO es "no hay productos" sino "hay productos pero ninguno con precio" — y
//    la salida depende de si quien mira puede editar el catálogo o tiene que pedirlo.

export type PosStockInfo = { stock: number; trackStock: boolean };

export function stockShortfall(
  info: PosStockInfo | undefined,
  qty: number,
): { available: number } | null {
  if (!info || !info.trackStock) return null;
  if (!(qty > 0)) return null;
  return info.stock >= qty ? null : { available: Math.max(0, info.stock) };
}

export type PosEmptyState = {
  title: string;
  description: string;
  // true → mostrar el botón que lleva al catálogo (quien mira puede cargar precios).
  linkToCatalog: boolean;
};

export function posEmptyState(input: {
  activeProducts: number;
  canManageCatalog: boolean;
}): PosEmptyState {
  const { activeProducts, canManageCatalog } = input;

  if (activeProducts === 0) {
    return {
      title: "Todavía no hay productos para vender",
      description: canManageCatalog
        ? "Cargá tus productos en el catálogo con su precio de venta (por unidad o por kg) y van a aparecer acá para cobrarlos."
        : "Pedile a quien administra el catálogo que cargue los productos con su precio de venta.",
      linkToCatalog: canManageCatalog,
    };
  }

  const n = activeProducts;
  return {
    title: `Hay ${n} producto${n === 1 ? "" : "s"} en el catálogo, pero ninguno tiene precio de venta`,
    description: canManageCatalog
      ? "Editá cada producto en el catálogo y completá el precio de venta (por unidad o por kg). Los que no tengan precio quedan como insumos y no se venden por caja."
      : "Pedile a quien administra el catálogo que les cargue el precio de venta.",
    linkToCatalog: canManageCatalog,
  };
}
