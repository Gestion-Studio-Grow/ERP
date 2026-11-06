// ============================================================================
// EDITAR UN TURNO — lo que se decide sin base ni pantalla (agenda interactiva, pedido del dueño de CH).
// ============================================================================
//
// PURO y client-safe (sin Prisma): lo usan la hoja «Editar» (para anticipar) y `editarTurno`
// (editar-actions.ts, que es la verdad). Tres preguntas:
//   · `camposCambiados`: qué cambió entre el turno y lo elegido (servicio, inicio, profesional);
//   · `precioDeLaEdicion`: con otro servicio, el precio vigente de ese servicio para esa clienta
//     (la misma regla del alta: `precioCongeladoDeReserva`); sin cambio de servicio, el de siempre;
//   · `veredictoDeEdicion`: si se puede guardar, o por qué no («Ya tiene un cobro…»).

import { precioCongeladoDeReserva, type ServicioConPrecio } from "./precio-reserva";

export type EstadoEditable = "PENDING" | "CONFIRMED";

export type TurnoParaEditar = {
  estado: string;
  /** ISO o Date del inicio actual. */
  inicio: string | Date;
  servicioId: string;
  profesionalId: string;
};

export type Eleccion = { servicioId: string; inicio: string | Date; profesionalId: string };

export type CamposCambiados = { servicio: boolean; inicio: boolean; profesional: boolean };

const ms = (d: string | Date) => (typeof d === "string" ? new Date(d).getTime() : d.getTime());

/** ¿Es un turno vivo (Reservado o Confirmado)? Lo cerrado no se edita. */
export function esEditable(estado: string): estado is EstadoEditable {
  return estado === "PENDING" || estado === "CONFIRMED";
}

/** ¿Se ofrece «Editar»? Vivo y sin empezar (el mismo borde que mover y estirar). */
export function sePuedeEditar(t: Pick<TurnoParaEditar, "estado" | "inicio">, ahora: Date): boolean {
  return esEditable(t.estado) && ms(t.inicio) > ahora.getTime();
}

export function camposCambiados(t: TurnoParaEditar, e: Eleccion): CamposCambiados {
  return {
    servicio: !!e.servicioId && e.servicioId !== t.servicioId,
    inicio: ms(e.inicio) !== ms(t.inicio),
    profesional: !!e.profesionalId && e.profesionalId !== t.profesionalId,
  };
}

export function cambioAlgo(c: CamposCambiados): boolean {
  return c.servicio || c.inicio || c.profesional;
}

/**
 * El precio que queda en el turno. Con el MISMO servicio, el congelado de siempre (no se toca);
 * con otro, el vigente de ese servicio para esta clienta (vecina o no), como al dar un turno nuevo.
 */
export function precioDeLaEdicion(o: {
  cambiaServicio: boolean;
  precioActual: number;
  servicioNuevo: ServicioConPrecio | null;
  esVecina: boolean | null | undefined;
}): { precio: number; isResidentBooking: boolean | null; cambia: boolean } {
  if (!o.cambiaServicio || !o.servicioNuevo) return { precio: o.precioActual, isResidentBooking: null, cambia: false };
  const { priceAtBooking, isResidentBooking } = precioCongeladoDeReserva(o.servicioNuevo, o.esVecina);
  return { precio: priceAtBooking, isResidentBooking, cambia: priceAtBooking !== o.precioActual };
}

export const MOTIVO_CON_COBRO = "Ya tiene un cobro: cancelalo y dá un turno nuevo.";
export const MOTIVO_CON_DESCUENTO = "Tiene un descuento aplicado: cancelalo y dá un turno nuevo.";

export type VeredictoDeEdicion = { ok: true } | { ok: false; motivo: string };

/**
 * ¿Se puede guardar? Lo mismo que el servidor rechaza, en el mismo orden:
 *   · sólo un turno vivo; nada que cambie, nada que guardar;
 *   · al pasado no se mueve; un turno que ya empezó no cambia de servicio;
 *   · cambiar el servicio cambia el precio: con plata adentro (cobro o seña) o con un descuento,
 *     no se toca (cancelar y dar un turno nuevo es el camino que no deja la caja torcida);
 *   · la profesional tiene que hacer el servicio.
 */
export function veredictoDeEdicion(o: {
  estado: string;
  cambios: CamposCambiados;
  inicioActual: string | Date;
  inicioNuevo: string | Date;
  ahora: Date;
  tienePlata: boolean;
  tieneDescuento: boolean;
  profesionalLoHace: boolean;
}): VeredictoDeEdicion {
  if (!esEditable(o.estado)) return { ok: false, motivo: "Sólo se edita un turno reservado o confirmado." };
  if (!cambioAlgo(o.cambios)) return { ok: false, motivo: "No cambiaste nada." };
  if (ms(o.inicioNuevo) <= o.ahora.getTime()) return { ok: false, motivo: "Ese horario ya pasó. Elegí uno que venga." };
  if (o.cambios.servicio) {
    if (ms(o.inicioActual) <= o.ahora.getTime()) return { ok: false, motivo: "Ese turno ya empezó: no se le cambia el servicio." };
    if (o.tienePlata) return { ok: false, motivo: MOTIVO_CON_COBRO };
    if (o.tieneDescuento) return { ok: false, motivo: MOTIVO_CON_DESCUENTO };
  }
  if (!o.profesionalLoHace) return { ok: false, motivo: "Esa profesional no hace ese servicio. Elegí otra." };
  return { ok: true };
}

/** «Piernas · jue 24 16:00 · Caro» — un lado del «antes → después». */
export type LadoDelCambio = { servicio: string; cuando: string; profesional: string };
