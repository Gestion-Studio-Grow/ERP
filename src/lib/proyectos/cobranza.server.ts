/**
 * Lecturas de la cobranza (ver `cobranza-core.ts`): los cobros registrados y el presupuesto aprobado de los proyectos
 * del negocio. Sólo importa Prisma, para que cualquier lectura de proyectos (también `datos.server.ts`) la use sin ciclos.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { cobranza, cobranzaEnMoneda, leerOriginal, pendientesDeCobro, totalAprobado, type Cobranza } from "./cobranza-core";
import { cambioDeVenta } from "./gestion-core";

/** Pesos por unidad de cada moneda cargada en el negocio. */
export async function tiposDeCambio(tenantId: string): Promise<Record<string, number>> {
  const filas = await prisma.proyectoTipoCambio.findMany({ where: { tenantId }, select: { moneda: true, porUnidad: true } });
  return Object.fromEntries(filas.map((f) => [f.moneda, f.porUnidad]));
}

/** Lo que hay que leer de un proyecto para su cobranza: su moneda, el último presupuesto aprobado y los cobros no anulados. */
export const SELECT_COBRANZA = {
  moneda: true,
  presupuestos: {
    where: { estado: "APROBADO" },
    orderBy: { version: "desc" as const },
    take: 1,
    select: { ivaPct: true, tcVenta: true, items: { select: { cantidad: true, costo: true, precio: true, moneda: true, recargoPct: true } } },
  },
  pagos: { where: { anuladoEl: null }, select: { id: true, monto: true } },
} as const;

type Original = { monto: number; moneda: string };

/**
 * Lo que pagó el cliente en su moneda, por id de cobro, de los proyectos que no venden en pesos. Sale del enlace
 * «Asiento» que deja `marcarCuota` (cuota → cobro): el monto en moneda guardado en el enlace o, en los enlaces de antes,
 * el de la cuota entera (hasta entonces se cobraba la cuota completa). Un cobro sin enlace no figura: es en pesos.
 */
export async function originalesDeCobros(tenantId: string, proyectos: readonly { moneda: string; pagos: readonly { id: string }[] }[]): Promise<Map<string, Original>> {
  const ids = proyectos.filter((p) => p.moneda !== "ARS").flatMap((p) => p.pagos.map((x) => x.id));
  const salida = new Map<string, Original>();
  if (ids.length === 0) return salida;
  const enlaces = await prisma.proyectoCambio.findMany({ where: { tenantId, entidad: "ProyectoCuota", campo: "Asiento", despues: { in: ids } }, select: { entidadId: true, antes: true, despues: true } });
  const sinMonto = enlaces.filter((e) => !leerOriginal(e.antes) && e.entidadId).map((e) => e.entidadId!);
  const cuotas = sinMonto.length > 0 ? await prisma.proyectoCuota.findMany({ where: { tenantId, id: { in: sinMonto } }, select: { id: true, monto: true, moneda: true } }) : [];
  const porId = new Map(cuotas.map((c) => [c.id, { monto: c.monto, moneda: c.moneda }]));
  for (const e of enlaces) {
    const o = leerOriginal(e.antes) ?? (e.entidadId ? porId.get(e.entidadId) : undefined);
    if (o && e.despues) salida.set(e.despues, o);
  }
  return salida;
}

/** La cobranza de un proyecto leído con `SELECT_COBRANZA` (en su moneda: ver `cobranzaEnMoneda`). */
export function cobranzaDe(
  p: {
    moneda: string;
    presupuestos: { ivaPct: number; tcVenta: number | null; items: { cantidad: number; costo: number; precio: number; moneda: string; recargoPct: number | null }[] }[];
    pagos: { id: string; monto: number }[];
  },
  tc: Readonly<Record<string, number>>,
  recargoGeneral: number,
  originales: ReadonlyMap<string, Original> = new Map(),
): Cobranza {
  const aprobado = p.presupuestos[0];
  const cobros = p.pagos.map((x) => ({ monto: x.monto, original: originales.get(x.id) ?? null }));
  if (!aprobado) return cobranza(0, cobros);
  return cobranzaEnMoneda(totalAprobado(aprobado, tc, recargoGeneral), cobros, { moneda: p.moneda, cambioVenta: cambioDeVenta(p.moneda, aprobado.tcVenta, tc), tcHoy: tc[p.moneda] ?? 0 });
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
  const originales = await originalesDeCobros(tenantId, proyectos);
  return new Map(proyectos.map((p) => [p.id, cobranzaDe(p, tc, recargoGeneral, originales)]));
}

/**
 * Lo que falta cobrar de una cuota de cobro, en su moneda: su monto menos lo que ya entró por cobros manuales
 * (`pendientesDeCobro`). Es lo que cobra «Marcar cobrado». `null` si la cuota no está pendiente.
 */
export async function pendienteDeLaCuota(tenantId: string, proyectoId: string, cuotaId: string, tc: Readonly<Record<string, number>>, recargoGeneral: number): Promise<number | null> {
  const [cuotas, cobranzas] = await Promise.all([
    prisma.proyectoCuota.findMany({ where: { tenantId, proyectoId, anuladoEl: null, tipo: "COBRO" }, select: { id: true, tipo: true, monto: true, moneda: true, venceEl: true, pagadoEl: true } }),
    cobranzasDelNegocio(tenantId, tc, recargoGeneral, [proyectoId]),
  ]);
  const i = cuotas.findIndex((c) => c.id === cuotaId);
  if (i < 0 || cuotas[i].pagadoEl) return null;
  return pendientesDeCobro(cuotas, tc, cobranzas.get(proyectoId) ?? cobranza(0, []))[i];
}
