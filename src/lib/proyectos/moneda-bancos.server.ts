// MIA-50 · T08 (GSG-MIA-150): lo que las acciones de cobro, pago, orden y liquidación escriben de moneda (M6) y de
// cuenta de banco (M8). Todo adentro de la transacción de quien llama: o entra con el movimiento o no entra.
//
// Sin M6/M8 aplicadas (Gate 2): `hayM6`/`hayM8` lo preguntan con `to_regclass`, que NO falla si la tabla no existe (así
// no aborta la transacción), y las acciones siguen como antes. Cada escritura es ×1 por su índice único
// (tenantId, origenTipo, origenId) con ON CONFLICT DO NOTHING: dos envíos a la vez no mueven el saldo dos veces.

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { redondearAlCentavo } from "@/lib/dinero/redondeo";
import { aCentavos, cambioAplicable, deCentavos, CAMBIO_PESO, diaArgentino, fotoEnPesos, type CambioDelDia, type FotoEnPesos, type OrigenConciliable } from "./moneda-bancos-core";

type Db = Prisma.TransactionClient | PrismaClient;

async function existe(db: Db, tabla: string): Promise<boolean> {
  const [r] = await db.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass(${`public."${tabla}"`}) IS NOT NULL AS ok`;
  return Boolean(r?.ok);
}

/** ¿Está aplicada M6 (historial del cambio y fotos en pesos)? */
export const hayM6 = (db: Db = prisma) => existe(db, "ProyectoCambioDia");
/** ¿Está aplicada M8 (movimientos de cuenta, retenciones y enlace cuota ↔ factura)? */
export const hayM8 = (db: Db = prisma) => existe(db, "ProyectoMovCuenta");

/** El historial del cambio de una moneda, del más nuevo al más viejo. Sin M6: vacío. */
export async function historialDelCambio(tenantId: string, moneda: string, db: Db = prisma): Promise<(CambioDelDia & { cargadoPor: string; createdAt: Date })[]> {
  if (!(await hayM6(db))) return [];
  const filas = await db.proyectoCambioDia.findMany({ where: { tenantId, moneda }, orderBy: { dia: "desc" }, take: 400, select: { dia: true, centavosPorUnidad: true, cargadoPor: true, createdAt: true } });
  return filas.map((f) => ({ dia: f.dia, centavosPorUnidad: Number(f.centavosPorUnidad), cargadoPor: f.cargadoPor, createdAt: f.createdAt }));
}

export type CambioDelMovimiento = { ok: true; cambioCentavos: number; dia: string | null } | { ok: false; error: string };

const fechaCorta = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;

/**
 * O39: el cambio de un movimiento del día `dia`. En pesos, 100. Con historial: el del día o el último anterior; si hay
 * historial y ninguno es de ese día o antes, se rechaza diciéndolo (nunca se usa uno posterior). Sin historial (antes de
 * M6, o sin cargar nunca uno), el cambio único de siempre ("ProyectoTipoCambio"); sin ninguno, también se rechaza.
 */
export async function cambioDelMovimiento(db: Db, tenantId: string, moneda: string, dia: string): Promise<CambioDelMovimiento> {
  if (moneda === "ARS") return { ok: true, cambioCentavos: CAMBIO_PESO, dia: null };
  if (await hayM6(db)) {
    const filas = await db.proyectoCambioDia.findMany({ where: { tenantId, moneda, dia: { lte: dia } }, orderBy: { dia: "desc" }, take: 1, select: { dia: true, centavosPorUnidad: true } });
    const elegido = cambioAplicable(filas.map((f) => ({ dia: f.dia, centavosPorUnidad: Number(f.centavosPorUnidad) })), dia);
    if (elegido) return { ok: true, cambioCentavos: elegido.centavosPorUnidad, dia: elegido.dia };
    if ((await db.proyectoCambioDia.count({ where: { tenantId, moneda } })) > 0) {
      return { ok: false, error: `No hay cambio de ${moneda} cargado para el ${fechaCorta(dia)} ni para un día anterior. Cargalo en Administración › Monedas con esa fecha.` };
    }
  }
  const unico = await db.proyectoTipoCambio.findFirst({ where: { tenantId, moneda }, select: { porUnidad: true } });
  if (unico && unico.porUnidad > 0) return { ok: true, cambioCentavos: aCentavos(unico.porUnidad), dia: null };
  return { ok: false, error: `No hay cambio de ${moneda} cargado. Cargalo en Administración › Monedas.` };
}

export type OrigenMoneda = "COBRO" | "PAGO" | "COMPROBANTE" | "ORDEN_PAGO";

/** O31/O39: la foto en pesos de un movimiento, una sola vez. Sin M6: no hace nada. Devuelve si la escribió. */
export async function guardarFotoTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  d: { origenTipo: OrigenMoneda; origenId: string; foto: FotoEnPesos; cambioDia: string | null; diferenciaCentavos?: number; criterio?: string | null; criterioProvisional?: boolean },
): Promise<boolean> {
  if (!(await hayM6(tx))) return false;
  const r = await tx.proyectoMovMoneda.createMany({
    data: [{
      tenantId,
      origenTipo: d.origenTipo,
      origenId: d.origenId,
      moneda: d.foto.moneda,
      originalCentavos: BigInt(d.foto.originalCentavos),
      cambioCentavos: BigInt(d.foto.cambioCentavos),
      cambioDia: d.cambioDia,
      pesosCentavos: BigInt(d.foto.pesosCentavos),
      diferenciaCentavos: BigInt(d.diferenciaCentavos ?? 0),
      criterio: d.criterio ?? null,
      criterioProvisional: d.criterioProvisional ?? false,
    }],
    skipDuplicates: true,
  });
  return r.count > 0;
}

/** La foto de un movimiento (null si no tiene: anterior a M6, o sin M6). */
export async function fotoDe(db: Db, tenantId: string, origenTipo: OrigenMoneda, origenId: string) {
  if (!(await hayM6(db))) return null;
  return db.proyectoMovMoneda.findFirst({ where: { tenantId, origenTipo, origenId } });
}

/**
 * O38: lo que un cobro, pago, orden o liquidación movió en una cuenta, una sola vez: la fila (índice único por origen) y
 * el saldo van juntos. `importeEnPesos` con signo (+ entra, − sale). Sin M8: no hace nada y devuelve false.
 */
export async function moverCuentaTx(tx: Prisma.TransactionClient, tenantId: string, d: { cuentaId: string; origenTipo: OrigenConciliable; origenId: string; importeEnPesos: number }): Promise<boolean> {
  if (!(await hayM8(tx))) return false;
  const centavos = aCentavos(d.importeEnPesos);
  if (centavos === 0) return false;
  const r = await tx.proyectoMovCuenta.createMany({ data: [{ tenantId, cuentaId: d.cuentaId, origenTipo: d.origenTipo, origenId: d.origenId, importeCentavos: BigInt(centavos) }], skipDuplicates: true });
  if (r.count === 0) return false;
  await tx.proyectoCuentaBanco.updateMany({ where: { id: d.cuentaId, tenantId }, data: { saldo: { increment: centavos / 100 } } });
  return true;
}

/** Anular devuelve el saldo exacto, una sola vez (el UPDATE condicionado a «no anulado» lo hace ×1). */
export async function revertirCuentaTx(tx: Prisma.TransactionClient, tenantId: string, origenTipo: OrigenConciliable, origenId: string): Promise<boolean> {
  if (!(await hayM8(tx))) return false;
  const m = await tx.proyectoMovCuenta.findFirst({ where: { tenantId, origenTipo, origenId, anuladoEl: null }, select: { id: true, cuentaId: true, importeCentavos: true } });
  if (!m) return false;
  const u = await tx.proyectoMovCuenta.updateMany({ where: { id: m.id, tenantId, anuladoEl: null }, data: { anuladoEl: new Date() } });
  if (u.count === 0) return false;
  await tx.proyectoCuentaBanco.updateMany({ where: { id: m.cuentaId, tenantId }, data: { saldo: { decrement: Number(m.importeCentavos) / 100 } } });
  return true;
}

/** La cuenta del negocio con ese id, o null. Un id de otro negocio no existe (filtro por tenant y RLS). */
export async function cuentaDelNegocio(db: Db, tenantId: string, cuentaId: string): Promise<{ id: string; moneda: string } | null> {
  if (!cuentaId) return null;
  return db.proyectoCuentaBanco.findFirst({ where: { id: cuentaId, tenantId }, select: { id: true, moneda: true } });
}

/** El día de hoy en Argentina: el de los movimientos que no traen fecha. */
export const hoyArgentina = () => diaArgentino(new Date());

/**
 * O36: anular un cobro anula también sus retenciones y el cobro «RETENCION» que las contaba como cobradas. Sin M8: nada.
 * Devuelve los ids de esos cobros, para que quien llama reabra su cuota igual que la del cobro.
 */
export async function anularRetencionesDelCobroTx(tx: Prisma.TransactionClient, tenantId: string, pagoId: string, autor: string): Promise<string[]> {
  if (!(await hayM8(tx))) return [];
  const rets = await tx.proyectoCobroRetencion.findMany({ where: { tenantId, pagoId, anuladoEl: null }, select: { id: true, retencionPagoId: true } });
  if (rets.length === 0) return [];
  await tx.proyectoCobroRetencion.updateMany({ where: { tenantId, pagoId, anuladoEl: null }, data: { anuladoEl: new Date() } });
  const ids = [...new Set(rets.map((r) => r.retencionPagoId).filter((x): x is string => Boolean(x)))];
  if (ids.length > 0) await tx.proyectoPago.updateMany({ where: { tenantId, id: { in: ids }, anuladoEl: null }, data: { anuladoEl: new Date(), anuladoPor: autor } });
  return ids;
}

export { fotoEnPesos };

/**
 * O31: el cambio (centavos por unidad) con que se fijó el costo de cada comprobante en otra moneda. Sin foto (anterior a
 * M6, o sin M6), el cambio único de siempre; sin ninguno, 0 (no suma costo en pesos: lo dice la pantalla de Monedas).
 */
export async function cambiosDeComprobantes(db: Db, tenantId: string, comprobantes: readonly { id: string; moneda: string }[]): Promise<Map<string, number>> {
  const salida = new Map<string, number>();
  const otras = comprobantes.filter((c) => c.moneda !== "ARS");
  if (otras.length === 0) return salida;
  const fotos = (await hayM6(db))
    ? await db.proyectoMovMoneda.findMany({ where: { tenantId, origenTipo: "COMPROBANTE", origenId: { in: otras.map((c) => c.id) } }, select: { origenId: true, cambioCentavos: true } })
    : [];
  const porId = new Map(fotos.map((f) => [f.origenId, Number(f.cambioCentavos)]));
  const unicos = new Map((await db.proyectoTipoCambio.findMany({ where: { tenantId }, select: { moneda: true, porUnidad: true } })).map((t) => [t.moneda, aCentavos(t.porUnidad)]));
  for (const c of otras) salida.set(c.id, porId.get(c.id) ?? unicos.get(c.moneda) ?? 0);
  return salida;
}

/** Centavos de un comprobante en su moneda → centavos de peso, con el cambio con que se fijó su costo. */
export function enPesosDelComprobante(centavos: number, moneda: string, cambio: number | undefined): number {
  return moneda === "ARS" ? centavos : Math.round((centavos * (cambio ?? 0)) / CAMBIO_PESO);
}

/** O31: las diferencias de cambio de las órdenes de pago en otra moneda (van a Administración, no al proyecto). */
export async function diferenciasDeCambio(tenantId: string, db: Db = prisma): Promise<{ totalCentavos: number; filas: { origenId: string; moneda: string; originalCentavos: number; cambioCentavos: number; pesosCentavos: number; diferenciaCentavos: number; createdAt: Date }[] }> {
  if (!(await hayM6(db))) return { totalCentavos: 0, filas: [] };
  const todas = await db.proyectoMovMoneda.findMany({ where: { tenantId, origenTipo: "ORDEN_PAGO", NOT: { diferenciaCentavos: BigInt(0) } }, orderBy: { createdAt: "desc" }, take: 200 });
  // Una orden anulada devolvió su plata: su diferencia de cambio tampoco cuenta.
  const anuladas = new Set((await db.proyectoOrdenPago.findMany({ where: { tenantId, id: { in: todas.map((f) => f.origenId) }, estado: "ANULADA" }, select: { id: true } })).map((o) => o.id));
  const filas = todas.filter((f) => !anuladas.has(f.origenId));
  const salida = filas.map((f) => ({ origenId: f.origenId, moneda: f.moneda, originalCentavos: Number(f.originalCentavos), cambioCentavos: Number(f.cambioCentavos), pesosCentavos: Number(f.pesosCentavos), diferenciaCentavos: Number(f.diferenciaCentavos), createdAt: f.createdAt }));
  return { totalCentavos: salida.reduce((s, f) => s + f.diferenciaCentavos, 0), filas: salida };
}

// ── Lecturas para Administración (O35, O38) ─────────────────────────────────

export interface ACobrarDeCuota {
  cuotaId: string;
  tramo: string | null;
  factura: { id: string; puntoVenta: number; numero: number | null; tipoComprobante: number | null; status: string } | null;
  /** Lo facturado (total de la factura enlazada), en pesos. */
  facturado: number;
  /** Lo cobrado contra la cuota en pesos: lo que entró al banco más lo retenido que cuenta como cobrado. */
  cobrado: number;
  /** Lo retenido (O36), en pesos. */
  retenido: number;
}

/**
 * O35: por cada cuota de cobro, su factura (tramo), lo facturado, lo cobrado y lo retenido. Lo cobrado sale de los
 * cobros vigentes unidos a la cuota (el «Asiento» de la cuota, el mismo enlace que usa anular). Sin M8: vacío.
 */
export async function aCobrarPorCuota(tenantId: string, cuotaIds: readonly string[], db: Db = prisma): Promise<Map<string, ACobrarDeCuota>> {
  const salida = new Map<string, ACobrarDeCuota>();
  if (cuotaIds.length === 0 || !(await hayM8(db))) return salida;
  const [enlacesFactura, enlacesPago, retenciones] = await Promise.all([
    db.proyectoCuotaFactura.findMany({ where: { tenantId, cuotaId: { in: [...cuotaIds] } }, select: { cuotaId: true, tramo: true, factura: { select: { id: true, puntoVenta: true, numero: true, tipoComprobante: true, status: true, total: true } } } }),
    db.proyectoCambio.findMany({ where: { tenantId, entidad: "ProyectoCuota", campo: "Asiento", entidadId: { in: [...cuotaIds] } }, select: { entidadId: true, despues: true } }),
    db.proyectoCobroRetencion.findMany({ where: { tenantId, cuotaId: { in: [...cuotaIds] }, anuladoEl: null }, select: { cuotaId: true, importeCentavos: true } }),
  ]);
  const pagoIds = enlacesPago.map((e) => e.despues).filter((x): x is string => Boolean(x));
  const pagos = new Map((await db.proyectoPago.findMany({ where: { tenantId, id: { in: pagoIds }, anuladoEl: null }, select: { id: true, monto: true } })).map((p) => [p.id, p.monto]));
  for (const id of cuotaIds) salida.set(id, { cuotaId: id, tramo: null, factura: null, facturado: 0, cobrado: 0, retenido: 0 });
  for (const e of enlacesFactura) {
    const f = e.factura;
    Object.assign(salida.get(e.cuotaId)!, { tramo: e.tramo, factura: { id: f.id, puntoVenta: f.puntoVenta, numero: f.numero, tipoComprobante: f.tipoComprobante, status: String(f.status) }, facturado: Number(f.total) });
  }
  for (const e of enlacesPago) {
    const monto = e.despues ? pagos.get(e.despues) : undefined;
    const fila = e.entidadId ? salida.get(e.entidadId) : undefined;
    if (fila && monto !== undefined) fila.cobrado = redondearAlCentavo(fila.cobrado + monto);
  }
  for (const r of retenciones) {
    const fila = r.cuotaId ? salida.get(r.cuotaId) : undefined;
    if (fila) fila.retenido = redondearAlCentavo(fila.retenido + deCentavos(r.importeCentavos));
  }
  return salida;
}

/** O38: contra qué está conciliado cada movimiento del extracto (cobro, pago, orden o liquidación). Sin M8: vacío. */
export async function origenesDeMovimientos(tenantId: string, ids: readonly string[], db: Db = prisma): Promise<Map<string, { origenTipo: string; origenId: string }>> {
  if (ids.length === 0 || !(await hayM8(db))) return new Map();
  const filas = await db.proyectoMovBanco.findMany({ where: { tenantId, id: { in: [...ids] }, origenTipo: { not: null } }, select: { id: true, origenTipo: true, origenId: true } });
  return new Map(filas.map((f) => [f.id, { origenTipo: f.origenTipo!, origenId: f.origenId! }]));
}

/**
 * O38: lo que movió cada cuenta (cobros, pagos, órdenes y sueldos), vigente y todavía sin conciliar: los candidatos
 * para conciliar un movimiento del extracto de esa cuenta. Sin M8: vacío.
 */
export async function movimientosParaConciliar(tenantId: string, db: Db = prisma): Promise<{ cuentaId: string; origenTipo: OrigenConciliable; origenId: string; importe: number; createdAt: Date }[]> {
  if (!(await hayM8(db))) return [];
  const [movs, usados] = await Promise.all([
    db.proyectoMovCuenta.findMany({ where: { tenantId, anuladoEl: null }, orderBy: { createdAt: "desc" }, take: 300, select: { cuentaId: true, origenTipo: true, origenId: true, importeCentavos: true, createdAt: true } }),
    db.proyectoMovBanco.findMany({ where: { tenantId, origenTipo: { not: null } }, select: { origenTipo: true, origenId: true } }),
  ]);
  const ya = new Set(usados.map((u) => `${u.origenTipo}|${u.origenId}`));
  return movs
    .filter((m) => !ya.has(`${m.origenTipo}|${m.origenId}`))
    .map((m) => ({ cuentaId: m.cuentaId, origenTipo: m.origenTipo as OrigenConciliable, origenId: m.origenId, importe: Number(m.importeCentavos) / 100, createdAt: m.createdAt }));
}

/** O35: las facturas recientes del negocio para enlazar a una cuota (las más nuevas primero). Sin M8: ninguna. */
export async function facturasParaEnlazar(tenantId: string, db: Db = prisma): Promise<{ id: string; texto: string }[]> {
  if (!(await hayM8(db))) return [];
  const filas = await db.invoice.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, puntoVenta: true, numero: true, total: true, fecha: true } });
  const pv = (n: number) => String(n).padStart(4, "0");
  return filas.map((f) => ({ id: f.id, texto: `${pv(f.puntoVenta)}-${f.numero != null ? String(f.numero).padStart(8, "0") : "sin número"} · $ ${Number(f.total).toLocaleString("es-AR", { maximumFractionDigits: 2 })}${f.fecha ? ` · ${f.fecha.slice(6, 8)}/${f.fecha.slice(4, 6)}/${f.fecha.slice(0, 4)}` : ""}` }));
}
