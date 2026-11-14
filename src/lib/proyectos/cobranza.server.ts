/**
 * Lecturas de la cobranza (ver `cobranza-core.ts`): los cobros registrados y el presupuesto aprobado de los proyectos
 * del negocio. Sólo importa Prisma, para que cualquier lectura de proyectos (también `datos.server.ts`) la use sin ciclos.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { basePrisma } from "@/lib/prisma-base";
import type { Prisma } from "@/generated/prisma/client";
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

// ── D13: cobros fijados al tipo de cambio de su momento ─────────────────────────────────────────
// `ProyectoPago.cuotaId/montoMoneda/tipoCambio` llegan con la migración 20261114120000_proyecto_pago_cuota, que puede no
// estar aplicada. Mismo patrón que `hayColumnaCuotaEnInvoice` (facturar-cuota.server.ts) y must-change-password.ts: se
// pregunta al catálogo SIN transacción (leer una columna que falta aborta la transacción en la que corre) y se recuerda
// sólo el sí; apenas se aplica la migración, la próxima pregunta ya lo ve.
let _columnasCobroFijado = false;

/** ¿La base tiene las tres columnas D13 de `ProyectoPago`? Falla cerrado: sin poder preguntar, `false`. */
export async function hayColumnasCobroFijado(): Promise<boolean> {
  if (_columnasCobroFijado) return true;
  const filas = await basePrisma
    .$queryRaw<{ n: bigint | number }[]>`SELECT count(*) AS n FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ProyectoPago' AND column_name IN ('cuotaId', 'montoMoneda', 'tipoCambio')`
    .catch(() => null);
  if (filas === null) return false;
  _columnasCobroFijado = Number(filas[0]?.n ?? 0) === 3;
  return _columnasCobroFijado;
}

/**
 * Las columnas de `ProyectoPago` que existen con o sin la migración D13. Toda lectura de cobros enteros va con este
 * `select`: sin él, Prisma pide también las tres columnas nuevas y la consulta falla en una base sin migrar.
 */
export const COLUMNAS_PAGO = { id: true, tenantId: true, proyectoId: true, medio: true, monto: true, nota: true, cobradoPor: true, anuladoEl: true, anuladoPor: true, createdAt: true } as const;

/** Sólo para tests: olvida el «sí» recordado (el test que borra las columnas en su base efímera). */
export function olvidarColumnasCobroFijadoParaTests(): void {
  _columnasCobroFijado = false;
}

/**
 * Interruptor de la valuación D13 (cambia el «por cobrar» que se ve, por eso arranca APAGADO): con
 * `PROYECTOS_COBRO_FIJADO=on`, un cobro suelto en pesos de un proyecto en otra moneda vale lo que valió al tipo de cambio
 * de SU momento. Apagado, se valúa como siempre (con el de hoy). Las columnas se escriben igual, prendido o apagado.
 */
export function cobroFijadoActivo(): boolean {
  return process.env.PROYECTOS_COBRO_FIJADO === "on";
}
/** Lectura o transacción: lo mismo para leer adentro de la transacción que va a grabar (con el candado tomado). */
type Db = Prisma.TransactionClient;
/** El enlace «Asiento» de un cobro: la cuota que lo asentó y, en otra moneda, lo que pagó el cliente en ella. */
export type EnlaceDeCobro = { original: Original | null; cuotaId: string | null; fijado?: Original | null };

/**
 * El enlace «Asiento» que deja `marcarCuota` (cuota → cobro), por id de cobro, para cualquier proyecto: la cuota que lo
 * asentó y lo que pagó el cliente en la moneda de ESA cuota (el monto guardado en el enlace, «60 USD»). Un enlace de
 * antes, sin monto, de una cuota que no es en pesos: la cuota entera (hasta entonces se cobraba completa). Un cobro sin
 * enlace no figura: es suelto.
 */
export async function originalesDeCobros(tenantId: string, proyectos: readonly { moneda?: string; pagos: readonly { id: string }[] }[], db: Db = prisma): Promise<Map<string, EnlaceDeCobro>> {
  const ids = proyectos.flatMap((p) => p.pagos.map((x) => x.id));
  const salida = new Map<string, EnlaceDeCobro>();
  if (ids.length === 0) return salida;
  const fijados = await fijadosDeCobros(tenantId, proyectos, db);
  const enlaces = await db.proyectoCambio.findMany({ where: { tenantId, entidad: "ProyectoCuota", campo: "Asiento", despues: { in: ids } }, select: { entidadId: true, antes: true, despues: true } });
  const sinMonto = enlaces.filter((e) => e.despues && e.entidadId && !leerOriginal(e.antes)).map((e) => e.entidadId!);
  const viejas = sinMonto.length > 0 ? await db.proyectoCuota.findMany({ where: { tenantId, id: { in: sinMonto }, moneda: { not: "ARS" } }, select: { id: true, monto: true, moneda: true } }) : [];
  const enteras = new Map(viejas.filter((c) => c.moneda !== "ARS").map((c) => [c.id, { monto: c.monto, moneda: c.moneda }]));
  for (const e of enlaces) {
    if (!e.despues) continue;
    const original = leerOriginal(e.antes) ?? (e.entidadId ? enteras.get(e.entidadId) : undefined) ?? null;
    salida.set(e.despues, { original, cuotaId: e.entidadId ?? null });
  }
  // Los cobros a mano fijados (D13) no tienen enlace: son sueltos, con lo que valieron en la moneda del proyecto.
  for (const [id, fijado] of fijados) if (!salida.has(id)) salida.set(id, { original: null, cuotaId: null, fijado });
  return salida;
}

/**
 * D13, por id de cobro: los cobros a mano (sin cuota) fijados al tipo de cambio de su momento, con lo que valieron en la
 * moneda del proyecto (`montoMoneda`; `registrarCobro` lo calcula con la moneda del proyecto). Vacío si el interruptor
 * está apagado, si falta la migración o en proyectos en pesos. Los de «Marcar cobrado» se quedan afuera: su valor en la
 * moneda de la cuota ya viaja en el enlace «Asiento».
 */
async function fijadosDeCobros(tenantId: string, proyectos: readonly { moneda?: string; pagos: readonly { id: string }[] }[], db: Db): Promise<Map<string, Original>> {
  const salida = new Map<string, Original>();
  const monedaDe = new Map<string, string>();
  for (const p of proyectos) if (p.moneda && p.moneda !== "ARS") for (const x of p.pagos) monedaDe.set(x.id, p.moneda);
  if (monedaDe.size === 0 || !cobroFijadoActivo() || !(await hayColumnasCobroFijado())) return salida;
  const filas = await db.proyectoPago.findMany({
    where: { tenantId, id: { in: [...monedaDe.keys()] }, cuotaId: null, tipoCambio: { gt: 0 }, montoMoneda: { not: null } },
    select: { id: true, montoMoneda: true },
  });
  for (const f of filas) if (f.montoMoneda !== null && Number.isFinite(f.montoMoneda)) salida.set(f.id, { monto: f.montoMoneda, moneda: monedaDe.get(f.id)! });
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
  enlaces: ReadonlyMap<string, EnlaceDeCobro> = new Map(),
): Cobranza {
  const aprobado = p.presupuestos[0];
  const cobros = p.pagos.map((x) => ({ monto: x.monto, original: enlaces.get(x.id)?.original ?? null, cuotaId: enlaces.get(x.id)?.cuotaId ?? null, fijado: enlaces.get(x.id)?.fijado ?? null }));
  if (!aprobado) return cobranza(0, cobros);
  return cobranzaEnMoneda(totalAprobado(aprobado, tc, recargoGeneral), cobros, { moneda: p.moneda, cambioVenta: cambioDeVenta(p.moneda, aprobado.tcVenta, tc), tcHoy: tc[p.moneda] ?? 0 });
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
  const enlaces = await originalesDeCobros(tenantId, proyectos, db);
  return new Map(proyectos.map((p) => [p.id, cobranzaDe(p, tc, recargoGeneral, enlaces)]));
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
