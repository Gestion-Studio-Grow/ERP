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

import { linkWhatsApp, mensajeSaludo } from "@/lib/turnos/mensajes-whatsapp";
import { pasoDelTurno, yaEmpezo, type Paso, type Permisos, type TurnoDelDia } from "../agenda-core";

export type ModoNoVino = "directo" | "hoja";

export type TeclasDeLaBarra = {
  noVino: ModoNoVino | null;
  cobrar: { que: "terminar" | "cobrar"; monto: number } | null;
  whatsapp: string | null;
};

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
  };
}

/** Con la barra, la tecla de siempre se esconde si repetiría «Cobrar» (una sola tecla por acción). */
export function muestraTeclaDelPaso(paso: Paso, barra: TeclasDeLaBarra | null): boolean {
  return !barra?.cobrar || cobroDelPaso(paso) === null;
}

export function hayBarra(b: TeclasDeLaBarra | null): b is TeclasDeLaBarra {
  return !!b && (b.noVino !== null || b.cobrar !== null || b.whatsapp !== null);
}
