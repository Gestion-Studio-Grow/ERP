// VOUCHERS · opciones de los filtros (lotes y vecinos con vouchers) y estado de la base.
//
// Una sola transacción por tenant (RLS + `tenantId` en cada consulta). La tabla ausente (migración
// 20261105120000_vouchers sin aplicar, Gate 2) no es un 500: vuelve `faltaMigracion` y la pantalla
// dice «falta un paso de base de datos». `server-only`: detrás está el valor `prisma`.

import "server-only";
import { tenantTransaction } from "@/lib/rls";
import { isPrismaError } from "@/lib/prisma-errors";
import { voucherEnElEnum } from "@/lib/vouchers/voucher-repo";

export type OpcionDeFiltro = { id: string; nombre: string };
export type OpcionesDeVouchers =
  | { faltaMigracion: true }
  | { faltaMigracion: false; lotes: OpcionDeFiltro[]; vecinos: OpcionDeFiltro[]; enumListo: boolean };

const TOPE = 500;

export async function opcionesDeVouchers(tenantId: string): Promise<OpcionesDeVouchers> {
  try {
    const [{ lotes, vecinos }, enumListo] = await Promise.all([
      tenantTransaction(
        async (tx) => {
          const lotes = await tx.voucherLote.findMany({
            where: { tenantId },
            orderBy: [{ fecha: "desc" }, { numero: "asc" }],
            take: TOPE,
            select: { id: true, numero: true, cantidad: true },
          });
          const vecinos = await tx.voucher.findMany({
            where: { tenantId },
            distinct: ["clientId"],
            take: TOPE,
            select: { client: { select: { id: true, name: true } } },
          });
          return { lotes, vecinos };
        },
        { tenantId },
      ),
      voucherEnElEnum().catch(() => false),
    ]);
    return {
      faltaMigracion: false,
      enumListo,
      lotes: lotes.map((l) => ({ id: l.id, nombre: `${l.numero} (${l.cantidad})` })),
      vecinos: vecinos
        .map((v) => ({ id: v.client.id, nombre: v.client.name }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    };
  } catch (e) {
    if (isPrismaError(e, "P2021") || isPrismaError(e, "P2022")) return { faltaMigracion: true };
    throw e;
  }
}
