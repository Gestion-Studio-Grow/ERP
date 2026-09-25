/**
 * ENG-021 · Rechazo de ARCA contra error pasajero. Dominio puro.
 *
 * Un RECHAZO es ARCA diciendo que el comprobante está mal: la factura queda rechazada y la
 * venta se puede volver a facturar con los datos corregidos (`invoice-core.ts`,
 * `createInvoiceInTx`). Un ERROR PASAJERO es algo que no depende del comprobante (ARCA con una
 * falla interna, el token vencido, otro envío que tomó el número): la factura sigue pendiente
 * y el despacho la reintenta. Ante la duda se reintenta, porque rechazar deja a la venta sin
 * factura y reintentar no emite nada de más (ENG-020 consulta antes de pedir otro CAE).
 *
 * Los códigos salen del manual del desarrollador de WSFEv1 (errores de sistema 5xx y 6xx y la
 * observación 10016). PROVISIONAL A CONFIRMAR con las respuestas grabadas en la prueba de
 * homologación del dueño (BACKLOG ENG-021).
 */

/** Códigos de ARCA que no son culpa del comprobante, con el motivo para mostrar. */
export const CODIGOS_PASAJEROS_ARCA: ReadonlyMap<number, string> = new Map([
  [500, 'ARCA tuvo un error interno de aplicación.'],
  [501, 'ARCA tuvo un error interno de base de datos.'],
  [502, 'ARCA tuvo un error interno del autorizador (transacción activa).'],
  [600, 'ARCA no validó el token de acceso: hay que volver a autenticar.'],
  [601, 'El token de acceso no representa a este CUIT: hay que revisar la credencial.'],
  [10016, 'El número no es el próximo a autorizar: otro envío lo tomó antes.'],
]);

/**
 * ¿Es pasajero lo que respondió ARCA? Sólo si TODOS los códigos son pasajeros: si además hay
 * un defecto del comprobante, reintentar no lo arregla y es un rechazo.
 */
export function esErrorPasajero(observaciones: readonly { codigo: number }[]): boolean {
  if (observaciones.length === 0) return false;
  return observaciones.every((o) => CODIGOS_PASAJEROS_ARCA.has(o.codigo));
}
