// Reseñas sin reseñas: qué se dice y a dónde se lleva.
//
// En el Inicio por apps (piloto), el siguiente paso es pedirlas desde la bandeja "Para contactar
// hoy": propone a quien vino ayer y todavía no opinó, con el WhatsApp y el link ya armados.
//
// Fuera del piloto (CH) NO se ofrece, aunque `appPermitida` diga que sí: sin gate por módulo la
// bandeja pasa el permiso (pide sólo clients:read), pero no está en la barra de CH y cada contacto
// deja constancia en auditoría. Mandar a CH ahí desde un estado vacío sería meterla en una
// pantalla del piloto que nadie le presentó. Tampoco se ofrece a quien no puede abrirla: el
// botón terminaría en "App no disponible". En esos casos se explica cuándo llegan.
//
// Client-safe y puro.

import type { PasoVacio } from "../turnos/pasos";

export function vacioDeResenas({
  piloto,
  bandejaPermitida,
}: {
  /** ¿El negocio trabaja con el Inicio por apps? (`enInicioPorApps`) */
  piloto: boolean;
  /** ¿Esta persona puede abrir "Para contactar hoy"? (`appPermitida`) */
  bandejaPermitida: boolean;
}): PasoVacio {
  if (piloto && bandejaPermitida) {
    return {
      titulo: "Todavía no hay reseñas",
      descripcion:
        "Pedilas desde “Para contactar hoy”: ahí aparece cada clienta que vino ayer y todavía no dejó su opinión, con el mensaje listo.",
      accion: { href: "/admin/clientes/hoy", etiqueta: "Pedir reseñas" },
    };
  }
  return {
    titulo: "Todavía no hay reseñas",
    descripcion: "Van a aparecer acá cuando los clientes las dejen después de un turno completado.",
    accion: null,
  };
}
