"use server";

// Banco de pruebas — ARCA (homologación/stub). Server Action gated por
// `billing:manage`. Emite UN comprobante de prueba (Factura C, monto chico) y
// registra el intento (logger). Deliberadamente AISLADA del outbox real
// (`processArcaOutbox`/`Invoice`/`OutboxEvent`): no depende de que las
// migraciones fiscales estén aplicadas a Neon (`docs/arquitectura/
// propuesta-activacion-arca-mp.md` bloque C, Gate 2 pendiente).
//
// Bloqueada en modo `real`: el banco de pruebas es para validar homologación
// sin arriesgar facturar de verdad — quien quiera facturar de verdad usa el
// flujo normal (`procesarFacturacionPendiente`).

import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  crearAfipClient,
  modoDesdeEnv,
  emitirFacturaDePrueba,
  CUIT_DE_PRUEBA,
  type ModoArca,
} from "@/plugins/arca";

export type ResultadoBancoPruebasArca =
  | {
      ok: true;
      modo: ModoArca;
      cae: string;
      caeVencimiento: string;
      numero: number;
      puntoVenta: number;
    }
  | { ok: false; modo: ModoArca; error: string };

/**
 * Lee CUIT/punto de venta del tenant si están disponibles; si la columna no
 * existe todavía en Neon (migración fiscal sin aplicar, Gate 2) o cualquier
 * otro error de lectura, cae a los valores de PRUEBA — el banco de pruebas
 * nunca debe fallar por una migración pendiente.
 */
async function datosFiscalesDelTenant(
  tenantId: string,
): Promise<{ cuit: number; puntoVenta: number }> {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { arcaCuit: true, arcaPuntoVenta: true },
    });
    return {
      cuit: tenant?.arcaCuit ? Number(tenant.arcaCuit) : CUIT_DE_PRUEBA,
      puntoVenta: tenant?.arcaPuntoVenta ?? 1,
    };
  } catch (e) {
    logger.info("arca.prueba", "No se pudo leer la config fiscal del tenant; uso valores de prueba", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return { cuit: CUIT_DE_PRUEBA, puntoVenta: 1 };
  }
}

/**
 * Emite una factura de prueba contra el modo vigente (`ARCA_MODO`). Bloqueada
 * en modo `real`. Registra el intento (request/response resumido + estado) con
 * el logger estructurado — sin tocar `Invoice`/`OutboxEvent`.
 */
export async function emitirFacturaDePruebaAction(): Promise<ResultadoBancoPruebasArca> {
  await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();
  const modo = modoDesdeEnv();

  if (modo === "real") {
    return {
      ok: false,
      modo,
      error:
        "El banco de pruebas no corre en modo real (evita facturar de verdad). " +
        "Usá ARCA_MODO=stub o ARCA_MODO=homologacion para probar.",
    };
  }

  const { cuit, puntoVenta } = await datosFiscalesDelTenant(tenantId);
  logger.info("arca.prueba", "Emitiendo factura de prueba", { tenantId, modo, cuit, puntoVenta });

  try {
    const client = crearAfipClient({ cuit, homologacion: true });
    const resultado = await emitirFacturaDePrueba(client, { puntoVenta });

    if (resultado.ok) {
      logger.info("arca.prueba", "Factura de prueba autorizada", {
        tenantId,
        modo,
        puntoVenta,
        cae: resultado.cae,
        numero: resultado.numero,
      });
      return {
        ok: true,
        modo,
        cae: resultado.cae,
        caeVencimiento: resultado.caeVencimiento,
        numero: resultado.numero,
        puntoVenta: resultado.puntoVenta,
      };
    }

    const error =
      resultado.motivo === "rechazo"
        ? `ARCA rechazó el comprobante de prueba: ${resultado.observaciones
            .map((o) => `[${o.codigo}] ${o.mensaje}`)
            .join("; ")}`
        : resultado.mensaje;
    logger.warn("arca.prueba", "Factura de prueba no autorizada", {
      tenantId,
      modo,
      puntoVenta,
      motivo: resultado.motivo,
      error,
    });
    return { ok: false, modo, error };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudo emitir la factura de prueba.";
    logger.error("arca.prueba", "Error al emitir factura de prueba", e, { tenantId, modo, puntoVenta });
    return { ok: false, modo, error: mensaje };
  }
}
