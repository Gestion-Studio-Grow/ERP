// Contexto de request para observabilidad (Core Plataforma — observabilidad v2).
//
// Segunda capa sobre el logger estructurado de v1 (src/lib/logger.ts): guarda un
// `requestId` (y, cuando se resuelven, tenantId/actor) en un AsyncLocalStorage por
// request, y el logger lo mergea SOLO en cada línea sin que el caller lo pase a
// mano. Así todas las líneas de un mismo request/webhook quedan correlacionadas en
// el agregador (Netlify/Vercel ingieren el JSON de stdout) — clave para depurar los
// caminos máquina-a-máquina (API pública, webhook de MP) donde hay reintentos.
//
// Cero deps nuevas (economía de deps, ADR-008): AsyncLocalStorage + node:crypto.
//
// SEPARADO a propósito de src/lib/tenant-context.ts: ese ALS es el cableado de RLS
// (ADR-018), hoy apagado tras el flag RLS_ENFORCEMENT; este es observabilidad pura
// y siempre activo. Mantenerlos independientes evita atar los logs a la activación
// de RLS (que es un gate). El `tenantId` acá es solo una etiqueta de log; el que
// gobierna el aislamiento es el de tenant-context.

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

// Contexto que acompaña a todas las líneas de log del request. `requestId` es
// obligatorio; el resto son etiquetas opcionales que se completan a medida que se
// resuelven (setRequestContext). Claves estables → filtrables después.
export type RequestContext = {
  requestId: string;
  tenantId?: string;
  actor?: string;
  [key: string]: unknown;
};

const storage = new AsyncLocalStorage<RequestContext>();

/** Genera un identificador de request nuevo (UUID v4). */
export function newRequestId(): string {
  return randomUUID();
}

// Un requestId entrante (traza distribuida: el llamador ya trae uno) puede meterse
// en cada línea de log, así que se sanea antes de confiar en él: solo un subconjunto
// seguro de caracteres y un largo acotado, para evitar inyección de saltos de línea
// o payloads gigantes en los logs. Si no pasa, se descarta y se genera uno limpio.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,200}$/;
export function sanitizeRequestId(value: string | null | undefined): string {
  return value && SAFE_REQUEST_ID.test(value) ? value : newRequestId();
}

/**
 * Corre `fn` con un contexto de request en scope. Si `seed.requestId` no viene, se
 * genera uno. Devuelve lo que devuelva `fn` (async o sync).
 */
export function runInRequestContext<T>(
  seed: Partial<RequestContext> & Record<string, unknown>,
  fn: () => T,
): T {
  const requestId = seed.requestId ?? newRequestId();
  return storage.run({ ...seed, requestId }, fn);
}

/** Contexto actual, o undefined si se está fuera de todo request (jobs, tests). */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** requestId actual, o undefined fuera de contexto. */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/**
 * Completa el contexto vigente con más etiquetas (ej. tenantId/actor una vez que la
 * auth los resolvió). Mutación in-place del store → las líneas de log posteriores
 * del mismo request ya las incluyen. No-op fuera de contexto. No pisa `requestId`.
 */
export function setRequestContext(patch: Record<string, unknown>): void {
  const store = storage.getStore();
  if (!store) return;
  for (const [k, v] of Object.entries(patch)) {
    if (k === "requestId") continue;
    store[k] = v;
  }
}

/**
 * Envuelve un route handler de Next para que corra dentro de un contexto de request:
 * honra un `x-request-id` entrante (saneado) o genera uno, y lo propaga de vuelta en
 * el header `x-request-id` de la respuesta para correlación end-to-end. Uso:
 *
 *   export const POST = withRequestId(async (request) => { ... });
 */
export function withRequestId<A extends unknown[]>(
  handler: (request: Request, ...rest: A) => Response | Promise<Response>,
): (request: Request, ...rest: A) => Promise<Response> {
  return (request, ...rest) => {
    const requestId = sanitizeRequestId(request.headers.get("x-request-id"));
    return runInRequestContext({ requestId }, async () => {
      const res = await handler(request, ...rest);
      try {
        res.headers.set("x-request-id", requestId);
      } catch {
        // Respuesta con headers inmutables (raro): la correlación en logs igual quedó.
      }
      return res;
    });
  };
}
