import "server-only";

// ============================================================================
// PADEL-CLASES — E8 · Clase fija semanal (PadelSerie). Lo que escribe en la base.
// ============================================================================
//
// Una serie es «el mismo alumno, el mismo día y hora, en el mismo club». Sus clases son PadelClase
// comunes (serieId) que nacen CONFIRMADA para las próximas N semanas (N = semanasDeSerie). Las que
// faltan se completan de forma PEREZOSA al abrir Hoy o Semana (completarSeries), sin cron.
//
// Idempotencia: sólo se crean las fechas POSTERIORES a la última clase que ya tiene la serie (con
// cualquier estado: una cancelada no vuelve a nacer) y que no tengan ya una clase a esa hora. Se
// lee y se escribe en `bookingTransaction` (Serializable): dos pantallas que abren a la vez no
// duplican (Postgres aborta una y el reintento ve las de la otra).
//
// Se saltea (y se informa) la semana que choca con otra clase viva (choqueEn) o cae en un bloqueo.
// Deuda anotada: si se saltea la ÚLTIMA semana generada, la próxima pasada la vuelve a intentar
// (no hay columna «generada hasta»); una salteada del medio no se reintenta.

import { prisma } from "@/lib/prisma";
import { bookingTransaction } from "@/lib/rls";
import { logger } from "@/lib/logger";
import { businessWallTimeToUtc, dateStrInBusinessTz, todayInBusinessTz } from "@/lib/datetime";
import { caeEnBloqueo, clasesQueFaltan, esTipoClase, precioDe, semanasDeSerie, sumarDias, type Franja } from "./core";
import { choqueEn, pagoConSaldo, saldoEnTx, type Tx } from "./acciones-compartido";
import type { ConfigPadel } from "./datos.server";

export type Salteada = { empiezaEn: Date; motivo: "ocupado" | "bloqueado" };

export type SerieParaGenerar = {
  id: string;
  alumnoId: string;
  clientId: string;
  clubId: string | null;
  hora: string;
  tipo: string;
  personas: number;
  /** «YYYY-MM-DD» */
  desde: string;
  hasta: string | null;
};

const fechaDb = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

/** El último día que se genera hoy: N semanas desde `desde` (incluye `desde`). */
export const horizonteDesde = (desde: string, diasAdelante: number): string => sumarDias(desde, 7 * semanasDeSerie(diasAdelante) - 1);

/**
 * Crea, ADENTRO de la transacción, las clases que le faltan a una serie hasta `horizonte`. Nunca
 * antes de `noAntesDe`. El saldo a favor paga solas las que cubre, en orden, sin usarlo dos veces.
 */
export async function generarClasesDeSerie(
  tx: Tx,
  p: { tenantId: string; serie: SerieParaGenerar; config: ConfigPadel; franjas: readonly Franja[]; horizonte: string; noAntesDe: Date },
): Promise<{ creadas: { id: string; empiezaEn: Date; precio: unknown; pagoMedio: string | null }[]; salteadas: Salteada[] }> {
  const { tenantId, serie, config } = p;
  const existentes = await tx.padelClase.findMany({ where: { tenantId, serieId: serie.id }, select: { empiezaEn: true } });
  const faltan = clasesQueFaltan({
    serie: { desde: serie.desde, hora: serie.hora, hasta: serie.hasta },
    existentes: existentes.map((e) => e.empiezaEn),
    horizonte: p.horizonte,
    piso: dateStrInBusinessTz(p.noAntesDe),
  }).filter((d) => d.getTime() >= p.noAntesDe.getTime());
  if (!faltan.length) return { creadas: [], salteadas: [] };

  const tipo = esTipoClase(serie.tipo) ? serie.tipo : "INDIVIDUAL";
  const precio = precioDe(config, tipo, serie.personas);
  let saldo = await saldoEnTx(tx, tenantId, serie.alumnoId);
  const creadas: { id: string; empiezaEn: Date; precio: unknown; pagoMedio: string | null }[] = [];
  const salteadas: Salteada[] = [];
  for (const empiezaEn of faltan) {
    const terminaEn = new Date(empiezaEn.getTime() + config.duracionMin * 60_000);
    if (caeEnBloqueo(dateStrInBusinessTz(empiezaEn), p.franjas, empiezaEn, terminaEn, serie.clubId)) {
      salteadas.push({ empiezaEn, motivo: "bloqueado" });
      continue;
    }
    if (await choqueEn(tx, tenantId, empiezaEn, terminaEn)) {
      salteadas.push({ empiezaEn, motivo: "ocupado" });
      continue;
    }
    const conSaldo = pagoConSaldo(saldo, precio);
    if (conSaldo) saldo -= precio;
    const c = await tx.padelClase.create({
      data: {
        tenantId, alumnoId: serie.alumnoId, clientId: serie.clientId, empiezaEn, terminaEn, tipo, personas: serie.personas,
        estado: "CONFIRMADA", confirmadaEl: new Date(), origen: "PROFE", precio, clubId: serie.clubId, serieId: serie.id, ...(conSaldo ?? {}),
      },
      select: { id: true, empiezaEn: true, precio: true, pagoMedio: true },
    });
    creadas.push(c);
  }
  return { creadas, salteadas };
}

/**
 * Generación perezosa (Hoy y Semana): completa las semanas que faltan de las series activas. Una
 * lectura para saber cuáles tienen algo que hacer; sólo esas abren su transacción. Si algo falla se
 * anota y la pantalla sigue (la próxima vez que se abra, lo vuelve a intentar).
 */
export async function completarSeries(
  tenantId: string,
  cargar: () => Promise<{ config: ConfigPadel; franjas: readonly Franja[] }>,
  ahora = new Date(),
): Promise<number> {
  try {
    const hoy = todayInBusinessTz();
    const series = await prisma.padelSerie.findMany({
      where: { tenantId, activa: true, OR: [{ hasta: null }, { hasta: { gte: new Date(`${hoy}T00:00:00.000Z`) } }] },
      select: { id: true, alumnoId: true, clubId: true, hora: true, tipo: true, personas: true, desde: true, hasta: true, alumno: { select: { clientId: true } } },
      take: 200,
    });
    if (!series.length) return 0;
    // La config y las franjas se leen sólo si hay series (el profe sin clases fijas no paga nada).
    const { config, franjas } = await cargar();
    const ultimas = await prisma.padelClase.groupBy({
      by: ["serieId"],
      where: { tenantId, serieId: { in: series.map((s) => s.id) } },
      _max: { empiezaEn: true },
    });
    const ultimaDe = new Map(ultimas.map((u) => [u.serieId, u._max.empiezaEn]));
    const horizonte = horizonteDesde(hoy, config.diasAdelante);
    let total = 0;
    for (const s of series) {
      const serie: SerieParaGenerar = {
        id: s.id, alumnoId: s.alumnoId, clientId: s.alumno.clientId, clubId: s.clubId, hora: s.hora, tipo: s.tipo, personas: s.personas,
        desde: fechaDb(s.desde)!, hasta: fechaDb(s.hasta),
      };
      const ultima = ultimaDe.get(s.id);
      // Atajo sin transacción: si no falta ninguna, no se abre nada.
      const faltan = clasesQueFaltan({ serie, existentes: ultima ? [ultima] : [], horizonte, piso: hoy }).filter((d) => d.getTime() > ahora.getTime());
      if (!faltan.length) continue;
      const r = await bookingTransaction((tx) => generarClasesDeSerie(tx, { tenantId, serie, config, franjas, horizonte, noAntesDe: ahora }), { tenantId });
      total += r.creadas.length;
    }
    return total;
  } catch (e) {
    logger.error("padel.series", "no se pudieron completar las clases fijas", e);
    return 0;
  }
}

/** La primera clase de una serie que arranca en `fecha` a `hora` (hora de pared de Argentina). */
export const inicioDeSerie = (fecha: string, hora: string): Date => businessWallTimeToUtc(fecha, hora);
