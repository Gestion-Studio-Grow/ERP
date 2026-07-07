"use server";

// Server Actions del módulo COBROS (Mercado Pago — links de pago). Gated por
// `payments:manage` (OWNER). Modo sandbox por defecto: funciona sin credenciales;
// con `MP_MODO=real` + `MP_ACCESS_TOKEN` genera links reales. Nunca maneja secretos
// en código (el token lo carga el dueño en el entorno).

import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { auditAdmin } from "@/lib/audit";
import {
  crearPasarelaCobrosPara,
  modoCobrosDesdeEnv,
  type ModoCobros,
} from "@/lib/mercadopago-cobros-dispatch";
import {
  SolicitudCobroInvalidaError,
  type SolicitudCobro,
} from "@/plugins/mercadopago/cobros";
import { MercadoPagoApiError } from "@/plugins/mercadopago/http";

/** Resultado de generar un cobro — lo consume la UI (CobrosSection). */
export type GenerarCobroResult =
  | {
      ok: true;
      preferenceId: string;
      initPoint: string;
      sandboxInitPoint?: string;
      modo: ModoCobros;
    }
  | { ok: false; error: string };

/**
 * Genera un link de cobro (preferencia de Checkout Pro) desde el formulario del
 * backoffice. Devuelve el link para compartir (WhatsApp) o un error legible.
 */
export async function generarCobro(formData: FormData): Promise<GenerarCobroResult> {
  await requireCapability("payments:manage");
  const tenantId = await getCurrentTenantId();

  const concepto = String(formData.get("concepto") || "").trim();
  const monto = Number(formData.get("monto"));
  const referenciaExterna = String(formData.get("referenciaExterna") || "").trim() || undefined;
  const emailPagador = String(formData.get("emailPagador") || "").trim() || undefined;

  const solicitud: SolicitudCobro = { concepto, monto, referenciaExterna, emailPagador };

  try {
    const pasarela = crearPasarelaCobrosPara(tenantId);
    const link = await pasarela.crearLinkDePago(solicitud);
    await auditAdmin({
      action: "create",
      entity: "PaymentLink",
      entityId: link.preferenceId,
      changes: { concepto, monto, referenciaExterna },
    });
    return {
      ok: true,
      preferenceId: link.preferenceId,
      initPoint: link.initPoint,
      sandboxInitPoint: link.sandboxInitPoint,
      modo: modoCobrosDesdeEnv(),
    };
  } catch (e) {
    if (e instanceof SolicitudCobroInvalidaError) {
      return { ok: false, error: e.errores.map((x) => x.mensaje).join(" ") };
    }
    if (e instanceof MercadoPagoApiError) {
      // No filtrar detalles crudos del proveedor al operador: mensaje claro + código.
      return {
        ok: false,
        error: `Mercado Pago rechazó la solicitud (${e.status}). Revisá el access token y que la cuenta esté habilitada para cobrar.`,
      };
    }
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo generar el cobro." };
  }
}

/** Modo de cobros actual (para que la UI avise si está en sandbox). */
export async function estadoCobros(): Promise<{ modo: ModoCobros }> {
  await requireCapability("payments:manage");
  return { modo: modoCobrosDesdeEnv() };
}
