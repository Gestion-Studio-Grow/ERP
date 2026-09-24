// ============================================================================
// PROBAR UN CUPÓN DESDE AFUERA — la reserva de CH, la tienda y el alta de la tienda.
// ============================================================================
//
// Probar un cupón es público (la reserva y la tienda no tienen sesión) y contesta si un código
// sirve: sin freno, alguien podía probar códigos de a miles hasta dar con uno. Había dos
// agujeros:
//   · `checkCoupon` (la reserva de CH) no tenía ningún freno;
//   · `probarCuponEnPedido` (la tienda) frenaba sólo los códigos INEXISTENTES y contestaba
//     distinto a uno que existe pero venció, se apagó o se agotó ("El cupón X venció el…"):
//     eso decía qué códigos existen, y probar ésos no sumaba al freno.
//
// LA REGLA, una sola para las tres puertas:
//   · hacia afuera, inexistente, apagado, vencido y agotado contestan LO MISMO (cada pantalla
//     con su texto de siempre para "no existe": no se agrega un mensaje nuevo);
//   · todo intento fallido suma al freno, por negocio y por IP: 10 en 10 minutos, y hasta que
//     se libere la ventana se contesta que espere, sin leer la base;
//   · el freno va ANTES de leer: un código adivinado después del freno tampoco contesta.
//
// El mostrador (con sesión) no pasa por acá: la cajera ve el motivo real ("venció el 30/09"),
// que es lo que necesita para explicarle al cliente.
//
// EL FRENO VIVE EN MEMORIA, POR PROCESO, como el del login (rate-limit.ts dice por qué hoy
// alcanza). Entre instancias de Vercel no se comparte. La única forma sin migración de que
// sobreviva entre instancias era contar filas de AuditLog por negocio+IP, y se descartó: esas
// filas aparecen en la Auditoría de la dueña y suman al número "acciones hoy" del Inicio
// (administracion.server.ts), o sea, CH vería filas nuevas por cada código mal tipeado. Lo que
// corresponde es un store compartido (tabla propia o Upstash) detrás de la misma interfaz.
//
// Sin "use server" y sin Prisma: la lectura del cupón llega inyectada (`leer`), así los tests
// ejecutan la decisión con datos.

import { createRateLimiter } from "@/lib/rate-limit";
import type { CuponLeido } from "@/lib/venta-reglas";

export const REGLA_CUPONES_FALLIDOS = { max: 10, windowMs: 10 * 60 * 1000 };

export const CUPON_FRENADO = "Probaste muchos códigos seguidos. Esperá unos minutos y volvé a intentar.";

export interface FrenoDeCupones {
  /** ¿Este negocio + IP ya gastó sus intentos fallidos de la ventana? */
  frenado(tenantId: string, ip: string | null | undefined): boolean;
  /** Suma un intento fallido (inexistente, apagado, vencido o agotado). */
  fallido(tenantId: string, ip: string | null | undefined): void;
}

/**
 * El freno cuenta por (NEGOCIO, IP): la clave lleva los dos, así los fallos contra una tienda no
 * frenan la reserva de otro negocio aunque salgan de la misma IP.
 *
 * LÍMITE CONOCIDO Y ACEPTADO: dentro de un mismo negocio, todos los que salen por la misma IP
 * pública comparten el cupo. En CH, las clientas que reservan desde el wifi del salón salen por
 * la IP del salón: 10 códigos mal tipeados en 10 minutos desde ahí frenan a TODAS las del salón
 * (en ese negocio) hasta que pase la ventana. Un aviso claro ("Esperá unos minutos") y sin
 * bloquear la reserva (sólo el cupón) es el costo de no tener otra cosa que identifique a quien
 * prueba sin sesión. Si pasa seguido, la salida es subir `max` para la reserva, no sacar el freno.
 */
export function crearFrenoDeCupones(now: () => number = Date.now): FrenoDeCupones {
  const limitador = createRateLimiter(REGLA_CUPONES_FALLIDOS, now);
  // Sin IP (un proxy que no la manda) se agrupa bajo una misma clave: también se frena.
  const clave = (tenantId: string, ip: string | null | undefined) => `cupon:${tenantId}:${ip || "sin-ip"}`;
  return {
    frenado: (tenantId, ip) => limitador.blocked(clave(tenantId, ip)),
    fallido: (tenantId, ip) => limitador.fail(clave(tenantId, ip)),
  };
}

/** El freno que comparten las tres puertas públicas del proceso. */
export const frenoDeCupones = crearFrenoDeCupones();

/**
 * ¿Este cupón se puede usar ahora? Existe, está prendido, no venció y le quedan usos. PURA. Es la
 * misma lista de rechazos que `aplicarCupon` (venta-reglas.ts), sin el motivo: hacia afuera el
 * motivo no se dice.
 *
 * `exigeDescuento`: el "tiene un descuento cargado" (value > 0) es regla de los PEDIDOS
 * (`aplicarCupon` ya lo exigía antes de la tanda 2a). La reserva de CH (`checkCoupon`) nunca lo
 * miró —y `bookAppointment` aplica igual un cupón en 0—, así que ahí va en false: la tanda 2a
 * cambió en CH el texto y el freno, no qué cupón vale.
 */
export function cuponUsable(
  c: Pick<CuponLeido, "active" | "expiresAt" | "maxUses" | "usedCount" | "value"> | null,
  ahora: Date,
  opts: { exigeDescuento: boolean },
): boolean {
  if (!c || !c.active) return false;
  if (c.expiresAt && c.expiresAt.getTime() < ahora.getTime()) return false;
  if (c.maxUses != null && c.usedCount >= c.maxUses) return false;
  return opts.exigeDescuento ? c.value > 0 : true;
}

export type PruebaPublica<C> = { ok: true; cupon: C } | { ok: false; motivo: "frenado" | "no-vale" };

/**
 * La prueba pública de un código: freno, lectura y decisión. El texto lo pone cada pantalla
 * según el `motivo` (y "no-vale" es UNO solo, sea inexistente, vencido o agotado).
 */
export async function probarCuponPublico<C extends Pick<CuponLeido, "active" | "expiresAt" | "maxUses" | "usedCount" | "value">>(p: {
  freno: FrenoDeCupones;
  tenantId: string;
  ip: string | null | undefined;
  ahora: Date;
  leer: () => Promise<C | null>;
  /** Ver `cuponUsable`: true en los pedidos (tienda), false en la reserva de CH. */
  exigeDescuento: boolean;
}): Promise<PruebaPublica<C>> {
  if (p.freno.frenado(p.tenantId, p.ip)) return { ok: false, motivo: "frenado" };
  const c = await p.leer();
  if (!c || !cuponUsable(c, p.ahora, { exigeDescuento: p.exigeDescuento })) {
    p.freno.fallido(p.tenantId, p.ip);
    return { ok: false, motivo: "no-vale" };
  }
  return { ok: true, cupon: c };
}

/**
 * El rechazo del cupón en el ALTA de la tienda (`placeOnlineOrder`), hacia afuera. El alta
 * decide con `aplicarCupon`, que dice el motivo ("venció el…"): acá se cambia por el texto
 * único y se suma al freno. La excepción es el rechazo REINTENTABLE (otra compra gastó el uso
 * en el mismo instante): ese no dice nada del código que no se sepa ya y se muestra tal cual.
 */
export function rechazoPublicoDelCupon(
  r: { error: string; reintentable?: boolean },
  freno: FrenoDeCupones,
  tenantId: string,
  ip: string | null | undefined,
  textoNoVale: string,
): string {
  if (r.reintentable) return r.error;
  freno.fallido(tenantId, ip);
  return textoNoVale;
}
