"use server";

// Liquidación de comisiones por período (BACKLOG "Alta prioridad").
//
// Problema que resuelve: las comisiones se calculaban al vuelo en Reportes, pero
// no había forma de marcar un período como pagado ni un histórico — la dueña no
// podía saber si ya le había pagado a un profesional. Ahora cada liquidación
// crea un `CommissionPayout` que congela el monto y estampa los turnos que cubrió
// (`Appointment.commissionPayoutId`). Consecuencia: "pendiente de pago" = turno
// COMPLETED + pago APPROVED + `commissionPayoutId` null; una vez liquidado sale
// del pendiente y no se puede volver a pagar (idempotente por construcción).
//
// La comisión se devenga sobre el monto efectivamente cobrado (`payment.amount`),
// igual que en `getReportData`, y solo sobre turnos COMPLETED (servicio ya
// realizado) — un turno pagado pero no realizado todavía no genera comisión.

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditAdmin } from "@/lib/audit";
import { getCurrentTenantId } from "@/lib/tenant";
import { tenantTransaction } from "@/lib/rls";
import { requireCapability } from "@/lib/authz";
import { isDemoSandbox } from "@/lib/demo-sandbox";
import { Prisma } from "@/generated/prisma/client";
import { resolvePct, settleCommissionsInTx } from "@/lib/commission-core";

const REPORTES_PATH = "/admin/reportes";

// Vuelve a Reportes con un código de feedback (banner). No filtra detalle crudo.
function backWith(status: string): never {
  redirect(`${REPORTES_PATH}?status=${encodeURIComponent(status)}`);
}

export type PendingCommission = {
  professionalId: string;
  professionalName: string;
  amount: number; // comisión pendiente
  ingresos: number; // base sobre la que se calculó (para mostrar el "sobre $X")
  appointmentCount: number;
  periodStart: Date | null;
  periodEnd: Date | null;
};

export type PayoutHistoryRow = {
  id: string;
  professionalName: string;
  amount: number;
  appointmentCount: number;
  periodStart: Date;
  periodEnd: Date;
  note: string | null;
  createdAt: Date;
};

// Overview de comisiones para Reportes: lo pendiente por profesional (turnos aún
// no liquidados) + el histórico de liquidaciones. Solo lectura → `reports:read`.
export async function getCommissionsOverview(): Promise<{
  pending: PendingCommission[];
  history: PayoutHistoryRow[];
}> {
  await requireCapability("reports:read");
  if (isDemoSandbox()) return { pending: [], history: [] };
  const tenantId = await getCurrentTenantId();

  const [appointments, overrides, payouts] = await Promise.all([
    // Turnos con comisión pendiente: realizados, cobrados y sin liquidar.
    prisma.appointment.findMany({
      where: {
        tenantId,
        status: "COMPLETED",
        commissionPayoutId: null,
        payment: { status: "APPROVED" },
      },
      include: { professional: true, payment: true },
    }),
    prisma.professionalServiceCommission.findMany({ where: { tenantId } }),
    prisma.commissionPayout.findMany({
      where: { tenantId },
      include: { professional: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Índice profId -> (servId -> pct override).
  const overridesByProf = new Map<string, Map<string, number>>();
  for (const o of overrides) {
    let m = overridesByProf.get(o.professionalId);
    if (!m) overridesByProf.set(o.professionalId, (m = new Map()));
    m.set(o.serviceId, o.commissionPercent);
  }

  const acc = new Map<string, PendingCommission>();
  for (const a of appointments) {
    if (!a.payment) continue; // defensivo; el where ya lo garantiza
    const pct = resolvePct(
      a.professional.commissionPercent,
      overridesByProf.get(a.professionalId) ?? new Map(),
      a.serviceId,
    );
    if (pct <= 0) continue;

    const cur =
      acc.get(a.professionalId) ??
      ({
        professionalId: a.professionalId,
        professionalName: a.professional.name,
        amount: 0,
        ingresos: 0,
        appointmentCount: 0,
        periodStart: null,
        periodEnd: null,
      } as PendingCommission);

    cur.amount += (a.payment.amount * pct) / 100;
    cur.ingresos += a.payment.amount;
    cur.appointmentCount += 1;
    if (!cur.periodStart || a.startsAt < cur.periodStart) cur.periodStart = a.startsAt;
    if (!cur.periodEnd || a.startsAt > cur.periodEnd) cur.periodEnd = a.startsAt;
    acc.set(a.professionalId, cur);
  }

  const pending = Array.from(acc.values()).sort((x, y) => y.amount - x.amount);

  const history: PayoutHistoryRow[] = payouts.map((p) => ({
    id: p.id,
    professionalName: p.professional.name,
    amount: p.amount,
    appointmentCount: p.appointmentCount,
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    note: p.note,
    createdAt: p.createdAt,
  }));

  return { pending, history };
}

// Liquida (marca como pagada) toda la comisión pendiente de un profesional.
// Acción de plata → `commissions:manage` (solo OWNER). Idempotente: recalcula el
// pendiente dentro de la transacción y estampa esos turnos con el payout, así un
// segundo click no encuentra nada que pagar. El monto se congela en el payout —
// si mañana cambia un precio o un %, el comprobante ya emitido no se altera.
export async function settleCommissions(formData: FormData) {
  const user = await requireCapability("commissions:manage");
  if (isDemoSandbox()) backWith("error_nada"); // modo demo: no hay comisiones reales que liquidar
  const tenantId = await getCurrentTenantId();
  const professionalId = String(formData.get("professionalId") ?? "").trim();
  if (!professionalId) backWith("error_prof");
  const note = String(formData.get("note") ?? "").trim() || null;

  const result = await tenantTransaction(
    (tx) =>
      settleCommissionsInTx(tx, {
        tenantId,
        professionalId,
        note,
        settledBy: `user:${user.id}`,
      }),
    // 🔒 SERIALIZABLE (fix del Gate de dinero): dos liquidaciones concurrentes del MISMO
    // profesional (doble-click / dos pestañas) leerían el mismo set pendiente y crearían
    // DOS CommissionPayout con el mismo monto. En Serializable, Postgres aborta una con
    // conflicto y `tenantTransaction` la reintenta; en el reintento el pendiente ya está
    // estampado → cuenta 0. Va junto con el compare-and-set de `settleCommissionsInTx`.
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  if (result.count === 0) backWith("error_nada");

  await auditAdmin({
    action: "settle",
    entity: "CommissionPayout",
    entityId: result.payoutId,
    changes: {
      professionalId,
      professionalName: result.professionalName,
      amount: result.amount,
      appointmentCount: result.count,
      note,
    },
  });

  revalidatePath(REPORTES_PATH);
  backWith("ok_settled");
}
