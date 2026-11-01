// Cuándo relee la agenda sola. PURO: lo prueba refresco-core.test.ts.

/** Una relectura por minuto, como máximo. */
export const CADA_MS = 60_000;

export function tocaRefrescar(p: { visible: boolean; ocupada: boolean; desdeElUltimo: number }): boolean {
  return p.visible && !p.ocupada && p.desdeElUltimo >= CADA_MS;
}
