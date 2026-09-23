// ============================================================================
// TEXTOS DE CONTACTO — lo que se le escribe a cada clienta según el motivo. PURO.
// ============================================================================
//
// PROVISIONALES A CONFIRMAR CON LA DUEÑA. Van en código y no en `MessageTemplate` porque
// sumarle tipos a esa tabla es cambiar el enum de Postgres (migración, 2ª ventana). Cuando
// exista, estos pasan a ser el texto por defecto de cada plantilla, como hoy
// PLANTILLA_RECORDATORIO_POR_DEFECTO lo es del recordatorio.
//
// Reglas de estilo: de vos, cortos, sin promesas que el negocio no hizo (nada de "20% off" que
// nadie decidió) y firmados con el nombre del negocio. La recepción puede editarlos en el chat
// antes de mandar: el botón sólo los deja escritos.

import type { MotivoContacto } from "./reglas";
import type { Rubro } from "./personas";

export type DatosTexto = {
  nombre: string;
  negocio: string;
  servicio: string | null;
  diasParaCumple: number | null;
  /** Link a la página del turno donde se deja la reseña, si se pudo armar. */
  linkResena?: string | null;
};

/** El primer nombre: "María José Pérez" → "María". Un mensaje 1 a 1 no saluda con el apellido. */
export function primerNombre(nombre: string): string {
  const n = nombre.trim().split(/\s+/)[0] ?? "";
  return n || nombre.trim();
}

export function textoContacto(motivo: MotivoContacto, d: DatosTexto, rubro: Rubro): string {
  const hola = `Hola ${primerNombre(d.nombre)}`;
  switch (motivo) {
    case "cumpleanios":
      return d.diasParaCumple === 0
        ? `${hola}, ¡feliz cumpleaños! Te mandamos un abrazo grande desde ${d.negocio}.`
        : `${hola}, se viene tu cumpleaños y desde ${d.negocio} te queremos saludar. ¡Que lo disfrutes mucho!`;
    case "resena":
      return (
        `${hola}, gracias por venir a ${d.negocio}. ` +
        `¿Nos contás cómo te fue${d.servicio ? ` con ${d.servicio}` : ""}? Tu opinión nos ayuda mucho` +
        (d.linkResena ? `: ${d.linkResena}` : ".")
      );
    case "pasada":
    case "recuperar":
      return rubro === "servicios"
        ? `${hola}, ¿cómo estás? Hace un tiempo que no te vemos por ${d.negocio}. ` +
            `Si querés, te buscamos un turno${d.servicio ? ` para ${d.servicio}` : ""}: decinos qué día te queda cómodo.`
        : `${hola}, ¿cómo estás? Hace un tiempo que no pasás por ${d.negocio}. ` +
            `Si querés, te preparamos el pedido: escribinos qué necesitás.`;
  }
}

/** El texto del hueco liberado para quien está en la lista de espera. */
export function textoHuecoLiberado(d: {
  nombre: string;
  negocio: string;
  servicio: string;
  profesional: string;
  cuando: string;
}): string {
  return (
    `Hola ${primerNombre(d.nombre)}, te escribimos de ${d.negocio}: se liberó un turno de ${d.servicio} ` +
    `${d.cuando} con ${d.profesional}. ¿Lo querés? Respondenos y te lo reservamos.`
  );
}
