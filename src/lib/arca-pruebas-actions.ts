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
  credencialDesdeEnv,
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
 * Lee CUIT y punto de venta del negocio para la prueba.
 *
 * El punto de venta NO tiene valor por defecto. Antes caía al 1 si faltaba, y eso daba un
 * falso "anda": la prueba salía con un talonario que no es el del local, mientras la
 * facturación real, sin punto de venta, no emite (`construirPerfilFiscal` lanza). Y en una
 * marca con varios locales bajo el mismo CUIT, el 1 es el talonario de OTRO local. Sin punto
 * de venta cargado, la prueba no corre y dice qué falta y quién lo carga.
 *
 * Sin CUIT se sigue usando el CUIT de prueba de ARCA (homologación o stub). Si la lectura
 * falla, tampoco se inventan datos: se devuelve el error.
 */
async function datosFiscalesDelTenant(
  tenantId: string,
): Promise<{ ok: true; cuit: number; puntoVenta: number } | { ok: false; error: string }> {
  let tenant: { arcaCuit: string | null; arcaPuntoVenta: number | null } | null;
  try {
    tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { arcaCuit: true, arcaPuntoVenta: true },
    });
  } catch (e) {
    logger.warn("arca.prueba", "No se pudo leer la config fiscal del tenant; no se emite la prueba", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return {
      ok: false,
      error: "No pudimos leer los datos fiscales del negocio, así que no se hizo la prueba. Probá de nuevo en un rato.",
    };
  }
  const puntoVenta = tenant?.arcaPuntoVenta ?? null;
  if (!puntoVenta || puntoVenta <= 0) {
    return {
      ok: false,
      error:
        "Falta el punto de venta de ARCA de este negocio, así que la prueba no corre: sin él, " +
        "tampoco sale la factura real. Pedile a Gestión Studio Grow que cargue el punto de venta " +
        "que ARCA habilitó para tu CUIT.",
    };
  }
  return { ok: true, cuit: tenant?.arcaCuit ? Number(tenant.arcaCuit) : CUIT_DE_PRUEBA, puntoVenta };
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

  const datos = await datosFiscalesDelTenant(tenantId);
  if (!datos.ok) return { ok: false, modo, error: datos.error };
  const { cuit, puntoVenta } = datos;
  logger.info("arca.prueba", "Emitiendo factura de prueba", { tenantId, modo, cuit, puntoVenta });

  try {
    // Banco de pruebas: usa el cert de PRUEBA de env (`ARCA_CERT_PEM`/`ARCA_KEY_PEM`),
    // aislado del camino REAL (que resuelve la credencial cifrada por tenant, ADR-066).
    // Bloqueado en modo real arriba: acá solo corre stub (no firma) u homologación (cert
    // de test, endpoint forzado a homologación — sin registros fiscales reales).
    const client = crearAfipClient({ cuit, homologacion: true }, { credencial: credencialDesdeEnv() });
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
