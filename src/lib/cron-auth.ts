/**
 * Autorización de endpoints de cron — Célula de Seguridad.
 *
 * Decisión pura y testeable de si un request de cron está autorizado, separada
 * del handler HTTP para poder verificarla sin levantar Prisma ni la ruta.
 *
 * **Fail-CLOSED (regla dura):** si `CRON_SECRET` no está seteada, NADIE pasa
 * (503, misconfiguración) — antes el chequeo se salteaba y el endpoint quedaba
 * abierto a internet, que podía dispararlo a voluntad (recordatorios spam,
 * consumo de compute de Neon). Con secreto seteado, se exige el bearer exacto.
 *
 * El status distingue el modo de rechazo:
 *   - 503 `cron_not_configured` → el server no tiene `CRON_SECRET` (culpa nuestra,
 *     no del caller). Cerrado igual: sin secreto no se ejecuta el efecto.
 *   - 401 `unauthorized`        → hay secreto pero el bearer no coincide.
 */

import { timingSafeEqual } from "node:crypto";

export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

/** Compara en tiempo constante (evita filtrar el secreto por timing). */
function bearerMatches(authHeader: string, expected: string): boolean {
  const a = Buffer.from(authHeader);
  const b = Buffer.from(`Bearer ${expected}`);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Decide si el request de cron está autorizado. Fail-closed: sin `secret`
 * configurado devuelve 503 (no ejecuta el efecto).
 */
export function authorizeCron(
  secret: string | undefined,
  authHeader: string | null,
): CronAuthResult {
  if (!secret) {
    return { ok: false, status: 503, error: "cron_not_configured" };
  }
  if (!authHeader || !bearerMatches(authHeader, secret)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true };
}
