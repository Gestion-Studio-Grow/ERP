// Logger estructurado del Core (observabilidad — frente Plataforma). Cero deps
// nuevas (alineado con la economía de deps de ADR-008): emite una línea JSON por
// evento a stdout/stderr, que es lo que ingieren Netlify/Vercel/Railway sin
// configurar nada. Reemplaza al `console.error("[scope] …", err)` disperso, que
// no es parseable ni conserva el stack de forma consistente.
//
// Diseño: la SERIALIZACIÓN es pura y testeable (`formatLogEntry`, recibe el
// timestamp) y separada del efecto (escribir a consola). Los métodos del `logger`
// ponen el reloj real y despachan. El contexto (tenantId, actor, requestId, ids de
// dominio) se pasa explícito por el caller — el logger no toca la DB ni resuelve
// tenant (evita acoplarse a los cimientos y golpear Neon).

import { getRequestContext } from "@/lib/request-context";

export type LogLevel = "error" | "warn" | "info";

// Contexto libre que acompaña al evento. Se serializa tal cual dentro de la línea
// JSON; usar claves estables (tenantId, actor, requestId, entityId…) para poder
// filtrar después.
export type LogContext = Record<string, unknown>;

// Serializa un error desconocido a algo plano y loggeable, conservando nombre,
// mensaje y stack. No es exhaustivo (no camina `cause` en profundidad): captura lo
// que hace falta para diagnosticar sin arrastrar objetos gigantes.
export function serializeError(err: unknown): {
  name?: string;
  message: string;
  stack?: string;
} {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  if (typeof err === "string") return { message: err };
  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: String(err) };
  }
}

// Arma la línea JSON del evento. PURA: mismo input → mismo texto. El `ts` viene
// dado (los métodos del logger le pasan el reloj real) para que sea determinista
// en los tests. Las claves fijas (ts, level, scope, msg) van primero; el contexto
// se mergea después pero nunca pisa esas fijas.
export function formatLogEntry(
  level: LogLevel,
  scope: string,
  msg: string,
  ts: string,
  ctx?: LogContext,
  err?: unknown,
): string {
  const entry: Record<string, unknown> = { ts, level, scope, msg };
  if (ctx) {
    for (const [k, v] of Object.entries(ctx)) {
      if (k in entry) continue; // no pisar las claves fijas
      entry[k] = v;
    }
  }
  if (err !== undefined) entry.err = serializeError(err);
  return JSON.stringify(entry);
}

function emit(level: LogLevel, line: string): void {
  // error/warn a stderr, info a stdout — así los agregadores separan severidades.
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

// Mergea el contexto de request vigente (requestId, tenantId…) DEBAJO del ctx
// explícito del caller: el ambiente da la correlación por defecto, pero si el caller
// pasa una clave con el mismo nombre, la suya gana. Fuera de un request devuelve el
// ctx tal cual. Las claves fijas (ts/level/scope/msg) las protege formatLogEntry.
function withAmbient(ctx?: LogContext): LogContext | undefined {
  const ambient = getRequestContext();
  if (!ambient) return ctx;
  return { ...ambient, ...ctx };
}

export const logger = {
  error(scope: string, msg: string, err?: unknown, ctx?: LogContext): void {
    emit("error", formatLogEntry("error", scope, msg, new Date().toISOString(), withAmbient(ctx), err));
  },
  warn(scope: string, msg: string, ctx?: LogContext): void {
    emit("warn", formatLogEntry("warn", scope, msg, new Date().toISOString(), withAmbient(ctx)));
  },
  info(scope: string, msg: string, ctx?: LogContext): void {
    emit("info", formatLogEntry("info", scope, msg, new Date().toISOString(), withAmbient(ctx)));
  },
};
