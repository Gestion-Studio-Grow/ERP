// ============================================================================
// RENDÍ en MIA — reglas puras de la carga y la aprobación (plan `docs/tenants/mia-producciones/PLAN-RENDI.md` §5.2).
// Sin Prisma ni fechas del sistema: las acciones (`acciones-rendiciones.ts`) leen, deciden acá y escriben con claim.
// ============================================================================

import { aplicarAccion, calcularCuadratura } from "@/lib/rendiciones/rendicion";
import { MEDIOS_PAGO, type EstadoRendicion, type EventoRendicion, type MedioPago, type Rendicion, type RolActor } from "@/lib/rendiciones/tipos";
import { puedeAprobarRendicion, puedeReintegrarRendicion, puedeRendir, type RolGestion } from "./gestion-core";

/** Los medios salen del motor (`tipos.ts`, única fuente; los mismos valores que el CHECK de la base). */
export const MEDIOS_RENDICION = MEDIOS_PAGO;
export type MedioRendicion = MedioPago;
export const MEDIO_RENDICION_LABEL: Record<MedioRendicion, string> = { PROPIO: "De mi bolsillo", ANTICIPO: "Con un anticipo" };

export const ESTADO_RENDICION_LABEL: Record<EstadoRendicion, string> = {
  borrador: "Borrador",
  enviada: "Para revisar",
  devuelta: "Devuelta para corregir",
  rechazada: "Rechazada",
  aprobada: "Aprobada",
  reintegrada: "Reintegrada",
};

export type AccionDeRevision = "aprobar" | "devolver" | "rechazar";
export const ACCIONES_DE_REVISION: readonly AccionDeRevision[] = ["aprobar", "devolver", "rechazar"];

/** El mensaje cuando el código llegó antes que la migración `20261104120000_rendiciones`. */
export const SIN_MIGRACION = "Las rendiciones todavía no están habilitadas en este negocio: falta actualizar la base. Avisale a Dirección.";

/** P2021 (tabla inexistente) / P2022 (columna inexistente): la migración no está aplicada. */
export function faltaLaMigracion(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return code === "P2021" || code === "P2022";
}

/** P2002: choca con una clave única. */
export function esClaveRepetida(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === "P2002";
}

/** El medio guardado → el del motor. Son los mismos valores; la base sólo admite esos dos (CHECK). */
export const medioDelMotor = (m: string): MedioPago => (m === "ANTICIPO" ? "ANTICIPO" : "PROPIO");

/** Filtro de Prisma: todo archivo del proyecto MENOS los comprobantes de Rendí (esos se ven sólo desde Rendiciones). */
export const SIN_COMPROBANTES = { tipo: { not: "COMPROBANTE" } } as const;

/** Mensaje cuando se quiere anular un gasto que está en una rendición viva. */
export const GASTO_EN_RENDICION = "Este gasto está en una rendición: rechazala desde Rendiciones.";

/**
 * Tope de comprobantes nuevos por negocio por mes (la foto vive en la base: Neon free). PROVISIONAL A CONFIRMAR con
 * MIA; si se queda corto, la salida es pasar los comprobantes a la nube (R2).
 */
export const MAX_COMPROBANTES_MES = 200;

/** Primer instante del mes calendario argentino (UTC−3, sin horario de verano) en el que cae `ahora`. */
export function inicioDelMesArgentino(ahora: Date): Date {
  const ar = new Date(ahora.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), 1, 3));
}

/**
 * Un importe como lo escribe una persona en Argentina, a centavos. Sólo dígitos, puntos de miles y coma decimal
 * (o un punto decimal con 1 o 2 dígitos: «12.5»). Nada de «0x10», «1e3», signos ni más de dos decimales: `null`.
 */
export function leerMontoArgentino(texto: string): number | null {
  const s = texto.trim().replace(/^\$\s*/, "");
  let entero: string;
  let dec = "";
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/))) {
    entero = m[1].replace(/\./g, "");
    dec = m[2] ?? "";
  } else if ((m = s.match(/^(\d+)\.(\d{1,2})$/))) {
    entero = m[1];
    dec = m[2];
  } else return null;
  if (entero.length > 12) return null;
  return Number(entero) * 100 + Number(dec.padEnd(2, "0"));
}
const esEstado = (s: string): s is EstadoRendicion => s in ESTADO_RENDICION_LABEL;

/** La fila de la base, en la forma del motor. Quien rinde se identifica por su persona del equipo. */
export function rendicionDelMotor(f: { id: string; gastoId: string; personaId: string; medio: string; anticipoId: string | null; montoCentavos: number; estado: string; eventos: unknown }): Rendicion {
  return {
    id: f.id,
    gastoId: f.gastoId,
    rindeId: f.personaId,
    medio: medioDelMotor(f.medio),
    ...(f.anticipoId ? { anticipoId: f.anticipoId } : {}),
    montoCentavos: f.montoCentavos,
    estado: esEstado(f.estado) ? f.estado : "borrador",
    eventos: Array.isArray(f.eventos) ? (f.eventos as EventoRendicion[]) : [],
  };
}

/** Quién actúa, para el motor: su persona del equipo; sin ficha (el dueño), su usuario. Nunca coincide con otra persona. */
export const actorDelMotor = (a: { personaId: string | null; userId: string }): string => a.personaId ?? `user:${a.userId}`;

/** La clave del envío que manda el formulario (un UUID del navegador). */
export const claveValida = (clave: string): boolean => /^[A-Za-z0-9_-]{16,64}$/.test(clave);

export interface DatosDeRendicion {
  descripcion: string;
  rubro: string;
  montoCentavos: number;
  medio: MedioRendicion;
  anticipoId: string | null;
  fecha: string | null;
}

/** Lee y valida el formulario de «Rendir un gasto». Mensajes en criollo. */
export function leerRendicion(d: { descripcion: string; rubro: string; monto: string; medio: string; anticipoId: string; fecha: string }): { ok: true; datos: DatosDeRendicion } | { ok: false; error: string } {
  const descripcion = d.descripcion.trim().slice(0, 200);
  if (!descripcion) return { ok: false, error: "Escribí qué pagaste (por ejemplo: «Taxi al predio»)." };
  const montoCentavos = leerMontoArgentino(d.monto) ?? 0;
  if (!(montoCentavos > 0) || !Number.isSafeInteger(montoCentavos) || montoCentavos > 100_000_000_00) return { ok: false, error: "Escribí cuánto pagaste: un importe mayor a cero." };
  if (!(MEDIOS_RENDICION as readonly string[]).includes(d.medio)) return { ok: false, error: "Elegí si lo pagaste de tu bolsillo o con un anticipo." };
  const medio = d.medio as MedioRendicion;
  const anticipoId = d.anticipoId.trim() || null;
  if (medio === "ANTICIPO" && !anticipoId) return { ok: false, error: "Elegí con qué anticipo lo pagaste." };
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(d.fecha.trim()) ? d.fecha.trim() : null;
  return { ok: true, datos: { descripcion, rubro: d.rubro.trim().slice(0, 60) || "Rendición", montoCentavos, medio, anticipoId: medio === "ANTICIPO" ? anticipoId : null, fecha } };
}

/** Por qué no puede rendir en este proyecto, o `null`. Ver el proyecto no alcanza: tiene que estar en su equipo. */
export function motivoNoRinde(rol: RolGestion, personaId: string | null, estaEnEquipo: boolean): string | null {
  if (!personaId) return "Tu usuario no está vinculado a una persona del equipo. Pedile a Dirección que te vincule.";
  if (!puedeRendir(rol, estaEnEquipo)) return estaEnEquipo ? "Tu rol no rinde gastos." : "Sólo rinde gastos quien está en el equipo de este proyecto.";
  return null;
}

/** Puede ver la rendición: quien aprueba ve todas; el resto, las propias. */
export function veLaRendicion(rol: RolGestion, actorPersonaId: string | null, rindePersonaId: string): boolean {
  return rol === "DIRECCION" || rol === "ADMINISTRACION" || (!!actorPersonaId && actorPersonaId === rindePersonaId);
}

/** Muestra los botones de revisión: Dirección o Administración, nunca en lo propio. El servidor lo vuelve a decidir. */
export function muestraRevision(rol: RolGestion, actorId: string, rindePersonaId: string, estado: string): boolean {
  return estado === "enviada" && puedeAprobarRendicion(rol, actorId, rindePersonaId);
}

/**
 * La transición pedida, decidida por el motor. Devuelve el nuevo estado y la bitácora completa; quien escribe lo hace
 * con `updateMany where estado = <desde>` para que dos clics concurrentes den uno solo.
 */
export function decidirRevision(
  fila: Parameters<typeof rendicionDelMotor>[0],
  accion: AccionDeRevision,
  ctx: { rol: RolGestion; actorId: string; fecha: string; comentario?: string; actorUserId?: string; rindeUserId?: string | null },
): { ok: true; desde: EstadoRendicion; hacia: EstadoRendicion; eventos: EventoRendicion[] } | { ok: false; error: string } {
  // Lo propio se mira por persona Y por usuario: si la ficha de quien rindió se desactivó, su actor pasa a `user:<id>`.
  const esPropia = ctx.actorId === fila.personaId || (!!ctx.actorUserId && !!ctx.rindeUserId && ctx.actorUserId === ctx.rindeUserId);
  if (esPropia) return { ok: false, error: "Nadie aprueba lo propio: esta rendición es tuya." };
  if (!puedeAprobarRendicion(ctx.rol, ctx.actorId, fila.personaId)) return { ok: false, error: "Sólo Dirección o Administración revisan rendiciones." };
  const r = rendicionDelMotor(fila);
  const res = aplicarAccion(r, accion, { fecha: ctx.fecha, actorId: ctx.actorId, rolActor: ctx.rol as RolActor, comentario: ctx.comentario });
  if (!res.ok) return { ok: false, error: `${res.motivo}.` };
  return { ok: true, desde: r.estado, hacia: res.rendicion.estado, eventos: res.rendicion.eventos };
}

// ── Tanda 3: reintegro y anticipos ──────────────────────────────────────────

/** Pagar, reintegrar o mover un anticipo: Dirección o Administración, nunca lo propio (por persona y por usuario). PURA. */
export function motivoNoMuevePlata(rol: RolGestion, actor: { personaId: string | null; userId: string }, de: { personaId: string; userId: string | null }): string | null {
  const actorId = actorDelMotor(actor);
  if (actorId === de.personaId || (!!de.userId && de.userId === actor.userId)) return "Nadie se paga lo propio: esto es tuyo.";
  if (!puedeReintegrarRendicion(rol, actorId, de.personaId)) return "Sólo Dirección o Administración mueven esta plata.";
  return null;
}

/** Se ve el botón «Reintegrar ahora»: aprobada, de su bolsillo, sin liquidación que la reclame. El servidor lo vuelve a decidir. */
export function muestraReintegro(rol: RolGestion, actorId: string, f: { personaId: string; medio: string; estado: string; liquidacionId: string | null }): boolean {
  return f.estado === "aprobada" && f.medio === "PROPIO" && !f.liquidacionId && puedeReintegrarRendicion(rol, actorId, f.personaId);
}

const EN_REVISION = new Set(["borrador", "enviada", "devuelta"]);

/**
 * Cierre de un anticipo con la cuadratura del motor (sólo las rendiciones de ESE anticipo; lo propio va por reintegro).
 * Con rendiciones esperando revisión no se cierra. Sobrante → devolución (INGRESO); faltante → reintegro (EGRESO). PURA.
 */
export function cierreDeAnticipo(
  anticipo: { id: string; montoCentavos: number; devueltoCentavos: number; reintegradoCentavos: number },
  filas: readonly Parameters<typeof rendicionDelMotor>[0][],
): { ok: true; aDevolver: number; aReintegrar: number; mensaje: string } | { ok: false; error: string } {
  const delAnticipo = filas.filter((f) => f.medio === "ANTICIPO" && f.anticipoId === anticipo.id);
  if (delAnticipo.some((f) => EN_REVISION.has(f.estado))) return { ok: false, error: "Hay rendiciones de este anticipo sin revisar: aprobalas, devolvelas o rechazalas antes de cerrarlo." };
  const c = calcularCuadratura(anticipo, delAnticipo.map(rendicionDelMotor), 0);
  return { ok: true, aDevolver: c.aDevolver, aReintegrar: Math.max(0, -c.diferencia), mensaje: c.mensaje };
}
