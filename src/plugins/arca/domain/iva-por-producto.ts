/**
 * ENG-024 · Un responsable inscripto discrimina IVA producto por producto (cada uno con su
 * alícuota: 21 %, 10,5 %, 27 %, exento…). El Core todavía no guarda la alícuota de cada producto:
 * `calcularImpuestos` (src/lib/fiscal.ts) le aplica un 21 % parejo al total. Una A o una B armada
 * así puede informar mal el IVA, y un comprobante emitido no se corrige: se anula con nota de
 * crédito. Por eso el inscripto no emite hasta que el IVA venga de cada producto.
 *
 * Antes la regla vivía sólo en una pantalla (`ventas/factura.ts:94`) y los otros caminos
 * (turno, Mercado Pago, facturita, bancos, API externa) la salteaban. Acá la aplica el despacho a
 * todos. Dominio puro.
 */

import type { InvoiceCreatedEvent } from '../core-contract';
import { CondicionIva } from './catalogos';
import type { ErrorValidacion } from './validacion';

export const MOTIVO_IVA_SIN_ALICUOTA_POR_PRODUCTO =
  'Para un Responsable Inscripto la factura todavía no se emite desde el sistema: el IVA tiene que salir de la ' +
  'alícuota de cada producto y hoy se calcula como un 21 % parejo sobre el total. Emitila desde ARCA o ' +
  'consultá a tu contador.';

/**
 * El motivo por el que el comprobante no se emite, o `null` si la regla no lo frena. Sólo mira al
 * inscripto: monotributo y exento emiten C, sin IVA discriminado.
 */
export function ivaSinAlicuotaPorProducto(ev: InvoiceCreatedEvent): ErrorValidacion | null {
  if (ev.emisor.condicionIva !== CondicionIva.ResponsableInscripto) return null;
  if (ev.ivaPorProducto === true) return null;
  return { campo: 'iva', mensaje: MOTIVO_IVA_SIN_ALICUOTA_POR_PRODUCTO };
}
