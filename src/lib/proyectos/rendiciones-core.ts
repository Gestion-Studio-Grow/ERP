// ============================================================================
// RENDÍ en MIA — reglas puras de la carga y la aprobación (plan `docs/tenants/mia-producciones/PLAN-RENDI.md` §5.2).
// Sin Prisma ni fechas del sistema: las acciones (`acciones-rendiciones.ts`) leen, deciden acá y escriben con claim.
// ============================================================================

import { aplicarAccion } from "@/lib/rendiciones/rendicion";
import { pesos as aCentavos } from "@/lib/rendiciones/dinero";
import type { EstadoRendicion, EventoRendicion, MedioPago, Rendicion, RolActor } from "@/lib/rendiciones/tipos";
import { leerNumero } from "./core";
import { puedeAprobarRendicion, puedeRendir, type RolGestion } from "./gestion-core";

export const MEDIOS_RENDICION = ["PROPIO", "ANTICIPO"] as const;
export type MedioRendicion = (typeof MEDIOS_RENDICION)[number];
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

export const medioDelMotor = (m: string): MedioPago => (m === "ANTICIPO" ? "efectivo_anticipo" : "propio_a_reintegrar");
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
  const monto = leerNumero(d.monto);
  const montoCentavos = Number.isFinite(monto) ? aCentavos(monto) : 0;
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
  ctx: { rol: RolGestion; actorId: string; fecha: string; comentario?: string },
): { ok: true; desde: EstadoRendicion; hacia: EstadoRendicion; eventos: EventoRendicion[] } | { ok: false; error: string } {
  if (!puedeAprobarRendicion(ctx.rol, ctx.actorId, fila.personaId)) {
    return { ok: false, error: ctx.actorId === fila.personaId ? "Nadie aprueba lo propio: esta rendición es tuya." : "Sólo Dirección o Administración revisan rendiciones." };
  }
  const r = rendicionDelMotor(fila);
  const res = aplicarAccion(r, accion, { fecha: ctx.fecha, actorId: ctx.actorId, rolActor: ctx.rol as RolActor, comentario: ctx.comentario });
  if (!res.ok) return { ok: false, error: `${res.motivo}.` };
  return { ok: true, desde: r.estado, hacia: res.rendicion.estado, eventos: res.rendicion.eventos };
}
