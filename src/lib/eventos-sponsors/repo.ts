// ============================================================================
// EVENTOS Y SPONSORS — acceso a la base (GSG-CRM-009).
// ============================================================================
//
// Todo pasa por `tenantTransaction({ tenantId })` (RLS por negocio) y además filtra `tenantId` a
// mano: con RLS apagado el filtro explícito es lo único que acota. La tabla ausente (migración
// 20261114231500_eventos_y_sponsors sin aplicar, Gate 2) no es un 500: vuelve `faltaMigracion`.
//
// La importación no duplica: `createMany({ skipDuplicates })` sobre las llaves únicas
// (tenantId, clave) y (tenantId, eventoId, marcaId, rol) = INSERT … ON CONFLICT DO NOTHING, que es
// atómico aunque dos importaciones corran a la vez. Lo que ya existía no se pisa.

import { createHash } from "node:crypto";
import { tenantTransaction } from "@/lib/rls";
import { isPrismaError } from "@/lib/prisma-errors";
import { diaADate, PUESTOS, ROLES, VERIFICACIONES, type AccionDeLote, type EventoDeLote, type FiltrosEventos, type PedidoValido, type Puesto, type Rol, type Verificacion } from "./core";

export const FALTA_MIGRACION = { faltaMigracion: true } as const;
type ConBase<T> = typeof FALTA_MIGRACION | ({ faltaMigracion: false } & T);

/** ¿El error es «la tabla no existe» (migración sin aplicar)? */
export function esFaltaDeTabla(e: unknown): boolean {
  if (isPrismaError(e, "P2021")) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /relation "(EventoRelevado|MarcaRelevada|EventoMarca|AccionDelEquipo|PedidoAlEquipo)" does not exist/.test(msg);
}

async function conBase<T>(fn: () => Promise<T>): Promise<ConBase<T>> {
  try {
    return { faltaMigracion: false, ...(await fn()) };
  } catch (e) {
    if (esFaltaDeTabla(e)) return FALTA_MIGRACION;
    throw e;
  }
}

const TOPE_LISTA = 300;

export interface FilaEvento {
  id: string;
  nombre: string;
  fecha: Date;
  fechaHasta: Date | null;
  lugar: string;
  region: string;
  organizador: string | null;
  tipo: string | null;
  verificacion: string;
  marcas: number;
}

/** Eventos del negocio, filtrados por región (exacta, sin mayúsculas) y por rango de fechas. */
export function listarEventos(tenantId: string, f: FiltrosEventos) {
  return conBase(() =>
    tenantTransaction(
      async (tx) => {
        const fecha = {
          ...(f.desde ? { gte: diaADate(f.desde) } : {}),
          ...(f.hasta ? { lte: diaADate(f.hasta) } : {}),
        };
        const [filas, regiones] = await Promise.all([
          tx.eventoRelevado.findMany({
            where: {
              tenantId,
              ...(f.region ? { region: { equals: f.region, mode: "insensitive" as const } } : {}),
              ...(f.desde || f.hasta ? { fecha } : {}),
            },
            orderBy: [{ fecha: "asc" }, { nombre: "asc" }],
            take: TOPE_LISTA,
            select: {
              id: true,
              nombre: true,
              fecha: true,
              fechaHasta: true,
              lugar: true,
              region: true,
              organizador: true,
              tipo: true,
              verificacion: true,
              _count: { select: { marcas: true } },
            },
          }),
          tx.eventoRelevado.findMany({ where: { tenantId }, distinct: ["region"], orderBy: { region: "asc" }, select: { region: true }, take: TOPE_LISTA }),
        ]);
        return {
          eventos: filas.map(({ _count, ...e }): FilaEvento => ({ ...e, marcas: _count.marcas })),
          regiones: regiones.map((r) => r.region),
          tope: filas.length === TOPE_LISTA,
        };
      },
      { tenantId },
    ),
  );
}

export interface MarcaEnEvento {
  marcaId: string;
  nombre: string;
  rubro: string | null;
  rol: Rol;
  nivel: string | null;
  urlFuente: string;
  edicion: string | null;
  verificacion: string;
  registro: LineaDeRegistro[];
}

export interface LineaDeRegistro {
  puesto: string;
  accion: string;
  hora: Date;
  url: string | null;
  detalle: string | null;
}

/** La ficha de un evento con sus marcas. `evento: null` si no es de este negocio o no existe. */
export function fichaEvento(tenantId: string, id: string) {
  return conBase(() =>
    tenantTransaction(
      async (tx) => {
        const e = await tx.eventoRelevado.findFirst({
          where: { id, tenantId },
          select: {
            id: true,
            nombre: true,
            fecha: true,
            fechaHasta: true,
            lugar: true,
            region: true,
            organizador: true,
            urlFuente: true,
            tipo: true,
            verificacion: true,
            clave: true,
            marcas: {
              where: { tenantId },
              orderBy: { marca: { nombre: "asc" } },
              select: { rol: true, nivel: true, urlFuente: true, edicion: true, verificacion: true, marca: { select: { id: true, nombre: true, rubro: true, clave: true } } },
            },
          },
        });
        if (!e) return { evento: null };
        const { marcas, clave, ...resto } = e;
        const lineas = await tx.accionDelEquipo.findMany({
          where: { tenantId, eventoClave: clave },
          orderBy: { hora: "asc" },
          take: 2_000,
          select: { puesto: true, accion: true, hora: true, url: true, detalle: true, marcaClave: true, rol: true },
        });
        const deLaMarca = (mc: string | null, rol: string | null) =>
          lineas.filter((l) => l.marcaClave === mc && l.rol === rol).map(({ marcaClave: _m, rol: _r, ...l }): LineaDeRegistro => l);
        return {
          evento: {
            ...resto,
            // Por jerarquía del rol (sponsor principal primero), no por orden alfabético; la base ya ordenó por nombre.
            registro: deLaMarca(null, null),
            marcas: marcas
              .map((m): MarcaEnEvento => ({
                marcaId: m.marca.id,
                nombre: m.marca.nombre,
                rubro: m.marca.rubro,
                rol: m.rol as Rol,
                nivel: m.nivel,
                urlFuente: m.urlFuente,
                edicion: m.edicion,
                verificacion: m.verificacion,
                registro: deLaMarca(m.marca.clave, m.rol),
              }))
              .sort((a, b) => ROLES.indexOf(a.rol) - ROLES.indexOf(b.rol)),
          },
        };
      },
      { tenantId },
    ),
  );
}

export interface FilaMarca {
  id: string;
  nombre: string;
  rubro: string | null;
  eventos: number;
}

/** Marcas del negocio (búsqueda por nombre opcional), con en cuántos eventos aparecen. */
export function listarMarcas(tenantId: string, q: string | null) {
  return conBase(() =>
    tenantTransaction(
      async (tx) => {
        const filas = await tx.marcaRelevada.findMany({
          where: { tenantId, ...(q ? { nombre: { contains: q, mode: "insensitive" as const } } : {}) },
          orderBy: { nombre: "asc" },
          take: TOPE_LISTA,
          select: { id: true, nombre: true, rubro: true, _count: { select: { eventos: true } } },
        });
        return { marcas: filas.map(({ _count, ...m }): FilaMarca => ({ ...m, eventos: _count.eventos })), tope: filas.length === TOPE_LISTA };
      },
      { tenantId },
    ),
  );
}

/** La vista por marca: en qué eventos está, con su rol y la fuente. */
export function fichaMarca(tenantId: string, id: string) {
  return conBase(() =>
    tenantTransaction(
      async (tx) => {
        const m = await tx.marcaRelevada.findFirst({
          where: { id, tenantId },
          select: {
            id: true,
            nombre: true,
            rubro: true,
            web: true,
            eventos: {
              where: { tenantId },
              orderBy: { evento: { fecha: "asc" } },
              select: {
                rol: true,
                nivel: true,
                urlFuente: true,
                edicion: true,
                verificacion: true,
                evento: { select: { id: true, nombre: true, fecha: true, fechaHasta: true, lugar: true, region: true } },
              },
            },
          },
        });
        return { marca: m };
      },
      { tenantId },
    ),
  );
}

export interface ResultadoImportacion {
  eventosNuevos: number;
  eventosExistentes: number;
  marcasNuevas: number;
  marcasExistentes: number;
  relacionesNuevas: number;
  relacionesExistentes: number;
  /** Eventos y marcas-en-evento a los que el lote les cambió la verificación (el Verificador volvió a mirar). */
  verificacionesActualizadas: number;
  accionesNuevas: number;
}

/** Huella de una línea del registro: la misma línea en dos importaciones es una sola. */
export function claveDeAccion(eventoClave: string, marcaClave: string | null, rol: string | null, a: AccionDeLote): string {
  return createHash("sha256").update(JSON.stringify([eventoClave, marcaClave, rol, a.puesto, a.hora, a.accion, a.url, a.detalle])).digest("hex").slice(0, 40);
}

const TANDA = 500;
function enTandas<T>(xs: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += TANDA) out.push(xs.slice(i, i + TANDA));
  return out;
}

/**
 * Importa un lote YA VALIDADO (`validarLote`). Idempotente: correrlo dos veces no duplica nada.
 * Una sola transacción: o entra el lote entero o nada.
 */
export function importarLote(tenantId: string, eventos: readonly EventoDeLote[]) {
  return conBase(() =>
    tenantTransaction(
      async (tx): Promise<ResultadoImportacion> => {
        // 0) Una importación a la vez por negocio: dos lotes en paralelo se trababan (deadlock) o vencían el tope de
        //    5 s esperándose. La segunda no espera: avisa y se reintenta. El candado se suelta solo al cerrar la transacción.
        const [candado] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${`eventos-sponsors:importar:${tenantId}`})) AS ok`;
        if (!candado?.ok) throw new ImportacionEnCurso();

        // 1) Eventos.
        const clavesEv = eventos.map((e) => e.clave);
        const nuevosEv = await tx.eventoRelevado.createMany({
          data: eventos.map((e) => ({
            tenantId,
            clave: e.clave,
            nombre: e.nombre,
            fecha: diaADate(e.fecha),
            fechaHasta: e.fechaHasta ? diaADate(e.fechaHasta) : null,
            lugar: e.lugar,
            region: e.region,
            organizador: e.organizador,
            urlFuente: e.urlFuente,
            tipo: e.tipo,
            verificacion: e.verificacion,
            origen: "IMPORTACION",
          })),
          skipDuplicates: true,
        });
        // Lo que ya existía no se pisa, salvo la verificación: el último informe del Verificador manda.
        let verificacionesActualizadas = 0;
        for (const v of VERIFICACIONES) {
          for (const claves of enTandas(eventos.filter((e) => e.verificacion === v).map((e) => e.clave))) {
            verificacionesActualizadas += (await tx.eventoRelevado.updateMany({ where: { tenantId, clave: { in: claves }, verificacion: { not: v } }, data: { verificacion: v } })).count;
          }
        }
        const idEv = new Map(
          (await tx.eventoRelevado.findMany({ where: { tenantId, clave: { in: clavesEv } }, select: { id: true, clave: true } })).map((e) => [e.clave, e.id]),
        );

        // 2) Marcas (la primera aparición en el lote da el rubro y la web).
        const marcas = new Map<string, { nombre: string; rubro: string | null; web: string | null }>();
        for (const e of eventos) for (const m of e.marcas) if (!marcas.has(m.clave)) marcas.set(m.clave, { nombre: m.nombre, rubro: m.rubro, web: m.web });
        const nuevasM = marcas.size
          ? await tx.marcaRelevada.createMany({
              data: [...marcas].map(([clave, m]) => ({ tenantId, clave, nombre: m.nombre, rubro: m.rubro, web: m.web })),
              skipDuplicates: true,
            })
          : { count: 0 };
        const idM = new Map(
          marcas.size
            ? (await tx.marcaRelevada.findMany({ where: { tenantId, clave: { in: [...marcas.keys()] } }, select: { id: true, clave: true } })).map((m) => [m.clave, m.id])
            : [],
        );

        // 3) Relaciones evento-marca-rol.
        const relaciones = eventos.flatMap((e) =>
          e.marcas.map((m) => ({ tenantId, eventoId: idEv.get(e.clave)!, marcaId: idM.get(m.clave)!, rol: m.rol, nivel: m.nivel, urlFuente: m.urlFuente, edicion: m.edicion, verificacion: m.verificacion })),
        );
        const nuevasR = relaciones.length ? await tx.eventoMarca.createMany({ data: relaciones, skipDuplicates: true }) : { count: 0 };
        for (const v of VERIFICACIONES) {
          for (const tanda of enTandas(relaciones.filter((r) => r.verificacion === v))) {
            const data = { verificacion: v };
            const where = { tenantId, verificacion: { not: v }, OR: tanda.map((r) => ({ eventoId: r.eventoId, marcaId: r.marcaId, rol: r.rol })) };
            verificacionesActualizadas += (await tx.eventoMarca.updateMany({ where, data })).count;
          }
        }

        // 4) El registro del equipo: qué puesto hizo qué. Una línea repetida no se duplica.
        const acciones = eventos.flatMap((e) => [
          ...e.registro.map((a) => ({ e: e.clave, m: null, rol: null, a })),
          ...e.marcas.flatMap((m) => m.registro.map((a) => ({ e: e.clave, m: m.clave, rol: m.rol as string | null, a }))),
        ]);
        let accionesNuevas = 0;
        for (const tanda of enTandas(acciones)) {
          accionesNuevas += (
            await tx.accionDelEquipo.createMany({
              data: tanda.map(({ e, m, rol, a }) => ({ tenantId, clave: claveDeAccion(e, m, rol, a), puesto: a.puesto, accion: a.accion, hora: new Date(a.hora), url: a.url, detalle: a.detalle, eventoClave: e, marcaClave: m, rol })),
              skipDuplicates: true,
            })
          ).count;
        }

        return {
          eventosNuevos: nuevosEv.count,
          eventosExistentes: eventos.length - nuevosEv.count,
          marcasNuevas: nuevasM.count,
          marcasExistentes: marcas.size - nuevasM.count,
          relacionesNuevas: nuevasR.count,
          relacionesExistentes: relaciones.length - nuevasR.count,
          verificacionesActualizadas,
          accionesNuevas,
        };
      },
      { tenantId }, // sin timeoutMs: es una acción de la app (rls.ts). Los topes del lote (core.ts) la mantienen bajo los 5 s.
    ),
  );
}

// ── El equipo de agentes ─────────────────────────────────────────────────────

export interface PorPuesto {
  puesto: Puesto;
  acciones: number;
  ultima: Date | null;
}

export interface EnDuda {
  eventoId: string;
  evento: string;
  marca: string | null;
  verificacion: string;
  urlFuente: string | null;
}

export interface Pedido {
  id: string;
  puesto: string;
  pedido: string;
  region: string | null;
  desde: Date | null;
  hasta: Date | null;
  estado: string;
  createdAt: Date;
}

const conteo = (filas: { verificacion: string; _count: { _all: number } }[]) =>
  Object.fromEntries(VERIFICACIONES.map((v) => [v, filas.find((f) => f.verificacion === v)?._count._all ?? 0])) as Record<Verificacion, number>;

/** La pantalla «Equipo»: cuánto relevó, cuánto está verificado, qué hizo cada puesto, qué quedó en duda y los pedidos. */
export function resumenDelEquipo(tenantId: string) {
  return conBase(() =>
    tenantTransaction(
      async (tx) => {
        const [eventos, marcas, evVerif, relVerif, puestos, dudasRel, dudasEv, pedidos] = await Promise.all([
          tx.eventoRelevado.count({ where: { tenantId } }),
          tx.marcaRelevada.count({ where: { tenantId } }),
          tx.eventoRelevado.groupBy({ by: ["verificacion"], where: { tenantId }, _count: { _all: true } }),
          tx.eventoMarca.groupBy({ by: ["verificacion"], where: { tenantId }, _count: { _all: true } }),
          tx.accionDelEquipo.groupBy({ by: ["puesto"], where: { tenantId }, _count: { _all: true }, _max: { hora: true } }),
          tx.eventoMarca.findMany({
            where: { tenantId, verificacion: { in: ["en duda", "falla"] } },
            orderBy: { evento: { fecha: "asc" } },
            take: 50,
            select: { verificacion: true, urlFuente: true, evento: { select: { id: true, nombre: true } }, marca: { select: { nombre: true } } },
          }),
          tx.eventoRelevado.findMany({
            where: { tenantId, verificacion: { in: ["en duda", "falla"] } },
            orderBy: { fecha: "asc" },
            take: 50,
            select: { id: true, nombre: true, verificacion: true, urlFuente: true },
          }),
          tx.pedidoAlEquipo.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, puesto: true, pedido: true, region: true, desde: true, hasta: true, estado: true, createdAt: true } }),
        ]);
        return {
          eventos,
          marcas,
          eventosPorVerificacion: conteo(evVerif),
          participacionesPorVerificacion: conteo(relVerif),
          porPuesto: PUESTOS.map((p): PorPuesto => {
            const f = puestos.find((x) => x.puesto === p);
            return { puesto: p, acciones: f?._count._all ?? 0, ultima: f?._max.hora ?? null };
          }),
          enDuda: [
            ...dudasEv.map((e): EnDuda => ({ eventoId: e.id, evento: e.nombre, marca: null, verificacion: e.verificacion, urlFuente: e.urlFuente })),
            ...dudasRel.map((r): EnDuda => ({ eventoId: r.evento.id, evento: r.evento.nombre, marca: r.marca.nombre, verificacion: r.verificacion, urlFuente: r.urlFuente })),
          ],
          pedidos: pedidos as Pedido[],
        };
      },
      { tenantId },
    ),
  );
}

/** Un pedido del negocio al equipo. Entra en cola; lo toma una sesión de GSG (acá no se ejecuta nada). */
/** Otra importación del mismo negocio está corriendo: la acción le pide a la persona que pruebe en un rato. */
export class ImportacionEnCurso extends Error {
  constructor() {
    super("ya hay una importación de eventos en curso en este negocio");
  }
}

export function crearPedido(tenantId: string, datos: PedidoValido & { creadoPor: string | null }) {
  return conBase(() =>
    tenantTransaction(
      async (tx) => ({ pedido: await tx.pedidoAlEquipo.create({ data: {
            tenantId,
            puesto: datos.puesto,
            pedido: datos.pedido,
            region: datos.region,
            desde: datos.desde ? diaADate(datos.desde) : null,
            hasta: datos.hasta ? diaADate(datos.hasta) : null,
            creadoPor: datos.creadoPor,
          }, select: { id: true } }) }),
      { tenantId },
    ),
  );
}
