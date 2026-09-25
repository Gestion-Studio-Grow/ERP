// INGRESO, DISEÑO NUEVO («Renglón») — lo que la pantalla dice, calculado de la regla real.
//
// Puro (sin framework). Los números del aviso de bloqueo salen de `LOGIN_RULE`, la misma regla
// que aplica `login()` (src/lib/auth-actions.ts): si mañana la regla cambia, el texto cambia solo
// y nunca le promete a la cajera un tiempo que no es.

import { LOGIN_RULE, type RateLimitRule } from "@/lib/rate-limit";

export type AvisoDeIngreso = { titulo: string; detalle: string };

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
