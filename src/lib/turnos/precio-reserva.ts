// ============================================================================
// El precio que se CONGELA al reservar — una sola enunciación de la regla.
// ============================================================================
//
// Hay cuatro caminos de alta de turno: reserva pública, modal de la vidriera, alta manual
// de recepción y reservar desde la lista de espera. Los tres primeros pasan por
// `bookAppointment` (`actions.ts`); el cuarto tiene su propio `appointment.create`
// (`waitlist-actions.ts`). Durante un tiempo la regla estuvo ENUNCIADA DOS VECES y la
// segunda se quedó atrás: escribía `priceAtBooking: service.price` a secas, así que la
// vecina que había esperado un hueco pagaba el precio de no-vecina y la comisión se
// devengaba sobre el precio inflado. El precio queda congelado en el turno, de modo que el
// cobro posterior NO lo corrige: se cobra de más y no lo ve nadie.
//
// Este módulo existe para que la regla no se pueda volver a separar. Es PURO y no importa
// nada a propósito: `actions.ts` y `waitlist-actions.ts` son `"use server"` —cada export
// suyo es un endpoint HTTP— así que el helper no podía vivir en ninguno de los dos (mismo
// motivo por el que existe `audit-core.ts`). Sin imports, además, es importable desde un
// client component el día que la pantalla quiera mostrar el precio antes de reservar.
//
// ADR-013 (precio preferencial de vecina) es la fuente de la regla.

export type ServicioConPrecio = { price: number; residentPrice: number | null };

export type PrecioCongelado = {
  /** Lo que se escribe en `Appointment.priceAtBooking`, ANTES del cupón. */
  priceAtBooking: number;
  /** Lo que se escribe en `Appointment.isResidentBooking`: por qué salió ese precio. */
  isResidentBooking: boolean;
};

/**
 * El precio de lista que le corresponde a esta clienta por este servicio, y el rastro de
 * por qué.
 *
 * Tres detalles que NO son accidentes:
 *   - `isResident` nulo o ausente (la ficha no tiene el dato, o el llamador no lo trae) paga
 *     el precio general: el beneficio se otorga, no se presume.
 *   - un servicio sin `residentPrice` cobra el general aunque la clienta sea vecina.
 *   - un `residentPrice` de CERO es un precio válido (gratis para vecinas) y no cae al
 *     general: por eso la condición es `!= null` y no un chequeo de verdad.
 */
export function precioCongeladoDeReserva(
  service: ServicioConPrecio,
  isResident: boolean | null | undefined,
): PrecioCongelado {
  const isResidentBooking = !!isResident && service.residentPrice != null;
  const priceAtBooking = isResidentBooking ? (service.residentPrice as number) : service.price;
  return { priceAtBooking, isResidentBooking };
}
