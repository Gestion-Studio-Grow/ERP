// PIN DE DESBLOQUEO de la sesión del panel (orden del dueño, 08/11/2026, textual: «El usuario no se va a vencer ni
// nada. A lo sumo diseñaríamos un ingreso por PIN cuando el usuario ya está logueado, para reactivarlo»).
//
// Con INACTIVIDAD_BLOQUEO_MS sin uso la sesión queda BLOQUEADA (auth.ts): no abre nada. Se destraba con un PIN de 4
// dígitos que el propio usuario definió justo después de entrar con su contraseña. Reglas:
//   · sólo destraba una sesión BLOQUEADA con firma válida (no una vencida ni un token viejo): el PIN no reemplaza la
//     contraseña, sólo reactiva a quien ya entró con ella en este navegador;
//   · el usuario se carga de la base (activo, no borrado, del negocio del pedido) y el PIN se compara con scrypt
//     (auth-password.ts), igual que la contraseña;
//   · cada intento RESERVA un fallo con un UPDATE condicional (`fallos < MAX_INTENTOS_PIN`) ANTES de comparar: con
//     pedidos en paralelo nunca hay más de MAX_INTENTOS_PIN comparaciones; acertar pone los fallos en 0;
//   · con MAX_INTENTOS_PIN errados seguidos el PIN no destraba más: contraseña completa (que pone los fallos en 0);
//   · sin PIN (no lo definió, o la tabla todavía no existe en la base) → contraseña;
//   · el PIN se define o cambia sólo con un ingreso por contraseña reciente (VENTANA_DEFINIR_PIN_MS): una cookie robada
//     con la sesión activa no alcanza para plantar un PIN propio.
//
// PURO (sin Prisma ni cookies): las rutas inyectan la base (sesion-pin.server.ts). Detalle:
// docs/seguridad/sesion-con-vencimiento.md.

import { createSessionToken, leerSesion } from "@/lib/auth";
import { MAX_INTENTOS_PIN, VENTANA_DEFINIR_PIN_MS } from "@/lib/sesion-constantes";

export { MAX_INTENTOS_PIN, VENTANA_DEFINIR_PIN_MS };

const PIN_VALIDO = /^\d{4}$/;

/** El PIN tal como lo tipeó la persona, normalizado (sin espacios), o null si no son 4 dígitos. */
export function normalizarPin(crudo: unknown): string | null {
  if (typeof crudo !== "string") return null;
  const pin = crudo.replace(/\s+/g, "");
  return PIN_VALIDO.test(pin) ? pin : null;
}

/** Problema de un PIN nuevo, o null si sirve. Evita los que se adivinan primero (repetidos y escaleras). */
export function problemaDelPinNuevo(pin: string | null, confirmacion: string | null): string | null {
  if (!pin) return "El PIN tiene que tener 4 números.";
  if (/^(\d)\1{3}$/.test(pin)) return "Elegí un PIN que no sea el mismo número repetido.";
  if ("0123456789".includes(pin) || "9876543210".includes(pin)) return "Elegí un PIN que no sea una escalera (1234, 4321…).";
  if (pin !== confirmacion) return "Los dos PIN no coinciden.";
  return null;
}

export type PinGuardado = { pinHash: string; fallos: number };

export type DependenciasDelPin = {
  /** Id del negocio del pedido. */
  tenantIdDelPedido: string;
  /** ¿Existe el usuario ACTIVO y no borrado con ese id en ese negocio? */
  usuarioActivo: (userId: string, tenantId: string) => Promise<boolean>;
  /** El PIN del usuario en ese negocio, o null (sin PIN, o la tabla todavía no existe). */
  cargarPin: (userId: string, tenantId: string) => Promise<PinGuardado | null>;
  /**
   * Reserva un intento de forma ATÓMICA: `UPDATE "UserPin" SET fallos = fallos + 1 WHERE userId, tenantId AND fallos <
   * max`; true sólo si actualizó la fila. Sin reserva no se compara el PIN.
   */
  reservarIntento: (userId: string, tenantId: string, max: number) => Promise<boolean>;
  /** Acertó: fallos en 0. */
  reiniciarFallos: (userId: string, tenantId: string) => Promise<void>;
  /** Compara el PIN con el hash (scrypt, `verifyPassword`). */
  verificar: (pin: string, hash: string) => Promise<boolean>;
  ahora?: number;
};

export type ResultadoDelDesbloqueo =
  /** Destrabada: cookie nueva con la actividad en «ahora» y el mismo `ingreso`. */
  | { tipo: "desbloqueada"; userId: string; tokenNuevo: string }
  /** PIN errado: quedan `quedan` intentos. */
  | { tipo: "errado"; quedan: number }
  /** Ya está activa: no hay nada que destrabar. */
  | { tipo: "activa" }
  /** Contraseña completa. `borrarCookie` cuando la sesión no sirve más (vencida, sin intentos, usuario dado de baja). */
  | { tipo: "contrasenia"; motivo: "sin-sesion" | "vencida" | "sin-pin" | "sin-intentos"; borrarCookie: boolean };

/** Qué pasa con este token y este PIN. Cualquier error de la base → contraseña (falla cerrada). */
export async function desbloquearConPin(
  token: string | undefined | null,
  pinCrudo: unknown,
  deps: DependenciasDelPin,
): Promise<ResultadoDelDesbloqueo> {
  const ahora = deps.ahora ?? Date.now();
  const sesion = await leerSesion(token, { ahora });
  if (!sesion) return { tipo: "contrasenia", motivo: "sin-sesion", borrarCookie: false };
  if (sesion.estado === "activa") return { tipo: "activa" };
  if (sesion.estado === "vencida") return { tipo: "contrasenia", motivo: "vencida", borrarCookie: true };
  if (!deps.tenantIdDelPedido) return { tipo: "contrasenia", motivo: "sin-sesion", borrarCookie: false };
  const { userId } = sesion;
  const tenantId = deps.tenantIdDelPedido;
  try {
    if (!(await deps.usuarioActivo(userId, tenantId))) {
      return { tipo: "contrasenia", motivo: "sin-sesion", borrarCookie: true };
    }
    const guardado = await deps.cargarPin(userId, tenantId);
    if (!guardado) return { tipo: "contrasenia", motivo: "sin-pin", borrarCookie: false };
    if (!(guardado.fallos < MAX_INTENTOS_PIN)) {
      return { tipo: "contrasenia", motivo: "sin-intentos", borrarCookie: true };
    }
    // Lo tipeado se valida DESPUÉS de saber que hay PIN e intentos: un PIN mal formado también gasta un intento
    // (si no, sería una forma gratis de sondear el estado), pero nunca se compara.
    if (!(await deps.reservarIntento(userId, tenantId, MAX_INTENTOS_PIN))) {
      return { tipo: "contrasenia", motivo: "sin-intentos", borrarCookie: true };
    }
    const pin = normalizarPin(pinCrudo);
    const ok = pin !== null && (await deps.verificar(pin, guardado.pinHash));
    if (ok) {
      await deps.reiniciarFallos(userId, tenantId);
      return { tipo: "desbloqueada", userId, tokenNuevo: await createSessionToken(userId, ahora, sesion.ingreso) };
    }
    // `guardado.fallos` es la foto de antes de reservar; con pedidos en paralelo puede quedar alguno menos, nunca más.
    const quedan = MAX_INTENTOS_PIN - (guardado.fallos + 1);
    if (quedan <= 0) return { tipo: "contrasenia", motivo: "sin-intentos", borrarCookie: true };
    return { tipo: "errado", quedan };
  } catch {
    return { tipo: "contrasenia", motivo: "sin-sesion", borrarCookie: false };
  }
}

/** ¿Esta sesión puede definir o cambiar el PIN? Activa y con la contraseña comprobada hace menos de la ventana. */
export async function puedeDefinirPin(token: string | undefined | null, ahora: number = Date.now()): Promise<string | null> {
  const s = await leerSesion(token, { ahora });
  if (!s || s.estado !== "activa") return null;
  if (s.ingreso <= 0 || ahora - s.ingreso >= VENTANA_DEFINIR_PIN_MS) return null;
  return s.userId;
}
