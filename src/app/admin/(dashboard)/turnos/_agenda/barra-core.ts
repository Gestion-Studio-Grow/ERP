// ============================================================================
// LA BARRA DE UN TOQUE — qué teclas lleva un turno y cómo actúa cada una (AGENDA-INTERACCION.md §2.4).
// ============================================================================
//
// PURO (sin React, client-safe). Sólo con `permisos.interaccion` prendido; apagado devuelve `null` y
// el renglón queda como siempre. Mismas capabilities que hoy, nada nuevo en RBAC:
//   · No vino — vivo (Reservado/Confirmado), ya empezó (`puedeMarcarseNoVino`, cobros.ts:192) y
//     `permisos.terminar` (agenda:complete). Directo (`markNoShow` + [Deshacer]) si no entró plata:
//     es el mismo camino que la hoja sin plata (`planSeniaAlCerrar` no pide nada). Con plata cobrada
//     hay que decidir la seña → abre la hoja de siempre.
//   · Cobrar — la del paso que sigue (`pasoDelTurno`), sólo si ese paso cobra: un vivo que ya empezó
//     abre la hoja «terminar»; un terminado que quedó debiendo, la hoja «cobrar».
//   · WhatsApp — el saludo a `wa.me`; sin un celular válido no aparece.
//   · Editar — `permisos.gestionar` (agenda:manage) y un turno vivo que no empezó (`puedeEditar`):
//     abre la hoja «Editar» (servicio, día, hora, profesional) que monta la mesa.

import { linkWhatsApp, mensajeSaludo } from "@/lib/turnos/mensajes-whatsapp";
import { sePuedeEditar } from "@/lib/turnos/editar-turno";
import { pasoDelTurno, yaEmpezo, type Paso, type Permisos, type TurnoDelDia } from "../agenda-core";

export type ModoNoVino = "directo" | "hoja";

export type TeclasDeLaBarra = {
  noVino: ModoNoVino | null;
  cobrar: { que: "terminar" | "cobrar"; monto: number } | null;
  whatsapp: string | null;
  editar: boolean;
};

/** ¿«Editar» (cajón y barra)? Agenda interactiva, agenda:manage, y un turno vivo que no empezó. */
export function puedeEditar(t: Pick<TurnoDelDia, "estado" | "inicio">, p: Permisos, ahora: Date): boolean {
  return !!p.interaccion && p.gestionar && sePuedeEditar(t, ahora);
}

/** ¿«No vino» se marca de un toque, o hay algo que decidir (la plata que ya pagó)? */
export function modoNoVino(t: Pick<TurnoDelDia, "cobrado">): ModoNoVino {
  return t.cobrado > 0 ? "hoja" : "directo";
}

/** La tecla «Cobrar» que sale del paso, o `null` si el paso no cobra. */
export function cobroDelPaso(paso: Paso): TeclasDeLaBarra["cobrar"] {
  if (paso.tipo === "cobrar") return { que: paso.vino ? "terminar" : "cobrar", monto: paso.monto };
  if (paso.tipo === "terminar" && paso.conCobro) return { que: "terminar", monto: paso.saldo };
  return null;
}

export function teclasDeLaBarra(t: TurnoDelDia, p: Permisos, ahora: Date): TeclasDeLaBarra | null {
  if (!p.interaccion) return null;
  const vivo = t.estado === "PENDING" || t.estado === "CONFIRMED";
  return {
    noVino: vivo && p.terminar && yaEmpezo(t, ahora) ? modoNoVino(t) : null,
    cobrar: cobroDelPaso(pasoDelTurno(t, p, ahora)),
    whatsapp: linkWhatsApp(t.telefono, mensajeSaludo(t.clienta)),
    editar: puedeEditar(t, p, ahora),
  };
}

/** Con la barra, la tecla de siempre se esconde si repetiría «Cobrar» (una sola tecla por acción). */
export function muestraTeclaDelPaso(paso: Paso, barra: TeclasDeLaBarra | null): boolean {
  return !barra?.cobrar || cobroDelPaso(paso) === null;
}

export function hayBarra(b: TeclasDeLaBarra | null): b is TeclasDeLaBarra {
  return !!b && (b.noVino !== null || b.cobrar !== null || b.whatsapp !== null || b.editar);
}

// ── La barra sobre el turno de la GRILLA (PorProfesional): qué turno está elegido ──
//
// En la PC la barra aparece con el mouse encima o con el foco del teclado (CSS); el clic abre el
// cajón como siempre. En táctil no hay «encima»: el PRIMER toque elige el turno y muestra la barra
// + «Abrir»; un segundo toque sobre el mismo (o «Abrir») abre el cajón. Tocar fuera o Esc la cierra.
// `cerrada` recuerda el turno al que se le cerró la barra con Esc mientras sigue con el foco o el
// mouse encima (si no, el CSS la volvería a mostrar); se olvida cuando el foco o el mouse se van.

export type SeleccionDeLaBarra = { elegido: string | null; cerrada: string | null };

export const SIN_SELECCION: SeleccionDeLaBarra = { elegido: null, cerrada: null };

export type EventoDeLaBarra =
  | { tipo: "toque"; id: string; tactil: boolean; conBarra: boolean }
  | { tipo: "fuera" }
  | { tipo: "escape"; id: string | null }
  | { tipo: "salir"; id: string };

export type EfectoDeLaBarra = { seleccion: SeleccionDeLaBarra; abrirCajon: string | null };

export function seleccionDeLaBarra(s: SeleccionDeLaBarra, e: EventoDeLaBarra): EfectoDeLaBarra {
  switch (e.tipo) {
    case "toque":
      // Mouse/teclado, o un turno sin teclas: el toque abre el cajón, como siempre.
      if (!e.tactil || !e.conBarra || s.elegido === e.id) return { seleccion: SIN_SELECCION, abrirCajon: e.id };
      return { seleccion: { elegido: e.id, cerrada: null }, abrirCajon: null };
    case "fuera":
      return { seleccion: s.elegido === null ? s : { ...s, elegido: null }, abrirCajon: null };
    case "escape": {
      const id = e.id ?? s.elegido;
      return { seleccion: { elegido: null, cerrada: id }, abrirCajon: null };
    }
    case "salir":
      return { seleccion: s.cerrada === e.id ? { ...s, cerrada: null } : s, abrirCajon: null };
  }
}

/** Cómo se ve la barra de un turno: «elegida» (táctil), «al-pasar» (mouse/foco) o «cerrada» (Esc). */
export function vistaDeLaBarra(s: SeleccionDeLaBarra, id: string): "elegida" | "al-pasar" | "cerrada" {
  if (s.cerrada === id) return "cerrada";
  return s.elegido === id ? "elegida" : "al-pasar";
}

/**
 * Dónde flota la barra para no salirse del marco de la planilla (que recorta): debajo del turno,
 * salvo que termine en las últimas filas (arriba); pegada a la izquierda, salvo en la mitad
 * derecha de las columnas (a la derecha).
 */
export function ladoDeLaBarra(o: { fila: number; alto: number; filas: number; columna: number; columnas: number }): {
  vertical: "abajo" | "arriba";
  horizontal: "izquierda" | "derecha";
} {
  const vertical = o.fila + o.alto >= o.filas - 1 && o.fila > 0 ? "arriba" : "abajo";
  const horizontal = o.columnas > 1 && o.columna >= Math.ceil(o.columnas / 2) ? "derecha" : "izquierda";
  return { vertical, horizontal };
}
