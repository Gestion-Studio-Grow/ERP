// ============================================================================
// EL INICIO DE LA DUEÑA — lo que la bandeja lee además de los números de las apps (servidor).
// ============================================================================
//
// Reingeniería CH, Tanda 3 (§2.8, CH-037). Dos lecturas livianas, cada una con `tenantId` además de RLS:
//
//   · `seniasSinCobrar`: los Reservados de hoy y mañana (todavía por venir) cuyo servicio pide seña y
//     no la tienen cobrada — «Hoy · 2 señas sin cobrar (Laura, Martina) $10.000 [Cobrar]». Un turno +
//     sus cobros (la misma lectura de cobros que la bandeja de pendientes, `cobrosDetalladosPorTurno`).
//   · `cajaDeHoy`: lo que entró neto hoy al libro (VENTA + INGRESO − EGRESO − RETIRO; la apertura del
//     cajón no suma), con la MISMA tabla de signos del libro (`movementSign`). Un `groupBy`. Es plata del
//     negocio: sólo `reports:read` (la recepción no ve cifras de facturación).
//
// No escribe nada. Si una lectura falla, el Inicio se dibuja igual sin ese dato (el llamador la ataja).

import "server-only";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { roleHasCapability } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { isDemoSandbox } from "@/lib/demo-flag";
import { todayInBusinessTz } from "@/lib/datetime";
import { movementSign, type CashMovementType } from "@/lib/caja/cash-register";
import { rangoDelDia } from "@/lib/turnos/turno-abierto";
import { cobrosDetalladosPorTurno } from "@/lib/turnos/anulacion";
import { estadoCobroTurno, seniaDelServicio } from "@/lib/turnos/cobros";
import type { SeniaSinCobrar } from "./bandeja-core";

/** Tope de turnos que se leen para armar el renglón (más es «y N más»). */
const TOPE_SENIAS = 40;

function diaMas(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Reservados de hoy y mañana, todavía por venir, con seña pedida por el servicio y sin cobrar. */
export async function seniasSinCobrar(): Promise<SeniaSinCobrar[]> {
  const user = await requireCapability("agenda:read");
  if (isDemoSandbox() || !roleHasCapability(user.role, "agenda:manage")) return [];
  const tenantId = await getCurrentTenantId();
  const hoy = todayInBusinessTz();
  const hasta = rangoDelDia(diaMas(hoy, 1)).hasta;
  const turnos = await prisma.appointment.findMany({
    where: { tenantId, status: "PENDING", startsAt: { gte: new Date(), lt: hasta }, service: { depositAmount: { gt: 0 } } },
    orderBy: { startsAt: "asc" },
    take: TOPE_SENIAS,
    select: {
      id: true,
      startsAt: true,
      priceAtBooking: true,
      client: { select: { name: true } },
      service: { select: { price: true, depositAmount: true } },
      payment: { select: { status: true, amount: true } },
    },
  });
  if (turnos.length === 0) return [];
  const cobros = await cobrosDetalladosPorTurno(
    prisma,
    tenantId,
    turnos.map((t) => t.id),
  );
  return turnos.flatMap((t) => {
    const precio = t.priceAtBooking ?? t.service.price;
    const senia = seniaDelServicio({ depositAmount: t.service.depositAmount, precio });
    const { cobrado } = estadoCobroTurno({ precio, cobros: (cobros.get(t.id) ?? []).map((c) => ({ amount: c.amount, method: c.method })), pagoLegado: t.payment });
    if (senia <= 0 || cobrado >= senia) return [];
    return [{ turnoId: t.id, clienta: t.client.name, monto: Math.round((senia - cobrado) * 100) / 100, inicio: t.startsAt.toISOString() }];
  });
}

/** Lo que entró neto hoy al libro de caja, o `null` si quien mira no ve la plata. */
export async function cajaDeHoy(): Promise<number | null> {
  const user = await requireCapability("dashboard:read");
  if (!roleHasCapability(user.role, "reports:read")) return null;
  if (isDemoSandbox()) return null;
  const tenantId = await getCurrentTenantId();
  const { desde, hasta } = rangoDelDia(todayInBusinessTz());
  const grupos = await prisma.cashMovement.groupBy({
    by: ["type"],
    where: { tenantId, occurredAt: { gte: desde, lt: hasta } },
    _sum: { amount: true },
  });
  const neto = grupos.reduce((s, g) => s + movementSign(g.type as CashMovementType) * (g._sum.amount ?? 0), 0);
  return Math.round(neto * 100) / 100;
}
