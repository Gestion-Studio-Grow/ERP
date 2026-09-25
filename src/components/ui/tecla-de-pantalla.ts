// ============================================================================
// TECLADO DE PANTALLA — cuándo una tecla suelta es de la pantalla y no de otro.
// ============================================================================
//
// Una sola regla para la tabla (Tabla.tsx), el tablero de pedidos («/» al buscador) y el libro del
// día de la agenda (↑/↓ o j/k): la tecla no es de la pantalla si viene con Ctrl/⌘/Alt (Ctrl/⌘K es
// del buscador), si se escribe en un campo, o si hay un diálogo o un desplegable abierto encima.

/** ¿Se está escribiendo en un campo? Entonces la letra es texto, no un atajo. */
export function esCampo(el: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(el instanceof HTMLElement)) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/** ¿Hay un diálogo o un desplegable abierto encima? Entonces las teclas son de él. */
export function hayAlgoEncima(): boolean {
  if (document.querySelector("dialog[open]")) return true;
  try {
    return document.querySelector(":popover-open") !== null;
  } catch {
    return false; // navegador sin :popover-open
  }
}

/** La tecla es de la pantalla: sin modificadores, fuera de un campo y sin nada abierto encima. */
export function teclaDeLaPantalla(e: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey" | "target">): boolean {
  return !(e.ctrlKey || e.metaKey || e.altKey) && !esCampo(e.target) && !hayAlgoEncima();
}
