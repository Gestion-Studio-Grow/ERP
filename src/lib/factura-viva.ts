// ============================================================================
// ENG-023 · ¿La venta tiene una factura viva ante ARCA? (regla pura, sin base)
// ============================================================================
//
// La usan las dos anulaciones que devuelven plata de una venta: la de un pedido
// (`order-anulacion.ts`, por `Invoice.orderId`) y la del cobro de un turno
// (`turnos/anulacion.ts`, por `Invoice.appointmentId`).
//
// Mientras no exista la nota de crédito (R4-F2), una venta con factura viva no se anula: el
// pedido quedaría anulado, el libro con la devolución, y la factura con su CAE vigente ante ARCA
// (medido en ENG-023: $121.000 declarados sin venta detrás). Cuando la nota de crédito exista,
// anular la encola en la misma transacción y esta regla deja de rechazar.
//
//   · AUTHORIZED → "autorizada": tiene CAE; sólo la cancela una nota de crédito.
//   · PENDING    → "en-camino": el envío a ARCA sigue abierto y el CAE puede llegar después de
//                  anular. Se frena igual y se pide esperar la respuesta.
//   · REJECTED   → no cuenta: ARCA no la autorizó, no hay nada que cancelar.
//   · Cualquier otro estado (uno nuevo que este módulo no conoce) se trata como vivo: ante la
//     duda, no se anula.

/** El estado de la factura tal como lo guarda `Invoice.status`. */
export type EstadoDeLaFactura = "PENDING" | "AUTHORIZED" | "REJECTED";

export type FacturaDeLaVenta = "sin-factura-viva" | "autorizada" | "en-camino";

export function facturaDeLaVenta(facturas: readonly { status: EstadoDeLaFactura | string }[]): FacturaDeLaVenta {
  const vivas = facturas.filter((f) => f.status !== "REJECTED");
  if (vivas.length === 0) return "sin-factura-viva";
  return vivas.some((f) => f.status === "AUTHORIZED") ? "autorizada" : "en-camino";
}

/** El motivo del rechazo, para quien intentó anular. `que` nombra lo que se quiso anular. */
export function mensajeFacturaViva(factura: Exclude<FacturaDeLaVenta, "sin-factura-viva">, que: "venta" | "turno"): string {
  const sujeto = que === "venta" ? "Esa venta" : "Ese turno";
  if (factura === "autorizada") {
    return (
      `${sujeto} tiene factura electrónica autorizada por ARCA. Si se anula acá, la factura sigue vigente ` +
      `ante ARCA: primero hay que emitir la nota de crédito que la cancela, y el sistema todavía no la ` +
      `emite. Pedile a tu contador que la emita y registrá la devolución de la plata en el libro de caja, ` +
      `con el motivo.`
    );
  }
  return (
    `${sujeto} tiene una factura que todavía está esperando la respuesta de ARCA. Si se anula ahora, la ` +
    `factura puede quedar autorizada igual. Esperá a que ARCA responda y volvé a intentarlo.`
  );
}
