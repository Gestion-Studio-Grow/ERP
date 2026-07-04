"use server";

// Liquidación de comisiones por período (BACKLOG: "Liquidación de comisiones por
// período"). Módulo propio, aislado de src/lib/actions.ts a propósito: esta sesión
// corre en paralelo con RBAC Fase 2, que está tocando actions.ts. Todo lo nuevo vive
// acá para no chocar al mergear.
//
// El CÁLCULO replica exactamente el de getReportData (actions.ts): comisión sobre
// pagos APPROVED cuyo turno está COMPLETED, con % resuelto por (profesional, servicio)
// —override de ProfessionalServiceCommission si existe, si no el % general del
// profesional (G18)—. La única diferencia es que acá se filtra por un rango de fechas
// (día-negocio de startsAt, mismo criterio que `porDia` del reporte) y se devuelve el
// detalle por turno, además del total, para poder verlo y exportarlo.

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  businessWallTimeToUtc,
  dateStrInBusinessTz,
  todayInBusinessTz,
} from "@/lib/datetime";
import { auditAdmin } from "@/lib/audit";
import { getCurrentTenantId } from "@/lib/tenant";
// TODO(RBAC): esta guarda usa la capability financiera existente `reports:read`
// (OWNER-only hoy), que es el default correcto y seguro: una liquidación es dato
// financiero sensible. Si RBAC Fase 2 decide crear una capability dedicada
// (`commissions:read` / `commissions:manage`), reemplazar acá y en settleCommission.
import { requireCapability } from "@/lib/authz";

export type CommissionAppointmentDetail = {
  appointmentId: string;
  date: string; // día-negocio "YYYY-MM-DD"
  clientName: string;
  serviceName: string;
  amount: number; // ingreso del turno
  pct: number; // % de comisión aplicado
  commission: number; // amount * pct / 100
};

export type CommissionByProfessional = {
  professionalId: string;
  professionalName: string;
  baseAmount: number; // ingresos base (suma de amount de turnos con comisión)
  commission: number; // comisión total del período
  appointmentCount: number;
  settled: boolean; // ya existe un CommissionPayout para este exacto período
  settledAt: string | null; // paidAt del payout, si está liquidado
  appointments: CommissionAppointmentDetail[];
};

export type CommissionLiquidation = {
  from: string;
  to: string;
  totalCommission: number;
  totalBase: number;
  byProfessional: CommissionByProfessional[];
};

// Suma un día de calendario a un "YYYY-MM-DD" de forma estable ante la zona
// (se ancla al mediodía UTC para no cruzar la medianoche por el offset).
function addOneDay(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  return new Date(d.getTime() + 86400000).toISOString().slice(0, 10);
}

// Límites UTC del rango [from, to] expresado en días-negocio. periodStart es el
// instante 00:00 del día "from"; periodEndExclusive es 00:00 del día siguiente a
// "to" (para la query, gte/lt); periodEndInclusive es 00:00 del día "to" y es lo
// que se persiste como periodEnd del payout (marcador de "día hasta, inclusivo").
function periodBounds(from: string, to: string) {
  return {
    periodStart: businessWallTimeToUtc(from, "00:00"),
    periodEndInclusive: businessWallTimeToUtc(to, "00:00"),
    periodEndExclusive: businessWallTimeToUtc(addOneDay(to), "00:00"),
  };
}

// Primer día del mes en curso (día-negocio) — default del selector de rango.
function firstDayOfCurrentMonth(): string {
  return `${todayInBusinessTz().slice(0, 7)}-01`;
}

// Núcleo del cálculo, reutilizado por el loader y por settleCommission (que
// recalcula server-side en vez de confiar en montos posteados, igual que
// confirmPayment recalcula el precio — ADR-014).
async function computeCommissions(from: string, to: string) {
  const { periodStart, periodEndExclusive } = periodBounds(from, to);

  const [payments, overrides] = await Promise.all([
    prisma.payment.findMany({
      where: {
        status: "APPROVED",
        appointment: {
          status: "COMPLETED",
          startsAt: { gte: periodStart, lt: periodEndExclusive },
        },
      },
      include: {
        appointment: {
          include: { professional: true, service: true, client: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.professionalServiceCommission.findMany(),
  ]);

  const overrideMap = new Map<string, number>();
  for (const o of overrides) {
    overrideMap.set(`${o.professionalId}:${o.serviceId}`, o.commissionPercent);
  }

  const byProf = new Map<
    string,
    Omit<CommissionByProfessional, "settled" | "settledAt">
  >();

  for (const p of payments) {
    const appt = p.appointment;
    const pct =
      overrideMap.get(`${appt.professionalId}:${appt.serviceId}`) ??
      appt.professional.commissionPercent;
    // Mismo criterio que getReportData: solo se devenga comisión si el % es > 0.
    if (pct <= 0) continue;

    const commission = (p.amount * pct) / 100;
    let entry = byProf.get(appt.professionalId);
    if (!entry) {
      entry = {
        professionalId: appt.professionalId,
        professionalName: appt.professional.name,
        baseAmount: 0,
        commission: 0,
        appointmentCount: 0,
        appointments: [],
      };
      byProf.set(appt.professionalId, entry);
    }
    entry.baseAmount += p.amount;
    entry.commission += commission;
    entry.appointmentCount += 1;
    entry.appointments.push({
      appointmentId: appt.id,
      date: dateStrInBusinessTz(appt.startsAt),
      clientName: appt.client.name,
      serviceName: appt.service.name,
      amount: p.amount,
      pct,
      commission,
    });
  }

  return byProf;
}

// Loader de la pantalla: comisiones del rango con detalle por turno y estado de
// liquidación por profesional. Rango por defecto: mes en curso.
export async function getCommissionLiquidation(input?: {
  from?: string;
  to?: string;
}): Promise<CommissionLiquidation> {
  await requireCapability("reports:read");

  const from = input?.from || firstDayOfCurrentMonth();
  const to = input?.to || todayInBusinessTz();

  const { periodStart, periodEndInclusive } = periodBounds(from, to);
  const byProf = await computeCommissions(from, to);

  // Payouts que cubren exactamente este período (para marcar pendiente/liquidado).
  const payouts = await prisma.commissionPayout.findMany({
    where: { periodStart, periodEnd: periodEndInclusive },
  });
  const settledMap = new Map(payouts.map((p) => [p.professionalId, p.paidAt]));

  const byProfessional: CommissionByProfessional[] = Array.from(byProf.values())
    .map((e) => {
      const settledAt = settledMap.get(e.professionalId) ?? null;
      return {
        ...e,
        appointments: e.appointments.sort((a, b) =>
          a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
        ),
        settled: settledAt !== null,
        settledAt: settledAt ? settledAt.toISOString() : null,
      };
    })
    .sort((a, b) => b.commission - a.commission);

  return {
    from,
    to,
    totalCommission: byProfessional.reduce((s, p) => s + p.commission, 0),
    totalBase: byProfessional.reduce((s, p) => s + p.baseAmount, 0),
    byProfessional,
  };
}

// "Marcar como pagada" la comisión de un profesional para un período. Recalcula
// server-side (no confía en montos posteados) y guarda un snapshot histórico.
// Idempotente: si ya se liquidó ese período, actualiza el snapshot y re-sella paidAt.
export async function settleCommission(formData: FormData) {
  await requireCapability("reports:read"); // TODO(RBAC): ver nota del import.

  const professionalId = String(formData.get("professionalId"));
  const from = String(formData.get("from"));
  const to = String(formData.get("to"));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!professionalId || !from || !to) {
    throw new Error("settleCommission: faltan professionalId / from / to.");
  }

  const byProf = await computeCommissions(from, to);
  const data = byProf.get(professionalId);
  if (!data) {
    // Nada que liquidar para ese profesional en el rango (0 turnos con comisión).
    throw new Error(
      "No hay comisión para liquidar de ese profesional en el período seleccionado.",
    );
  }

  const tenantId = await getCurrentTenantId();
  const { periodStart, periodEndInclusive } = periodBounds(from, to);

  await prisma.commissionPayout.upsert({
    where: {
      professionalId_periodStart_periodEnd: {
        professionalId,
        periodStart,
        periodEnd: periodEndInclusive,
      },
    },
    create: {
      tenantId,
      professionalId,
      periodStart,
      periodEnd: periodEndInclusive,
      amount: data.commission,
      baseAmount: data.baseAmount,
      appointmentCount: data.appointmentCount,
      notes,
    },
    update: {
      amount: data.commission,
      baseAmount: data.baseAmount,
      appointmentCount: data.appointmentCount,
      notes,
      paidAt: new Date(),
    },
  });

  await auditAdmin({
    action: "settle_commission",
    entity: "CommissionPayout",
    entityId: professionalId,
    changes: {
      professionalId,
      from,
      to,
      amount: data.commission,
      baseAmount: data.baseAmount,
      appointmentCount: data.appointmentCount,
    },
  });

  revalidatePath("/admin/comisiones");
}

export type PayoutHistoryRow = {
  id: string;
  professionalName: string;
  from: string; // día-negocio
  to: string; // día-negocio
  amount: number;
  baseAmount: number;
  appointmentCount: number;
  notes: string | null;
  paidAt: string; // ISO
};

// Histórico de liquidaciones ya registradas (últimas 100), más recientes primero.
export async function getPayoutHistory(): Promise<PayoutHistoryRow[]> {
  await requireCapability("reports:read");

  const payouts = await prisma.commissionPayout.findMany({
    include: { professional: true },
    orderBy: { paidAt: "desc" },
    take: 100,
  });

  return payouts.map((p) => ({
    id: p.id,
    professionalName: p.professional.name,
    from: dateStrInBusinessTz(p.periodStart),
    to: dateStrInBusinessTz(p.periodEnd),
    amount: p.amount,
    baseAmount: p.baseAmount,
    appointmentCount: p.appointmentCount,
    notes: p.notes,
    paidAt: p.paidAt.toISOString(),
  }));
}
