/**
 * Lecturas del pago parcial a proveedor (regla en `pago-parcial-core.ts`). Sólo importa Prisma, como `cobranza.server.ts`:
 * con `db` = la transacción, lee adentro de ella (con el candado de la cobranza tomado).
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { redondear } from "./core";
import { faltaDelPago, parteEnSuMoneda } from "./pago-parcial-core";

type Db = Prisma.TransactionClient;
type Cuota = { id: string; tipo: string; moneda: string; pagadoEl?: Date | null; anuladoEl?: Date | null };

/**
 * Lo pagado en parte por cada cuota de pago SIN marcar, en su moneda, por id de cuota: los gastos vivos enlazados a ella
 * por el «Asiento». Una cuota sin partes no figura. `conAnuladas`: también las cuotas que el plan sacó (para descontarlas
 * del plan nuevo, `regenerarCuotas`).
 */
export async function pagosParcialesDeCuotas(tenantId: string, cuotas: readonly Cuota[], tc: Readonly<Record<string, number>>, db: Db = prisma, conAnuladas = false): Promise<Map<string, number>> {
  const abiertas = new Map(cuotas.filter((c) => c.tipo !== "COBRO" && !c.pagadoEl && (conAnuladas || !c.anuladoEl)).map((c) => [c.id, c.moneda]));
  const salida = new Map<string, number>();
  if (abiertas.size === 0) return salida;
  const enlaces = await db.proyectoCambio.findMany({ where: { tenantId, entidad: "ProyectoCuota", campo: "Asiento", entidadId: { in: [...abiertas.keys()] } }, select: { entidadId: true, antes: true, despues: true } });
  const ids = enlaces.flatMap((e) => (e.despues ? [e.despues] : []));
  if (ids.length === 0) return salida;
  const gastos = await db.proyectoGasto.findMany({ where: { tenantId, id: { in: ids }, anuladoEl: null }, select: { id: true, neto: true, iva: true } });
  const vivos = new Map(gastos.map((g) => [g.id, redondear(g.neto + g.iva)]));
  for (const e of enlaces) {
    const pesos = e.despues ? vivos.get(e.despues) : undefined;
    if (pesos === undefined || !e.entidadId) continue;
    const parte = parteEnSuMoneda(abiertas.get(e.entidadId)!, pesos, e.antes, tc);
    salida.set(e.entidadId, redondear((salida.get(e.entidadId) ?? 0) + parte));
  }
  return salida;
}

/** Lo que le falta a una cuota de pago (su monto menos las partes ya pagadas), en su moneda. */
export async function pendienteDelPago(tenantId: string, c: Cuota & { monto: number }, tc: Readonly<Record<string, number>>, db: Db = prisma): Promise<number> {
  const pagados = await pagosParcialesDeCuotas(tenantId, [c], tc, db);
  return faltaDelPago(c.monto, pagados.get(c.id) ?? 0);
}
