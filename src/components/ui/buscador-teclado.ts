// Qué hace cada tecla en el BuscadorCombo. Puro, sin DOM ni React, para poder EJECUTARLO en un
// test: el combo sólo aplica lo que esto decide (ver `BuscadorCombo.tsx`).
//
// EL ENTER SE CONSUME SIEMPRE. El combo vive adentro de formularios que cobran (PosForm) y que
// agendan (NewAppointmentForm). Un Enter que el combo deja pasar sigue de largo y el navegador
// hace el envío implícito del <form>. Medido en Chromium a 412 px, táctil y es-AR, con el
// PosForm real y la acción de cobro de mentira: chip Mercado Pago, lomo 1,5, Enter (el foco
// pasa a la línea nueva), tipear "vacip" —sin resultados— y Enter: se cobraba el ticket tal
// como estaba, sin tocar «Cobrar». El <select> nativo al que reemplaza no enviaba nada con
// Enter (mismo navegador, 0 envíos). La tecla Ir del teclado del celular también manda un
// Enter; eso no está medido en un teléfono real, sólo emulado.
//
// Y CON EL TEXTO VACÍO, EL ENTER NO ELIGE. Con el campo recién enfocado la lista muestra las
// primeras opciones del catálogo (`filtrarOpciones` con texto vacío), y el Enter que venía de
// la cantidad ("Enter salta al siguiente") caía en el primer producto de la lista sin que
// nadie lo hubiera buscado; volver a enfocar una línea ya elegida y dar Enter le cambiaba el
// producto. Con Enter se elige sólo lo que la persona buscó (tipeó algo) o recorrió con las
// flechas.

import type { OpcionBuscador } from "./buscador-filtro";

export interface EstadoBuscador {
  abierto: boolean;
  /** Lo tipeado desde que se abrió la lista. */
  texto: string;
  /** Lo que la lista muestra ahora, ya filtrado. */
  visibles: readonly OpcionBuscador[];
  /** Índice resaltado dentro de `visibles`. */
  activo: number;
  /** Se movió con las flechas desde que se abrió o se tipeó por última vez. */
  recorrio: boolean;
}

export type DecisionTecla =
  /** Nada que hacer; `prevenir` dice si igual hay que frenar lo que haría el navegador. */
  | { tipo: "nada"; prevenir: boolean }
  /** Resaltar otra opción (y abrir la lista si estaba cerrada). */
  | { tipo: "mover"; prevenir: true; activo: number }
  | { tipo: "elegir"; prevenir: true; opcion: OpcionBuscador }
  | { tipo: "cerrar"; prevenir: false };

export function decidirTecla(
  tecla: { key: string; componiendo?: boolean },
  e: EstadoBuscador,
): DecisionTecla {
  const ultimo = Math.max(e.visibles.length - 1, 0);
  switch (tecla.key) {
    case "ArrowDown":
      // Con la lista cerrada, la flecha la abre en la primera opción, no en la segunda.
      return { tipo: "mover", prevenir: true, activo: e.abierto ? Math.min(e.activo + 1, ultimo) : 0 };
    case "ArrowUp":
      return { tipo: "mover", prevenir: true, activo: Math.max(Math.min(e.activo, ultimo) - 1, 0) };
    case "Enter": {
      // Mientras el teclado está componiendo una palabra, el Enter la confirma: no elige.
      if (tecla.componiendo) return { tipo: "nada", prevenir: true };
      const opcion = e.abierto ? e.visibles[e.activo] : undefined;
      const busco = e.texto.trim() !== "" || e.recorrio;
      if (opcion && busco) return { tipo: "elegir", prevenir: true, opcion };
      // Sin resultados, con el texto vacío o con la lista cerrada: no se elige nada, y el
      // Enter NO llega al formulario.
      return { tipo: "nada", prevenir: true };
    }
    case "Escape":
      return { tipo: "cerrar", prevenir: false };
    default:
      return { tipo: "nada", prevenir: false };
  }
}
