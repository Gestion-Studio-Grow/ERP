// Núcleo transaccional de comisiones (idiom `-core` del repo, ver `order-core`/
// `invoice-core`/`cartera-core`): lógica pura + orquestación de tx SIN `"use server"`,
// componible y testeable sin DB. Los wrappers de acción viven en `commission-actions.ts`.

import { Prisma } from "@/generated/prisma/client";

// Resuelve el % de comisión de un turno: si hay override por (profesional,
// servicio) usa ese; si no, cae al % general del profesional (G18). Misma regla
// que `getReportData`.
export function resolvePct(
  professionalCommissionPercent: number,
  overrideByService: Map<string, number>,
  serviceId: string,
): number {
  return overrideByService.get(serviceId) ?? professionalCommissionPercent;
}

export type SettleCommissionsResult = {
  count: number;
  amount: number;
  payoutId?: string;
  professionalName?: string;
};

// Núcleo transaccional de la liquidación. DEBE correr dentro de una tx Serializable
// (ver `settleCommissions`). Congela el monto en un `CommissionPayout` y estampa los
// turnos con COMPARE-AND-SET anti-doble-pago.
export async function settleCommissionsInTx(
  tx: Prisma.TransactionClient,
  args: { tenantId: string; professionalId: string; note: string | null; settledBy: string },
): Promise<SettleCommissionsResult> {
  const { tenantId, professionalId, note, settledBy } = args;

  const professional = await tx.professional.findFirst({
    where: { id: professionalId, tenantId },
  });
  if (!professional) return { count: 0, amount: 0 };

  const [appointments, overrides] = await Promise.all([
    tx.appointment.findMany({
      where: {
        tenantId,
        professionalId,
        status: "COMPLETED",
        commissionPayoutId: null,
        payment: { status: "APPROVED" },
      },
      include: { payment: true },
    }),
    tx.professionalServiceCommission.findMany({ where: { tenantId, professionalId } }),
  ]);

  const overrideByService = new Map(overrides.map((o) => [o.serviceId, o.commissionPercent]));

  let amount = 0;
  let periodStart: Date | null = null;
  let periodEnd: Date | null = null;
  const ids: string[] = [];
  for (const a of appointments) {
    if (!a.payment) continue;
    const pct = resolvePct(professional.commissionPercent, overrideByService, a.serviceId);
    if (pct <= 0) continue; // turno sin comisión: no forma parte de la liquidación
    amount += (a.payment.amount * pct) / 100;
    ids.push(a.id);
    if (!periodStart || a.startsAt < periodStart) periodStart = a.startsAt;
    if (!periodEnd || a.startsAt > periodEnd) periodEnd = a.startsAt;
  }

  if (ids.length === 0 || !periodStart || !periodEnd) return { count: 0, amount: 0 };

  const payout = await tx.commissionPayout.create({
    data: {
      tenantId,
      professionalId,
      amount,
      appointmentCount: ids.length,
      periodStart,
      periodEnd,
      note,
      settledBy,
    },
  });

  // 🔒 Compare-and-set anti-doble-liquidación: solo estampa los turnos que SIGUEN sin
  // liquidar (`commissionPayoutId: null`). Si una operación concurrente ya reclamó
  // parte del set, `claimed.count` != ids.length → abortamos la tx (rollback del
  // payout), así NUNCA quedan dos CommissionPayout con el mismo monto. Mismo patrón
  // que `transitionCheque` (compare-and-set + Serializable en `settleCommissions`).
  const claimed = await tx.appointment.updateMany({
    where: { id: { in: ids }, commissionPayoutId: null },
    data: { commissionPayoutId: payout.id },
  });
  if (claimed.count !== ids.length) {
    throw new Error("La liquidación cambió por una operación concurrente; reintentá.");
  }

  return { count: ids.length, amount, payoutId: payout.id, professionalName: professional.name };
}
