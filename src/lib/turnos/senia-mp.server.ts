// El aviso de pago de MP de un turno (seña obligatoria): la tx del negocio alrededor de
// `aplicarPagoMPDelTurnoEnTx` (senia-mp.ts). Lo llama el webhook de MP (mercadopago-dispatch.ts),
// que ya corre en `runInTenantContext(negocio)`; acá el negocio va explícito en `tenantTransaction`
// y nunca se lee el host.
//
// Serializable: dos avisos del mismo pago a la vez leen las mismas filas del turno; uno de los dos
// aborta (40001), `tenantTransaction` lo reintenta y el reintento ve el cobro del otro (idempotente
// por la nota). Con la columna `idempotencyKey` migrada, el `@@unique` es además el árbitro
// (`settleAppointmentPaymentGuarded` contesta «race» = ya lo registró el otro). Sin la columna, se
// corre sin clave ni libro (mismo patrón que «Llegó la seña»).

import { Prisma } from "@/generated/prisma/client";
import { tenantTransaction } from "@/lib/rls";
import { logger } from "@/lib/logger";
import { lastClosedDay } from "@/lib/caja/frontera-cierre";
import { settleAppointmentPaymentGuarded } from "@/lib/caja/cobro-turno";
import type { PagoMP } from "@/plugins/mercadopago";
import {
  ACCION_SENIA_MP_NO_REGISTRADA,
  DEPS_SENIA_MP,
  SeniaMPRechazada,
  aplicarPagoMPDelTurnoEnTx,
  auditarAvisoMPEnTx,
  netoDelPagoMP,
  type ResultadoSeniaMP,
} from "./senia-mp";

export async function aplicarPagoMPDelTurno(appointmentId: string, tenantId: string, pago: PagoMP): Promise<ResultadoSeniaMP> {
  // Pendiente / rechazado / en proceso: ni una consulta.
  if (netoDelPagoMP(pago) === null) return { accion: "sin-cambios", motivo: `estado ${pago.estado}` };
  const cerradoHasta = await lastClosedDay(tenantId);
  const run = (withSchema: boolean) =>
    tenantTransaction(
      (tx) => aplicarPagoMPDelTurnoEnTx(tx, tenantId, appointmentId, pago, { ...DEPS_SENIA_MP, withSchema, cerradoHasta, ahora: new Date() }),
      { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  try {
    const settled = await settleAppointmentPaymentGuarded({ runWithBridge: () => run(true), runWithoutBridge: () => run(false) });
    if (settled.outcome === "race") return { accion: "ya-registrado", motivo: "otro aviso del mismo pago ganó la carrera" };
    if (settled.outcome === "degraded") {
      logger.warn("caja", "seña por Mercado Pago registrada SIN puente al libro (migración de cobros parciales sin aplicar)", { tenantId, appointmentId });
    }
    return settled.value;
  } catch (e) {
    if (!(e instanceof SeniaMPRechazada)) throw e;
    // El ajuste de una devolución parcial no se pudo completar: la tx se deshizo entera; queda el aviso.
    await tenantTransaction(
      (tx) =>
        auditarAvisoMPEnTx(tx, {
          tenantId,
          appointmentId,
          action: ACCION_SENIA_MP_NO_REGISTRADA,
          changes: { pagoMP: { id: pago.id, estado: pago.estado, monto: pago.monto }, motivo: e.motivo },
        }),
      { tenantId },
    );
    return { accion: "rechazado", motivo: e.motivo };
  }
}
