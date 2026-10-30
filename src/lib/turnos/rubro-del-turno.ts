// IDENTIDAD POR RUBRO EN EL MOTOR DE TURNOS COMPARTIDO (ronda 2, P0-5 de base / P0-1 de AGR). Las páginas públicas del
// motor (`/reserva`, `/servicios`, la confirmación y «ver mi turno») nacieron con la voz y la piel de una estética.
// Un taller o un profe que caía en ellas leía «Pendiente de pago», «Box», «Cada tratamiento…» o «Mecánico de ejemplo
// (editable)». Ahora cada rubro con páginas propias va a las suyas, y las compartidas dicen sólo lo que es cierto.
//
// Las funciones de abajo son PURAS (se testean solas); `rubroDelTurno` lee la base una vez por pedido.
import { cache } from "react";
import { getTenantIdentity } from "@/lib/identidad-rubro";
import { resolveAgendaRubroIdBySlug } from "@/blueprints/agenda/rubros";

/** Qué páginas de turnos tiene el negocio: las propias del taller, las del profe, o las compartidas de agenda. */
export type RubroDelTurno = "taller" | "clases" | "agenda";

/** PURA: el rubro por el blueprint del alta (manda) o, sin él, por la familia del slug (red de contención). */
export function rubroDelTurnoDe(d: { blueprintId: string | null; slug: string | null }): RubroDelTurno {
  if (d.blueprintId === "taller" || resolveAgendaRubroIdBySlug(d.slug) === "taller") return "taller";
  if (d.blueprintId === "profe-padel") return "clases";
  return "agenda";
}

/** El rubro del negocio del pedido (fail-open: sin base, las páginas compartidas de siempre). */
export const rubroDelTurno = cache(async (): Promise<RubroDelTurno> => {
  try {
    const i = await getTenantIdentity();
    return rubroDelTurnoDe({ blueprintId: i.blueprintId, slug: i.slug });
  } catch {
    return "agenda";
  }
});

/**
 * PURA: a dónde va una ruta del motor compartido en un rubro con páginas propias, o `null` si se queda. El taller
 * tiene su formulario (`/taller/turno`), su carta (`/taller#que-hacemos`) y su página del turno; el profe, su turnero.
 */
export function destinoPropio(rubro: RubroDelTurno, ruta: "reserva" | "servicios" | "servicio" | "turno" | "confirmacion", id?: string): string | null {
  if (rubro === "taller") {
    if (ruta === "reserva") return "/taller/turno";
    if (ruta === "servicios" || ruta === "servicio") return "/taller#que-hacemos";
    if (ruta === "turno" && id) return `/taller/turno/${encodeURIComponent(id)}`;
    if (ruta === "confirmacion" && id) return `/taller/turno/${encodeURIComponent(id)}?nuevo=1`;
  }
  if (rubro === "clases") return "/clases";
  return null;
}

/**
 * PURA: el estado que se le muestra a quien reservó. «Pendiente de pago» SÓLO si el servicio pide seña (ADR-014,
 * `Service.depositAmount`); si no, el turno espera la confirmación del negocio y no hay ningún pago pendiente.
 */
export function estadoPublicoDelTurno(depositAmount: number | null | undefined): { texto: string; conSena: boolean } {
  const conSena = typeof depositAmount === "number" && Number.isFinite(depositAmount) && depositAmount > 0;
  return conSena ? { texto: "Pendiente de pago", conSena } : { texto: "A confirmar", conSena };
}

/** PURA: el aviso de cómo sigue, según haya seña y canal. Sin número de WhatsApp no se promete WhatsApp. */
export function comoSigueElTurno({ conSena, hayWhatsApp }: { conSena: boolean; hayWhatsApp: boolean }): string {
  if (conSena) return hayWhatsApp ? "Te vamos a escribir por WhatsApp para coordinar la seña y confirmar tu turno." : "Te vamos a contactar para coordinar la seña y confirmar tu turno.";
  return hayWhatsApp ? "Te vamos a escribir por WhatsApp para confirmar tu turno." : "Te vamos a contactar para confirmar tu turno.";
}

/** PURA: los nombres que siembra el alta («Box de ejemplo (editable)») no se le muestran al público. */
export function nombrePublico(nombre: string | null | undefined): string | null {
  const n = (nombre ?? "").trim();
  if (!n || /de ejemplo|\(editable\)/i.test(n)) return null;
  return n;
}
