// ============================================================================
// PEDIDOS — lo que viaja a las acciones desde el diseño nuevo. PURO.
// ============================================================================
//
// El tablero nuevo cobra, entrega, avanza y anula con las MISMAS Server Actions de la bandeja de
// siempre (`cobrarPedido`, `entregarPedido`, `advanceOrderStatus`, `anularVenta`,
// order-actions.ts) y les manda EXACTAMENTE los mismos campos que mandaban los formularios viejos
// (CobrarPedidoForm, EntregarPedidoForm, AvanzarPedidoForm, AnularPedidoForm):
//
//   · cobrar:   id, paymentMethod ("" si no se eligió: el servidor lo rechaza con su texto);
//   · entregar: id, paymentMethod (sólo si no tildó «Queda a cobrar»: el select deshabilitado no
//               viajaba), quedaACobrar="on" si lo tildó;
//   · avanzar:  id;
//   · anular:   id, motivo, stockNoVolvio="on" si lo tildó.
//
// Lo prueba formularios-del-pedido.test.ts contra lo que armaba cada formulario viejo.

export type CamposDelCobro = { id: string; medio: string; quedaACobrar: boolean };

/** Lo que manda «Cobrar» (bandeja de siempre: CobrarPedidoForm). */
export function camposDelCobro(c: Pick<CamposDelCobro, "id" | "medio">): [string, string][] {
  return [
    ["id", c.id],
    ["paymentMethod", c.medio],
  ];
}

/** Lo que manda «Entregar» (bandeja de siempre: EntregarPedidoForm). Ya cobrado: sólo el id. */
export function camposDeLaEntrega(c: CamposDelCobro & { cobrado: boolean }): [string, string][] {
  if (c.cobrado) return [["id", c.id]];
  const out: [string, string][] = [["id", c.id]];
  if (!c.quedaACobrar) out.push(["paymentMethod", c.medio]);
  if (c.quedaACobrar) out.push(["quedaACobrar", "on"]);
  return out;
}

/** Lo que manda «Anular» (bandeja de siempre: AnularPedidoForm). */
export function camposDeLaAnulacion(c: { id: string; motivo: string; stockNoVolvio: boolean }): [string, string][] {
  const out: [string, string][] = [
    ["id", c.id],
    ["motivo", c.motivo],
  ];
  if (c.stockNoVolvio) out.push(["stockNoVolvio", "on"]);
  return out;
}

export function aFormData(campos: readonly [string, string][]): FormData {
  const fd = new FormData();
  for (const [k, v] of campos) fd.append(k, v);
  return fd;
}

/** El texto de la tecla de la entrega, según lo elegido. */
export function textoDeLaEntrega(c: { cobrado: boolean; medio: string; quedaACobrar: boolean; total: string }): string {
  if (c.cobrado) return "Entregar";
  if (c.quedaACobrar) return "Entregar sin cobrar";
  if (c.medio) return `Cobrar ${c.total} y entregar`;
  return "Entregar";
}

/** El redirect de sesión vencida llega como excepción con digest NEXT_REDIRECT: se deja pasar. */
export function esRedirectDeNext(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}
