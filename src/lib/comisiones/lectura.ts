// ============================================================================
// LECTURAS DE LA LIQUIDACIÓN (T1) — vista previa, comprobantes y «Mi liquidación».
// ============================================================================
//
// Spec: docs/producto/comisiones/LIQUIDACION.md §5-T1. Sólo lectura, sin migración.
//
//   · `getVistaPreviaDeComisiones` — `reports:read`: lo pendiente del período, turno por turno.
//   · `getComprobantesRecientes`   — `reports:read`: las últimas liquidaciones con su link `wa.me`.
//   · `getMiLiquidacion`           — `commissions:read-own`: SÓLO lo de la profesional de la
//     sesión (`User.professionalId`), del negocio de la sesión. Sin profesional asociada no ve nada.
//
// El `tenantId` sale SIEMPRE de la sesión (`getCurrentTenantId`) y va en cada `where`; el cliente
// de Prisma además corre con RLS. Nada llega por parámetro salvo la clave del período, que se
// valida (`periodoElegido`).

import "server-only";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { isDemoSandbox } from "@/lib/demo-sandbox";
import { dateStrInBusinessTz, todayInBusinessTz } from "@/lib/datetime";
import { leerTurnosPendientes } from "@/lib/reports/comisiones-lectura";
import { comisionMarker } from "@/lib/comision-liquidacion";
import { periodoElegido, periodoQueContiene, type PeriodoComision } from "./periodo";
import { aCentavos, armarVistaPrevia, type VistaPrevia, type VistaPreviaProfesional } from "./vista-previa";
import { linkDelComprobante, nombreDelMedio, type DatosDelComprobante } from "./comprobante-wa";

const vacia = (periodo: PeriodoComision): VistaPrevia => ({ periodo, profesionales: [], totalCents: 0, esperandoSaldo: 0, despuesDelCorte: 0 });

/** «05/11/2026» de un día YYYY-MM-DD. */
const diaAr = (dia: string) => dia.split("-").reverse().join("/");
/** «01/10 al 31/10» del período real cubierto por un payout. */
function periodoDelPayout(desde: Date, hasta: Date): string {
  const [a, b] = [dateStrInBusinessTz(desde), dateStrInBusinessTz(hasta)];
  const corto = (d: string) => diaAr(d).slice(0, 5);
  return a === b ? corto(a) : `${corto(a)} al ${corto(b)}`;
}

/** La vista previa del período elegido (clave de la URL, o el último período cerrado). */
export async function getVistaPreviaDeComisiones(periodoRaw: unknown): Promise<VistaPrevia> {
  await requireCapability("reports:read");
  const periodo = periodoElegido(periodoRaw, todayInBusinessTz());
  if (isDemoSandbox()) return vacia(periodo);
  const tenantId = await getCurrentTenantId();
  const { turnos, overrides } = await leerTurnosPendientes(prisma, tenantId);
  return armarVistaPrevia(turnos, overrides, periodo);
}

export interface ComprobanteDeLiquidacion {
  payoutId: string;
  professionalId: string;
  professionalName: string;
  amountCents: number;
  datos: DatosDelComprobante;
  /** `null`: sin celular usable cargado; la pantalla pide cargarlo (no se abre un chat al voleo). */
  link: string | null;
}

type PayoutLeido = {
  id: string;
  professionalId: string;
  amount: number;
  appointmentCount: number;
  periodStart: Date;
  periodEnd: Date;
  createdAt: Date;
  professional: { name: string; phone: string | null };
};

/** Los datos del comprobante de cada payout: lo cobrado de sus turnos y el medio de su egreso. */
async function comprobantesDe(tenantId: string, payouts: readonly PayoutLeido[]): Promise<ComprobanteDeLiquidacion[]> {
  if (payouts.length === 0) return [];
  const ids = payouts.map((p) => p.id);
  const [negocio, turnos, egresos] = await Promise.all([
    prisma.tenant.findFirst({ where: { id: tenantId }, select: { name: true } }),
    prisma.appointment.findMany({
      where: { tenantId, commissionPayoutId: { in: ids } },
      select: { commissionPayoutId: true, payment: { select: { amount: true } } },
    }),
    prisma.cashMovement.findMany({
      where: { tenantId, createdBy: { in: ids.map(comisionMarker) } },
      select: { createdBy: true, method: true },
    }),
  ]);
  const basePorPayout = new Map<string, number>();
  for (const t of turnos) {
    if (!t.commissionPayoutId) continue;
    basePorPayout.set(t.commissionPayoutId, (basePorPayout.get(t.commissionPayoutId) ?? 0) + aCentavos(Number(t.payment?.amount ?? 0)));
  }
  const medioPorMarca = new Map(egresos.map((e) => [e.createdBy, e.method]));
  return payouts.map((p) => {
    const datos: DatosDelComprobante = {
      profesional: p.professional.name,
      negocio: negocio?.name ?? "el negocio",
      periodo: periodoDelPayout(p.periodStart, p.periodEnd),
      turnos: p.appointmentCount,
      baseCents: basePorPayout.get(p.id) ?? 0,
      comisionCents: aCentavos(p.amount),
      medio: nombreDelMedio(medioPorMarca.get(comisionMarker(p.id))),
      fecha: diaAr(dateStrInBusinessTz(p.createdAt)),
    };
    return {
      payoutId: p.id,
      professionalId: p.professionalId,
      professionalName: p.professional.name,
      amountCents: aCentavos(p.amount),
      datos,
      link: linkDelComprobante(p.professional.phone, datos),
    };
  });
}

const SELECT_PAYOUT = {
  id: true,
  professionalId: true,
  amount: true,
  appointmentCount: true,
  periodStart: true,
  periodEnd: true,
  createdAt: true,
  professional: { select: { name: true, phone: true } },
} as const;

/** Las últimas liquidaciones del negocio, con su comprobante para mandar por WhatsApp. */
export async function getComprobantesRecientes(cuantos = 8): Promise<ComprobanteDeLiquidacion[]> {
  await requireCapability("reports:read");
  if (isDemoSandbox()) return [];
  const tenantId = await getCurrentTenantId();
  const payouts = await prisma.commissionPayout.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: cuantos,
    select: SELECT_PAYOUT,
  });
  return comprobantesDe(tenantId, payouts);
}

export type MiLiquidacion =
  | { tipo: "sin-perfil" }
  | {
      tipo: "profesional";
      nombre: string;
      /** Lo pendiente estimado: todo lo liquidable hasta fin de este período (sin liquidar). */
      pendiente: VistaPreviaProfesional | null;
      esperandoSaldo: number;
      periodo: PeriodoComision;
      liquidaciones: ComprobanteDeLiquidacion[];
    };

/**
 * «Mi liquidación»: lo de la profesional de la sesión y NADA más. El `professionalId` sale del
 * `User` de la sesión (nunca de la URL) y se cruza con el negocio de la sesión: un `User` de otro
 * negocio no existe acá (`getCurrentUser` lo busca por tenant), y una profesional de otro negocio
 * con el mismo id no matchea el `tenantId`.
 */
export async function getMiLiquidacion(): Promise<MiLiquidacion> {
  const user = await requireCapability("commissions:read-own");
  if (!user.professionalId || isDemoSandbox()) return { tipo: "sin-perfil" };
  const tenantId = await getCurrentTenantId();
  const professionalId = user.professionalId;
  const profesional = await prisma.professional.findFirst({ where: { id: professionalId, tenantId }, select: { name: true } });
  if (!profesional) return { tipo: "sin-perfil" };

  const periodo = periodoQueContiene(todayInBusinessTz());
  const [{ turnos, overrides }, payouts] = await Promise.all([
    leerTurnosPendientes(prisma, tenantId, professionalId),
    prisma.commissionPayout.findMany({
      where: { tenantId, professionalId },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: SELECT_PAYOUT,
    }),
  ]);
  const vista = armarVistaPrevia(turnos, overrides, periodo);
  const liquidaciones = (await comprobantesDe(tenantId, payouts)).map((c) => ({ ...c, link: null }));
  return {
    tipo: "profesional",
    nombre: profesional.name,
    pendiente: vista.profesionales.find((p) => p.professionalId === professionalId) ?? null,
    esperandoSaldo: vista.esperandoSaldo,
    periodo,
    liquidaciones,
  };
}
