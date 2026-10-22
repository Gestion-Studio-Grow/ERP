// ============================================================================
// «CERRAR EL DÍA» — las dos lecturas que agrega a las del cierre de siempre (servidor).
// ============================================================================
//
//   · `tarjetaEnLaBase`: ¿el enum `PaymentMethod` de ESTA base ya tiene DEBITO y CREDITO (M1)? Lee el
//     catálogo de Postgres (`pg_enum`), que no tiene datos de ningún negocio: no lleva `tenantId`. Una
//     vez por pedido (`cache`). Si la lectura falla, `false`: rige D6 (tarjeta como Mercado Pago), que
//     es lo seguro. Ver el contrato en cerrar-el-dia-core.ts.
//   · `turnosAtendidosDelDia`: cuántos turnos de ese día quedaron Terminados, para el WhatsApp del
//     cierre («· 12 turnos»). Un `count` con `tenantId`.

import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { isDemoSandbox } from "@/lib/demo-flag";
import { rangoDelDia } from "@/lib/turnos/turno-abierto";
import { enumTieneTarjeta } from "./cerrar-el-dia-core";

export const tarjetaEnLaBase = cache(async (): Promise<boolean> => {
  if (isDemoSandbox()) return false;
  try {
    const filas = await prisma.$queryRaw<{ valor: string }[]>`
      SELECT e.enumlabel AS valor
        FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'PaymentMethod'`;
    return enumTieneTarjeta(filas.map((f) => f.valor));
  } catch {
    return false;
  }
});

export async function turnosAtendidosDelDia(day: string): Promise<number | null> {
  await requireCapability("orders:read");
  if (isDemoSandbox()) return null;
  const tenantId = await getCurrentTenantId();
  const { desde, hasta } = rangoDelDia(day);
  return prisma.appointment.count({ where: { tenantId, status: "COMPLETED", startsAt: { gte: desde, lt: hasta } } });
}
