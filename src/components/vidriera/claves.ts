// Claves del navegador de la bolsa de cada negocio (ronda 2, `src/components/vidriera/`). Una sola definición para las
// cuatro tiendas: `useVidriera` (Qué Bien Olés y la vidriera genérica), `useBolsaGuardada` (Shine, A Dos Manos, Magra)
// y `OlvidarBolsa` (la página de gracias) leen y escriben las mismas.

/** Dónde se guarda la bolsa de cada negocio en el navegador. */
export const CLAVE_BOLSA = (tenantKey: string) => `gsg:bolsa:${tenantKey}`;
/** La bolsa que esta pestaña acaba de mandar por «Enviar pedido» (la lee OlvidarBolsa en gracias). */
export const CLAVE_ENVIO = (tenantKey: string) => `gsg:bolsa-enviada:${tenantKey}`;
/**
 * La clave anti-duplicado de la bolsa guardada (ronda 2). Viaja CON la bolsa: si la persona manda el pedido, se corta la
 * red y recarga, la bolsa vuelve con la misma clave y el servidor devuelve el pedido ya registrado en vez de un segundo.
 */
export const CLAVE_DEL_PEDIDO = (tenantKey: string) => `gsg:pedido:${tenantKey}`;

/** Lo que se le cree a una clave guardada: el formato de `nuevaClaveDePedido` (UUID o hex), nada más. */
export function claveGuardadaValida(cruda: unknown): string | null {
  return typeof cruda === "string" && /^[A-Za-z0-9-]{16,64}$/.test(cruda) ? cruda : null;
}

/** Lee la clave guardada del negocio (o `null`): sin almacenamiento no hay clave, y no es un error. */
export function leerClaveGuardada(tenantKey: string): string | null {
  try {
    return claveGuardadaValida(window.localStorage.getItem(CLAVE_DEL_PEDIDO(tenantKey)));
  } catch {
    return null;
  }
}

/** Guarda la clave junto con la bolsa, o la borra cuando la bolsa queda vacía (`null`). */
export function guardarClave(tenantKey: string, clave: string | null): void {
  try {
    if (clave) window.localStorage.setItem(CLAVE_DEL_PEDIDO(tenantKey), clave);
    else window.localStorage.removeItem(CLAVE_DEL_PEDIDO(tenantKey));
  } catch {
    /* sin almacenamiento no se guarda, y nada más */
  }
}
