// ============================================================================
// LECTURAS DEL MOTOR COMERCIAL — las MISMAS para la pantalla y para su número.
// ============================================================================
//
// Cada lectura recibe el cliente de base por parámetro: la pantalla le pasa el `prisma` del
// request y el número del Inicio le pasa el `db` de su contexto (que es ese mismo `prisma`).
// Así "12 para contactar hoy" en el botón y la bandeja que se abre al tocarlo salen de la
// misma consulta y de la misma cuenta, no de dos copias que se desincronizan.
//
// Reglas de estas lecturas (son las del Inicio, src/apps/kpis/mostrador.server.ts):
//   · el negocio va EXPLÍCITO en el `where` de arriba, además del candado y de RLS;
//   · nada de transacciones: con RLS encendido, el `prisma` global adentro de una transacción
//     sale por otra conexión sin el negocio puesto y devuelve 0 sin error (rls.ts);
//   · pocas consultas y en paralelo: la ficha trae su actividad ANIDADA (una sola operación),
//     no una consulta por clienta.
//
// Sin "use server" (cada export sería un endpoint que recibe `tenantId` de afuera) y sin
// `server-only`, para que los tests lo ejecuten con una base falsa. Sólo TIPOS de Prisma.

import type { Prisma } from "@/generated/prisma/client";
import { businessWallTimeToUtc } from "@/lib/datetime";
import { armarBandeja, type Bandeja } from "./bandeja";
import { ciclosPorServicio } from "./ciclo";
import { leerConstancias, type Constancias, type EventoConstancia } from "./constancias";
import { sumarDias } from "./fechas";
import { armarPersona, type FichaCruda, type Persona, type Rubro } from "./personas";
import { CRM_REGLAS, ENTIDAD_CONTACTO, ENTIDAD_PERMISO, type ReglasCrm } from "./reglas";
import { evaluarBase, porRecuperar, type Evaluacion } from "./segmentos";
import { whereTurnosDeManana } from "./wheres";

/** El cliente de base con el que se lee: el `prisma` del request (o una base falsa en los tests). */
export type DbCrm = Prisma.TransactionClient;

/** Todas las fichas del negocio: la lista de Clientes, los duplicados y su número. */
export function whereFichasDelNegocio(tenantId: string): Prisma.ClientWhereInput {
  return { tenantId };
}

/** Desde cuándo mira el motor (la ventana de historial). */
export function desdeHistorial(ahora: Date, reglas: Pick<ReglasCrm, "ventanaHistorialDias"> = CRM_REGLAS): Date {
  return new Date(ahora.getTime() - reglas.ventanaHistorialDias * 86_400_000);
}

// ── Fichas con su actividad (UNA operación) ─────────────────────────────────

const SELECT_TURNO_CRM = {
  id: true,
  status: true,
  startsAt: true,
  serviceId: true,
  priceAtBooking: true,
  service: { select: { name: true, price: true } },
  review: { select: { id: true } },
} satisfies Prisma.AppointmentSelect;

/**
 * Cada ficha con su actividad de la ventana de historial, ANIDADA en la misma operación:
 *   · servicios: los turnos completados (visitas) y los reservados/confirmados (el próximo);
 *   · mostrador: los pedidos no anulados.
 * Una sola ida a la base para toda la base de clientas (Prisma resuelve el anidado con una
 * consulta más por relación, no una por ficha). Con el volumen de CH (~1.000 turnos por año) es
 * trivial; pasadas las ~20 mil filas por negocio conviene pasar a agregados en SQL.
 */
export async function leerFichasConActividad(
  db: DbCrm,
  tenantId: string,
  opciones: { desde: Date; rubro: Rubro },
): Promise<FichaCruda[]> {
  const { desde, rubro } = opciones;
  if (rubro === "servicios") {
    return db.client.findMany({
      where: whereFichasDelNegocio(tenantId),
      select: {
        id: true,
        name: true,
        phone: true,
        birthDate: true,
        appointments: {
          where: { startsAt: { gte: desde }, status: { in: ["COMPLETED", "PENDING", "CONFIRMED"] } },
          select: SELECT_TURNO_CRM,
        },
      },
    });
  }
  return db.client.findMany({
    where: whereFichasDelNegocio(tenantId),
    select: {
      id: true,
      name: true,
      phone: true,
      birthDate: true,
      orders: {
        where: { createdAt: { gte: desde }, status: { not: "CANCELLED" } },
        select: { id: true, createdAt: true, total: true },
      },
    },
  });
}

/** Las constancias de contacto (del último mes) y TODAS las de permiso: una baja no vence. */
export async function leerConstanciasCrm(db: DbCrm, tenantId: string, ahora: Date): Promise<EventoConstancia[]> {
  const desdeContactos = new Date(ahora.getTime() - 31 * 86_400_000);
  return db.auditLog.findMany({
    where: {
      tenantId,
      OR: [{ entity: ENTIDAD_CONTACTO, createdAt: { gte: desdeContactos } }, { entity: ENTIDAD_PERMISO }],
    },
    select: { entity: true, action: true, entityId: true, createdAt: true },
  });
}

// ── La base evaluada ────────────────────────────────────────────────────────

export type BaseEvaluada = { persona: Persona; ev: Evaluacion }[];

/** Personas, ciclo de cada servicio y segmento de cada una. PURA (recibe las filas). */
export function evaluarFichas(fichas: readonly FichaCruda[], rubro: Rubro, hoy: string, ahora: Date, reglas: ReglasCrm = CRM_REGLAS): BaseEvaluada {
  const personas = fichas.map((f) => armarPersona(f, rubro, ahora));
  const porServicio = ciclosPorServicio(personas.map((p) => p.visitas), reglas);
  return evaluarBase(personas, hoy, porServicio, reglas);
}

export type ContextoCrm = { tenantId: string; hoy: string; ahora: Date; rubro: Rubro };

/** Clientas por recuperar: UNA lectura (fichas con actividad). La pantalla y su número. */
export async function cargarPorRecuperar(db: DbCrm, c: ContextoCrm): Promise<BaseEvaluada> {
  const fichas = await leerFichasConActividad(db, c.tenantId, { desde: desdeHistorial(c.ahora), rubro: c.rubro });
  return porRecuperar(evaluarFichas(fichas, c.rubro, c.hoy, c.ahora));
}

/**
 * La bandeja de hoy: DOS lecturas en paralelo (fichas con actividad y constancias). La
 * pantalla y su número llaman a esto mismo. En servicios se piden reseñas (turnos); en un
 * mostrador no: las reseñas de productos son de la ola 9.
 */
export async function cargarBandeja(
  db: DbCrm,
  c: ContextoCrm,
): Promise<{ bandeja: Bandeja; base: BaseEvaluada; constancias: Constancias }> {
  const [fichas, eventos] = await Promise.all([
    leerFichasConActividad(db, c.tenantId, { desde: desdeHistorial(c.ahora), rubro: c.rubro }),
    leerConstanciasCrm(db, c.tenantId, c.ahora),
  ]);
  const base = evaluarFichas(fichas, c.rubro, c.hoy, c.ahora);
  const constancias = leerConstancias(eventos, c.hoy);
  const bandeja = armarBandeja({ evaluadas: base, constancias, hoy: c.hoy, pedirResenas: c.rubro === "servicios" });
  return { bandeja, base, constancias };
}

// ── Clientes nuevos del mes (UNA operación) ─────────────────────────────────

/** El primer instante del mes del negocio de `hoy`, y el del mes siguiente. */
export function bordesDelMes(hoy: string): { desde: Date; hasta: Date } {
  const primero = `${hoy.slice(0, 7)}-01`;
  // Del día 28 en adelante siempre se cae en el mes siguiente sumando 4 días.
  const siguiente = `${sumarDias(`${hoy.slice(0, 7)}-28`, 4).slice(0, 7)}-01`;
  return { desde: businessWallTimeToUtc(primero, "00:00"), hasta: businessWallTimeToUtc(siguiente, "00:00") };
}

/**
 * La primera visita de cada ficha, de TODA la historia (no de la ventana): una clienta que
 * vuelve después de dos años no es nueva. Un `groupBy` por ficha con el mínimo:
 *   · servicios: el primer turno completado;
 *   · mostrador: el primer pedido no anulado atado a una ficha.
 */
export async function leerPrimerasVisitas(db: DbCrm, tenantId: string, rubro: Rubro): Promise<Date[]> {
  if (rubro === "servicios") {
    const grupos = await db.appointment.groupBy({
      by: ["clientId"],
      where: { tenantId, status: "COMPLETED" },
      _min: { startsAt: true },
    });
    return grupos.flatMap((g) => (g._min?.startsAt ? [g._min.startsAt] : []));
  }
  const grupos = await db.order.groupBy({
    by: ["clientId"],
    where: { tenantId, clientId: { not: null }, status: { not: "CANCELLED" } },
    _min: { createdAt: true },
  });
  return grupos.flatMap((g) => (g.clientId && g._min?.createdAt ? [g._min.createdAt] : []));
}

/** Cuántas primeras visitas caen en `[desde, hasta)`. PURA. */
export function contarNuevas(primeras: readonly Date[], mes: { desde: Date; hasta: Date }): number {
  return primeras.filter((d) => d.getTime() >= mes.desde.getTime() && d.getTime() < mes.hasta.getTime()).length;
}

// ── Avisos de mañana (UNA operación) ────────────────────────────────────────

/** Los turnos de mañana a confirmar, sólo si ya se avisó o no. La cobertura de Recordatorios. */
export async function leerAvisosDeManana(
  db: DbCrm,
  tenantId: string,
  rango: { desde: Date; hasta: Date },
): Promise<{ total: number; avisados: number }> {
  const filas = await db.appointment.findMany({
    where: whereTurnosDeManana(tenantId, rango.desde, rango.hasta),
    select: { reminderSentAt: true },
  });
  return { total: filas.length, avisados: filas.filter((f) => f.reminderSentAt !== null).length };
}
