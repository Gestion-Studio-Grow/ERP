// Claves del navegador de la bolsa de cada negocio (ronda 2, `src/components/vidriera/`). Una sola definición para las
// cuatro tiendas: `useVidriera` (Qué Bien Olés y la vidriera genérica), `useBolsaGuardada` (Shine, A Dos Manos, Magra)
// y `OlvidarBolsa` (la página de gracias) leen y escriben las mismas.

/** Dónde se guarda la bolsa de cada negocio en el navegador. */
export const CLAVE_BOLSA = (tenantKey: string) => `gsg:bolsa:${tenantKey}`;
/** La bolsa que esta pestaña acaba de mandar por «Enviar pedido» (la lee OlvidarBolsa en gracias). */
export const CLAVE_ENVIO = (tenantKey: string) => `gsg:bolsa-enviada:${tenantKey}`;
