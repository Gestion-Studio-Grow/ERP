// ============================================================================
// AGENDA PRÁCTICA — lo que se decide sin pantalla ni base. PURO, client-safe.
// ============================================================================
//
// Interruptor «agenda-practica» (src/cambios/interruptores.ts). Apagado (CH hoy), nada de esto
// se usa y la agenda es la de siempre. Ítems del plan de practicidad (Factory-GSG,
// 30-LANZAMIENTO/practicidad/PLAN-PRACTICIDAD-RAE.md), verificados contra el código del 18/10:
//   · T4 — defaults del alta: la fecha propone MAÑANA y, si hay una sola profesional, viene elegida.
//   · T10 + E3 — cancelar y «no vino» confirman con la consecuencia y preguntan qué pasa con la
//     seña: se la queda el negocio o se le devuelve (la devolución es la anulación del cobro, con
//     su egreso en el libro; «a favor de la próxima» necesita migración y queda afuera).
//   · E2 + T12 — la clienta cancela o reprograma online sólo con la anticipación que el negocio
//     cargó, y la regla está escrita donde reserva. Sin regla cargada, nada cambia.
//   · E5 — al completar, «Reservar el próximo» con la fecha de su ciclo.
//   · E6 — al cancelar, cuántas anotadas de la lista de espera sirven para ese hueco.

import { sumarDias } from "@/lib/crm/fechas";

// ── E2 · la regla de cancelación de la clienta ───────────────────────────────

export interface PoliticaDeCancelacion {
  /** Horas antes del turno hasta las que la clienta cancela o reprograma sola, online. */
  horasMinimas: number;
}

/**
 * La regla la carga el negocio: variable `CANCELACION_ONLINE_HORAS`, con el mismo formato que
 * `TENANT_HOST_MAP` («slug=horas;slug=horas», p. ej. `beauty-spa=24`). Por negocio y sin migración.
 * Si el negocio no la cargó, NO hay regla: no se muestra ningún texto y la clienta cancela como
 * siempre (no se inventa un número que el negocio no decidió).
 */
export function leerPoliticas(raw: string | null | undefined): ReadonlyMap<string, PoliticaDeCancelacion> {
  const m = new Map<string, PoliticaDeCancelacion>();
  for (const par of String(raw ?? "").split(";")) {
    const [slug, horas] = par.split("=").map((x) => x?.trim());
    const n = Number(horas);
    if (slug && Number.isInteger(n) && n > 0 && n <= 24 * 30) m.set(slug, { horasMinimas: n });
  }
  return m;
}

export function politicaDelNegocio(
  slug: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): PoliticaDeCancelacion | null {
  return (slug && leerPoliticas(env.CANCELACION_ONLINE_HORAS).get(slug)) || null;
}

/** La regla en castellano, para la reserva, la confirmación y «Tu turno» (T12). */
export function reglaDeCancelacion(p: PoliticaDeCancelacion): string {
  return `Podés cancelar o reprogramar online hasta ${p.horasMinimas} h antes del turno. Después, escribinos por WhatsApp.`;
}

/** ¿La clienta puede cancelar o reprogramar ella sola este turno, ahora? */
export function puedeCambiarOnline(input: {
  startsAt: Date;
  ahora: Date;
  politica: PoliticaDeCancelacion;
}): { ok: true } | { ok: false; error: string } {
  const faltan = input.startsAt.getTime() - input.ahora.getTime();
  if (faltan >= input.politica.horasMinimas * 3_600_000) return { ok: true };
  return {
    ok: false,
    error: `Faltan menos de ${input.politica.horasMinimas} h para tu turno: ya no se puede cambiar online. Escribinos por WhatsApp y lo vemos.`,
  };
}

// ── T4 · defaults del alta ───────────────────────────────────────────────────

/** La fecha que propone el alta: mañana (el día del negocio). Siempre editable. */
export function fechaPropuestaDelAlta(hoy: string): string {
  return sumarDias(hoy, 1);
}

/** Si hay UNA sola profesional, viene elegida; si hay varias, ninguna (un default equivocado es peor). */
export function profesionalPropuesta(profesionales: readonly { id: string }[]): string {
  return profesionales.length === 1 ? profesionales[0].id : "";
}

// ── T10 + E3 · cancelar y «no vino» con la consecuencia ──────────────────────

export type CierreSinPrestar = "cancelar" | "no-vino";
export type DestinoDeLaSenia = "retener" | "devolver";

export function esDestinoDeLaSenia(v: unknown): v is DestinoDeLaSenia {
  return v === "retener" || v === "devolver";
}

/** ¿Hace falta elegir qué pasa con la seña? Sólo si entró plata. */
export function planSeniaAlCerrar(input: {
  cobrado: number;
  destino: string | null | undefined;
}): { ok: true; destino: DestinoDeLaSenia | null } | { ok: false; error: string } {
  if (input.cobrado <= 0) return { ok: true, destino: null };
  if (!esDestinoDeLaSenia(input.destino)) {
    return { ok: false, error: "Elegí qué pasa con la seña: se la queda el negocio o se le devuelve." };
  }
  return { ok: true, destino: input.destino };
}

/** La pregunta, con la consecuencia escrita (T10). */
export function preguntaDeCierre(input: { accion: CierreSinPrestar; clienta: string; hora: string }): string {
  return input.accion === "cancelar"
    ? `¿Cancelar el turno de ${input.clienta} de las ${input.hora}? El horario queda libre para otra clienta.`
    : `¿Marcar que ${input.clienta} no vino al turno de las ${input.hora}? Queda como faltazo en su ficha.`;
}

/** Motivo con el que se anula cada cobro cuando la seña se devuelve (queda en el libro y la auditoría). */
export function motivoDeDevolucion(accion: CierreSinPrestar): string {
  return accion === "cancelar" ? "Devolución de la seña: turno cancelado" : "Devolución de la seña: no vino";
}

// ── E5 · reservar el próximo ─────────────────────────────────────────────────

/** El próximo turno, a un ciclo del de hoy; nunca antes de mañana. */
export function fechaDelProximo(input: { dia: string; cicloDias: number; hoy: string }): string {
  const propuesta = sumarDias(input.dia, Math.max(1, Math.round(input.cicloDias)));
  const manana = sumarDias(input.hoy, 1);
  return propuesta < manana ? manana : propuesta;
}

/** El link al alta con la clienta y la fecha puestas (la lista ya lee ?nuevo, ?fecha y ?cliente). */
export function hrefDelProximo(input: { clienteId: string; fecha: string }): string {
  return `/admin/turnos/lista?nuevo=1&fecha=${encodeURIComponent(input.fecha)}&cliente=${encodeURIComponent(input.clienteId)}`;
}

// ── E6 · el hueco a la lista de espera ───────────────────────────────────────

/** El aviso al cancelar, o null si nadie de la lista sirve para ese hueco. */
export function avisoDeEspera(input: { anotadas: number; servicio: string }): string | null {
  if (input.anotadas <= 0) return null;
  const quien = input.anotadas === 1 ? "Hay 1 clienta anotada" : `Hay ${input.anotadas} clientas anotadas`;
  return `${quien} en la lista de espera para ${input.servicio}: avisales desde Lista de espera → Huecos liberados.`;
}
