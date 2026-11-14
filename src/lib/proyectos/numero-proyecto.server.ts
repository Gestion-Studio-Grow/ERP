// PROYECTOS · el número correlativo por negocio. El alta manual (acciones-ficha.ts) y el importador
// (acciones-importar.ts) numeran con el MISMO candado corto: el que llega segundo espera sólo a que termine la
// transacción del primero (un alta o una tanda del importador, no el import entero) y lee el último número ya
// confirmado. Sin candado, el alta chocaba contra el índice único con un número que el import todavía no confirmaba
// y esperaba hasta el final del import.

import "server-only";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Pick<Prisma.TransactionClient, "$executeRaw" | "proyecto">;

/** Toma el candado de numeración del negocio (hasta el fin de la transacción) y devuelve el último número usado. */
export async function ultimoNumeroConCandado(tx: Tx, tenantId: string): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`proyectos-numero:${tenantId}`}))`;
  const ultimo = await tx.proyecto.findFirst({ where: { tenantId }, orderBy: { numero: "desc" }, select: { numero: true } });
  return ultimo?.numero ?? 0;
}
