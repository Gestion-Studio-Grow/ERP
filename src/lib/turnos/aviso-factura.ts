// Qué le dice la pantalla a recepción sobre la factura de un turno recién terminado. PURO.
//
// La factura del turno sale "best-effort" (ADR-024 §2.a): si ARCA la rechaza o el envío
// falla, el turno igual queda terminado. Hasta el UAT del 16/10 eso quedaba sólo en el log del
// servidor y recepción se enteraba días después, por la clienta o por la contadora. Ahora la
// acción devuelve un aviso y la pantalla lo muestra.

export type ResultadoFacturaDelTurno =
  | { tipo: "sin-factura" } // el negocio nunca configuró la facturación, se eligió no facturar, o no hay monto
  | { tipo: "emitida"; status: "PENDING" | "AUTHORIZED" | "REJECTED"; rechazoMotivo: string | null }
  | { tipo: "fallo" }; // tiró antes de llegar a ARCA (un dato fiscal mal, la base, el cobro cambió, un bug)

const DONDE = "Quedó en Facturación → Comprobantes ARCA: avisale a quien lleva la facturación.";

/**
 * El aviso para recepción, o `null` si no hay nada que decir (salió bien o sigue en camino).
 * `momento`: al terminar el turno, o al registrar un cobro (opción B: cada cobro, su factura).
 */
export function avisoDeFacturaDelTurno(r: ResultadoFacturaDelTurno, momento: "terminar" | "cobro" = "terminar"): string | null {
  const hecho = momento === "cobro" ? "El cobro quedó registrado" : "El turno quedó terminado";
  if (r.tipo === "fallo") {
    return `${hecho}, pero la factura no se pudo emitir. ${DONDE}`;
  }
  if (r.tipo === "emitida" && r.status === "REJECTED") {
    const motivo = r.rechazoMotivo?.trim();
    return `${hecho}, pero ARCA rechazó la factura${motivo ? ` (${motivo})` : ""}. ${DONDE}`;
  }
  // PENDING: ARCA no contestó todavía o fue un corte pasajero; el despacho la reintenta solo.
  return null;
}
