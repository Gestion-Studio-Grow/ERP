import "server-only";
/**
 * MIA T06 · lecturas de las tablas de M2 (detalle de línea, adicionales, estados de la previsión). M2 se escribe sin
 * aplicar (Gate 2): todo pregunta antes si la tabla existe (`to_regclass`, no aborta la transacción) y sin M2 responde
 * vacío, así el sistema sigue como hoy.
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { valoresDelNegocio } from "./parametros/leer.server";
import { DIAS_POR_DEFECTO, topeDeAdicionales, type Adicional, type DiasDelPlan } from "./presupuesto-core";

type Db = Prisma.TransactionClient | typeof prisma;

export const FALTA_M2 = "Esta función todavía no está habilitada en la base (falta aplicar la migración M2).";

/** Si M2 está aplicada. Sin caché: el mismo proceso puede ver la base antes y después de aplicarla. */
export async function hayM2(db: Db = prisma): Promise<boolean> {
  const r = await db.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('"ProyectoPrevisionEstado"') IS NOT NULL AS ok`;
  return !!r[0]?.ok;
}

/**
 * Los días del plan (`plan.*`, R8). Sin la tabla de parámetros (M7a) rige el rubro.
 *
 * MIA-253: adentro de una transacción se leen con ELLA (`db` = tx). Con el cliente global la consulta pedía otra conexión:
 * con el pool en una (`DB_CONNECTION_LIMIT=1`) esperaba a la que tenía tomada la transacción y la transacción vencía a los
 * 5 s (la pestaña Finanzas, `pagosPorRevisar`); con más conexiones salía por una sin el negocio puesto y, con RLS, no veía
 * los parámetros (el plan quedaba con los días del rubro). Sin M7a se pregunta antes con `to_regclass`, que no aborta la
 * transacción.
 */
export async function diasDelPlan(tenantId: string, db: Db = prisma): Promise<DiasDelPlan> {
  const enTx = db !== prisma;
  try {
    if (enTx) {
      const hay = await db.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('"ProyectoParametro"') IS NOT NULL AS ok`;
      if (!hay[0]?.ok) return DIAS_POR_DEFECTO;
    }
    const v = await valoresDelNegocio(tenantId, db);
    return { anticipoProveedorAntes: v["plan.anticipoProveedorDiasAntes"], saldoProveedorDespues: v["plan.saldoProveedorDiasDespues"], saldoClienteAntes: v["plan.saldoClienteDiasAntes"] };
  } catch (e) {
    // En una transacción, un error de la base ya la abortó: que suba con su causa, no como «current transaction is aborted».
    if (enTx) throw e;
    return DIAS_POR_DEFECTO;
  }
}

export interface DetalleDeLinea {
  itemId: string;
  sector: string | null;
  categoria: string | null;
  puestos: number | null;
  horas: number | null;
  dias: number | null;
  anticipoPct: number | null;
}

/** El detalle de cada línea del presupuesto base, por id de ítem. */
export async function detallesDeLineas(db: Db, tenantId: string, itemIds: readonly string[]): Promise<Map<string, DetalleDeLinea>> {
  if (itemIds.length === 0 || !(await hayM2(db))) return new Map();
  const filas = await db.proyectoLineaDetalle.findMany({ where: { tenantId, itemId: { in: [...itemIds] } }, select: { itemId: true, sector: true, categoria: true, puestos: true, horas: true, dias: true, anticipoPct: true } });
  return new Map(filas.map((f) => [f.itemId, f]));
}

const SELECT_ADICIONAL = {
  id: true,
  numero: true,
  nombre: true,
  estado: true,
  ivaPct: true,
  creadoPor: true,
  aprobadoInternoPor: true,
  aprobadoInternoEl: true,
  enviadoEl: true,
  respondidoEl: true,
  respondidoPor: true,
  motivoRechazo: true,
  lineas: {
    orderBy: { posicion: "asc" as const },
    select: { id: true, sector: true, categoria: true, detalle: true, proveedor: true, supplierId: true, cantidad: true, puestos: true, horas: true, dias: true, costoCentavos: true, precioCentavos: true, anticipoPct: true },
  },
} as const;

type FilaAdicional = Prisma.ProyectoAdicionalGetPayload<{ select: typeof SELECT_ADICIONAL }>;
export type AdicionalLeido = Adicional & Omit<FilaAdicional, "lineas">;

/** BIGINT → number: centavos de un adicional (hasta 90 billones de pesos sin perder precisión). */
const aAdicional = (a: FilaAdicional): AdicionalLeido => ({ ...a, lineas: a.lineas.map((l) => ({ ...l, costoCentavos: Number(l.costoCentavos), precioCentavos: Number(l.precioCentavos) })) });

export async function adicionalesDelProyecto(db: Db, tenantId: string, proyectoId: string): Promise<AdicionalLeido[]> {
  if (!(await hayM2(db))) return [];
  const filas = await db.proyectoAdicional.findMany({ where: { tenantId, proyectoId }, orderBy: { numero: "asc" }, select: SELECT_ADICIONAL });
  return filas.map(aAdicional);
}

/** Lo que suman al tope de cobro los adicionales aprobados, en pesos con IVA, por proyecto (O11). */
export async function topeDeAdicionalesPorProyecto(db: Db, tenantId: string, proyectoIds?: readonly string[]): Promise<Map<string, number>> {
  if (!(await hayM2(db))) return new Map();
  const filas = await db.proyectoAdicional.findMany({
    where: { tenantId, estado: "APROBADO", ...(proyectoIds && { proyectoId: { in: [...proyectoIds] } }) },
    select: { proyectoId: true, estado: true, ivaPct: true, lineas: { select: SELECT_ADICIONAL.lineas.select } },
  });
  const salida = new Map<string, number>();
  for (const f of filas) {
    const a = { ...f, lineas: f.lineas.map((l) => ({ ...l, costoCentavos: Number(l.costoCentavos), precioCentavos: Number(l.precioCentavos) })) };
    salida.set(f.proyectoId, (salida.get(f.proyectoId) ?? 0) + topeDeAdicionales([a]) / 100);
  }
  return salida;
}

export interface EstadoPrevision {
  confirmado: boolean;
  marcadoNombre: string | null;
  marcadoEl: Date | null;
}

/** El estado que marcó Administración en cada cuota de pago, por id de cuota (O12). */
export async function estadosDePrevision(db: Db, tenantId: string, cuotaIds: readonly string[]): Promise<Map<string, EstadoPrevision>> {
  if (cuotaIds.length === 0 || !(await hayM2(db))) return new Map();
  const filas = await db.proyectoPrevisionEstado.findMany({ where: { tenantId, cuotaId: { in: [...cuotaIds] } }, select: { cuotaId: true, confirmado: true, marcadoNombre: true, marcadoEl: true } });
  return new Map(filas.map((f) => [f.cuotaId, f]));
}
