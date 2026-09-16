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
// realizado) — un turno pagado pero no realizado todavía no genera comisión. Eso YA
// está decidido: `sePuedeLiquidar` exige el turno saldado justamente para que la
// comisión se pague sobre plata que entró.
//
// LIQUIDAR MUEVE LA PLATA. Hasta acá esta acción marcaba la comisión como pagada y no
// escribía un solo peso en el libro de caja: el efectivo salía del cajón y el sistema lo
// seguía esperando, así que el cierre del día lo asentaba como "Diferencia de caja"
// imborrable. Ahora el EGRESO va en la MISMA transacción, marcado con `comision:<payoutId>`
// en `createdBy` — la aritmética y el asiento viven puros en `comision-liquidacion.ts`.

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditAdmin } from "@/lib/audit-core";
import { sePuedeLiquidar } from "@/lib/comision-liquidable";
import { getCurrentTenantId } from "@/lib/tenant";
import { tenantTransaction } from "@/lib/rls";
import { Prisma } from "@/generated/prisma/client";
import { requireCapability } from "@/lib/authz";
import { isDemoSandbox } from "@/lib/demo-sandbox";
// La aritmética de la comisión y el egreso que deja la liquidación viven PUROS y testeados
// afuera: acá sólo se orquesta la persistencia. Ver el encabezado de ese archivo sobre los
// dos defectos que cierra (la plata que no se asentaba y la fórmula duplicada a mano).
import {
  calcularLiquidacion,
  egresoDeLiquidacion,
  parseCashMethod,
  type TurnoParaComision,
} from "@/lib/comision-liquidacion";
import { businessWallTimeToUtc, dateStrInBusinessTz, todayInBusinessTz } from "@/lib/datetime";
// Hasta qué día está CONGELADO el libro (corte inicial + cierres diarios). El egreso de una
// liquidación no puede caer en un día ya cerrado: sus números ya se arquearon.
import { lastClosedDay } from "@/lib/caja/frontera-cierre";
// Mismo criterio de fecha contable que el egreso de una compra a proveedor: si hoy está
// cerrado, el asiento se imputa al primer día abierto en vez de perderse.
import { diaContableDelEgreso } from "@/lib/stock/purchase-egreso";

const REPORTES_PATH = "/admin/reportes";
// Liquidar ahora deja una fila en el libro: las dos pantallas de caja tienen que mostrarla
// sin esperar a que alguien recargue, o se va a tipear el egreso a mano por segunda vez.
const LIBRO_PATH = "/admin/caja/libro";
const CAJA_PATH = "/admin/caja";

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

  // Se AGRUPA primero y se calcula después, con `calcularLiquidacion` — la MISMA función
  // que corre la liquidación que se persiste. Antes esta pantalla sumaba con su propia
  // copia a mano de `(payment.amount * pct) / 100`, sin `round2`: bastaba con que alguien
  // tocara una de las dos para que la dueña viera un total y el comprobante congelara otro.
  const porProfesional = new Map<
    string,
    { nombre: string; pctGeneral: number; turnos: TurnoParaComision[] }
  >();
  for (const a of appointments) {
    if (!a.payment) continue; // defensivo; el where ya lo garantiza
    // Un turno con saldo pendiente ESPERA. Liquidarlo lo congela con su payout, y el
    // cobro posterior del saldo ya no vuelve a entrar al pendiente: esa comisión se
    // perdía para siempre. Ver `comision-liquidable.ts`.
    if (!sePuedeLiquidar({ precio: a.priceAtBooking ?? a.service.price, cobros: a.collections.map((c) => ({ amount: c.amount.toNumber(), method: c.method })), pagoLegado: a.payment })) continue;
    let g = porProfesional.get(a.professionalId);
    if (!g) {
      g = { nombre: a.professional.name, pctGeneral: a.professional.commissionPercent, turnos: [] };
      porProfesional.set(a.professionalId, g);
    }
    // `payment.amount` es lo efectivamente COBRADO: la base de la comisión es esa, no el
    // precio de lista (decisión vigente, ver `comision-liquidable.ts`).
    g.turnos.push({ id: a.id, serviceId: a.serviceId, base: a.payment.amount, startsAt: a.startsAt });
  }

  const pending: PendingCommission[] = [];
  for (const [professionalId, g] of porProfesional) {
    const calc = calcularLiquidacion(
      g.turnos,
      g.pctGeneral,
      overridesByProf.get(professionalId) ?? new Map(),
    );
    if (calc.appointmentCount === 0) continue; // todos sus turnos son de servicios sin comisión
    pending.push({
      professionalId,
      professionalName: g.nombre,
      amount: calc.amount,
      ingresos: calc.ingresos,
      appointmentCount: calc.appointmentCount,
      periodStart: calc.periodStart,
      periodEnd: calc.periodEnd,
    });
  }
  pending.sort((x, y) => y.amount - x.amount);

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
  // El formulario todavía no pregunta por qué medio se le pagó (un solo campo, la nota).
  // `null` = no informado: el egreso asume EFECTIVO y lo DICE en el detalle de la fila.
  // Ver `MEDIO_ASUMIDO` en comision-liquidacion.ts y `necesita_otro_archivo`.
  const method = parseCashMethod(formData.get("method"));

  // Fecha CONTABLE del egreso. Se lee ANTES de la transacción (misma forma que el alta
  // manual del libro): si hoy ya está congelado por un cierre, el asiento se imputa al
  // primer día abierto en vez de reescribir un día que ya se arqueó y se informó.
  const hoy = todayInBusinessTz();
  const diaDelEgreso = diaContableDelEgreso(hoy, await lastClosedDay(tenantId));

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

    const liquidables: TurnoParaComision[] = [];
    for (const a of appointments) {
      if (!a.payment) continue;
      // Misma guarda que el listado de pendientes: sin esto, la pantalla mostraría un
      // total y la liquidación escribiría otro.
      if (!sePuedeLiquidar({ precio: a.priceAtBooking ?? a.service.price, cobros: a.collections.map((c) => ({ amount: c.amount.toNumber(), method: c.method })), pagoLegado: a.payment })) continue;
      // La base es lo COBRADO (`payment.amount`), no el precio de lista.
      liquidables.push({ id: a.id, serviceId: a.serviceId, base: a.payment.amount, startsAt: a.startsAt });
    }

    // MISMA función que el listado de pendientes: la fórmula dejó de estar duplicada a mano
    // y el monto pasa por `round2`, la regla única del dinero. `CommissionPayout.amount` es
    // `Float`: antes se congelaba el float crudo acumulado (1851.8505 en un comprobante).
    const calc = calcularLiquidacion(liquidables, professional.commissionPercent, overrideByService);
    const { ids, amount, periodStart, periodEnd } = calc;

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

    // ── LA PLATA SALE DE LA CAJA, EN ESTA MISMA TRANSACCIÓN ──────────────────
    //
    // Antes esto no existía: se marcaba la comisión como pagada y el libro no se enteraba.
    // El efectivo salía del cajón de verdad, el sistema lo seguía esperando, y al cerrar el
    // día `cerrarDia` asentaba un FALTANTE por el monto entero como "Diferencia de caja" —
    // una fila IMBORRABLE desde el libro. La comisión pagada quedaba registrada para
    // siempre como un descuadre sin explicación.
    //
    // Va DENTRO de la tx a propósito: un payout emitido sin su egreso es peor que ninguno
    // de los dos. Si el asiento falla, no hay comprobante.
    //
    // No hace falta pre-chequeo de idempotencia: la marca lleva `payout.id`, que nace en
    // esta misma transacción. Si Serializable la hace reintentar, el payout también se
    // rehace y la marca es otra; si aborta, no queda nada.
    const egreso = egresoDeLiquidacion({
      payoutId: payout.id,
      profesional: professional.name,
      amount,
      method,
      periodStart: dateStrInBusinessTz(periodStart),
      periodEnd: dateStrInBusinessTz(periodEnd),
      dia: diaDelEgreso,
      hoy,
    });
    if (egreso) {
      // Si hay un turno de mostrador ABIERTO, el asiento se engancha a ese turno: pagarle
      // la comisión con la plata del cajón tiene que bajar el efectivo que el arqueo
      // espera. El arqueo filtra por medio, así que un pago por transferencia enganchado al
      // turno no le toca el efectivo. Mismo criterio que la compra a proveedor.
      const session = await tx.cashSession.findFirst({
        where: { tenantId, status: "OPEN" },
        select: { id: true },
      });
      await tx.cashMovement.create({
        data: {
          tenantId,
          sessionId: session?.id ?? null,
          type: egreso.type,
          method: egreso.method,
          amount: egreso.amount,
          reason: egreso.reason,
          // Anclado al MEDIODÍA de la zona del negocio, igual que el alta manual del libro:
          // así ningún corrimiento de zona horaria mueve la fila de día.
          occurredAt: businessWallTimeToUtc(egreso.dia, "12:00"),
          createdBy: egreso.createdBy,
        },
        select: { id: true },
      });
    }

    return {
      count: ids.length,
      amount,
      payoutId: payout.id,
      professionalName: professional.name,
      egreso,
    };
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
      // El egreso queda en el audit igual que en el libro: es la única forma de saber
      // después por qué medio se pagó y si el medio fue asumido.
      egresoMetodo: result.egreso?.method ?? null,
      egresoMedioAsumido: result.egreso?.medioAsumido ?? null,
      egresoDia: result.egreso?.dia ?? null,
    },
  });

  revalidatePath(REPORTES_PATH);
  if (result.egreso) {
    revalidatePath(LIBRO_PATH);
    revalidatePath(CAJA_PATH);
  }
  backWith("ok_settled");
}
