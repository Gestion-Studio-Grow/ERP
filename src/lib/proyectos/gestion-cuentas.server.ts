// La cuenta elegida al marcar una cuota: con ella, el cobro o el pago mueve el saldo que ve Administración.

import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { movimientoDeCuenta } from "./gestion-core";

/** Sin cuenta elegida devuelve null; un texto es el error para la persona. Con `db`, lee adentro de esa transacción. */
export async function cuentaParaCuota(tenantId: string, formData: FormData, c: { tipo: string; monto: number; moneda: string; importeEnPesos: number }, db: Prisma.TransactionClient | typeof prisma = prisma): Promise<{ id: string; movido: number } | null | string> {
  const id = String(formData.get("cuenta") ?? "");
  if (!id || id === "ninguna") return null;
  const cuenta = await db.proyectoCuentaBanco.findFirst({ where: { id, tenantId }, select: { id: true, moneda: true } });
  if (!cuenta) return "Esa cuenta ya no existe. Recargá la página.";
  const movido = movimientoDeCuenta({ ...c, monedaCuenta: cuenta.moneda });
  if (movido === null) return `Esa cuenta está en ${cuenta.moneda} y la cuota en ${c.moneda}: elegí otra o dejala sin cuenta.`;
  return { id: cuenta.id, movido };
}
