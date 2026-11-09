// INGRESO, DISEÑO NUEVO («Renglón») — lo que la pantalla dice, calculado de la regla real.
//
// Puro (sin framework). Los números del aviso de bloqueo salen de `LOGIN_RULE`, la misma regla
// que aplica `login()` (src/lib/auth-actions.ts): si mañana la regla cambia, el texto cambia solo
// y nunca le promete a la cajera un tiempo que no es.

import { LOGIN_RULE, type RateLimitRule } from "@/lib/rate-limit";
import { INACTIVIDAD_BLOQUEO_MS, INACTIVIDAD_VENCE_MS, MAX_INTENTOS_PIN } from "@/lib/sesion-constantes";

const MINUTOS_SIN_USO = Math.round(INACTIVIDAD_BLOQUEO_MS / 60_000);
const DIAS_SIN_USO = Math.round(INACTIVIDAD_VENCE_MS / 86_400_000);
/** Avisos del login que no son un error de lo tipeado: sin rojo ni campo marcado. */
export const AVISOS_INFORMATIVOS: ReadonlySet<string> = new Set(["vencida", "inactiva", "pin"]);

/** `informativo`: no es un error de lo tipeado (la sesión venció): sin rojo ni campo marcado. */
export type AvisoDeIngreso = { titulo: string; detalle: string; informativo?: true };

const minutos = (regla: RateLimitRule) =>
  Math.max(1, Math.round(regla.windowMs / 60_000));

/**
 * El aviso de la franja según `?error=` del login. `throttled` = el limitador frenó la conexión;
 * cualquier otro valor = email o contraseña que no coinciden (un solo mensaje para los dos: no
 * revela si el email existe, igual que `login()`). Sin error, nada.
 */
export function avisoDeIngreso(
  error: string | undefined,
  regla: RateLimitRule = LOGIN_RULE,
): AvisoDeIngreso | null {
  if (!error) return null;
  const min = minutos(regla);
  if (error === "google") {
    return {
      titulo: "No pudimos ingresar con Google.",
      detalle: "Tu mail de Google tiene que estar dado de alta en este panel. Probá de nuevo o ingresá con tu clave.",
    };
  }
  if (error === "vencida") {
    return {
      titulo: "Tu sesión venció.",
      detalle: `Pasaron ${DIAS_SIN_USO} días sin usar el panel en este dispositivo. Volvé a entrar con tu email y tu contraseña.`,
      informativo: true,
    };
  }
  if (error === "inactiva") {
    return {
      titulo: "Tapamos la pantalla.",
      detalle: `Pasaron ${MINUTOS_SIN_USO} minutos sin uso y no tenés un PIN elegido. Volvé a entrar con tu contraseña; después podés elegir uno.`,
      informativo: true,
    };
  }
  if (error === "pin") {
    return {
      titulo: `Erraste el PIN ${MAX_INTENTOS_PIN} veces.`,
      detalle: "Por seguridad, ahora hay que entrar con tu email y tu contraseña. Con eso el PIN vuelve a andar.",
      informativo: true,
    };
  }
  if (error === "throttled") {
    return {
      titulo: "Frenamos el ingreso desde esta conexión.",
      detalle: `Hubo ${regla.max} intentos fallidos en menos de ${min} minutos. Se destraba solo en ${min} minutos como mucho; no hace falta hacer nada.`,
    };
  }
  return {
    titulo: "El email o la contraseña no coinciden.",
    detalle: `Revisá los dos y probá de nuevo. Con ${regla.max} intentos fallidos se frena el ingreso ${min} minutos.`,
  };
}

const FECHA_AR = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "America/Argentina/Buenos_Aires",
});

/** El folio de la hoja: el día de hoy en la Argentina («jueves 24 de septiembre»). */
export function folioDelDia(ahora: Date): string {
  return FECHA_AR.format(ahora).replace(",", "");
}

// ── DESPUÉS DE UNA CLAVE EQUIVOCADA ─────────────────────────────────────────
//
// `login()` (src/lib/auth-actions.ts) redirige a `?error=1` y la página se arma de nuevo: el
// campo del email volvía vacío y lo que la persona tipeaba mientras decía «Entrando…» se perdía.
// El email se guarda en la pestaña (sessionStorage) mientras se escribe y vuelve al campo sólo
// con el error y sólo si el campo está vacío. La contraseña NUNCA se guarda: vuelve vacía.

/** Dónde se guarda el email tipeado, en la pestaña (se va al cerrarla). Sólo el email. */
export const CLAVE_EMAIL_DEL_INGRESO = "gsg:ingreso:email";

/**
 * El email que hay que poner en el campo al armarse la pantalla, o `null` para no tocarlo.
 * Sin error no se completa nada (entrada normal); lo ya tipeado no se pisa nunca.
 */
export function emailAlMontar(p: { conError: boolean; enCampo: string; guardado: string | null }): string | null {
  if (!p.conError || p.enCampo !== "") return null;
  const guardado = p.guardado?.trim() ?? "";
  return guardado === "" ? null : guardado;
}

/** Con el email de vuelta, el cursor va a la contraseña (lo único que hay que volver a tipear). */
export function campoParaElCursor(p: { conError: boolean; email: string }): "login-email" | "login-password" {
  return p.conError && p.email.trim() !== "" ? "login-password" : "login-email";
}
