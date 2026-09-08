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
import { sePuedeLiquidar } from "@/lib/comision-liquidable";
import { getCurrentTenantId } from "@/lib/tenant";
import { tenantTransaction } from "@/lib/rls";
import { Prisma } from "@/generated/prisma/client";
import { requireCapability } from "@/lib/authz";
import { isDemoSandbox } from "@/lib/demo-sandbox";

const REPORTES_PATH = "/admin/reportes";

// Vuelve a Reportes con un código de feedback (banner). No filtra detalle crudo.
function backWith(status: string): never {
  redirect(`${REPORTES_PATH}?status=${encodeURIComponent(status)}`);
}

// Resuelve el % de comisión de un turno: si hay override por (profesional,
// servicio) usa ese; si no, cae al % general del profesional (G18). Misma regla
// que `getReportData`.
function resolvePct(
  professionalCommissionPercent: number,
  overrideByService: Map<string, number>,
  serviceId: string,
): number {
  return overrideByService.get(serviceId) ?? professionalCommissionPercent;
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
      // `collections` y el precio hacen falta para saber si el turno está SALDADO: uno con
      // saldo pendiente no se liquida (ver `comision-liquidable.ts`).
      include: {
        professional: true,
        payment: true,
        collections: { select: { amount: true, method: true } },
        service: { select: { price: true } },
      },
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
    // Un turno con saldo pendiente ESPERA. Liquidarlo lo congela con su payout, y el
    // cobro posterior del saldo ya no vuelve a entrar al pendiente: esa comisión se
    // perdía para siempre. Ver `comision-liquidable.ts`.
    if (!sePuedeLiquidar({ precio: a.priceAtBooking ?? a.service.price, cobros: a.collections.map((c) => ({ amount: c.amount.toNumber(), method: c.method })), pagoLegado: a.payment })) continue;
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

  const result = await tenantTransaction(async (tx) => {
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
        include: {
          payment: true,
          collections: { select: { amount: true, method: true } },
          service: { select: { price: true } },
        },
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
      // Misma guarda que el listado de pendientes: sin esto, la pantalla mostraría un
      // total y la liquidación escribiría otro.
      if (!sePuedeLiquidar({ precio: a.priceAtBooking ?? a.service.price, cobros: a.collections.map((c) => ({ amount: c.amount.toNumber(), method: c.method })), pagoLegado: a.payment })) continue;
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
        settledBy: `user:${user.id}`,
      },
    });

    // C-1 · La CLAVE del arreglo: se reclaman sólo los turnos que SIGUEN sin liquidar.
    // Antes filtraba nada más que por `id`, así que dos liquidaciones concurrentes del
    // mismo profesional (doble clic, dos pestañas) leían el mismo set pendiente, cada
    // una creaba su `CommissionPayout` y la segunda pisaba la asignación: quedaban DOS
    // comprobantes por el MISMO trabajo. Es plata pagada dos veces.
    const reclamados = await tx.appointment.updateMany({
      where: { id: { in: ids }, commissionPayoutId: null },
      data: { commissionPayoutId: payout.id },
    });

    // Si otra transacción se los llevó primero, reclamamos menos de los que contamos:
    // el monto del payout ya no corresponde al trabajo. Se aborta y se deshace todo
    // (incluido el `create` de arriba) en vez de emitir un comprobante que miente.
    if (reclamados.count !== ids.length) {
      throw new Error(
        "Otra liquidación de este profesional se estaba procesando al mismo tiempo. No se pagó nada: volvé a intentar y revisá el historial.",
      );
    }

    return { count: ids.length, amount, payoutId: payout.id, professionalName: professional.name };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

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
