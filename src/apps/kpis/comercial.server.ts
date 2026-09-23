// ============================================================================
// NÚMEROS DE CLIENTES Y RECEPCIÓN — Agenda, Confirmar mañana, Lista de espera, Clientes,
// Para contactar hoy, Por recuperar, Fichas duplicadas, Reseñas, Recordatorios y Campañas.
// ============================================================================
//
// Mismas reglas que todos los loaders de esta carpeta (ver mostrador.server.ts): el `db` del
// contexto, sin transacciones, el `where` de la pantalla y la plata sólo con `monto`.
//
// Cada número lee con la MISMA función que su pantalla, no con una copia:
//   · Agenda, Confirmar mañana, Lista de espera y Recordatorios: los `where` de src/lib/crm/wheres.ts,
//     que usan también `getAgendaDay`, `getMananaConfirmar` y `getWaitlist` (actions).
//   · Clientes, Para contactar hoy, Por recuperar y Fichas duplicadas: las lecturas del motor
//     comercial (src/lib/crm/lecturas.ts), que son las que llaman sus páginas.
//
// UNA consulta por número, con una excepción declarada: "Para contactar hoy" hace DOS en
// paralelo (las fichas con su actividad y las constancias de contacto y permiso). Sin las
// constancias el número contaría a quien ya se le escribió o pidió no recibir mensajes, y la
// bandeja que se abre al tocarlo mostraría menos: el Inicio mentiría.

import { fmtMoneyARS, fmtNumberAR } from "@/components/ui/format";
import { diaSiguiente, rangoDelDia } from "@/lib/turnos/turno-abierto";
import { detallePorMotivo } from "@/lib/crm/bandeja";
import { gruposDuplicados } from "@/lib/crm/identidad";
import {
  bordesDelMes,
  cargarBandeja,
  cargarPorRecuperar,
  contarNuevas,
  leerAvisosDeManana,
  leerPrimerasVisitas,
  whereFichasDelNegocio,
  type ContextoCrm,
} from "@/lib/crm/lecturas";
import { whereEsperando, whereTurnosDeManana, whereTurnosDelDia } from "@/lib/crm/wheres";
import { plural, type ContextoLoader, type DatoKpi, type LoaderKpi } from "./nucleo.server";

function contextoCrm(ctx: ContextoLoader): ContextoCrm {
  return { tenantId: ctx.tenantId, hoy: ctx.hoy, ahora: ctx.ahora, rubro: ctx.esMostrador ? "mostrador" : "servicios" };
}

// ── Agenda ───────────────────────────────────────────────────────────────────

/** "18 turnos hoy · 83% confirmados". Confirmado = todo lo que no quedó en Reservado. PURA. */
export function resumirAgenda(grupos: readonly { status: string; _count: { _all: number } }[]): DatoKpi {
  const total = grupos.reduce((s, g) => s + g._count._all, 0);
  const reservados = grupos.filter((g) => g.status === "PENDING").reduce((s, g) => s + g._count._all, 0);
  if (total === 0) return { valor: "0", detalle: "turnos hoy" };
  const pct = Math.round(((total - reservados) / total) * 100);
  return { valor: fmtNumberAR(total), detalle: `${plural(total, "turno hoy", "turnos hoy")} · ${pct}% confirmados` };
}

/** El `where` de la agenda del día (`getAgendaDay`), agrupado por estado. */
export const agenda: LoaderKpi = async ({ db, tenantId, hoy }) => {
  const { desde, hasta } = rangoDelDia(hoy);
  const grupos = await db.appointment.groupBy({
    by: ["status"],
    where: whereTurnosDelDia(tenantId, desde, hasta),
    _count: { _all: true },
  });
  return resumirAgenda(grupos);
};

// ── Confirmar mañana y Recordatorios ─────────────────────────────────────────

/** "7 turnos de mañana sin avisar": los de `getMananaConfirmar` sin `reminderSentAt`. */
export const confirmarManana: LoaderKpi = async ({ db, tenantId, hoy }) => {
  const { desde, hasta } = rangoDelDia(diaSiguiente(hoy));
  const n = await db.appointment.count({ where: { ...whereTurnosDeManana(tenantId, desde, hasta), reminderSentAt: null } });
  return { valor: fmtNumberAR(n), detalle: plural(n, "turno de mañana sin avisar", "turnos de mañana sin avisar") };
};

/** "62% de los turnos de mañana ya avisados", o '—' si mañana no hay turnos. PURA. */
export function resumirCobertura(c: { total: number; avisados: number }): DatoKpi {
  if (c.total === 0) return { sinDato: "Mañana no hay turnos reservados ni confirmados" };
  const pct = Math.round((c.avisados / c.total) * 100);
  return { valor: `${pct}%`, detalle: `de los turnos de mañana ya avisados (${c.avisados} de ${c.total})` };
}

export const recordatorios: LoaderKpi = async ({ db, tenantId, hoy }) =>
  resumirCobertura(await leerAvisosDeManana(db, tenantId, rangoDelDia(diaSiguiente(hoy))));

// ── Lista de espera ──────────────────────────────────────────────────────────

/** "4 esperando": el `where` de la lista (`getWaitlist`). */
export const listaDeEspera: LoaderKpi = async ({ db, tenantId }) => {
  const n = await db.waitlistEntry.count({ where: whereEsperando(tenantId) });
  return { valor: fmtNumberAR(n), detalle: "esperando un turno" };
};

// ── Reseñas ──────────────────────────────────────────────────────────────────

/** "4,8★ · promedio de 25 · 3 sin publicar", o '—' si todavía no hay reseñas. PURA. */
export function resumirResenas(
  grupos: readonly { published: boolean; _count: { _all: number }; _avg: { rating: number | null } }[],
): DatoKpi {
  const total = grupos.reduce((s, g) => s + g._count._all, 0);
  if (total === 0) return { sinDato: "Todavía no hay reseñas" };
  const suma = grupos.reduce((s, g) => s + (g._avg.rating ?? 0) * g._count._all, 0);
  const sinPublicar = grupos.filter((g) => !g.published).reduce((s, g) => s + g._count._all, 0);
  const promedio = fmtNumberAR(Math.round((suma / total) * 10) / 10, 1);
  return {
    valor: `${promedio}★`,
    detalle: `promedio de ${fmtNumberAR(total)}${sinPublicar > 0 ? ` · ${fmtNumberAR(sinPublicar)} sin publicar` : ""}`,
  };
}

/** Todas las reseñas del negocio (la lista de /admin/resenas), por publicada o no. */
export const resenas: LoaderKpi = async ({ db, tenantId }) => {
  const grupos = await db.review.groupBy({
    by: ["published"],
    where: { tenantId },
    _count: { _all: true },
    _avg: { rating: true },
  });
  return resumirResenas(grupos);
};

// ── Clientes ─────────────────────────────────────────────────────────────────

/** "14 clientes nuevos este mes": primera visita (o primer pedido) de toda la historia, este mes. */
export const clientes: LoaderKpi = async (ctx) => {
  const c = contextoCrm(ctx);
  const n = contarNuevas(await leerPrimerasVisitas(ctx.db, ctx.tenantId, c.rubro), bordesDelMes(ctx.hoy));
  return { valor: fmtNumberAR(n), detalle: plural(n, "cliente nuevo este mes", "clientes nuevos este mes") };
};

/** "12 para contactar hoy (3 cumpleaños · 5 por recuperar · 4 reseñas)": la bandeja misma. */
export const paraContactarHoy: LoaderKpi = async (ctx) => {
  const { bandeja } = await cargarBandeja(ctx.db, contextoCrm(ctx));
  const n = bandeja.filas.length;
  if (n === 0 && bandeja.contactadasHoy >= bandeja.tope) {
    return { valor: "0", detalle: `ya se contactaron las ${bandeja.tope} de hoy` };
  }
  const motivos = detallePorMotivo(bandeja.porMotivo);
  return { valor: fmtNumberAR(n), detalle: `para contactar hoy${motivos ? ` (${motivos})` : ""}` };
};

/** "23 en riesgo · $1,4 M por año en juego" (la plata, sólo con reports:read). */
export const porRecuperar: LoaderKpi = async (ctx) => {
  const enRiesgo = await cargarPorRecuperar(ctx.db, contextoCrm(ctx));
  const n = enRiesgo.length;
  const dato: DatoKpi = { valor: fmtNumberAR(n), detalle: "en riesgo de no volver" };
  if (ctx.monto && n > 0) {
    const total = enRiesgo.reduce((s, x) => s + x.ev.valorAnual, 0);
    return { ...dato, monto: `${fmtMoneyARS(total, 0)} por año en juego` };
  }
  return dato;
};

/** "6 personas con fichas duplicadas": grupos por la clave del teléfono, las fichas de la lista. */
export const unificarFichas: LoaderKpi = async ({ db, tenantId }) => {
  const fichas = await db.client.findMany({ where: whereFichasDelNegocio(tenantId), select: { id: true, name: true, phone: true } });
  const n = gruposDuplicados(fichas).length;
  return { valor: fmtNumberAR(n), detalle: plural(n, "persona con fichas duplicadas", "personas con fichas duplicadas") };
};

// ── Campañas ─────────────────────────────────────────────────────────────────

/**
 * "120 anotados": los de la campaña presencial, los mismos que lista la pantalla
 * (campania/page.tsx: `leadCampania` del negocio). Si la tabla todavía no existe en la base
 * del negocio, '—' con el motivo en vez de un error: es un estado conocido de la migración.
 */
export const campanias: LoaderKpi = async ({ db, tenantId }) => {
  try {
    const n = await db.leadCampania.count({ where: { tenantId } });
    return { valor: fmtNumberAR(n), detalle: plural(n, "anotado", "anotados") };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "P2021" || code === "P2022") {
      return { sinDato: "La campaña todavía no está habilitada en este negocio" };
    }
    throw e;
  }
};

export const LOADERS_COMERCIAL: Readonly<Record<string, LoaderKpi>> = {
  agenda,
  "confirmar-manana": confirmarManana,
  "lista-de-espera": listaDeEspera,
  clientes,
  "para-contactar-hoy": paraContactarHoy,
  "clientas-por-recuperar": porRecuperar,
  "unificar-fichas": unificarFichas,
  resenas,
  recordatorios,
  campanias,
};
