/**
 * Lecturas de la cobranza (ver `cobranza-core.ts`): los cobros registrados y el presupuesto aprobado de los proyectos
 * del negocio. Sólo importa Prisma, para que cualquier lectura de proyectos (también `datos.server.ts`) la use sin ciclos.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { cobranza, totalAprobado, type Cobranza } from "./cobranza-core";

/** Pesos por unidad de cada moneda cargada en el negocio. */
export async function tiposDeCambio(tenantId: string): Promise<Record<string, number>> {
  const filas = await prisma.proyectoTipoCambio.findMany({ where: { tenantId }, select: { moneda: true, porUnidad: true } });
  return Object.fromEntries(filas.map((f) => [f.moneda, f.porUnidad]));
}

/** Lo que hay que leer de un proyecto para su cobranza: el último presupuesto aprobado y los cobros no anulados. */
export const SELECT_COBRANZA = {
  presupuestos: {
    where: { estado: "APROBADO" },
    orderBy: { version: "desc" as const },
    take: 1,
    select: { ivaPct: true, items: { select: { cantidad: true, costo: true, precio: true, moneda: true, recargoPct: true } } },
  },
  pagos: { where: { anuladoEl: null }, select: { monto: true } },
} as const;

/** La cobranza de un proyecto leído con `SELECT_COBRANZA`. */
export function cobranzaDe(
  p: { presupuestos: { ivaPct: number; items: { cantidad: number; costo: number; precio: number; moneda: string; recargoPct: number | null }[] }[]; pagos: { monto: number }[] },
  tc: Readonly<Record<string, number>>,
  recargoGeneral: number,
): Cobranza {
  return cobranza(totalAprobado(p.presupuestos[0], tc, recargoGeneral), p.pagos);
}

/** La cobranza de cada proyecto del negocio (o de los pedidos), por id. */
export async function cobranzasDelNegocio(
  tenantId: string,
  tc: Readonly<Record<string, number>>,
  recargoGeneral: number,
  proyectoIds?: readonly string[],
): Promise<Map<string, Cobranza>> {
  const proyectos = await prisma.proyecto.findMany({
    where: { tenantId, ...(proyectoIds && { id: { in: [...proyectoIds] } }) },
    select: { id: true, ...SELECT_COBRANZA },
  });
  return new Map(proyectos.map((p) => [p.id, cobranzaDe(p, tc, recargoGeneral)]));
}
