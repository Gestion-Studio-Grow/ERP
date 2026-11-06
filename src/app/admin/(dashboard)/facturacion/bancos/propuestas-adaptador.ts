// La bandeja «Propuestos» (bancos + Mercado Pago) habla con el motor SÓLO por acá.
//
// Hoy son las acciones de bancos de siempre. Cuando la sesión A congele el contrato de estados del
// motor (propuestas de MP incluidas), se cambia la referencia de cada acción y las pantallas no se
// tocan. Son referencias a server actions (no envoltorios): el server component las pasa por props
// al componente de cliente, y la prueba en el navegador pasa dobles.

import { emitirPropuestasAction, marcarNoFacturableAction } from "@/lib/bancos-actions";

export type { PropuestaVista } from "@/lib/bancos-actions";

export const accionesPropuestas = {
  /** Emite las propuestas elegidas (ids) — mismo tope del plan, idempotencia y despacho a ARCA. */
  emitir: emitirPropuestasAction,
  /** No es una venta: no se factura (y, si se pide, se aprende el patrón). */
  noEsVenta: marcarNoFacturableAction,
};

export type AccionesPropuestas = typeof accionesPropuestas;
