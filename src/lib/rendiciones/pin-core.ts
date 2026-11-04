// PIN DINÁMICO DE INGRESO (plan Rendí §4) para COMERCIAL/PRODUCCION de una productora que no usan una app de códigos.
// Puro: sin base, sin cookies y sin reloj (todo recibe `ahoraMs`). La base y el pedido: pin.server.ts.
//
// - El código nunca se guarda: se guarda HMAC-SHA256(clave derivada, negocio · persona · código). Atar el hash al negocio
//   y a la persona hace que el mismo código no sirva en otro negocio ni para otra persona.
// - Un código vivo por persona: pedir otro pisa hash/vencimiento/uso/intentos, pero NO la ventana de fallos ni el bloqueo.

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

// design-lint-ignore: no hay interfaz ni animación; el lint toma `Buffer.from(` por el `.from(` de gsap (reducedMotion N/A).

/** Quien no ve plata y no tiene app de códigos entra con un PIN por mail. Provisional hasta confirmarlo con MIA. */
export const ROLES_CON_PIN: readonly string[] = ["COMERCIAL", "PRODUCCION"];
export const DIGITOS_PIN = 6;
export const VIGENCIA_PIN_MS = 5 * 60_000;
export const MAX_INTENTOS_PIN = 5;
/** Ventana en la que se cuentan los fallos: 5 dentro de 15 minutos bloquean 15 minutos. */
export const VENTANA_FALLOS_MS = 15 * 60_000;
export const BLOQUEO_PIN_MS = 15 * 60_000;
/** Entre un pedido de código y el siguiente: frena el bombardeo de mails a la misma persona. */
export const ESPERA_ENTRE_PEDIDOS_MS = 60_000;

/** Lo único que ve la persona, pase lo que pase (anti enumeración). */
export const MENSAJE_PEDIDO = "Si tu usuario existe, te llegó un código por mail. Vence en 5 minutos.";
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
  intentosVentana: number;
  ventanaDesde: Date | null;
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

/** ¿Se puede mandar otro código? No si está bloqueado ni si el anterior salió hace menos de un minuto. */
export function puedePedir(f: FilaPin | null, ahoraMs: number): boolean {
  if (!f) return true;
  if (estaBloqueado(f, ahoraMs)) return false;
  const pedidoEl = f.venceEl.getTime() - VIGENCIA_PIN_MS;
  return ahoraMs - pedidoEl >= ESPERA_ENTRE_PEDIDOS_MS;
}

/** Lo que se pisa al pedir otro código. Deliberadamente sin intentosVentana, ventanaDesde ni bloqueadoHasta. */
export function datosDelPedido(hash: string, ahoraMs: number) {
  return { hash, venceEl: new Date(ahoraMs + VIGENCIA_PIN_MS), usadoEl: null, intentos: 0 };
}

/** Lo que queda tras un fallo: suma en la ventana (o abre una nueva) y al quinto bloquea 15 minutos. */
export function datosTrasFallo(f: FilaPin, ahoraMs: number) {
  const ventanaViva = !!f.ventanaDesde && ahoraMs - f.ventanaDesde.getTime() < VENTANA_FALLOS_MS;
  const enVentana = (ventanaViva ? f.intentosVentana : 0) + 1;
  if (enVentana >= MAX_INTENTOS_PIN) {
    return { intentos: f.intentos + 1, intentosVentana: 0, ventanaDesde: null, bloqueadoHasta: new Date(ahoraMs + BLOQUEO_PIN_MS) };
  }
  return { intentos: f.intentos + 1, intentosVentana: enVentana, ventanaDesde: ventanaViva ? f.ventanaDesde : new Date(ahoraMs), bloqueadoHasta: f.bloqueadoHasta };
}

/** Tras entrar: el código queda usado y los fallos se limpian. */
export const datosTrasExito = (ahoraMs: number) => ({ usadoEl: new Date(ahoraMs), intentos: 0, intentosVentana: 0, ventanaDesde: null, bloqueadoHasta: null });
