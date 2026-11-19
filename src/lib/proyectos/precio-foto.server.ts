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

/** El total congelado de cada versión aprobada con foto, en pesos sin IVA. Sin M3, ninguno. */
export async function totalesCongelados(db: Db, tenantId: string, presupuestoIds: readonly string[]): Promise<Map<string, number>> {
  if (presupuestoIds.length === 0 || !(await hayM3(db))) return new Map();
  const filas = await db.proyectoPrecioFoto.findMany({ where: { tenantId, presupuestoId: { in: [...presupuestoIds] } }, select: { presupuestoId: true, totalVentaCentavos: true } });
  return new Map(filas.map((f) => [f.presupuestoId, Number(f.totalVentaCentavos) / 100]));
}
