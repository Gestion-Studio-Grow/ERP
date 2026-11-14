// ============================================================================
// MANTENIMIENTO GSG — reglas puras de la conexión de los agentes (MANT-003, diseño §7.3, §7.4, §15.5).
// ============================================================================
//
// La conexión de los agentes (`agente-db.ts`, rol `gsg_agente`) NO cae a otra: sin AGENTE_DATABASE_URL,
// o si la variable apunta a la misma base/rol que la app o la consola (correría sin el candado del rol),
// los agentes con datos quedan apagados y el ticket lo atiende una persona, como hoy.
// Un ticket de cartera (vive en el estudio, cliente en `clienteTenantId`) pide el permiso n1 del estudio
// Y el del cliente; CH en cualquiera de los dos → nada (D5). Defensa en código, además del candado de la
// base (prisma/pending-gate2/MANT_roles_soporte.sql). PURO: lo prueba agente-core.test.ts.

import { PRIORIDADES, TIPOS_TICKET, type Prioridad, type TipoTicket } from "./config";
import { quienApruebaElBorrador } from "./agentes-permisos";
import type { SugerenciaIa } from "./tickets-core";

/**
 * La URL de la conexión de los agentes, o null (apagado). Sin caída a DATABASE_URL ni a
 * OPERATOR_DATABASE_URL; si es igual a alguna de las dos, también null (fail-closed). PURA.
 */
export function urlDeAgente(env: Record<string, string | undefined>): string | null {
  const url = env.AGENTE_DATABASE_URL?.trim();
  if (!url) return null;
  if (url === env.DATABASE_URL?.trim() || url === env.OPERATOR_DATABASE_URL?.trim()) return null;
  return url;
}

export interface PermisoDeNegocio {
  /** El slug del negocio (para reconocer CH). Vacío o ausente → no se sabe de quién es → nada. */
  slug: string | null | undefined;
  /** El permiso n1 vigente de su titular. */
  n1: boolean;
}

/**
 * ¿Puede un agente trabajar con datos sobre este ticket? `estudio` = el negocio donde vive el ticket;
 * `cliente` = el de cartera (null si no es de cartera). CH o negocio desconocido en cualquiera → no;
 * sin permiso n1 de cualquiera → no (lo atiende una persona). PURA.
 */
export function agentePuedeEnTicket(p: { estudio: PermisoDeNegocio; cliente?: PermisoDeNegocio | null }): { puede: boolean; motivo: string } {
  const negocios = p.cliente ? [p.estudio, p.cliente] : [p.estudio];
  // quienApruebaElBorrador da «duenio» para CH y para un slug que no dice de qué negocio es.
  if (negocios.some((n) => quienApruebaElBorrador(n.slug) === "duenio")) {
    return { puede: false, motivo: "Es CH o no se sabe de qué negocio es: ningún agente toca la base (D5)." };
  }
  if (!p.estudio.n1) return { puede: false, motivo: "El negocio no dio el permiso n1: lo atiende una persona." };
  if (p.cliente && !p.cliente.n1) return { puede: false, motivo: "El cliente de cartera no dio el permiso n1: lo atiende una persona." };
  return { puede: true, motivo: p.cliente ? "Permiso n1 del estudio y del cliente." : "Permiso n1 del negocio." };
}

export const LARGO_MAXIMO_BORRADOR = 4000;
export const LARGO_MAXIMO_MOTIVO = 1000;

/** El borrador que deja un agente: tipo y prioridad de las listas, respuesta no vacía y acotada. PURA. */
export function validarBorradorDeAgente(x: unknown): { ok: true; valor: SugerenciaIa } | { ok: false; error: string } {
  if (typeof x !== "object" || x === null) return { ok: false, error: "Falta el borrador." };
  const o = x as Record<string, unknown>;
  if (typeof o.tipo !== "string" || !(TIPOS_TICKET as readonly string[]).includes(o.tipo)) return { ok: false, error: "Tipo desconocido." };
  if (typeof o.prioridad !== "string" || !(PRIORIDADES as readonly string[]).includes(o.prioridad)) return { ok: false, error: "Prioridad desconocida." };
  const respuesta = typeof o.respuesta === "string" ? o.respuesta.trim() : "";
  if (!respuesta) return { ok: false, error: "El borrador está vacío." };
  if (respuesta.length > LARGO_MAXIMO_BORRADOR) return { ok: false, error: "El borrador es demasiado largo." };
  const motivo = typeof o.motivo === "string" ? o.motivo.trim().slice(0, LARGO_MAXIMO_MOTIVO) : "";
  return { ok: true, valor: { tipo: o.tipo as TipoTicket, prioridad: o.prioridad as Prioridad, respuesta, motivo } };
}
