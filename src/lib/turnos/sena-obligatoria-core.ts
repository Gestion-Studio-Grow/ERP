// ============================================================================
// SEÑA OBLIGATORIA · lo puro (interruptor «sena-obligatoria», apagado por defecto)
// ============================================================================
//
// Con el interruptor prendido, un turno cuyo servicio pide seña (> 0) NO pasa a Confirmado sin un
// cobro vigente. La guarda del servidor (`exigirSeniaParaConfirmar`, sena-obligatoria.ts) carga los
// datos dentro de la transacción y decide con `decidirConfirmacionConSenia`, que vive acá para que
// la pantalla y los tests usen la MISMA regla. Apagado: la regla dice siempre que sí (lo de siempre).
//
// CUÁNDO ALCANZA LA SEÑA: cuando la plata que entró y sigue en pie (`cobradoRealDelTurno`: cobros −
// anulaciones, sin condonaciones; sin cobros, el pago viejo) cubre la seña del servicio, al centavo
// (`faltanteDeSenia`, cobros.ts). Es LA MISMA función que usa «Llegó la seña» (`seniaQueFalta`,
// cobro-dividido.ts) y la pantalla con el interruptor prendido: una seña parcial no alcanza y un cobro
// anulado no cuenta. No se exige la clave `senia:<turno>`: sin la columna `idempotencyKey` migrada la
// seña se graba sin clave (cobro-turno-repo.ts, `withSchema`) y la que entra por «Registrar cobro»
// lleva el uuid del formulario.
//
// «PENDIENTE DE SEÑA» no es un estado ni una columna: se deriva. Vence en
//   min(creado + H horas, inicio − 2 h)
// con H por negocio en la variable `SENA_VENCE_HORAS` («slug=horas;slug=horas», el formato de
// `CANCELACION_ONLINE_HORAS`). Sin H cargada para el negocio vence a las 2 h del inicio. Vencer no
// cancela nada: sólo lo marca.
//
// Client-safe: sin Prisma ni nada de servidor.

import { fmtShortDate, fmtTime, dateStrInBusinessTz } from "@/lib/datetime";
import { cobradoRealDelTurno, type FilaDeCobro } from "./anulacion";
import { faltanteDeSenia, type PagoLegado } from "./cobros";

export type VeredictoSenia = { ok: true } | { ok: false; motivo: string };

/** Lo que contesta el servidor cuando se intenta confirmar sin la seña. */
export const MENSAJE_FALTA_SENIA =
  "Este turno pide seña y todavía no entró entera: no se puede confirmar. Registrá la seña con «Llegó la seña» (cobra y confirma) o pedile a la dueña que lo confirme sin seña.";

/** Lo que contesta la edición si el cambio de servicio o precio deja a un Confirmado sin su seña. */
export const MENSAJE_EDITAR_SIN_SENIA =
  "Con ese cambio el turno pide una seña que no entró, y está confirmado: cobrá la seña primero o pedile a la dueña que lo confirme sin seña.";

/** Las acciones de auditoría que deciden si un Confirmado lo es por la excepción de la dueña. */
export const ACCION_CONFIRMAR = "confirm";
export const ACCION_CONFIRMAR_SIN_SENIA = "confirm_sin_senia";
export const ACCION_VOLVIO_A_RESERVADO = "unconfirm_falta_senia";
export const ACCIONES_DE_CONFIRMACION = [ACCION_CONFIRMAR, ACCION_CONFIRMAR_SIN_SENIA, ACCION_VOLVIO_A_RESERVADO] as const;

/** Mínimo de caracteres del motivo de «Confirmar sin seña» (queda en la auditoría). */
export const MOTIVO_MINIMO_SIN_SENIA = 10;

/** Horas antes del inicio en que una seña pendiente vence, aunque H dé más tarde. */
export const HORAS_ANTES_DEL_INICIO = 2;

type CobroLeido = FilaDeCobro & { id?: string; method?: string };

/** La seña que le falta a ESTE turno para poder confirmarse (0 = alcanza). PURA. */
export function seniaQueFaltaParaConfirmar(e: { senia: number; precio: number; cobros: readonly CobroLeido[]; pagoLegado?: PagoLegado }): number {
  return faltanteDeSenia(e.senia, cobradoRealDelTurno(e.precio, e.cobros, e.pagoLegado));
}

/**
 * ¿Se puede escribir CONFIRMED? La ÚNICA regla, para todos los caminos. PURA.
 *   · interruptor apagado → sí (comportamiento de siempre);
 *   · el servicio no pide seña (≤ 0) → sí;
 *   · lo cobrado vigente cubre la seña → sí;
 *   · si no → no, con el motivo para la pantalla.
 */
export function decidirConfirmacionConSenia(e: {
  prendida: boolean;
  senia: number;
  precio: number;
  cobros: readonly CobroLeido[];
  pagoLegado?: PagoLegado;
}): VeredictoSenia {
  if (!e.prendida) return { ok: true };
  if (seniaQueFaltaParaConfirmar(e) <= 0) return { ok: true };
  return { ok: false, motivo: MENSAJE_FALTA_SENIA };
}

/**
 * «Confirmar sin seña» (la excepción de la dueña): quién puede y con qué motivo. PURA. El permiso lo
 * vuelve a exigir el servidor con `requireCapability("agenda:confirmar-sin-senia")`.
 */
export function validarConfirmarSinSenia(p: {
  puede: boolean;
  motivo: unknown;
}): { ok: true; motivo: string } | { ok: false; error: string } {
  if (!p.puede) return { ok: false, error: "Confirmar sin seña lo hace sólo la dueña (o quien ella habilite)." };
  const motivo = typeof p.motivo === "string" ? p.motivo.trim().replace(/\s+/g, " ") : "";
  if (motivo.length < MOTIVO_MINIMO_SIN_SENIA) {
    return { ok: false, error: `Escribí por qué se confirma sin seña (al menos ${MOTIVO_MINIMO_SIN_SENIA} letras): queda en la auditoría.` };
  }
  return { ok: true, motivo: motivo.slice(0, 500) };
}

// ── Vencimiento de la seña pendiente ─────────────────────────────────────────

/** `SENA_VENCE_HORAS` («beauty-spa=24;otro=12») → slug → horas. Mismo formato que `leerPoliticas`. */
export function leerHorasDeVencimiento(raw: string | null | undefined): ReadonlyMap<string, number> {
  const m = new Map<string, number>();
  for (const par of String(raw ?? "").split(";")) {
    const [slug, horas] = par.split("=").map((x) => x?.trim());
    const n = Number(horas);
    if (slug && Number.isInteger(n) && n > 0 && n <= 24 * 30) m.set(slug, n);
  }
  return m;
}

/** Las horas H del negocio, o `null` si no las cargó. */
export function horasDeVencimientoDelNegocio(
  slug: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): number | null {
  return (slug && leerHorasDeVencimiento(env.SENA_VENCE_HORAS).get(slug)) || null;
}

/** min(creado + H, inicio − 2 h). Sin H (o sin fecha de alta), inicio − 2 h. PURA. */
export function vencimientoDeLaSenia(p: { creado: Date | string | null | undefined; inicio: Date | string; horas: number | null }): Date {
  const inicio = new Date(p.inicio).getTime();
  const tope = inicio - HORAS_ANTES_DEL_INICIO * 3_600_000;
  const creado = p.creado ? new Date(p.creado).getTime() : Number.NaN;
  if (p.horas == null || !Number.isFinite(creado)) return new Date(tope);
  return new Date(Math.min(creado + p.horas * 3_600_000, tope));
}

export type MarcaDeSenia = { tipo: "pendiente"; vence: string; texto: string } | { tipo: "vencida"; vence: string; texto: string };

/** «Pendiente de seña · vence hoy 14:00» / «… vence 12/11 14:00» / «Seña vencida». PURA. */
export function marcaDeSeniaPendiente(vence: Date | string, ahora: Date): MarcaDeSenia {
  const v = new Date(vence);
  const iso = v.toISOString();
  if (v.getTime() <= ahora.getTime()) return { tipo: "vencida", vence: iso, texto: "Seña vencida" };
  const cuando = dateStrInBusinessTz(v) === dateStrInBusinessTz(ahora) ? `hoy ${fmtTime(v)}` : `${fmtShortDate(v).slice(0, 5)} ${fmtTime(v)}`;
  return { tipo: "pendiente", vence: iso, texto: `Pendiente de seña · vence ${cuando}` };
}

/**
 * La marca para un turno, o `null` si no corresponde: interruptor prendido, turno Reservado que todavía
 * no empezó, servicio con seña y sin cobro vigente. PURA (la usan la agenda y la ficha).
 */
export function marcaDeSeniaDelTurno(p: {
  prendida: boolean;
  status: string;
  inicio: Date | string;
  creado: Date | string | null | undefined;
  senia: number;
  precio: number;
  cobros: readonly CobroLeido[];
  pagoLegado?: PagoLegado;
  horas: number | null;
  ahora: Date;
}): MarcaDeSenia | null {
  if (!p.prendida || p.status !== "PENDING") return null;
  if (new Date(p.inicio).getTime() <= p.ahora.getTime()) return null;
  if (seniaQueFaltaParaConfirmar(p) <= 0) return null;
  return marcaDeSeniaPendiente(vencimientoDeLaSenia({ creado: p.creado, inicio: p.inicio, horas: p.horas }), p.ahora);
}
