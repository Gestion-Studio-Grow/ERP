"use server";

// ============================================================================
// EMITIR A MANO — las acciones de las pantallas que usan el facturador guiado
// ============================================================================
//
// Cada una pone SU barrera y le pasa al motor común (`emitirComprobanteManual`) el negocio que
// emite. La de Factoque vive en facturita-actions.ts (barrera del producto).
//
//  · Panel de cualquier negocio (Facturación → Emitir): `billing:manage` + la app Facturación
//    (ADR-098) + facturación electrónica asignada (módulo `arca`), con el negocio de la sesión.
//  · Consola del contador: `cartera:manage` + que el cliente sea de SU cartera y esté activo
//    (`accesoAClienteDeCartera` para escribir); emite en el negocio DEL CLIENTE y queda registrado
//    en el estudio quién lo hizo.

import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { AppNoDisponibleError, requireAppAccion } from "@/lib/require-app";
import { accesoAClienteDeCartera } from "@/lib/contador/recibidos-db";
import { auditAdmin } from "@/lib/audit-core";
import { logger } from "@/lib/logger";
import { emitirComprobanteManual, tieneFacturacionElectronica } from "@/lib/facturacion/emision-manual.server";
import type { ResultadoEmisionManual } from "@/lib/facturacion/facturador-core";
import type { EmisionFacturita } from "@/lib/facturita-core";

/** Emitir desde el panel de Facturación del negocio de la sesión. */
export async function emitirComprobanteManualAction(datos: EmisionFacturita): Promise<ResultadoEmisionManual> {
  const user = await requireCapability("billing:manage");
  // La guardia de la app (ADR-098), la misma de la pantalla: una app oculta no emite.
  try {
    await requireAppAccion("facturacion");
  } catch (e) {
    if (e instanceof AppNoDisponibleError) return { ok: false, error: e.message };
    throw e;
  }
  const tenantId = await getCurrentTenantId();
  if (!(await tieneFacturacionElectronica(tenantId))) {
    return { ok: false, error: "Tu negocio no tiene la facturación electrónica asignada. Pedísela a Soporte GSG." };
  }
  return emitirComprobanteManual({ tenantId, actor: `user:${user.id}`, revalidar: ["/admin/facturacion"] }, datos);
}

/** Emitir desde la consola del contador, en el negocio de UN cliente de su cartera. */
export async function emitirParaClienteAction(clienteTenantId: string, datos: EmisionFacturita): Promise<ResultadoEmisionManual> {
  const acceso = await accesoAClienteDeCartera(clienteTenantId, true);
  if (!acceso.ok) return { ok: false, error: acceso.error };
  const cliente = acceso.cliente.id;
  const r = await emitirComprobanteManual(
    {
      tenantId: cliente,
      actor: `user:${acceso.usuario.id}`,
      revalidar: [`/contador/cliente/${cliente}/comprobantes`, `/contador/cliente/${cliente}/emitir`],
    },
    datos,
  );
  if (r.invoiceId) {
    // El registro en el estudio no puede contestar «no se emitió» de una factura que ya existe.
    await auditAdmin({
      action: "cartera.emitir_a_mano",
      entity: "CarteraCliente",
      entityId: cliente,
      changes: { estudioTenantId: acceso.estudioTenantId, invoiceId: r.invoiceId, ok: r.ok, repetida: r.ok ? (r.repetida ?? false) : false },
    }).catch((e: unknown) => logger.error("emision-manual", "no se pudo registrar la emisión en el estudio", e, { cliente }));
  }
  return r;
}
