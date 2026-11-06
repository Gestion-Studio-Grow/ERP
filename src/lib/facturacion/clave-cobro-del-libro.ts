// ============================================================================
// Opción B de CH (06/11/2026): UNA FACTURA POR CADA COBRO DEL TURNO. Clave del cobro. PURO.
// ============================================================================
//
// Cada cobro del libro del turno (`Collection`: la seña, un cobro parcial, el saldo) se factura
// por su monto, una sola vez. La clave en el libro de cobros facturados (`CobroFacturado`, índice
// único tenantId + clave) es `turno:cobro:<collectionId>`: empieza con `turno:` para entrar en el
// CHECK de la tabla (`^(mp|turno|banco):.+$`, migración 20261022150000) sin ensancharlo.
//
// Vive aparte y sin dependencias porque la lee también `turnos/anulacion.ts`, que importan
// componentes de cliente: no puede traer el Core de facturación consigo.

const PREFIJO = "turno:cobro:";

/** La clave con que se anota en `CobroFacturado` la factura de UN cobro del libro del turno. */
export function claveCobroDelLibro(collectionId: string): string {
  if (!collectionId) throw new Error("claveCobroDelLibro: falta el id del cobro.");
  return `${PREFIJO}${collectionId}`;
}

/** El id del cobro, si la clave es la de un cobro del libro; `null` si es de otra cosa. */
export function cobroDeLaClave(clave: string): string | null {
  return clave.startsWith(PREFIJO) && clave.length > PREFIJO.length ? clave.slice(PREFIJO.length) : null;
}
