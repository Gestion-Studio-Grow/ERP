/**
 * ENG-123 · Guarda del ARCA simulado en producción.
 *
 * El modo simulado de ARCA (`StubAfipClient`, src/plugins/arca/afip/stub.ts) devuelve un CAE falso
 * («STUB…»). Sirve en desarrollo, en preview y en tests; en PRODUCCIÓN con la facturación encendida
 * ese CAE quedaría guardado como el de una factura real. Esta guarda falla cerrado:
 *   - el despacho no arma un cliente simulado (arca-dispatch.ts `crearClientePara`);
 *   - el Core no persiste un CAE simulado (invoice-core.ts `registerFiscalDocument`);
 *   - el arranque (src/instrumentation.ts) y `/api/health` lo reportan.
 *
 * Criterio de producción: `VERCEL_ENV === "production"` (el mismo que usa el repo en
 * `scripts/vercel-build.mjs` y `fiscal/cert-crypto.ts`). Fuera de producción no cambia nada.
 * Facturación encendida: `ARCA_INVOICING_ENABLED === "true"` (mismo criterio que `isInvoicingEnabled`).
 * Sin dependencias de la base: se puede cargar en el arranque.
 */

import { logger } from "@/lib/logger";

type Env = Record<string, string | undefined>;

/** Prefijo del CAE que inventa el simulador (stub.ts). Mismo valor que `PREFIJO_CAE_DE_PRUEBA`. */
export const PREFIJO_CAE_SIMULADO = "STUB";

export function esProduccion(env: Env = process.env): boolean {
  return env.VERCEL_ENV === "production";
}

function facturacionEncendida(env: Env): boolean {
  return env.ARCA_INVOICING_ENABLED === "true";
}

/** ¿El CAE es el que inventa el simulador? */
export function caeEsSimulado(cae: string | null | undefined): boolean {
  return typeof cae === "string" && cae.startsWith(PREFIJO_CAE_SIMULADO);
}

/** Producción con la facturación encendida: ahí el simulado está prohibido. PURA. */
export function simuladoProhibido(env: Env = process.env): boolean {
  return esProduccion(env) && facturacionEncendida(env);
}

/**
 * ¿El entorno entero está en simulado (ARCA_MODO sin `real` ni `homologacion`) en producción con la
 * facturación encendida? Lo que reportan el arranque y `/api/health`. PURA.
 */
export function arcaSimuladoEnProduccion(env: Env = process.env): boolean {
  const modo = env.ARCA_MODO;
  return simuladoProhibido(env) && modo !== "real" && modo !== "homologacion";
}

/**
 * El nombre lo clasifica como falla de configuración (arca-reintentos.ts): el envío se detiene con
 * el motivo, no se reintenta en loop.
 */
export class ArcaSimuladoEnProduccionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArcaSimuladoEnProduccionError";
  }
}

const MENSAJE =
  "ARCA está en modo simulado en producción con la facturación encendida: no se emite ni se guarda " +
  "ningún CAE (sería falso). Configurá ARCA_MODO=real con el certificado del negocio, o apagá " +
  "ARCA_INVOICING_ENABLED — acción humana.";

/**
 * Falla cerrado si se va a usar el simulado (o guardar un CAE simulado) donde está prohibido.
 * Deja el error en el log antes de lanzar. Fuera de producción no hace nada.
 */
export function exigirNoSimuladoEnProduccion(
  ctx: { tenantId: string; donde: string },
  env: Env = process.env,
): void {
  if (!simuladoProhibido(env)) return;
  const err = new ArcaSimuladoEnProduccionError(MENSAJE);
  logger.error("arca", "ARCA simulado bloqueado en producción", err, ctx);
  throw err;
}

/** Chequeo de arranque: deja un error en el log si el entorno está mal. Devuelve si lo está. */
export function reportarArcaSimuladoAlArrancar(env: Env = process.env): boolean {
  if (!arcaSimuladoEnProduccion(env)) return false;
  logger.error("arca", "arranque: ARCA simulado con la facturación encendida en producción", undefined, {
    motivo: MENSAJE,
  });
  return true;
}
