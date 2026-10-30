// LA BOLSA DE UNA TIENDA, EN PURO (ronda 2, P0-3 `src/components/vidriera/`). Lo que comparten las cuatro tiendas y
// toca plata: qué se le cree a una bolsa guardada en el navegador y qué viaja al servidor en cada renglón. Sin React:
// se testea solo (vidriera.test.ts).
//
// Nada de esto decide un precio ni un total: el servidor (`placeOnlineOrder`) vuelve a leer cada producto y su precio.
// El `unitPrice` que viaja es el que la vidriera MOSTRÓ, para que el servidor avise si cambió (reglas-tienda.ts
// `preciosVistos`) en vez de cobrar distinto sin decir nada. Antes sólo Magra lo mandaba.

/** Una bolsa: id del producto → cantidad (unidades, o kilos en lo que se vende por peso). */
export type BolsaSimple = Readonly<Record<string, number>>;

/** Tope de cantidad por renglón que se le cree a una bolsa guardada (el servidor tiene su propio tope). */
export const TOPE_GUARDADO = 999;

/**
 * Lo que se le cree a una bolsa leída del navegador: sólo productos que la vidriera tiene hoy (la clave puede llevar la
 * variante después de «|»: `id|aroma`, `id|talle`) y cantidades positivas, finitas y razonables. Cualquier otra cosa (JSON viejo, editado a mano, de otro catálogo) se descarta en silencio:
 * la bolsa arranca con lo que sirve. PURA.
 */
export function limpiarBolsaGuardada(cruda: unknown, idsValidos: ReadonlySet<string>): Record<string, number> {
  if (!cruda || typeof cruda !== "object" || Array.isArray(cruda)) return {};
  const out: Record<string, number> = {};
  for (const [id, q] of Object.entries(cruda as Record<string, unknown>)) {
    const [producto, variante = ""] = id.split("|");
    if (!idsValidos.has(producto) || variante.length > 80) continue;
    if (typeof q !== "number" || !Number.isFinite(q) || q <= 0 || q > TOPE_GUARDADO) continue;
    out[id] = q;
  }
  return out;
}

/** Un renglón tal como viaja en el formulario del pedido. */
export type RenglonDelPedido = { productId: string; quantity: number; unitPrice: number | null };

/**
 * Los renglones del pedido a partir de la bolsa, en el orden de la bolsa, con el precio unitario que la vidriera
 * MUESTRA (por unidad o por kilo). Un producto que ya no está en el catálogo no viaja. PURA.
 */
export function renglonesDelPedido<P extends { id: string }>(
  bolsa: BolsaSimple,
  porId: ReadonlyMap<string, P>,
  precioVisto: (p: P) => number | null | undefined,
): RenglonDelPedido[] {
  const out: RenglonDelPedido[] = [];
  for (const [id, q] of Object.entries(bolsa)) {
    const p = porId.get(id);
    if (!p || !(q > 0)) continue;
    const precio = precioVisto(p);
    out.push({ productId: id, quantity: q, unitPrice: typeof precio === "number" && Number.isFinite(precio) && precio > 0 ? precio : null });
  }
  return out;
}

/**
 * ¿Se mandan los precios vistos? Todos o ninguno: el servidor empareja `unitPrice` con `productId` por posición y, si
 * no vienen todos, no usa ninguno (reglas-tienda.ts `preciosVistos`). Un renglón sin precio visible (a consultar) no
 * debe correr a los demás. PURA.
 */
export function mandaPreciosVistos(renglones: readonly RenglonDelPedido[]): boolean {
  return renglones.length > 0 && renglones.every((r) => r.unitPrice != null);
}
