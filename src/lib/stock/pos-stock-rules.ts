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
// 3. `permiteVenderSinStock` / `faltanteDeLinea`: cuándo el faltante AVISA en vez de
//    bloquear (MAG-4, la carne pesada al gramo). Ver el comentario de la regla.
//
// Sin Prisma (string literals, no el enum `ProductSaleUnit`): lo importa el POS, que es un
// client component.

export type PosStockInfo = { stock: number; trackStock: boolean };

export type UnidadDeVenta = "UNIT" | "WEIGHT";

/**
 * Dónde se está descontando el stock:
 *  - COUNTER: la venta de mostrador, con la mercadería en la mano;
 *  - ONLINE: el pedido para retiro o envío (backoffice, vidriera, ingesta externa);
 *  - EDICION_PESO_REAL: se reescribe un pedido ya tomado con el peso que dio la balanza.
 */
export type ContextoDeStock = "COUNTER" | "ONLINE" | "EDICION_PESO_REAL";

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

// ============================================================================
// MAG-4 — EL PAQUETE ESTÁ EN LA MANO: EL FALTANTE AVISA, NO BLOQUEA.
// ============================================================================
//
// QUÉ PASABA. Si la cantidad superaba el stock cargado, el POS deshabilitaba «Cobrar» y el
// servidor abortaba la venta entera (`recordMovement` sólo descuenta si `stock >= qty`). En
// carne el stock en kilos no coincide al gramo con lo que hay: los paquetes al vacío pesan
// distinto, la merma de limpieza y envasado no siempre se carga. Con el cliente en la caja y
// un vacío de 1,240 kg en la mano, el sistema decía "quedan 1,1 kg" y la venta no salía. Las
// dos salidas que quedaban —ir al catálogo a cambiar el stock o apagar «Controlar stock»—
// pierden el control justo donde se quería tenerlo.
//
// LA REGLA. Se vende aunque el sistema diga que no alcanza SÓLO si se cumplen las dos:
//   · el producto se vende POR PESO (el número del sistema es una estimación, no un conteo), y
//   · la mercadería está físicamente delante: venta de MOSTRADOR, o la edición de un pedido
//     con el peso real que marcó la balanza.
// Todo lo demás sigue bloqueando como antes: lo que se vende por unidad se cuenta y si el
// sistema dice cero es cero; un pedido online o de la ingesta externa promete mercadería que
// nadie tiene en la mano, y ahí la guarda es la que evita vender lo que no hay.
//
// El stock queda en negativo con su VENTA normal en el ledger. No se agrega un AJUSTE que lo
// compense: el negativo ES el aviso de que hay que recontar ese producto, y taparlo con un
// ajuste automático borraría la única pista.
export function permiteVenderSinStock(input: {
  saleUnit: UnidadDeVenta | string;
  contexto: ContextoDeStock;
}): boolean {
  if (input.saleUnit !== "WEIGHT") return false;
  return input.contexto === "COUNTER" || input.contexto === "EDICION_PESO_REAL";
}

/**
 * Los ids de los productos que en ESTE contexto pueden quedar en negativo. Es el dato
 * explícito que el llamador (createOrder, con la unidad leída del Product en la base —nunca
 * del formulario—) le pasa a `insertOrder`. `insertOrder` no decide nada: si no le llega esta
 * lista, no permite negativo para nadie, y así la vidriera y la ingesta externa no heredan la
 * excepción.
 */
export function productosQuePuedenQuedarNegativos(
  products: { id: string; saleUnit: UnidadDeVenta | string }[],
  contexto: ContextoDeStock,
): string[] {
  return products
    .filter((p) => permiteVenderSinStock({ saleUnit: p.saleUnit, contexto }))
    .map((p) => p.id);
}

/** Cantidad con coma y el signo menos tipográfico, como se lee en el mostrador: "−0,14". */
function cantidadLegible(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  const s = Math.abs(r).toString().replace(".", ",");
  return r < 0 ? `−${s}` : s;
}

/**
 * Qué hacer con una línea del ticket frente al stock:
 *  - `null`: alcanza, o el producto no controla stock;
 *  - `{ bloquea: true }`: no alcanza y la regla no permite vender igual (el caso de siempre);
 *  - `{ bloquea: false, aviso }`: no alcanza, se vende igual y la fila dice cuánto queda.
 */
export function faltanteDeLinea(
  info: PosStockInfo | undefined,
  qty: number,
  linea: { saleUnit: UnidadDeVenta | string; contexto: ContextoDeStock },
):
  | null
  | { bloquea: true; available: number }
  | { bloquea: false; available: number; quedaria: number; aviso: string } {
  const short = stockShortfall(info, qty);
  if (!short || !info) return null;
  if (!permiteVenderSinStock(linea)) return { bloquea: true, available: short.available };
  const quedaria = Math.round((info.stock - qty) * 1000) / 1000;
  return {
    bloquea: false,
    available: short.available,
    quedaria,
    aviso:
      `El sistema tenía ${cantidadLegible(info.stock)} kg; se vende igual y queda en ` +
      `${cantidadLegible(quedaria)} kg. Recontalo en Inventario.`,
  };
}
