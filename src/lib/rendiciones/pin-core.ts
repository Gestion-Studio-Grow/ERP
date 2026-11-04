// PIN DINÁMICO DE INGRESO (plan Rendí §4) para COMERCIAL/PRODUCCION de una productora que no usan una app de códigos.
// Puro: sin base, sin cookies y sin reloj (todo recibe `ahoraMs`). La base y el pedido: pin.server.ts.
//
// - El código nunca se guarda: se guarda HMAC-SHA256(clave derivada, negocio · persona · código). Atar el hash al negocio
//   y a la persona hace que el mismo código no sirva en otro negocio ni para otra persona.
// - Un código vivo por persona: pedir otro pisa hash/vencimiento/uso/intentos, pero NO los fallos recientes ni el bloqueo.
// - Ventana DESLIZANTE: se guardan las horas de los últimos fallos (`fallosEl`); 5 dentro de cualquier tramo de 15 minutos
//   bloquean. Una ventana fija dejaba hasta 8 fallos seguidos cruzando su borde.

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

// design-lint-ignore: no hay interfaz ni animación; el lint toma `Buffer.from(` por el `.from(` de gsap (reducedMotion N/A).

/** Quien no ve plata y no tiene app de códigos entra con un PIN por mail. Provisional hasta confirmarlo con MIA. */
export const ROLES_CON_PIN: readonly string[] = ["COMERCIAL", "PRODUCCION"];
export const DIGITOS_PIN = 6;
export const VIGENCIA_PIN_MS = 5 * 60_000;
export const MAX_INTENTOS_PIN = 5;
/** Ventana deslizante en la que se cuentan los fallos: 5 dentro de cualquier tramo de 15 minutos bloquean 15 minutos. */
export const VENTANA_FALLOS_MS = 15 * 60_000;
export const BLOQUEO_PIN_MS = 15 * 60_000;
/** Entre un pedido de código y el siguiente: frena el bombardeo de mails a la misma persona. */
export const ESPERA_ENTRE_PEDIDOS_MS = 60_000;

/** Lo único que ve la persona, pase lo que pase (anti enumeración). */
export const MENSAJE_PEDIDO = "Si tu usuario existe, te llegó un código por mail. Vence en 5 minutos.";
/** Volvió a pedir antes del minuto (exista o no el usuario: depende sólo de cuándo pidió la vez anterior). */
export const MENSAJE_RECIEN = "Ya te mandamos un código hace instantes; revisá tu mail.";
export const MENSAJE_FALLO = "El código no sirve. Revisá el último mail o pedí otro código; si fallás muchas veces, esperá 15 minutos.";

export interface ContextoPin {
  tenantId: string;
  userId: string;
}

/** Seis dígitos uniformes (randomInt no tiene sesgo de módulo). `azar` se inyecta en los tests. */
export function generarPin(azar: (max: number) => number = randomInt): string {
  return String(azar(10 ** DIGITOS_PIN)).padStart(DIGITOS_PIN, "0");
}

export const normalizarPin = (codigo: string): string => codigo.replace(/[\s-]/g, "").slice(0, 20);

export function hashDelPin(codigo: string, ctx: ContextoPin, clave: Buffer): string {
  return createHmac("sha256", clave).update(`${ctx.tenantId}\u0000${ctx.userId}\u0000${normalizarPin(codigo)}`).digest("hex");
}

/**
 * Compara en tiempo constante. Siempre calcula el HMAC, aun con un formato inválido o sin hash guardado: el trabajo es el
 * mismo exista o no el código (anti timing).
 */
export function pinCoincide(codigo: string, hashGuardado: string | null, ctx: ContextoPin, clave: Buffer): boolean {
  const calculado = Buffer.from(hashDelPin(codigo, ctx, clave), "hex");
  const guardado = Buffer.from(hashGuardado ?? "", "hex");
  const mismoLargo = guardado.length === calculado.length;
  const iguales = timingSafeEqual(calculado, mismoLargo ? guardado : calculado);
  return mismoLargo && iguales && new RegExp(`^\\d{${DIGITOS_PIN}}$`).test(normalizarPin(codigo));
}

export interface FilaPin {
  venceEl: Date;
  usadoEl: Date | null;
  intentos: number;
  fallosEl: Date[];
  bloqueadoHasta: Date | null;
}

export type EstadoPin = "vivo" | "vencido" | "usado" | "bloqueado";

export function estadoDelPin(f: FilaPin, ahoraMs: number): EstadoPin {
  if (f.bloqueadoHasta && f.bloqueadoHasta.getTime() > ahoraMs) return "bloqueado";
  if (f.usadoEl) return "usado";
  if (f.venceEl.getTime() <= ahoraMs) return "vencido";
  return "vivo";
}

export const estaBloqueado = (f: Pick<FilaPin, "bloqueadoHasta"> | null, ahoraMs: number): boolean =>
  !!f?.bloqueadoHasta && f.bloqueadoHasta.getTime() > ahoraMs;

/**
 * ¿Se puede mandar otro código? No si está bloqueado ni si el anterior salió hace menos de un minuto, salvo que ese ya se
 * haya usado para entrar (si no, quien sale y vuelve a entrar enseguida quedaba trabado un minuto con un código gastado).
 */
export function puedePedir(f: FilaPin | null, ahoraMs: number): boolean {
  if (!f) return true;
  if (estaBloqueado(f, ahoraMs)) return false;
  if (f.usadoEl) return true;
  const pedidoEl = f.venceEl.getTime() - VIGENCIA_PIN_MS;
  return ahoraMs - pedidoEl >= ESPERA_ENTRE_PEDIDOS_MS;
}

/** El aviso del pedido: depende sólo de cuándo pidió la vez anterior esta misma clave, nunca de si el usuario existe. */
export const mensajeDelPedido = (anteriorMs: number | undefined, ahoraMs: number): string =>
  anteriorMs !== undefined && ahoraMs - anteriorMs < ESPERA_ENTRE_PEDIDOS_MS ? MENSAJE_RECIEN : MENSAJE_PEDIDO;

/** Lo que se pisa al pedir otro código. Deliberadamente sin fallosEl ni bloqueadoHasta. */
export function datosDelPedido(hash: string, ahoraMs: number) {
  return { hash, venceEl: new Date(ahoraMs + VIGENCIA_PIN_MS), usadoEl: null, intentos: 0 };
}

/** Los fallos que siguen dentro de la ventana deslizante. */
export const fallosVigentes = (fallos: readonly Date[], ahoraMs: number): Date[] => fallos.filter((d) => ahoraMs - d.getTime() < VENTANA_FALLOS_MS);

/** Lo que queda tras un fallo: suma su hora a los recientes y, si quedan 5 en los últimos 15 minutos, bloquea 15 minutos. */
export function datosTrasFallo(f: FilaPin, ahoraMs: number) {
  const recientes = [...fallosVigentes(f.fallosEl ?? [], ahoraMs), new Date(ahoraMs)];
  if (recientes.length >= MAX_INTENTOS_PIN) {
    return { intentos: f.intentos + 1, fallosEl: [] as Date[], bloqueadoHasta: new Date(ahoraMs + BLOQUEO_PIN_MS) };
  }
  return { intentos: f.intentos + 1, fallosEl: recientes.slice(-(MAX_INTENTOS_PIN - 1)), bloqueadoHasta: f.bloqueadoHasta };
}

/** Tras entrar: el código queda usado y los fallos se limpian. */
export const datosTrasExito = (ahoraMs: number) => ({ usadoEl: new Date(ahoraMs), intentos: 0, fallosEl: [] as Date[], bloqueadoHasta: null });

/**
 * ¿La base todavía no tiene la tabla del PIN? (migración 20261104120000_rendiciones sin aplicar). Prisma la reporta como
 * P2021; una consulta cruda, como P2010 con el 42P01 de Postgres adentro.
 */
export function esTablaInexistente(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const { code, meta, message } = e as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
  if (code === "P2021" || code === "42P01" || meta?.code === "42P01") return true;
  return typeof message === "string" && /42P01|relation "?ProyectoPinIngreso"? does not exist/i.test(message);
}

/** Generar el código de otra persona (para pasárselo por WhatsApp): sólo Dirección o Administración, sólo a quien entra con PIN. */
export const ROLES_QUE_GENERAN_PIN: readonly string[] = ["DIRECCION", "ADMINISTRACION"];
export const puedeGenerarPinDe = (rolActor: string, rolPersona: string): boolean =>
  ROLES_QUE_GENERAN_PIN.includes(rolActor) && ROLES_CON_PIN.includes(rolPersona);

/** Link de WhatsApp sin número (no guardamos teléfonos del equipo): la persona elige el contacto en su teléfono. */
export const enlaceWhatsAppDelPin = (nombre: string, codigo: string): string =>
  `https://wa.me/?text=${encodeURIComponent(`Hola ${nombre}, tu código para entrar al panel es ${codigo}. Vence en 5 minutos y sirve una sola vez.`)}`;
