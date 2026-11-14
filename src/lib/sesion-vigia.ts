// VIGÍA DE INACTIVIDAD del panel (certificación GSG-SEG-004, 09/11/2026). PURO y sin importaciones de servidor: lo usa
// el navegador (VigiaDeInactividad.tsx). El proxy no distingue el uso real de los sondeos automáticos (chip de pedidos,
// bandeja, agenda), que reemiten la cookie; así que el uso REAL (teclado, mouse, toque) se mide acá y, a los
// INACTIVIDAD_BLOQUEO_MS, el navegador pide a /admin/login/bloquear que el servidor deje la cookie bloqueada.

import { INACTIVIDAD_BLOQUEO_MS } from "@/lib/sesion-constantes";

/** Clave del almacenamiento del navegador con el último uso en cualquier pestaña del panel. */
export const CLAVE_ULTIMO_USO = "gsg-panel-ultimo-uso";

/** ¿Pasaron INACTIVIDAD_BLOQUEO_MS sin uso real? Un `ultimoUso` inválido bloquea (falla cerrada). */
export function debeBloquearPorInactividad(ultimoUso: number, ahora: number): boolean {
  if (!Number.isFinite(ultimoUso) || !Number.isFinite(ahora)) return true;
  return ahora - ultimoUso >= INACTIVIDAD_BLOQUEO_MS;
}

/**
 * El uso más reciente entre esta pestaña y lo guardado por otras. Lo guardado inválido o en el futuro (más allá de
 * `ahora`) se ignora: no estira la sesión.
 */
export function ultimoUsoMasReciente(propio: number, guardado: string | null, ahora: number = Date.now()): number {
  const otro = guardado === null ? Number.NaN : Number(guardado);
  if (!Number.isFinite(otro) || otro > ahora) return propio;
  return Math.max(propio, otro);
}
