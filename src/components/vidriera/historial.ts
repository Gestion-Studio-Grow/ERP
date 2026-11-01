// El estado de la entrada del historial SIN lo interno de Next (ronda 2). Una tienda que reescribe su URL con
// `history.replaceState(null, …)` borra las marcas propias de la entrada, entre ellas la de la hoja abierta
// (`useHoja`), y cerrar con la X dejaba un «atrás» muerto. Con esto, Next aplica la URL nueva, vuelve a copiar lo suyo,
// y lo demás sobrevive: `history.replaceState(estadoPropio(), "", url)`.
export function estadoPropio(): Record<string, unknown> {
  const s = window.history.state as Record<string, unknown> | null;
  if (!s || typeof s !== "object") return {};
  const { __NA: _na, __PRIVATE_NEXTJS_INTERNALS_TREE: _arbol, ...propio } = s;
  return propio;
}
