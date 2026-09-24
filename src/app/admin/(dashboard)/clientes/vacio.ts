// La lista de Clientes de siempre (CH) sin clientes: las fichas nacen solas al reservar, así
// que el siguiente paso es dar el primer turno, si quien mira puede darlo. Sin la agenda a mano
// no se ofrece un botón que termine en "App no disponible".
//
// Client-safe y puro.

import { hrefNuevoTurno, type PasoVacio } from "../turnos/pasos";

export function vacioDeClientes({ puedeDarTurno }: { puedeDarTurno: boolean }): PasoVacio {
  return {
    titulo: "Todavía no hay clientes",
    descripcion: "Las fichas se crean solas cuando alguien reserva un turno, por la web o desde la agenda.",
    accion: puedeDarTurno ? { href: hrefNuevoTurno(), etiqueta: "Dar un turno" } : null,
  };
}
