// MIA T07 (GSG-MIA-149) · la foto de la aprobación (M3) vista desde la plata: el plan de cobro y el tope de cobro salen del
// total congelado (O16). Archivo chico y sin dependencias de la cobranza, para que `cobranza.server` lo use sin ciclos.
import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

/** Si M3 está aplicada. `to_regclass` no aborta una transacción (Gate 2: el código tolera su ausencia). */
export async function hayM3(db: Db = prisma): Promise<boolean> {
  const r = await db.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('"ProyectoPrecioFoto"') IS NOT NULL AS ok`;
  return !!r[0]?.ok;
}

/**
 * MIA-199 · P1-1/P3-1: el total de venta escrito a mano (precio por total) para la versión en curso, en pesos sin IVA:
 * mientras no se aprueba, las cuotas previstas salen de él (no de la suma de renglones). Sin M3 o sin total, ninguno.
 */
export async function totalAMano(db: Db, tenantId: string, proyectoId: string, presupuestoId: string): Promise<Map<string, number>> {
  if (!(await hayM3(db))) return new Map();
  const f = await db.proyectoPrecio.findUnique({ where: { proyectoId }, select: { tenantId: true, totalVentaCentavos: true } });
  return f && f.tenantId === tenantId && f.totalVentaCentavos !== null ? new Map([[presupuestoId, Number(f.totalVentaCentavos) / 100]]) : new Map();
}

/** El total congelado de cada versión aprobada con foto, en pesos sin IVA. Sin M3, ninguno. */
export async function totalesCongelados(db: Db, tenantId: string, presupuestoIds: readonly string[]): Promise<Map<string, number>> {
  if (presupuestoIds.length === 0 || !(await hayM3(db))) return new Map();
  const filas = await db.proyectoPrecioFoto.findMany({ where: { tenantId, presupuestoId: { in: [...presupuestoIds] } }, select: { presupuestoId: true, totalVentaCentavos: true } });
  return new Map(filas.map((f) => [f.presupuestoId, Number(f.totalVentaCentavos) / 100]));
}
