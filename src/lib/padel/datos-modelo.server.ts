import "server-only";

// ============================================================================
// PADEL-CLASES · T4 — lecturas del modelo nuevo (clubes, turnos fijos, paquetes, grupales, plata
// con el club). Las consumen las pantallas de la Tanda 5.
// ============================================================================
//
// Todas acotadas por `tenantId` y todas toleran una base SIN la migración 20261023120000 (Gate 2):
// si `modeloT4()` dice que no está, devuelven `{ disponible: false }` o la lista vacía, nunca un 500.
// Las pantallas del panel piden su permiso antes (requireApp), como el resto de datos.server.ts.
//
// No importa datos.server.ts a propósito (datos.server.ts importa `reservasEntre` de acá).

import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { businessWallTimeToUtc, dateStrInBusinessTz } from "@/lib/datetime";
import {
  claveOcurrencia,
  cuentaConElClub,
  estadoPaquete,
  lugaresLibres,
  margenDeLaClase,
  resumenCobroGrupal,
  reservasDeSeries,
  textoPaquete,
  type ClubBase,
  type SerieBase,
} from "./core";
import { modeloT4 } from "./modelo.server";

const fechaDe = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);
const aFechaDb = (f: string) => new Date(`${f}T00:00:00.000Z`);

export const SELECT_SERIE = {
  id: true, alumnoId: true, diaSemana: true, hora: true, duracionMin: true, tipo: true, personas: true, clubId: true,
  desde: true, hasta: true, pausadaDesde: true, pausadaHasta: true, activa: true,
} as const;

type FilaSerie = { id: string; diaSemana: number; hora: string; duracionMin: number; desde: Date; hasta: Date | null; pausadaDesde: Date | null; pausadaHasta: Date | null; activa: boolean };

/** La fila de la base como la entiende el motor puro. */
export const serieBase = (s: FilaSerie): SerieBase => ({
  id: s.id,
  diaSemana: s.diaSemana,
  hora: s.hora,
  duracionMin: s.duracionMin,
  desde: fechaDe(s.desde)!,
  hasta: fechaDe(s.hasta),
  pausadaDesde: fechaDe(s.pausadaDesde),
  pausadaHasta: fechaDe(s.pausadaHasta),
  activa: s.activa,
});

/** El `where` de las series activas de un negocio que tocan [desde, hasta] ("YYYY-MM-DD"). */
export const filtroSeriesActivas = (tenantId: string, desde: string, hasta: string) => ({
  tenantId,
  activa: true,
  desde: { lte: aFechaDb(hasta) },
  OR: [{ hasta: null }, { hasta: { gte: aFechaDb(desde) } }],
});

/** Las claves (serie|fecha) de las ocurrencias que ya son clase. */
export const clavesGeneradas = (filas: readonly { serieId: string | null; serieFecha: Date | null }[]): Set<string> =>
  new Set(filas.filter((f) => f.serieId && f.serieFecha).map((f) => claveOcurrencia(f.serieId!, fechaDe(f.serieFecha)!)));

/** Las series activas de un negocio que tocan [desde, hasta] ("YYYY-MM-DD"). Fuera de transacciones. */
export async function seriesActivas(tenantId: string, desde: string, hasta: string) {
  return prisma.padelSerie.findMany({ where: filtroSeriesActivas(tenantId, desde, hasta), select: SELECT_SERIE });
}

/** Las ocurrencias de series que ya son clase en [desde, hasta] (en cualquier estado). Fuera de transacciones. */
export async function ocurrenciasGeneradas(tenantId: string, serieIds: readonly string[], desde: string, hasta: string): Promise<Set<string>> {
  if (!serieIds.length) return new Set();
  const filas = await prisma.padelClase.findMany({
    where: { tenantId, serieId: { in: [...serieIds] }, serieFecha: { gte: aFechaDb(desde), lte: aFechaDb(hasta) } },
    select: { serieId: true, serieFecha: true },
  });
  return clavesGeneradas(filas);
}

/**
 * M-116: lo que los turnos fijos tienen reservado entre dos instantes y todavía no es clase. Sin la
 * migración, nada (no hay series). Lo usa datos.server.ts para que el turnero no ofrezca esa hora.
 */
export async function reservasEntre(tenantId: string, desde: Date, hasta: Date): Promise<{ id: string; empiezaEn: Date; terminaEn: Date }[]> {
  if (!(await modeloT4())) return [];
  const d = dateStrInBusinessTz(desde);
  const h = dateStrInBusinessTz(hasta);
  const series = await seriesActivas(tenantId, d, h);
  if (!series.length) return [];
  const generadas = await ocurrenciasGeneradas(tenantId, series.map((s) => s.id), d, h);
  return reservasDeSeries(series.map(serieBase), d, h, generadas)
    .filter((r) => r.endsAt > desde && r.startsAt < hasta)
    .map((r, i) => ({ id: `serie-reservada-${i}`, empiezaEn: r.startsAt, terminaEn: r.endsAt }));
}

// ── Clubes ──────────────────────────────────────────────────────────────────

const SELECT_CLUB = { id: true, nombre: true, direccion: true, mapsUrl: true, trasladoMin: true, costoCancha: true, modoCobroClub: true, techada: true, activo: true } as const;

export type ClubPanel = ClubBase & { direccion: string | null; mapsUrl: string | null; techada: boolean; activo: boolean };

const aClub = (c: { id: string; nombre: string; direccion: string | null; mapsUrl: string | null; trasladoMin: number; costoCancha: unknown; modoCobroClub: string | null; techada: boolean; activo: boolean }): ClubPanel => ({
  ...c,
  costoCancha: c.costoCancha == null ? null : Number(c.costoCancha),
});

/** Los clubes del profe (activos primero). `disponible: false` = la base todavía no tiene la T4. */
export async function clubes(tenantIdForzado?: string): Promise<{ disponible: boolean; clubes: ClubPanel[] }> {
  if (!(await modeloT4())) return { disponible: false, clubes: [] };
  const tenantId = tenantIdForzado ?? (await getCurrentTenantId());
  const filas = await prisma.padelClub.findMany({ where: { tenantId }, orderBy: [{ activo: "desc" }, { nombre: "asc" }], select: SELECT_CLUB });
  return { disponible: true, clubes: filas.map(aClub) };
}

/** Un club del negocio (para acciones y para Maps), o null. */
export async function clubDelNegocio(tenantId: string, clubId: string): Promise<ClubPanel | null> {
  const c = await prisma.padelClub.findFirst({ where: { tenantId, id: clubId }, select: SELECT_CLUB });
  return c ? aClub(c) : null;
}

// ── Turnos fijos ────────────────────────────────────────────────────────────

/** Los turnos fijos de un alumno (o de todos), con su club. */
export async function series(p: { alumnoId?: string; soloActivas?: boolean } = {}) {
  if (!(await modeloT4())) return { disponible: false as const, series: [] };
  const tenantId = await getCurrentTenantId();
  const filas = await prisma.padelSerie.findMany({
    where: { tenantId, ...(p.alumnoId ? { alumnoId: p.alumnoId } : {}), ...(p.soloActivas ? { activa: true } : {}) },
    orderBy: [{ diaSemana: "asc" }, { hora: "asc" }],
    select: { ...SELECT_SERIE, club: { select: { id: true, nombre: true } }, alumno: { select: { client: { select: { name: true } } } } },
  });
  return {
    disponible: true as const,
    series: filas.map((s) => ({ ...serieBase(s), alumnoId: s.alumnoId, tipo: s.tipo, personas: s.personas, club: s.club, nombre: s.alumno.client.name })),
  };
}

// ── Paquetes ────────────────────────────────────────────────────────────────

/** Los paquetes que vende el profe (Ajustes → Paquetes, y los chips de «Vender paquete»). */
export async function paquetes() {
  if (!(await modeloT4())) return { disponible: false as const, paquetes: [] };
  const tenantId = await getCurrentTenantId();
  const filas = await prisma.padelPaquete.findMany({
    where: { tenantId },
    orderBy: [{ activo: "desc" }, { clases: "asc" }],
    select: { id: true, nombre: true, clases: true, precio: true, venceDias: true, activo: true },
  });
  return { disponible: true as const, paquetes: filas.map((p) => ({ ...p, precio: Number(p.precio) })) };
}

/** Los paquetes de un alumno con lo que le queda («4 de 4 · vence 22/11», «1 clase vencida»). */
export async function paquetesDelAlumno(alumnoId: string, ahora = new Date(), tenantIdForzado?: string) {
  if (!(await modeloT4())) return { disponible: false as const, paquetes: [] };
  const tenantId = tenantIdForzado ?? (await getCurrentTenantId());
  const filas = await prisma.padelPaqueteAlumno.findMany({
    where: { tenantId, alumnoId },
    orderBy: { compradoEl: "desc" },
    take: 10,
    select: { id: true, clasesTotal: true, clasesUsadas: true, precio: true, pagoEstado: true, pagoMedio: true, compradoEl: true, venceEl: true, extendidoHasta: true, paquete: { select: { nombre: true } } },
  });
  return {
    disponible: true as const,
    paquetes: filas.map((p) => ({
      id: p.id,
      nombre: p.paquete.nombre,
      clasesTotal: p.clasesTotal,
      clasesUsadas: p.clasesUsadas,
      precio: Number(p.precio),
      pagoEstado: p.pagoEstado,
      pagoMedio: p.pagoMedio,
      compradoEl: p.compradoEl,
      venceEl: p.venceEl,
      extendidoHasta: p.extendidoHasta,
      ...estadoPaquete(p, ahora),
      texto: textoPaquete(p, ahora),
    })),
  };
}

// ── Grupales con participantes ─────────────────────────────────────────────

/** Los participantes de una clase y «1 de 3 pagaron» (M-120/M-121). */
export async function participantesDeClase(claseId: string, tenantIdForzado?: string) {
  if (!(await modeloT4())) return { disponible: false as const, participantes: [], resumen: null };
  const tenantId = tenantIdForzado ?? (await getCurrentTenantId());
  const filas = await prisma.padelParticipante.findMany({
    where: { tenantId, claseId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, alumnoId: true, nombre: true, precio: true, pagoEstado: true, pagoMedio: true, comprobanteEnviadoEl: true, pagoNota: true,
      alumno: { select: { client: { select: { name: true } } } },
    },
  });
  const ps = filas.map(({ alumno, ...p }) => ({ ...p, precio: Number(p.precio), nombre: alumno?.client.name ?? p.nombre ?? null }));
  return { disponible: true as const, participantes: ps, resumen: resumenCobroGrupal(ps) };
}

/**
 * Las grupales abiertas con lugar, para el turnero (M-140: «Sáb 10:00 · Grupal · quedan 2»). PÚBLICA:
 * nunca devuelve nombres ni celulares de los anotados (M-141), sólo cuántos lugares quedan.
 */
export async function grupalesAbiertas(tenantId: string, ahora = new Date()) {
  if (!(await modeloT4())) return [];
  const filas = await prisma.padelClase.findMany({
    where: { tenantId, tipo: "GRUPAL", estado: "CONFIRMADA", cupo: { not: null }, pagoEstado: "POR_PARTICIPANTE", empiezaEn: { gt: ahora } },
    orderBy: { empiezaEn: "asc" },
    take: 20,
    select: { id: true, empiezaEn: true, terminaEn: true, cupo: true, clubId: true, participantes: { select: { alumnoId: true, nombre: true } } },
  });
  return filas
    .map((c) => ({ claseId: c.id, empiezaEn: c.empiezaEn, terminaEn: c.terminaEn, clubId: c.clubId, quedan: lugaresLibres(c.cupo, c.participantes) }))
    .filter((c) => c.quedan > 0);
}

// ── Plata con el club ───────────────────────────────────────────────────────

/**
 * «Cuenta con el club»: por club, lo que el profe le debe en el período [desde, hasta), y el margen
 * total (lo cobrado de esas clases − la cancha). Una lectura de clubes y una de clases.
 */
export async function cuentasConClubes(desde: Date, hasta: Date) {
  if (!(await modeloT4())) return { disponible: false as const, clubes: [], margen: null };
  const tenantId = await getCurrentTenantId();
  const [cs, clases] = await Promise.all([
    prisma.padelClub.findMany({ where: { tenantId }, select: SELECT_CLUB }),
    prisma.padelClase.findMany({
      where: { tenantId, clubId: { not: null }, empiezaEn: { gte: desde, lt: hasta } },
      select: { clubId: true, estado: true, empiezaEn: true, terminaEn: true, costoCancha: true, precio: true },
    }),
  ]);
  const cuentas = cs.map(aClub).map((c) => cuentaConElClub(c, clases, { desde, hasta }));
  const dadas = clases.filter((c) => c.estado === "DADA" || c.estado === "AUSENTE");
  const margenes = dadas.map((c) => margenDeLaClase(c));
  return {
    disponible: true as const,
    clubes: cuentas,
    margen: {
      ingreso: margenes.reduce((s, m) => s + m.ingreso, 0),
      costo: margenes.reduce((s, m) => s + m.costo, 0),
      margen: margenes.reduce((s, m) => s + m.margen, 0),
      sinCosto: margenes.filter((m) => !m.costoConocido).length,
    },
  };
}

/** Desde y hasta del mes de `fecha` ("YYYY-MM-DD"), en la hora del negocio (para cuentasConClubes). */
export function mesDe(fecha: string): { desde: Date; hasta: Date } {
  const y = Number(fecha.slice(0, 4));
  const m = Number(fecha.slice(5, 7));
  const sig = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { desde: businessWallTimeToUtc(`${fecha.slice(0, 8)}01`, "00:00"), hasta: businessWallTimeToUtc(sig, "00:00") };
}
