import "server-only";

// ============================================================================
// PADEL-CLASES · T5 — lecturas de PAQUETES y PRECIO POR CLUB (servidor). NO es "use server".
// ============================================================================
//
// Las tres tablas son de la migración 20261110120000_profeturnos_paquetes_precio_club (Gate 2): en
// una base sin aplicar, Prisma contesta P2021 (tabla inexistente). Cada lectura lo captura y cae al
// camino viejo: precio de la lista general (PadelConfig), sin paquetes, sin ventas. Nunca un 500.
//
// OJO: estas lecturas van FUERA de las transacciones de las acciones. Un P2021 adentro de una
// transacción la deja abortada (Postgres 25P02) y se caería todo lo demás; afuera, falla sola.
// Las que corren ADENTRO (paquetesEnTx) sólo las llama quien ya sabe que la tabla existe.
//
// Todo con `tenantId` en el where (además del RLS de las tablas).

import { prisma } from "@/lib/prisma";
import { isTableMissing } from "@/lib/prisma-errors";
import { MEDIO_PAQUETE, listaDelClub, quedanDe, quedanEnTotal, type ListaDePrecios, type PaqueteConUso, type PrecioDeClub } from "./paquetes-core";
import type { Tx } from "./acciones-compartido";

/** Corre la lectura; si la tabla nueva no existe todavía, devuelve `siFalta`. */
export async function tolerante<T>(fn: () => Promise<T>, siFalta: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isTableMissing(e)) return siFalta;
    throw e;
  }
}

const aNumero = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// ── Precio por club ─────────────────────────────────────────────────────────

/** Los precios propios de los clubes del negocio (vacío si no hay o si la tabla no existe). */
export async function preciosPorClub(tenantId: string): Promise<Map<string, PrecioDeClub>> {
  return tolerante(async () => {
    const filas = await prisma.padelPrecioClub.findMany({ where: { tenantId }, select: { clubId: true, precioIndividual: true, precioGrupal: true } });
    return new Map(filas.map((f) => [f.clubId, { precioIndividual: aNumero(f.precioIndividual), precioGrupal: aNumero(f.precioGrupal) }]));
  }, new Map<string, PrecioDeClub>());
}

/** El precio propio de un club, o null (sin fila, sin club, o tabla sin aplicar). */
export async function precioDelClub(tenantId: string, clubId: string | null | undefined): Promise<PrecioDeClub | null> {
  if (!clubId) return null;
  return tolerante(async () => {
    const f = await prisma.padelPrecioClub.findFirst({ where: { tenantId, clubId }, select: { precioIndividual: true, precioGrupal: true } });
    return f ? { precioIndividual: aNumero(f.precioIndividual), precioGrupal: aNumero(f.precioGrupal) } : null;
  }, null);
}

/** La lista de precios que rige para una clase en ese club (sin club: la general). */
export async function listaPara<C extends ListaDePrecios>(tenantId: string, config: C, clubId: string | null | undefined): Promise<C> {
  return listaDelClub(config, await precioDelClub(tenantId, clubId));
}

// ── Paquetes ────────────────────────────────────────────────────────────────

export interface PaqueteDeFicha extends PaqueteConUso {
  quedan: number;
  precio: number;
  pagoMedio: string;
}

/** Usadas = usos cuya clase sigue pagada con PAQUETE (una cancelada volvió al paquete). */
const SELECT_PAQUETE = {
  id: true, clases: true, precio: true, pagoMedio: true, pagadoEl: true, anuladoEl: true,
  _count: { select: { usos: { where: { clase: { pagoEstado: "PAGADO", pagoMedio: MEDIO_PAQUETE } } } } },
} as const;

type FilaPaquete = { id: string; clases: number; precio: unknown; pagoMedio: string; pagadoEl: Date; anuladoEl: Date | null; _count: { usos: number } };

const aFicha = (p: FilaPaquete): PaqueteDeFicha => {
  const base = { id: p.id, clases: p.clases, usadas: p._count.usos, pagadoEl: p.pagadoEl, anuladoEl: p.anuladoEl };
  return { ...base, quedan: quedanDe(base), precio: Number(p.precio), pagoMedio: p.pagoMedio };
};

/** Los paquetes vivos de un alumno con lo usado, ADENTRO de una transacción (la tabla existe). */
export async function paquetesEnTx(tx: Tx, tenantId: string, alumnoId: string): Promise<PaqueteDeFicha[]> {
  const filas = await tx.padelPaquete.findMany({ where: { tenantId, alumnoId, anuladoEl: null }, orderBy: [{ pagadoEl: "asc" }, { id: "asc" }], select: SELECT_PAQUETE });
  return filas.map(aFicha);
}

/**
 * Para la ficha del alumno: sus paquetes (los últimos 10, también los anulados) y cuántas clases le
 * quedan en total. `disponible: false` = la migración no se aplicó (la ficha no muestra la sección).
 */
export async function paquetesDelAlumno(tenantId: string, alumnoId: string): Promise<{ disponible: boolean; quedan: number; paquetes: PaqueteDeFicha[] }> {
  return tolerante<{ disponible: boolean; quedan: number; paquetes: PaqueteDeFicha[] }>(async () => {
    const filas = await prisma.padelPaquete.findMany({ where: { tenantId, alumnoId }, orderBy: [{ pagadoEl: "desc" }, { id: "desc" }], take: 10, select: SELECT_PAQUETE });
    const paquetes = filas.map(aFicha);
    return { disponible: true, quedan: quedanEnTotal(paquetes), paquetes };
  }, { disponible: false, quedan: 0, paquetes: [] });
}

/** Cuántas clases le quedan a un alumno (0 si no tiene o la tabla no existe). Para la hoja «Cobré». */
export async function quedanAlAlumno(tenantId: string, alumnoId: string): Promise<{ disponible: boolean; quedan: number }> {
  return tolerante<{ disponible: boolean; quedan: number }>(async () => {
    const filas = await prisma.padelPaquete.findMany({ where: { tenantId, alumnoId, anuladoEl: null }, select: SELECT_PAQUETE });
    return { disponible: true, quedan: quedanEnTotal(filas.map(aFicha)) };
  }, { disponible: false, quedan: 0 });
}

/**
 * Las ventas de paquetes en [desde, hasta): plata que entró ese día (Hoy, Semana, Plata y el .csv).
 * Los anulados no cuentan. Vacío si la tabla no existe.
 */
export async function ventasDePaquetes(tenantId: string, desde: Date, hasta?: Date): Promise<{ precio: number; pagoMedio: string; pagadoEl: Date; alumno: string }[]> {
  return tolerante(async () => {
    const filas = await prisma.padelPaquete.findMany({
      where: { tenantId, anuladoEl: null, pagadoEl: { gte: desde, ...(hasta ? { lt: hasta } : {}) } },
      orderBy: { pagadoEl: "asc" },
      take: 2000,
      select: { precio: true, pagoMedio: true, pagadoEl: true, alumno: { select: { client: { select: { name: true } } } } },
    });
    return filas.map((f) => ({ precio: Number(f.precio), pagoMedio: f.pagoMedio, pagadoEl: f.pagadoEl, alumno: f.alumno.client.name }));
  }, []);
}
