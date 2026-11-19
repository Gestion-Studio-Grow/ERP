// ============================================================================
// MIA T07 (GSG-MIA-149) · el precio «por total» guardado (M3) y el reparto del equipo (M4), en la base.
// Sin M3 o M4 aplicadas (Gate 2) todo sigue como antes: no hay total escrito, no hay foto, no hay reparto, y el envío,
// las cuotas y el tope de cobro salen de los ítems. Se pregunta con `to_regclass`, que no aborta una transacción.
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { centavosDe, sumarAlCentavo } from "@/lib/dinero/redondeo";
import { costoTotalItem } from "./gestion-core";
import { tiposDeCambio } from "./cobranza.server";
import { hayM3, totalesCongelados } from "./precio-foto.server";
import { parametrosDelNegocio } from "./parametros/leer.server";
import { valoresDe } from "./parametros/validar";
import type { Clave } from "./parametros/catalogo";
import {
  ACCION_DIRECCION,
  ACCION_FRENA,
  POR_TOTAL,
  calcularTablero,
  fueraDeRango,
  funcionesSinPersona,
  leerPorcentajes,
  modoPropuesta,
  participantesDeLaFoto,
  porcentajesDelNegocio,
  porcentajesVigentes,
  rangosDelNegocio,
  repartoInicial,
  topeDelNegocio,
  type MiembroEquipo,
  type ModoPropuesta,
  type ParametrosPrecio,
  type ParticipanteFoto,
  type PorcentajesProyecto,
  type RepartoProyecto,
  type Tablero,
} from "./precio-proyecto-core";

type Db = Prisma.TransactionClient | typeof prisma;

export const CLAVES_PRECIO = [
  "precio.modo",
  "precio.rentabilidad",
  "precio.comision",
  "precio.margenError",
  "precio.iibbGa",
  "precio.redondeo.tope",
  "precio.redondeo.medida",
  "precio.redondeo.accion",
  "reparto.conceptos",
  "reparto.matriz",
  "equipo.funciones",
] as const satisfies readonly Clave[];

export { hayM3 };
export async function hayM4(db: Db = prisma): Promise<boolean> {
  const r = await db.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('"ProyectoEquipoReparto"') IS NOT NULL AS ok`;
  return !!r[0]?.ok;
}

/** Lo del catálogo que usa el precio, y qué valores son provisionales (R3: la marca viaja a la foto). Fuera de transacción. */
export interface ContextoPrecio {
  valores: ParametrosPrecio;
  provisionales: string[];
}
export async function contextoDelPrecio(tenantId: string): Promise<ContextoPrecio> {
  const p = await parametrosDelNegocio(tenantId);
  const v = valoresDe(p);
  const valores = Object.fromEntries(CLAVES_PRECIO.map((k) => [k, v[k]])) as unknown as ParametrosPrecio;
  return { valores, provisionales: CLAVES_PRECIO.filter((k) => p[k].provisional) };
}

/** Un candado por proyecto para el precio, el reparto, el envío y la aprobación: de a uno. */
export async function trabarPrecio(tx: Prisma.TransactionClient, tenantId: string, proyectoId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`precio-proyecto:${tenantId}:${proyectoId}`}))`;
}

const num = (b: bigint | null | undefined): number | null => (b === null || b === undefined ? null : Number(b));

export interface FotoPrecio {
  presupuestoId: string;
  version: number;
  ivaPct: number;
  costoOriginal: number;
  adicionales: number;
  subtotal: number;
  iibGa: number;
  totalVenta: number;
  redondeoBruto: number;
  redondeoNeto: number;
  parametros: Record<string, unknown>;
  participantes: ParticipanteFoto[];
  aprobadoPor: string;
  createdAt: Date;
}

export interface EstadoPrecio {
  m3: boolean;
  m4: boolean;
  ctx: ContextoPrecio;
  porTotal: boolean;
  costoOriginal: number;
  adicionales: number;
  totalVenta: number | null;
  vigentes: PorcentajesProyecto;
  /** Los que alguien pidió fuera de rango y esperan a Dirección. */
  pendientes: PorcentajesProyecto | null;
  pendientesPor: string | null;
  pendientesMotivo: string | null;
  topeAprobado: number | null;
  topeAprobadoPor: string | null;
  tablero: Tablero | null;
  equipo: MiembroEquipo[];
  reparto: RepartoProyecto;
  repartoGuardado: boolean;
  foto: FotoPrecio | null;
  /** Lo que frena el envío de la propuesta. Null: sale. */
  freno: string | null;
}

/** El costo original del tablero: los ítems de la versión viva, en pesos, sin IVA, cada uno al centavo. */
async function costoOriginal(db: Db, tenantId: string, proyectoId: string): Promise<number> {
  const [viva, tc] = await Promise.all([
    db.proyectoPresupuesto.findFirst({ where: { tenantId, proyectoId }, orderBy: { version: "desc" }, select: { items: { select: { cantidad: true, costo: true, moneda: true } } } }),
    tiposDeCambio(tenantId, db),
  ]);
  return viva ? centavosDe(sumarAlCentavo(viva.items.map((i) => costoTotalItem(i, tc)))) : 0;
}

/** El equipo del proyecto con la función como id del catálogo. */
async function equipoDe(db: Db, tenantId: string, proyectoId: string): Promise<MiembroEquipo[]> {
  const filas = await db.proyectoEquipo.findMany({ where: { tenantId, proyectoId }, orderBy: { id: "asc" }, select: { id: true, personaId: true, funcion: true, persona: { select: { nombre: true } } } });
  return filas.map((f) => ({ id: f.id, personaId: f.personaId, nombre: f.persona.nombre, funcion: f.funcion }));
}

const aFoto = (f: { presupuestoId: string; version: number; ivaPct: number; costoOriginalCentavos: bigint; adicionalesCentavos: bigint; subtotalCentavos: bigint; iibGaCentavos: bigint; totalVentaCentavos: bigint; redondeoBrutoCentavos: bigint; redondeoNetoCentavos: bigint; parametros: unknown; participantes: unknown; aprobadoPor: string; createdAt: Date }): FotoPrecio => ({
  presupuestoId: f.presupuestoId,
  version: f.version,
  ivaPct: f.ivaPct,
  costoOriginal: Number(f.costoOriginalCentavos),
  adicionales: Number(f.adicionalesCentavos),
  subtotal: Number(f.subtotalCentavos),
  iibGa: Number(f.iibGaCentavos),
  totalVenta: Number(f.totalVentaCentavos),
  redondeoBruto: Number(f.redondeoBrutoCentavos),
  redondeoNeto: Number(f.redondeoNetoCentavos),
  parametros: (f.parametros ?? {}) as Record<string, unknown>,
  participantes: (Array.isArray(f.participantes) ? f.participantes : []) as ParticipanteFoto[],
  aprobadoPor: f.aprobadoPor,
  createdAt: f.createdAt,
});

/** Todo lo del precio de un proyecto. Con `db` = una transacción, lee adentro (y con el candado, si se tomó). */
export async function estadoDelPrecio(tenantId: string, proyectoId: string, ctx: ContextoPrecio, db: Db = prisma): Promise<EstadoPrecio> {
  const [m3, m4] = await Promise.all([hayM3(db), hayM4(db)]);
  const v = ctx.valores;
  const negocio = porcentajesDelNegocio(v);
  const funciones = v["equipo.funciones"];
  const [co, equipo, fila, filasReparto, foto] = await Promise.all([
    costoOriginal(db, tenantId, proyectoId),
    equipoDe(db, tenantId, proyectoId),
    m3 ? db.proyectoPrecio.findUnique({ where: { proyectoId } }) : null,
    m4 ? db.proyectoEquipoReparto.findMany({ where: { tenantId, proyectoId }, select: { equipoId: true, concepto: true, puntos: true } }) : [],
    m3 ? db.proyectoPrecioFoto.findFirst({ where: { tenantId, proyectoId }, orderBy: { version: "desc" } }) : null,
  ]);
  const precio = fila && fila.tenantId === tenantId ? fila : null;
  const vigentes = porcentajesVigentes(precio?.porcentajes, negocio);
  const pendientesLeidos = leerPorcentajes(precio?.pendientes);
  const pendientes = pendientesLeidos ? porcentajesVigentes(pendientesLeidos, negocio) : null;
  const totalVenta = num(precio?.totalVentaCentavos);
  const adicionales = 0;
  let tablero: Tablero | null = null;
  try {
    tablero = calcularTablero({ costoOriginal: co, adicionales, porcentajes: vigentes, funciones, totalVenta, tope: topeDelNegocio(v) });
  } catch {
    tablero = null;
  }
  const repartoGuardado = filasReparto.length > 0;
  const reparto: RepartoProyecto = repartoGuardado
    ? filasReparto.reduce<RepartoProyecto>((r, f) => ({ ...r, [f.concepto]: { ...(r[f.concepto] ?? {}), [f.equipoId]: f.puntos / 100 } }), {})
    : repartoInicial(v["reparto.matriz"], v["reparto.conceptos"], equipo);
  const porTotal = v["precio.modo"] === POR_TOTAL;
  const e: EstadoPrecio = {
    m3,
    m4,
    ctx,
    porTotal,
    costoOriginal: co,
    adicionales,
    totalVenta,
    vigentes,
    pendientes,
    pendientesPor: precio?.pendientesPor ?? null,
    pendientesMotivo: precio?.pendientesMotivo ?? null,
    topeAprobado: num(precio?.topeAprobadoCentavos),
    topeAprobadoPor: precio?.topeAprobadoPor ?? null,
    tablero,
    equipo,
    reparto,
    repartoGuardado,
    foto: foto ? aFoto(foto) : null,
    freno: null,
  };
  e.freno = frenoDelEnvio(e);
  return e;
}

/** Sin total escrito (o con el negocio «por ítem») el envío sigue como siempre. Con total, estas reglas lo frenan (O14, O15, O50). */
export function frenoDelEnvio(e: EstadoPrecio): string | null {
  if (!e.m3 || !e.porTotal || e.totalVenta === null) return null;
  const t = e.tablero;
  if (!t) return "El tablero del precio no cierra: revisá los porcentajes.";
  if (e.pendientes) return "Hay porcentajes fuera del rango del negocio esperando a Dirección.";
  if (t.totalMenorAlSubtotal) return "El total de venta quedó menor que el subtotal del tablero (cambió el costo): corregilo antes de enviar.";
  if (t.pasaTope) {
    const accion = e.ctx.valores["precio.redondeo.accion"];
    if (accion === ACCION_FRENA) return "El redondeo pasa el tope del negocio: bajá el total.";
    if (accion === ACCION_DIRECCION && e.topeAprobado !== t.redondeoBruto) return "El redondeo pasa el tope del negocio: falta que Dirección lo apruebe.";
  }
  const sinPersona = funcionesSinPersona(e.vigentes, e.ctx.valores["reparto.matriz"], e.ctx.valores["equipo.funciones"], e.equipo);
  if (sinPersona.length > 0) return `Falta asignar a alguien del equipo en: ${sinPersona.map((f) => f.nombre).join(", ")}.`;
  return null;
}

/** Para el envío (acciones-ficha): adentro de SU transacción, con el candado del precio. Devuelve el freno o null. */
export async function frenoDelPrecioTx(tx: Prisma.TransactionClient, tenantId: string, proyectoId: string, ctx: ContextoPrecio): Promise<string | null> {
  await trabarPrecio(tx, tenantId, proyectoId);
  return (await estadoDelPrecio(tenantId, proyectoId, ctx, tx)).freno;
}

/** Lo fuera de rango de unos porcentajes, con las funciones del negocio. */
export const fueraDelNegocio = (p: PorcentajesProyecto, ctx: ContextoPrecio) => fueraDeRango(p, rangosDelNegocio(ctx.valores), ctx.valores["equipo.funciones"]);

/**
 * La foto de la aprobación del cliente (O18), en la MISMA transacción que la aprueba: total, renglones del tablero,
 * porcentajes, rangos, tope y participantes con su función y su reparto. Una por versión (índice único): una segunda
 * aprobación no escribe otra. Sólo con M3 y con un total escrito en un negocio «por total». Devuelve si la escribió.
 */
export async function grabarFotoTx(tx: Prisma.TransactionClient, tenantId: string, presupuestoId: string, aprobadoPor: string, ctx: ContextoPrecio): Promise<boolean> {
  if (!(await hayM3(tx))) return false;
  const pr = await tx.proyectoPresupuesto.findFirst({ where: { id: presupuestoId, tenantId }, select: { proyectoId: true, version: true, ivaPct: true, tcVenta: true, proyecto: { select: { moneda: true } } } });
  if (!pr) return false;
  await trabarPrecio(tx, tenantId, pr.proyectoId);
  const e = await estadoDelPrecio(tenantId, pr.proyectoId, ctx, tx);
  const t = e.tablero;
  if (!e.porTotal || e.totalVenta === null || !t || t.totalVenta === null) return false;
  const v = ctx.valores;
  const parametros = {
    modo: v["precio.modo"],
    porcentajes: e.vigentes,
    rangos: rangosDelNegocio(v),
    tope: { pct: v["precio.redondeo.tope"], medida: v["precio.redondeo.medida"], accion: v["precio.redondeo.accion"], aprobadoPor: e.topeAprobadoPor },
    comisiones: t.comisiones,
    rentabilidad: t.rentabilidad,
    margenError: t.margenError,
    redondeoPuntos: t.redondeoPuntos,
    conceptos: v["reparto.conceptos"],
    funciones: v["equipo.funciones"],
    provisionales: ctx.provisionales,
  };
  const participantes = participantesDeLaFoto(e.equipo, e.reparto, v["reparto.conceptos"], e.vigentes, "Empresa");
  const r = await tx.proyectoPrecioFoto.createMany({
    data: [
      {
        tenantId,
        proyectoId: pr.proyectoId,
        presupuestoId,
        version: pr.version,
        modo: POR_TOTAL,
        moneda: pr.proyecto.moneda,
        tcVenta: pr.tcVenta,
        ivaPct: pr.ivaPct,
        costoOriginalCentavos: BigInt(t.costoOriginal),
        adicionalesCentavos: BigInt(t.adicionales),
        subtotalCentavos: BigInt(t.subtotal),
        iibGaCentavos: BigInt(t.iibGa),
        totalVentaCentavos: BigInt(t.totalVenta),
        redondeoBrutoCentavos: BigInt(t.redondeoBruto ?? 0),
        redondeoNetoCentavos: BigInt(t.redondeoNeto ?? 0),
        parametros: parametros as unknown as Prisma.InputJsonValue,
        participantes: participantes as unknown as Prisma.InputJsonValue,
        aprobadoPor: aprobadoPor.slice(0, 120),
      },
    ],
    skipDuplicates: true,
  });
  return r.count > 0;
}

/**
 * O17 · cómo sale la propuesta pública de una versión cuando el negocio cotiza por total. El total es el congelado de la
 * foto; si todavía no hay foto y es la última versión, el del tablero (enviada, no se puede tocar). Null = por ítems.
 * Se lee fuera de toda transacción: sin M3 o sin el catálogo, null (la propuesta sale como siempre).
 */
export async function modoDeLaPropuesta(tenantId: string, v: { id: string; proyectoId: string }, db: Db = prisma): Promise<ModoPropuesta | null> {
  const valores = valoresDe(await parametrosDelNegocio(tenantId, db));
  const vacio = modoPropuesta(valores, null);
  if (!vacio || !(await hayM3(db))) return vacio;
  const congelado = (await totalesCongelados(db, tenantId, [v.id])).get(v.id);
  if (congelado != null) return { ...vacio, neto: congelado };
  const ultima = await db.proyectoPresupuesto.findFirst({ where: { tenantId, proyectoId: v.proyectoId }, orderBy: { version: "desc" }, select: { id: true } });
  if (ultima?.id !== v.id) return vacio;
  const precio = await db.proyectoPrecio.findFirst({ where: { tenantId, proyectoId: v.proyectoId }, select: { totalVentaCentavos: true } });
  return { ...vacio, neto: precio?.totalVentaCentavos == null ? null : Number(precio.totalVentaCentavos) / 100 };
}
