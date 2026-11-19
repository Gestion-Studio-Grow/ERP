/**
 * Lecturas de la cobranza (ver `cobranza-core.ts`): los cobros registrados y el presupuesto aprobado de los proyectos
 * del negocio. Sólo importa Prisma, para que cualquier lectura de proyectos (también `datos.server.ts`) la use sin ciclos.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { topeDeAdicionalesPorProyecto } from "./presupuesto-m2.server";
import { cobranza, cobranzaDePerdido, cobranzaEnMoneda, leerOriginal, pendientesDeCobro, totalAprobado, type Cobranza } from "./cobranza-core";
import { cambioDeVenta } from "./gestion-core";

/** Pesos por unidad de cada moneda cargada en el negocio. */
export async function tiposDeCambio(tenantId: string, db: Db = prisma): Promise<Record<string, number>> {
  const filas = await db.proyectoTipoCambio.findMany({ where: { tenantId }, select: { moneda: true, porUnidad: true } });
  return Object.fromEntries(filas.map((f) => [f.moneda, f.porUnidad]));
}

/** Lo que hay que leer de un proyecto para su cobranza: su moneda, el último presupuesto aprobado y los cobros no anulados. */
export const SELECT_COBRANZA = {
  moneda: true,
  perdidoEl: true,
  presupuestos: {
    where: { estado: "APROBADO" },
    orderBy: { version: "desc" as const },
    take: 1,
    select: { ivaPct: true, tcVenta: true, items: { select: { cantidad: true, costo: true, precio: true, moneda: true, recargoPct: true } } },
  },
  pagos: { where: { anuladoEl: null }, select: { id: true, monto: true } },
} as const;

type Original = { monto: number; moneda: string };
/** Lectura o transacción: lo mismo para leer adentro de la transacción que va a grabar (con el candado tomado). */
type Db = Prisma.TransactionClient;
/** El enlace «Asiento» de un cobro: la cuota que lo asentó y, en otra moneda, lo que pagó el cliente en ella. */
export type EnlaceDeCobro = { original: Original | null; cuotaId: string | null };

/**
 * El enlace «Asiento» que deja `marcarCuota` (cuota → cobro), por id de cobro, para cualquier proyecto: la cuota que lo
 * asentó y lo que pagó el cliente en la moneda de ESA cuota (el monto guardado en el enlace, «60 USD»). Un enlace de
 * antes, sin monto, de una cuota que no es en pesos: la cuota entera (hasta entonces se cobraba completa). Un cobro sin
 * enlace no figura: es suelto.
 */
export async function originalesDeCobros(tenantId: string, proyectos: readonly { pagos: readonly { id: string }[] }[], db: Db = prisma): Promise<Map<string, EnlaceDeCobro>> {
  const ids = proyectos.flatMap((p) => p.pagos.map((x) => x.id));
  const salida = new Map<string, EnlaceDeCobro>();
  if (ids.length === 0) return salida;
  const enlaces = await db.proyectoCambio.findMany({ where: { tenantId, entidad: "ProyectoCuota", campo: "Asiento", despues: { in: ids } }, select: { entidadId: true, antes: true, despues: true } });
  const sinMonto = enlaces.filter((e) => e.despues && e.entidadId && !leerOriginal(e.antes)).map((e) => e.entidadId!);
  const viejas = sinMonto.length > 0 ? await db.proyectoCuota.findMany({ where: { tenantId, id: { in: sinMonto }, moneda: { not: "ARS" } }, select: { id: true, monto: true, moneda: true } }) : [];
  const enteras = new Map(viejas.filter((c) => c.moneda !== "ARS").map((c) => [c.id, { monto: c.monto, moneda: c.moneda }]));
  for (const e of enlaces) {
    if (!e.despues) continue;
    const original = leerOriginal(e.antes) ?? (e.entidadId ? enteras.get(e.entidadId) : undefined) ?? null;
    salida.set(e.despues, { original, cuotaId: e.entidadId ?? null });
  }
  return salida;
}

/** La cobranza de un proyecto leído con `SELECT_COBRANZA` (en su moneda: ver `cobranzaEnMoneda`). */
export function cobranzaDe(
  p: {
    moneda: string;
    presupuestos: { ivaPct: number; tcVenta: number | null; items: { cantidad: number; costo: number; precio: number; moneda: string; recargoPct: number | null }[] }[];
    pagos: { id: string; monto: number }[];
    perdidoEl: Date | null;
  },
  tc: Readonly<Record<string, number>>,
  recargoGeneral: number,
  enlaces: ReadonlyMap<string, EnlaceDeCobro> = new Map(),
  adicionales = 0,
): Cobranza {
  const c = cobranzaSinPerder(p, tc, recargoGeneral, enlaces, adicionales);
  // Un proyecto perdido no tiene nada por cobrar (pregunta 2 = A, provisional a confirmar por el dueño): lo cobrado sigue
  // como cobrado y devolverlo es otra operación. En la fuente única: ficha, Administración, Rentabilidad y Dirección.
  return p.perdidoEl ? cobranzaDePerdido(c) : c;
}

function cobranzaSinPerder(
  p: Parameters<typeof cobranzaDe>[0],
  tc: Readonly<Record<string, number>>,
  recargoGeneral: number,
  enlaces: ReadonlyMap<string, EnlaceDeCobro>,
  adicionales: number,
): Cobranza {
  const aprobado = p.presupuestos[0];
  const cobros = p.pagos.map((x) => ({ monto: x.monto, original: enlaces.get(x.id)?.original ?? null, cuotaId: enlaces.get(x.id)?.cuotaId ?? null }));
  if (!aprobado) return cobranza(0, cobros);
  // MIA T06 · O11: el tope sube el precio con IVA de los adicionales aprobados (en pesos), y nada más.
  return cobranzaEnMoneda(totalAprobado(aprobado, tc, recargoGeneral) + adicionales, cobros, { moneda: p.moneda, cambioVenta: cambioDeVenta(p.moneda, aprobado.tcVenta, tc), tcHoy: tc[p.moneda] ?? 0 });
}

/** La cobranza de cada proyecto del negocio (o de los pedidos), por id. Con `db` = la transacción, lee adentro de ella. */
export async function cobranzasDelNegocio(
  tenantId: string,
  tc: Readonly<Record<string, number>>,
  recargoGeneral: number,
  proyectoIds?: readonly string[],
  db: Db = prisma,
): Promise<Map<string, Cobranza>> {
  const proyectos = await db.proyecto.findMany({
    where: { tenantId, ...(proyectoIds && { id: { in: [...proyectoIds] } }) },
    select: { id: true, ...SELECT_COBRANZA },
  });
  const [enlaces, adicionales] = await Promise.all([originalesDeCobros(tenantId, proyectos, db), topeDeAdicionalesPorProyecto(db, tenantId, proyectoIds)]);
  return new Map(proyectos.map((p) => [p.id, cobranzaDe(p, tc, recargoGeneral, enlaces, adicionales.get(p.id) ?? 0)]));
}

/**
 * Las cuotas de cobro vivas de un proyecto y su cobranza, leídas con `db` (adentro de la transacción, con el candado). Con
 * `prevista`: el reparto las deja afuera (`esPrevista`, la misma regla que la ficha y Administración).
 */
export async function cobranzaConCuotas(db: Db, tenantId: string, proyectoId: string, tc: Readonly<Record<string, number>>, recargoGeneral: number) {
  const cuotas = await db.proyectoCuota.findMany({ where: { tenantId, proyectoId, anuladoEl: null, tipo: "COBRO" }, select: { id: true, tipo: true, monto: true, moneda: true, venceEl: true, pagadoEl: true, prevista: true } });
  const cob = (await cobranzasDelNegocio(tenantId, tc, recargoGeneral, [proyectoId], db)).get(proyectoId) ?? cobranza(0, []);
  return { cuotas, cob };
}

/**
 * El mismo envío de un alta de cuota (doble clic, reintento): con el candado de su clave, si el historial ya tiene su
 * «Envío», se contesta como hecho y no se graba otra (MIA-089 · V7, sin migración: como `registrarCobro`). Sin clave
 * válida, `null`: el alta se graba como siempre.
 */
export async function envioYaGrabado(tx: Db, tenantId: string, clave: string | null): Promise<boolean> {
  if (!clave) return false;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`envio-cuota:${tenantId}:${clave}`}))`;
  return !!(await tx.proyectoCambio.findFirst({ where: { tenantId, entidad: "ProyectoCuota", campo: "Envío", antes: clave }, select: { id: true } }));
}

/**
 * Si el proyecto está perdido, leído para la transacción que va a cobrar o marcar (MIA-089 · V2). `FOR UPDATE`: en
 * Serializable la foto de la transacción es de ANTES de esperar el candado; leer la fila con candado hace que un «Marcar
 * perdido» confirmado en el medio aborte por conflicto (40001) y `tenantTransaction` reintente con la foto nueva.
 */
export async function estaPerdido(tx: Db, tenantId: string, proyectoId: string): Promise<boolean> {
  const filas = await tx.$queryRaw<{ perdido: boolean }[]>`SELECT ("perdidoEl" IS NOT NULL) AS perdido FROM "Proyecto" WHERE id = ${proyectoId} AND "tenantId" = ${tenantId} FOR UPDATE`;
  return filas[0]?.perdido === true;
}

/**
 * Candado de la cobranza de un proyecto: «Marcar cobrado», un cobro registrado y una cuota de cobro cargada a mano se
 * ponen en fila, y cada uno recalcula lo que falta ADENTRO de su transacción. Se suelta solo al terminar la transacción.
 */
export async function trabarCobranza(tx: Db, tenantId: string, proyectoId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cobranza-proyecto:${tenantId}:${proyectoId}`}))`;
}

/**
 * Lo que falta cobrar de una cuota de cobro, en su moneda (`pendientesDeCobro`: ya descontado lo suelto y topeado contra
 * lo que falta cobrar), con la cobranza con la que se calculó. Es lo que cobra «Marcar cobrado». `null` si la cuota no
 * está pendiente.
 */
export async function pendienteDeLaCuota(tenantId: string, proyectoId: string, cuotaId: string, tc: Readonly<Record<string, number>>, recargoGeneral: number, db: Db = prisma): Promise<{ pendiente: number; cob: Cobranza } | null> {
  const { cuotas, cob } = await cobranzaConCuotas(db, tenantId, proyectoId, tc, recargoGeneral);
  const i = cuotas.findIndex((c) => c.id === cuotaId);
  if (i < 0 || cuotas[i].pagadoEl) return null;
  return { pendiente: pendientesDeCobro(cuotas, tc, cob)[i], cob };
}
