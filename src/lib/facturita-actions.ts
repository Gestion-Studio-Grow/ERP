"use server";

/**
 * Server actions de FACTURITA (producto C, ADR-076). Mismo molde que el resto:
 * gated por capability + blueprint, tenant explícito en toda query, y el motor
 * de emisión del Core (calcularImpuestos + createInvoice + despacho ARCA) —
 * cero duplicación fiscal.
 */

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { tenantTransaction } from "@/lib/rls";
import { createInvoice } from "@/lib/invoice-core";
import {
  calcularImpuestos,
  getFiscalProfile,
  isInvoicingEnabled,
  PerfilFiscalIncompletoError,
} from "@/lib/fiscal";
import { procesarEnviosDelNegocio } from "@/lib/arca-dispatch";
import { contarFacturasDelMes, fechaFiscalDelDia } from "@/lib/bancos-glue";
import { logger } from "@/lib/logger";
import {
  estadoLimite,
  validarEmision,
  type EmisionFacturita,
  type EstadoLimite,
} from "@/lib/facturita-core";

const CONCEPTO_PRODUCTOS = 1;

/** Barrera del producto: sesión con permiso de facturación + tenant facturita. */
async function requireTenantFacturita(): Promise<string> {
  await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();
  const tenant = await tenantTransaction(
    (tx) => tx.tenant.findUnique({ where: { id: tenantId }, select: { blueprintId: true } }),
    { tenantId },
  );
  if (tenant?.blueprintId !== "facturita") {
    throw new Error("Esta pantalla es del producto Facturita.");
  }
  return tenantId;
}

/** Estado del tope mensual (5 gratis) para el tablero. */
export async function estadoFacturitaAction(): Promise<EstadoLimite> {
  const tenantId = await requireTenantFacturita();
  return estadoLimite(await contarFacturasDelMes(tenantId));
}

export type ResultadoEmisionFacturita =
  | { ok: true; invoiceId: string; limite: EstadoLimite }
  | { ok: false; error: string; invoiceId?: string };

// La fecha del comprobante es el día del NEGOCIO, no el del proceso. Armada con
// `getDate()` salía en la zona del proceso: con TZ=UTC (medido) una factura del 31/08 a
// las 22:30 hora argentina quedaba fechada 20260901, o sea en el período fiscal siguiente.
// No se exporta a propósito: en un archivo "use server" cada export es un endpoint.
function fechaHoy(): string {
  return fechaFiscalDelDia(new Date());
}

/**
 * Emite una factura manual: valida receptor y total, respeta el tope de 5 por
 * mes, y crea la factura por el motor del Core (la letra la decide el sistema
 * según la condición del emisor; monotributo → Factura C).
 */
export async function emitirFacturitaAction(
  datos: EmisionFacturita,
): Promise<ResultadoEmisionFacturita> {
  const tenantId = await requireTenantFacturita();

  const validacion = validarEmision(datos);
  if (!validacion.ok) return { ok: false, error: validacion.error };

  const limite = estadoLimite(await contarFacturasDelMes(tenantId));
  if (!limite.puedeEmitir) {
    return { ok: false, error: limite.mensaje ?? "Llegaste al límite de facturas del plan de este mes." };
  }

  try {
    const perfil = await getFiscalProfile(tenantId);
    const { neto, iva, total } = calcularImpuestos(perfil.condicionIva, datos.total);
    const invoiceId = await createInvoice({
      tenantId,
      concepto: CONCEPTO_PRODUCTOS,
      fecha: fechaHoy(),
      emisor: { cuit: perfil.cuit, condicionIva: perfil.condicionIva, puntoVenta: perfil.puntoVenta },
      receptor: {
        docTipo: validacion.receptor.docTipo,
        docNro: validacion.receptor.docNro,
        condicionIva: "CONSUMIDOR_FINAL",
      },
      neto,
      iva,
      total,
    });

    // Despacho a ARCA (CAE) si la facturación está encendida (stub/homologación/real).
    if (isInvoicingEnabled()) {
      await procesarEnviosDelNegocio(tenantId).catch((err) =>
        logger.warn("facturita", "despacho ARCA diferido (lo toma el próximo ciclo)", {
          tenantId,
          err: err instanceof Error ? err.message : String(err),
        }),
      );
    }

    revalidatePath("/facturita/app");

    // Si el despacho ya la rechazó (la decisión del comprobante o ARCA), se dice ahora y con el
    // motivo: responder «Factura emitida» con la factura rechazada deja al usuario creyendo que
    // entregó un comprobante válido. En camino (despacho diferido) sigue siendo ok.
    const decidida = await tenantTransaction(
      (tx) => tx.invoice.findFirst({ where: { id: invoiceId, tenantId }, select: { status: true, rechazoMotivo: true } }),
      { tenantId },
    );
    if (decidida?.status === "REJECTED") {
      return {
        ok: false,
        error: `ARCA no autorizó la factura: ${decidida.rechazoMotivo ?? "sin motivo informado"}`,
        invoiceId,
      };
    }
    return { ok: true, invoiceId, limite: estadoLimite(limite.usadas + 1) };
  } catch (err) {
    logger.error("facturita", "emisión falló", err, { tenantId });
    // Perfil fiscal sin cargar: reintentar no lo arregla, hay que cargar el dato.
    // Decirlo tal cual en vez del "probá en unos minutos" genérico.
    if (err instanceof PerfilFiscalIncompletoError) {
      return {
        ok: false,
        error:
          "Faltan los datos fiscales del negocio (CUIT y punto de venta). " +
          "Cargá el alta fiscal antes de emitir: no se emite con datos provisorios.",
      };
    }
    return {
      ok: false,
      error: "No se pudo emitir la factura. Probá de nuevo en unos minutos.",
    };
  }
}
