// Qué pasó cuando facturar el turno tiró. Lo comparten `completeAppointment` y `cobro-actions`
// (terminar y cobrar dividido, cobrar varios), para que el criterio sea uno solo.
//
// El silencio es SÓLO para el negocio que nunca configuró la facturación (CH: sin credencial y sin
// punto de venta): no es una falla que recepción pueda resolver y se repetiría en cada turno. Si empezó
// a configurarla, quiere facturar: un dato mal es una falla y se avisa, porque el turno no se puede
// facturar después y nadie más se entera (CERT-R2-CH, V3-1).

import { PerfilFiscalIncompletoError } from "@/lib/fiscal";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import type { ResultadoFacturaDelTurno } from "./aviso-factura";

/**
 * Sin punto de venta y sin credencial cargada. El punto de venta en cero cuenta como cargado: es un
 * dato mal, no un dato que falta. Sólo corre cuando el perfil ya dio incompleto: no suma nada al
 * negocio que factura bien. `Tenant` no tiene RLS; la credencial sí, y se lee sólo el conteo.
 */
async function nuncaConfiguroLaFacturacion(tenantId: string): Promise<boolean> {
  const negocio = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { arcaPuntoVenta: true } });
  if (!negocio || negocio.arcaPuntoVenta != null) return false;
  const credenciales = await tenantTransaction((tx) => tx.tenantFiscalCredential.count({ where: { tenantId } }), { tenantId });
  return credenciales === 0;
}

/** Nunca tira: la facturación no rompe el cierre. Si no se puede saber, se avisa. */
export async function resultadoDeFacturaFallida(err: unknown, ids: { appointmentId: string; tenantId: string }): Promise<ResultadoFacturaDelTurno> {
  if (err instanceof PerfilFiscalIncompletoError && (await nuncaConfiguroLaFacturacion(ids.tenantId).catch(() => false))) {
    logger.warn("arca", "perfil fiscal incompleto: el negocio nunca configuró la facturación, el turno no se factura", { ...ids, campo: err.campo });
    return { tipo: "sin-factura" };
  }
  logger.error("arca", "facturación best-effort falló", err, ids);
  return { tipo: "fallo" };
}
