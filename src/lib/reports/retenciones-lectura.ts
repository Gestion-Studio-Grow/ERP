// ============================================================================
// LECTURA de los pagos a cuenta del mes — los movimientos del extracto del banco.
// ============================================================================
//
// La misma para la pantalla (/admin/retenciones) y el botón del Inicio. UNA consulta: los
// movimientos del extracto con fecha del mes (`whereExtractoDelMes`); el tipo de cada uno lo
// decide su leyenda (retenciones.ts). Sin "use server" ni "server-only" (ver
// debts/cuentas-lectura.ts).

import type { Prisma } from "@/generated/prisma/client";
import type { MesKey } from "@/lib/libros/fecha-fiscal";
import { aNumero } from "@/lib/debts/resumen-cuentas";
import { resumirPagosACuenta, whereExtractoDelMes, type ResumenPagosACuenta } from "./retenciones";

export async function leerPagosACuenta(
  db: Prisma.TransactionClient,
  tenantId: string,
  mes: MesKey,
): Promise<ResumenPagosACuenta> {
  const movs = await db.movimientoImportado.findMany({
    where: whereExtractoDelMes(tenantId, mes),
    select: { id: true, fecha: true, descripcion: true, monto: true },
    orderBy: [{ fecha: "asc" }, { id: "asc" }],
  });
  return resumirPagosACuenta(movs.map((m) => ({ id: m.id, fecha: m.fecha, descripcion: m.descripcion, monto: aNumero(m.monto) })));
}
