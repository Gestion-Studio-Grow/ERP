"use server";

// RENDICIÓN RECIBIDA — la profesional del box le rinde a CH (docs/tenants/ch/NAIL-ARTIST.md §5).
//
// Lo inverso de `settleCommissions` (commission-actions.ts): en vez de un EGRESO a la profesional,
// un INGRESO de ella a la caja del salón. Una sola `tenantTransaction` crea el `ProfessionalSettlement`
// con los montos CONGELADOS y el `CashMovement` INGRESO, y los engancha por `cashMovementId`: un
// comprobante sin su asiento es peor que ninguno de los dos.
//
// El monto lo calcula SIEMPRE el servidor (`calcularRendicion` sobre los turnos de la base); el
// formulario manda profesional, mes, medio y nota, nunca un importe.
//
// Doble clic / dos pestañas: el árbitro es el `@@unique([tenantId, professionalId, periodStart,
// periodEnd])`. La segunda transacción o ve la fila (pre-chequeo) o choca con el índice (P2002) o la
// serialización la reintenta y ahí la ve: en los tres casos, «ya estaba registrada», 1 fila y 1 asiento.
//
// Todo detrás del interruptor `nail-artist` (que exige la migración aplicada): apagado, nada de esto
// toca la base.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { auditAdmin } from "@/lib/audit-core";
import { requireCapability } from "@/lib/authz";
import { isDemoSandbox } from "@/lib/demo-sandbox";
import { getCurrentTenantId } from "@/lib/tenant";
import { tenantTransaction } from "@/lib/rls";
import { isColumnMissing, isUniqueViolation } from "@/lib/prisma-errors";
import { nailArtistDelNegocio } from "@/cambios/interruptores.server";
import { businessWallTimeToUtc, todayInBusinessTz } from "@/lib/datetime";
import { lastClosedDay } from "@/lib/caja/frontera-cierre";
import { transferenciaEnElLibroTx } from "@/lib/caja/transferencia-en-el-libro";
import { diaContableDelEgreso } from "@/lib/stock/purchase-egreso";
import { parseMedioDeLiquidacion } from "@/lib/comision-liquidacion";
import { calcularRendicion, leerConfigDeRendicion, motivoDelIngreso, periodoMensual, periodoTerminado, tieneRendicion } from "@/lib/reports/rendiciones";
import { leerTurnosRendibles } from "@/lib/reports/rendiciones-lectura";
// Marca del sistema en `CashMovement.createdBy`: `rendicion:<settlementId>` (el libro no la deja borrar).
import { RENDICION_ACTOR_PREFIX } from "@/lib/rendicion-marca";

export type ResultadoRendicion = { ok: true; mensaje: string } | { ok: false; error: string };

const COMISIONES_PATH = "/admin/comisiones";
const AVISO_APAGADO = "Las rendiciones del box todavía no están activas en tu negocio. Avisale a GSG.";
const YA_ESTABA = "Esa rendición ya estaba registrada: no se cargó dos veces.";

/** Alquiler fijo y % que la profesional rinde. OWNER (`commissions:manage`); audita antes/después. */
export async function guardarConfigDeRendicion(formData: FormData): Promise<ResultadoRendicion> {
  await requireCapability("commissions:manage");
  if (isDemoSandbox()) return { ok: false, error: "En la demo no se guardan cambios." };
  if (!(await nailArtistDelNegocio())) return { ok: false, error: AVISO_APAGADO };
  const professionalId = String(formData.get("professionalId") ?? "").trim();
  if (!professionalId) return { ok: false, error: "Falta la profesional." };
  const leida = leerConfigDeRendicion({ boxRentAmount: formData.get("boxRentAmount"), rentPercent: formData.get("rentPercent") });
  if (!leida.ok) return leida;
  const tenantId = await getCurrentTenantId();
  try {
    const antes = await tenantTransaction(
      async (tx) => {
        const fila = await tx.professional.findFirst({
          where: { id: professionalId, tenantId, deletedAt: null },
          select: { name: true, boxRentAmount: true, rentPercent: true, commissionPercent: true },
        });
        if (!fila) return null;
        await tx.professional.updateMany({ where: { id: professionalId, tenantId }, data: leida.config });
        return fila;
      },
      { tenantId },
    );
    if (!antes) return { ok: false, error: "Esa profesional ya no existe. Recargá la página." };
    await auditAdmin({
      action: "professional_rendicion_config",
      entity: "Professional",
      entityId: professionalId,
      changes: {
        antes: { alquiler: antes.boxRentAmount?.toNumber() ?? null, porcentaje: antes.rentPercent },
        despues: { alquiler: leida.config.boxRentAmount, porcentaje: leida.config.rentPercent },
        // Riesgo (g) del plan: % de comisión y % de rendición a la vez. No se bloquea, queda dicho.
        commissionPercent: antes.commissionPercent,
      },
    });
    revalidatePath(COMISIONES_PATH);
    const aviso = antes.commissionPercent > 0 && tieneRendicion(leida.config)
      ? ` Ojo: ${antes.name} también tiene ${antes.commissionPercent} % de comisión; mientras rinda, no aparece en las comisiones a pagar.`
      : "";
    return { ok: true, mensaje: `Guardado.${aviso}` };
  } catch (err) {
    if (isColumnMissing(err)) return { ok: false, error: AVISO_APAGADO };
    throw err;
  }
}

type Registro =
  | { tipo: "ok"; settlementId: string; cashMovementId: string; amount: number; nombre: string; count: number; dia: string }
  | { tipo: "sin_prof" | "sin_config" | "ya" | "nada" };

/** «Registrar rendición»: settlement congelado + INGRESO en la caja, en una transacción. OWNER. */
export async function registrarRendicion(formData: FormData): Promise<ResultadoRendicion> {
  const user = await requireCapability("commissions:manage");
  if (isDemoSandbox()) return { ok: false, error: "En la demo no se registra plata." };
  if (!(await nailArtistDelNegocio())) return { ok: false, error: AVISO_APAGADO };
  const professionalId = String(formData.get("professionalId") ?? "").trim();
  if (!professionalId) return { ok: false, error: "Falta la profesional." };
  const periodo = periodoMensual(formData.get("mes"));
  if (!periodo) return { ok: false, error: "El mes no se entiende. Recargá la página." };
  // Un mes que no terminó sigue sumando turnos: congelarlo dejaría afuera lo que falta cobrar.
  if (!periodoTerminado(periodo)) return { ok: false, error: "Ese mes todavía no terminó: la rendición se registra con el mes cerrado." };
  const method = parseMedioDeLiquidacion(formData.get("method"));
  if (!method) return { ok: false, error: "Elegí por qué medio te la rindió." };
  if (method === "TRANSFERENCIA" && !(await transferenciaEnElLibroTx(prisma))) {
    return { ok: false, error: "Este negocio todavía no separa la transferencia en el libro. Elegí otro medio." };
  }
  const note = String(formData.get("note") ?? "").trim().slice(0, 200) || null;
  const tenantId = await getCurrentTenantId();
  // Mismo criterio que la liquidación: si hoy ya está cerrado, el asiento va al primer día abierto.
  const hoy = todayInBusinessTz();
  const dia = diaContableDelEgreso(hoy, await lastClosedDay(tenantId));
  const clave = { tenantId, professionalId, periodStart: periodo.desde, periodEnd: periodo.hasta };

  let r: Registro;
  try {
    r = await tenantTransaction(
      async (tx): Promise<Registro> => {
        const prof = await tx.professional.findFirst({
          where: { id: professionalId, tenantId, deletedAt: null },
          select: { name: true, boxRentAmount: true, rentPercent: true },
        });
        if (!prof) return { tipo: "sin_prof" };
        const config = { boxRentAmount: prof.boxRentAmount?.toNumber() ?? null, rentPercent: prof.rentPercent };
        if (!tieneRendicion(config)) return { tipo: "sin_config" };
        const ya = await tx.professionalSettlement.findFirst({ where: clave, select: { id: true } });
        if (ya) return { tipo: "ya" };
        const turnos = await leerTurnosRendibles(tx, tenantId, professionalId, periodo);
        const calc = calcularRendicion(turnos, config);
        if (calc.amount <= 0) return { tipo: "nada" };
        const settlement = await tx.professionalSettlement.create({
          data: {
            ...clave,
            collectedTotal: calc.collectedTotal,
            percentAmount: calc.percentAmount,
            rentAmount: calc.rentAmount,
            amount: calc.amount,
            appointmentCount: calc.appointmentCount,
            rentPercent: calc.rentPercent > 0 ? calc.rentPercent : null,
            note,
            settledBy: `user:${user.id}`,
          },
          select: { id: true },
        });
        // Con un turno de mostrador ABIERTO, el ingreso se engancha a él (en efectivo, el arqueo lo espera).
        const session = await tx.cashSession.findFirst({ where: { tenantId, status: "OPEN" }, select: { id: true } });
        const asiento = await tx.cashMovement.create({
          data: {
            tenantId,
            sessionId: session?.id ?? null,
            type: "INGRESO",
            method,
            amount: calc.amount,
            reason: motivoDelIngreso(prof.name, periodo.mes),
            occurredAt: businessWallTimeToUtc(dia, "12:00"),
            createdBy: `${RENDICION_ACTOR_PREFIX}${settlement.id}`,
          },
          select: { id: true },
        });
        await tx.professionalSettlement.updateMany({ where: { id: settlement.id, tenantId }, data: { cashMovementId: asiento.id } });
        // Los turnos rendidos quedan marcados: no vuelven a ser comisión pendiente aunque mañana
        // se le saque la config (se le cobraría y se le pagaría por la misma plata).
        if (turnos.length > 0) {
          await tx.appointment.updateMany({ where: { tenantId, id: { in: turnos.map((t) => t.id) }, settlementId: null }, data: { settlementId: settlement.id } });
        }
        return { tipo: "ok", settlementId: settlement.id, cashMovementId: asiento.id, amount: calc.amount, nombre: prof.name, count: calc.appointmentCount, dia };
      },
      { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (err) {
    // La carrera del doble clic: la otra transacción ganó el índice único del período.
    if (isUniqueViolation(err)) return { ok: false, error: YA_ESTABA };
    if (isColumnMissing(err)) return { ok: false, error: AVISO_APAGADO };
    throw err;
  }

  switch (r.tipo) {
    case "sin_prof":
      return { ok: false, error: "Esa profesional ya no existe. Recargá la página." };
    case "sin_config":
      return { ok: false, error: "Esa profesional no tiene alquiler ni porcentaje cargado: no rinde." };
    case "ya":
      return { ok: false, error: YA_ESTABA };
    case "nada":
      return { ok: false, error: "Ese mes no tiene nada para rendir." };
  }

  await auditAdmin({
    action: "settle",
    entity: "ProfessionalSettlement",
    entityId: r.settlementId,
    changes: { professionalId, professionalName: r.nombre, mes: periodo.mes, amount: r.amount, appointmentCount: r.count, method, cashMovementId: r.cashMovementId, dia: r.dia, note },
  });
  revalidatePath(COMISIONES_PATH);
  revalidatePath("/admin/caja");
  revalidatePath("/admin/caja/libro");
  return { ok: true, mensaje: `Rendición de ${r.nombre} registrada: el ingreso quedó en la caja.` };
}
