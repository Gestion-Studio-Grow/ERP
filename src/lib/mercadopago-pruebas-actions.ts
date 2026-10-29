"use server";

// Banco de pruebas — Cobros Mercado Pago (stub/test). Server Action gated por
// `payments:manage`. Genera un link de cobro de prueba (monto chico) y registra
// el intento (logger). Bloqueada en modo `real`: el banco de pruebas es para
// validar sin cobrar de verdad — quien quiera cobrar de verdad usa el flujo
// normal (`generarCobro`).

import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { logger } from "@/lib/logger";
import {
  CobrosSinConexionError,
  crearPasarelaCobrosPara,
  modoCobrosDesdeEnv,
  type ModoCobros,
} from "@/lib/mercadopago-cobros-dispatch";
import { generarCobroDePrueba } from "@/plugins/mercadopago/cobros";

export type ResultadoBancoPruebasCobros =
  | { ok: true; modo: ModoCobros; preferenceId: string; initPoint: string; sandboxInitPoint?: string }
  | { ok: false; modo: ModoCobros; error: string };

/**
 * Genera un cobro de prueba contra el modo vigente (`MP_MODO`). Bloqueado en
 * modo `real`. Registra el intento (request/response resumido + estado) con el
 * logger estructurado.
 */
export async function generarCobroDePruebaAction(): Promise<ResultadoBancoPruebasCobros> {
  await requireCapability("payments:manage");
  const tenantId = await getCurrentTenantId();
  const modo = modoCobrosDesdeEnv();

  if (modo === "real") {
    return {
      ok: false,
      modo,
      error:
        "Con Mercado Pago conectado no se hacen verificaciones: cada link cobra de verdad.",
    };
  }

  logger.info("mercadopago.prueba", "Generando cobro de prueba", { tenantId, modo });

  let pasarela: Awaited<ReturnType<typeof crearPasarelaCobrosPara>>;
  try {
    pasarela = await crearPasarelaCobrosPara(tenantId);
  } catch (e) {
    // Sin conexión de Mercado Pago (y sin MP_MODO_LEGADO=1): falla cerrada, con qué hacer.
    if (e instanceof CobrosSinConexionError) return { ok: false, modo, error: e.message };
    throw e;
  }
  const resultado = await generarCobroDePrueba(pasarela);

  if (resultado.ok) {
    logger.info("mercadopago.prueba", "Cobro de prueba generado", {
      tenantId,
      modo,
      preferenceId: resultado.link.preferenceId,
    });
    return {
      ok: true,
      modo,
      preferenceId: resultado.link.preferenceId,
      initPoint: resultado.link.initPoint,
      sandboxInitPoint: resultado.link.sandboxInitPoint,
    };
  }

  logger.warn("mercadopago.prueba", "Cobro de prueba no generado", {
    tenantId,
    modo,
    motivo: resultado.motivo,
    error: resultado.mensaje,
  });
  return { ok: false, modo, error: resultado.mensaje };
}
