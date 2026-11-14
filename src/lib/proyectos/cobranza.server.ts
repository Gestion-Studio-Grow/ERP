/**
 * Lecturas de la cobranza (ver `cobranza-core.ts`): los cobros registrados y el presupuesto aprobado de los proyectos
 * del negocio. Sólo importa Prisma, para que cualquier lectura de proyectos (también `datos.server.ts`) la use sin ciclos.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { basePrisma } from "@/lib/prisma-base";
import { tenantTransaction } from "@/lib/rls";
import type { Prisma } from "@/generated/prisma/client";
import { cobranza, cobranzaEnMoneda, leerOriginal, pendientesDeCobro, totalAprobado, type Cobranza } from "./cobranza-core";
import { importeDeCentavos } from "@/lib/dinero/redondeo";
import { cambioDeVenta, type CambioDelCobro } from "./gestion-core";

/** Pesos por unidad de cada moneda cargada en el negocio. */
export async function tiposDeCambio(tenantId: string, db: Db = prisma): Promise<Record<string, number>> {
  const filas = await db.proyectoTipoCambio.findMany({ where: { tenantId }, select: { moneda: true, porUnidad: true } });
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
// `ProyectoPago.cuotaId/moneda/montoMonedaCentavos/tipoCambio` llegan con `prisma/pending-gate2/D13_cobro_fijado.sql`
// (Gate 2, puede no estar aplicado) y NO están en el cliente de Prisma (`// GATE2-D13:` en schema.prisma): se escriben y
// leen con SQL crudo. Mismo patrón que `hayColumnaCuotaEnInvoice` (facturar-cuota.server.ts): se pregunta al catálogo SIN
// transacción (leer una columna que falta aborta la transacción en la que corre) y se recuerda sólo el sí.
let _columnasCobroFijado = false;

/**
 * ¿La base tiene las cuatro columnas D13 de `ProyectoPago` CON SUS TIPOS (text, text, bigint, numeric de escala 6)? Con
 * las de la migración vieja (DOUBLE) da `false`: nunca se escriben centavos en una columna de coma flotante. Falla
 * cerrado: sin poder preguntar, `false`.
 */
export async function hayColumnasCobroFijado(): Promise<boolean> {
  if (_columnasCobroFijado) return true;
  const filas = await basePrisma
    .$queryRaw<{ n: bigint | number }[]>`SELECT count(*) AS n FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ProyectoPago' AND (
        (column_name = 'cuotaId' AND data_type = 'text')
        OR (column_name = 'moneda' AND data_type = 'text')
        OR (column_name = 'montoMonedaCentavos' AND data_type = 'bigint')
        OR (column_name = 'tipoCambio' AND data_type = 'numeric' AND numeric_scale = 6))`
    .catch(() => null);
  if (filas === null) return false;
  _columnasCobroFijado = Number(filas[0]?.n ?? 0) === 4;
  return _columnasCobroFijado;
}

/**
 * D13: graba el fijado de un cobro recién creado, en la MISMA transacción que lo creó. El único lugar que escribe las
 * cuatro columnas: una sola vez (`"moneda"` y `"cuotaId"` todavía nulos) y parametrizado. El tipo de cambio va como
 * texto exacto a `numeric`; los centavos, como `bigint`. Llamar sólo con `hayColumnasCobroFijado()` en true.
 */
export async function fijarCobroTx(tx: Db, tenantId: string, pagoId: string, fijado: CambioDelCobro): Promise<void> {
  if (fijado.cuotaId === null && fijado.moneda === null) return;
  await tx.$executeRaw`UPDATE "ProyectoPago"
    SET "cuotaId" = ${fijado.cuotaId}, "moneda" = ${fijado.moneda}, "montoMonedaCentavos" = ${fijado.montoMonedaCentavos}::bigint, "tipoCambio" = ${fijado.tipoCambio}::numeric
    WHERE "id" = ${pagoId} AND "tenantId" = ${tenantId} AND "moneda" IS NULL AND "cuotaId" IS NULL`;
}

/**
 * Las columnas de `ProyectoPago` que existen con o sin el SQL D13. Toda lectura de cobros enteros va con este `select`
 * (si un día se descomentan los campos D13 sin aplicar el SQL, Prisma los pediría y la consulta fallaría).
 */
export const COLUMNAS_PAGO = { id: true, tenantId: true, proyectoId: true, medio: true, monto: true, nota: true, cobradoPor: true, anuladoEl: true, anuladoPor: true, createdAt: true } as const;

/** Sólo para tests: olvida el «sí» recordado (el test que aplica o vuelve atrás el SQL D13 en su base efímera). */
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
 * moneda del proyecto (`montoMonedaCentavos`, en la moneda grabada en `moneda`). Vacío si el interruptor está apagado, si
 * falta el SQL D13 o en proyectos en pesos; se omite el cobro fijado en otra moneda. Los de «Marcar cobrado» se quedan
 * afuera: su valor en la moneda de la cuota ya viaja en el enlace «Asiento». Los centavos se leen como texto y se arman
 * con `BigInt`; el `number` que sale es sólo para la cuenta de pantalla (`importeDeCentavos`).
 */
async function fijadosDeCobros(tenantId: string, proyectos: readonly { moneda?: string; pagos: readonly { id: string }[] }[], db: Db): Promise<Map<string, Original>> {
  const salida = new Map<string, Original>();
  const monedaDe = new Map<string, string>();
  for (const p of proyectos) if (p.moneda && p.moneda !== "ARS") for (const x of p.pagos) monedaDe.set(x.id, p.moneda);
  if (monedaDe.size === 0 || !cobroFijadoActivo() || !(await hayColumnasCobroFijado())) return salida;
  const ids = [...monedaDe.keys()];
  const leer = (q: Db) => q.$queryRaw<{ id: string; moneda: string | null; centavos: string | null }[]>`
    SELECT "id", "moneda", "montoMonedaCentavos"::text AS centavos FROM "ProyectoPago"
    WHERE "tenantId" = ${tenantId} AND "id" = ANY(${ids}::text[])
      AND "cuotaId" IS NULL AND "tipoCambio" > 0 AND "montoMonedaCentavos" IS NOT NULL`;
  // Con RLS, el SQL crudo sólo ve filas adentro de una transacción con el negocio puesto: afuera de una (`db` = el
  // cliente de la app) se abre una para este negocio; adentro de la que graba, se lee en ella (con el candado).
  const filas = db === prisma ? await tenantTransaction((tx) => leer(tx), { tenantId }) : await leer(db);
  // Sólo si se fijó en la moneda que el proyecto tiene HOY: un cobro fijado en otra (el proyecto cambió de moneda después)
  // se valúa como siempre, con el tipo de cambio de hoy.
  for (const f of filas) {
    const moneda = monedaDe.get(f.id)!;
    if (f.moneda === moneda && f.centavos !== null && /^\d+$/.test(f.centavos)) salida.set(f.id, { monto: importeDeCentavos(BigInt(f.centavos)), moneda });
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
