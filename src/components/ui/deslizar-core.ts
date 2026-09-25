// ============================================================================
// DESLIZAR PARA CONFIRMAR — cuándo un arrastre confirma. Puro: sin React.
// ============================================================================
//
// Para lo irreversible (cerrar el día, cerrar el mes, anular un cobro): un toque suelto no alcanza,
// hay que llevar la perilla hasta el final. Si se suelta antes, vuelve (con resorte). Con el
// teclado: flechas y Inicio/Fin mueven de a pasos; llegar al final confirma igual que con el dedo.

/** Desde dónde un arrastre suelto cuenta como «llegó al final». */
export const UMBRAL_CONFIRMA = 0.92;

/** Pasos del teclado (flechas): 10 toques de flecha llegan al final. */
export const PASO_TECLADO = 0.1;

/** El avance (0..1) según cuánto se corrió el dedo sobre el recorrido libre de la pista. */
export function avanceDe(desplazamiento: number, recorrido: number): number {
  if (!(recorrido > 0)) return 0;
  return Math.min(1, Math.max(0, desplazamiento / recorrido));
}

/** Al soltar: ¿confirma o vuelve? */
export function alSoltar(avance: number): "confirma" | "vuelve" {
  return avance >= UMBRAL_CONFIRMA ? "confirma" : "vuelve";
}

/** Una tecla sobre la perilla → el avance nuevo, o `null` si esa tecla no la mueve. */
export function avanceConTecla(avance: number, key: string): number | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return Math.min(1, Math.round((avance + PASO_TECLADO) * 100) / 100);
    case "ArrowLeft":
    case "ArrowDown":
      return Math.max(0, Math.round((avance - PASO_TECLADO) * 100) / 100);
    case "Home":
      return 0;
    case "End":
      return 1;
    default:
      return null;
  }
}
