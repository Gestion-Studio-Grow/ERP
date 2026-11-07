// El aviso de pago de MP de un turno (seña obligatoria): la tx del negocio alrededor de
// `aplicarPagoMPDelTurnoEnTx` (senia-mp.ts). Lo llama el webhook de MP (mercadopago-dispatch.ts),
// que ya corre en `runInTenantContext(negocio)`; acá el negocio va explícito en `tenantTransaction`
// y nunca se lee el host.
//
// Con la regla APAGADA el aviso hace exactamente lo de antes: se lee el interruptor primero (una
// lectura liviana) y se contesta «apagada» sin leer el cierre de caja ni abrir la tx Serializable.
//
// Serializable: dos avisos del mismo pago a la vez leen las mismas filas del turno; uno de los dos
// aborta (40001), `tenantTransaction` lo reintenta y el reintento ve el cobro del otro (idempotente
// por la nota). Con la columna `idempotencyKey` migrada, el `@@unique` es además el árbitro
// (`settleAppointmentPaymentGuarded` contesta «race» = ya lo registró el otro). Sin la columna, se
// corre sin clave ni libro (mismo patrón que «Llegó la seña»). La frontera del cierre de caja se lee
// DENTRO de esa misma tx (un cierre que se commitea en el medio hace abortar y reintentar).

import { Prisma } from "@/generated/prisma/client";
import { tenantTransaction } from "@/lib/rls";
import { logger } from "@/lib/logger";
import { lastClosedDayTx } from "@/lib/caja/frontera-cierre";
import type { DayKey } from "@/lib/caja/cierre-diario";
import { settleAppointmentPaymentGuarded } from "@/lib/caja/cobro-turno";
import type { PagoMP } from "@/plugins/mercadopago";
import { senaObligatoriaEnTx } from "./sena-obligatoria";
import {
  ACCION_SENIA_MP_NO_REGISTRADA,
  DEPS_SENIA_MP,
  SeniaMPRechazada,
  aplicarPagoMPDelTurnoEnTx,
  auditarAvisoMPEnTx,
  netoDelPagoMP,
  type DepsSeniaMPTx,
  type ResultadoSeniaMP,
} from "./senia-mp";

type Tx = Prisma.TransactionClient;

/** Lo que el servidor usa de afuera (inyectable para los tests). */
export type DepsServidorSeniaMP = {
  transaccion: <T>(fn: (tx: Tx) => Promise<T>, opts: { tenantId: string; isolationLevel?: Prisma.TransactionIsolationLevel }) => Promise<T>;
  cerradoHastaEnTx: (tx: Tx, tenantId: string) => Promise<DayKey | null>;
  reglaPrendidaEnTx: (tx: Tx, tenantId: string) => Promise<boolean>;
  enTx: Pick<DepsSeniaMPTx, "aplicarCobro" | "anularCobro">;
  ahora: () => Date;
};

const DEPS_SERVIDOR: DepsServidorSeniaMP = {
  transaccion: (fn, opts) => tenantTransaction((tx) => fn(tx as Tx), opts),
  cerradoHastaEnTx: (tx, tenantId) => lastClosedDayTx(tx, tenantId),
  reglaPrendidaEnTx: (tx, tenantId) => senaObligatoriaEnTx(tx, tenantId),
  enTx: DEPS_SENIA_MP,
  ahora: () => new Date(),
};

export async function aplicarPagoMPDelTurno(
  appointmentId: string,
  tenantId: string,
  pago: PagoMP,
  deps: DepsServidorSeniaMP = DEPS_SERVIDOR,
): Promise<ResultadoSeniaMP> {
  // Pendiente / rechazado / en proceso: ni una consulta.
  if (netoDelPagoMP(pago) === null) return { accion: "sin-cambios", motivo: `estado ${pago.estado}` };
  // Regla apagada: el comportamiento de siempre, sin cierre de caja ni tx Serializable.
  if (!(await deps.transaccion((tx) => deps.reglaPrendidaEnTx(tx, tenantId), { tenantId }))) return { accion: "apagada" };
  const run = (withSchema: boolean) =>
    deps.transaccion(
      async (tx) => {
        const cerradoHasta = await deps.cerradoHastaEnTx(tx, tenantId);
        return aplicarPagoMPDelTurnoEnTx(tx, tenantId, appointmentId, pago, { ...deps.enTx, withSchema, cerradoHasta, ahora: deps.ahora() });
      },
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
    await deps.transaccion(
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

/**
 * La seña falló con un error inesperado (el handler sigue y factura igual): queda en el log y una
 * fila `senia_mp_no_registrada` que la agenda muestra. Nunca tira: un fallo acá tampoco bloquea nada.
 */
export async function avisarSeniaMPFallida(
  appointmentId: string,
  tenantId: string,
  pago: PagoMP,
  error: unknown,
  deps: Pick<DepsServidorSeniaMP, "transaccion"> = DEPS_SERVIDOR,
): Promise<void> {
  const motivo = error instanceof Error ? error.message : String(error);
  logger.error("caja", "la seña por Mercado Pago falló; el aviso siguió sin ella", { tenantId, appointmentId, pagoId: pago.id, motivo });
  try {
    await deps.transaccion(
      (tx) =>
        auditarAvisoMPEnTx(tx, {
          tenantId,
          appointmentId,
          action: ACCION_SENIA_MP_NO_REGISTRADA,
          changes: { pagoMP: { id: pago.id, estado: pago.estado, monto: pago.monto }, motivo: `error inesperado: ${motivo}` },
        }),
      { tenantId },
    );
  } catch (e) {
    logger.error("caja", "no se pudo dejar el aviso de la seña fallida", { tenantId, appointmentId, motivo: e instanceof Error ? e.message : String(e) });
  }
}
