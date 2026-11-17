// CONSOLA DE LA CUADRILLA · lecturas y escrituras sobre UNA transacción parada en UN negocio.
//
// Todo recibe `tx` (de `tenantTransaction` o de `enElNegocio`, las dos con `app.current_tenant_id`) y el
// `tenantId` de ese negocio: cada consulta lo filtra además de RLS. Ninguna función elige el negocio por sí
// misma ni lee de otro: la vista de varios negocios del operador es una transacción por negocio.
// Antes de escribir se pregunta a `permisos.ts` con la fila leída acá, nunca con lo que mandó el navegador.
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { esNivel0, puede, type Actor, type ExcepcionCtx, type Resultado } from "./permisos";
import type { VistaPedidos } from "./pedidos";

type Tx = Prisma.TransactionClient;

export class NoPermitido extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "NoPermitido";
  }
}

function exigir(r: Resultado): void {
  if (!r.ok) throw new NoPermitido(r.motivo);
}

/** Huella del contenido que se ve al aprobar: si el agente lo cambia después, la aprobación no vale. */
export function huellaDe(contenido: string): string {
  return createHash("sha256").update(contenido, "utf8").digest("hex").slice(0, 24);
}

export const hiloDeAgente = (agenteId: string) => `agente:${agenteId}`;
export const hiloDeEquipo = (equipo: string) => `equipo:${equipo}`;

export type Filtros = {
  agenteId?: string;
  /** "PENDIENTE" (por defecto) o "TODAS". */
  estado?: string;
  tipo?: string;
  /** Lista de pedidos (criterio 8): abiertos, negados, oportunidades, topes o todos. */
  pedidos?: VistaPedidos;
};

export type AgenteVista = {
  id: string;
  nombre: string;
  puesto: string;
  equipo: string;
  estado: string;
  ultimaSenal: Date | null;
  pendientes: number;
};

export type ExcepcionVista = {
  id: string;
  tenantId: string;
  agenteId: string;
  agenteNombre: string;
  tipo: string;
  categoria: string;
  titulo: string;
  contenido: string;
  huella: string;
  estado: string;
  creadaPorUserId: string | null;
  decididaPor: string | null;
  decididaEn: Date | null;
  motivo: string | null;
  createdAt: Date;
};

export type MensajeVista = {
  id: string;
  hilo: string;
  autorTipo: string;
  autor: string;
  texto: string;
  createdAt: Date;
  /** El pedido que abre o contesta este mensaje (GSG-MIA-072): el hilo dice a qué pedido responde cada cosa. */
  pedido?: { id: string; texto: string; createdAt: Date } | null;
};

export type Tablero = {
  tenantId: string;
  agentes: AgenteVista[];
  excepciones: ExcepcionVista[];
  pendientes: number;
  frenados: number;
};

/** El tablero de un negocio: agentes y excepciones (pendientes primero, la más vieja arriba). */
export async function leerTablero(tx: Tx, tenantId: string, filtros: Filtros = {}): Promise<Tablero> {
  const soloPendientes = (filtros.estado ?? "PENDIENTE") !== "TODAS";
  const [agentes, filas, pendientesPorAgente] = await Promise.all([
    tx.agenteCuadrilla.findMany({
      where: { tenantId },
      orderBy: [{ equipo: "asc" }, { nombre: "asc" }],
      select: { id: true, nombre: true, puesto: true, equipo: true, estado: true, ultimaSenal: true },
    }),
    tx.excepcionCuadrilla.findMany({
      where: {
        tenantId,
        ...(soloPendientes ? { estado: "PENDIENTE" } : {}),
        ...(filtros.agenteId ? { agenteId: filtros.agenteId } : {}),
        ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
      },
      orderBy: { createdAt: soloPendientes ? "asc" : "desc" },
      take: 200,
      include: { agente: { select: { nombre: true } } },
    }),
    tx.excepcionCuadrilla.groupBy({
      by: ["agenteId"],
      where: { tenantId, estado: "PENDIENTE" },
      _count: { _all: true },
    }),
  ]);
  const cuenta = new Map(pendientesPorAgente.map((g) => [g.agenteId, g._count._all]));
  const excepciones: ExcepcionVista[] = filas.map((e) => ({
    id: e.id,
    tenantId: e.tenantId,
    agenteId: e.agenteId,
    agenteNombre: e.agente.nombre,
    tipo: e.tipo,
    categoria: e.categoria,
    titulo: e.titulo,
    contenido: e.contenido,
    huella: huellaDe(e.contenido),
    estado: e.estado,
    creadaPorUserId: e.creadaPorUserId,
    decididaPor: e.decididaPor,
    decididaEn: e.decididaEn,
    motivo: e.motivo,
    createdAt: e.createdAt,
  }));
  if (soloPendientes) {
    // Sin reordenar por tipo: la primera de la bandeja es la más vieja, la misma que abre la franja del panel.
  }
  return {
    tenantId,
    agentes: agentes.map((a) => ({ ...a, pendientes: cuenta.get(a.id) ?? 0 })),
    excepciones,
    pendientes: pendientesPorAgente.reduce((s, g) => s + g._count._all, 0),
    frenados: agentes.filter((a) => a.estado === "FRENADO").length,
  };
}

/** Conteo barato para el aviso de la cabecera: cuántas esperan y cuál es la más vieja. */
export async function resumenDePendientes(tx: Tx, tenantId: string): Promise<{ pendientes: number; primeraId: string | null }> {
  const [pendientes, primera] = await Promise.all([
    tx.excepcionCuadrilla.count({ where: { tenantId, estado: "PENDIENTE" } }),
    tx.excepcionCuadrilla.findFirst({ where: { tenantId, estado: "PENDIENTE" }, orderBy: { createdAt: "asc" }, select: { id: true } }),
  ]);
  return { pendientes, primeraId: primera?.id ?? null };
}

export async function leerHilo(tx: Tx, tenantId: string, hilo: string): Promise<MensajeVista[]> {
  const filas = await tx.mensajeCuadrilla.findMany({
    where: { tenantId, hilo },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, hilo: true, autorTipo: true, autor: true, texto: true, createdAt: true, pedidoId: true },
  });
  // A qué pedido responde cada mensaje: se busca DENTRO del negocio (tenantId + RLS); un id que no está, no se muestra.
  const ids = [...new Set(filas.flatMap((f) => (f.pedidoId ? [f.pedidoId] : [])))];
  const pedidos = ids.length
    ? new Map(
        (await tx.pedidoCuadrilla.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, texto: true, createdAt: true } })).map((p) => [p.id, p]),
      )
    : new Map<string, { id: string; texto: string; createdAt: Date }>();
  return filas.reverse().map(({ pedidoId, ...m }) => ({ ...m, pedido: pedidoId ? (pedidos.get(pedidoId) ?? null) : null }));
}

/**
 * Tiempo de respuesta de la cuadrilla: por cada mensaje de una persona, cuánto tardó en llegar el siguiente
 * mensaje de un agente en el mismo hilo. Devuelve los segundos (sin los que todavía esperan).
 */
export function tiemposDeRespuesta(mensajes: Pick<MensajeVista, "hilo" | "autorTipo" | "createdAt">[]): number[] {
  const porHilo = new Map<string, typeof mensajes>();
  for (const m of mensajes) porHilo.set(m.hilo, [...(porHilo.get(m.hilo) ?? []), m]);
  const out: number[] = [];
  for (const lista of porHilo.values()) {
    const orden = [...lista].sort((a, b) => +a.createdAt - +b.createdAt);
    let esperaDesde: Date | null = null;
    for (const m of orden) {
      if (m.autorTipo === "PERSONA" && !esperaDesde) esperaDesde = m.createdAt;
      if (m.autorTipo === "AGENTE" && esperaDesde) {
        out.push(Math.round((+m.createdAt - +esperaDesde) / 1000));
        esperaDesde = null;
      }
    }
  }
  return out;
}

export function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** Mensajes de los últimos 7 días del negocio (para medir la respuesta). */
export async function mensajesRecientes(tx: Tx, tenantId: string) {
  return tx.mensajeCuadrilla.findMany({
    where: { tenantId, createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    select: { hilo: true, autorTipo: true, createdAt: true },
    take: 2000,
  });
}

function aCtx(e: { tenantId: string; agenteId: string; tipo: string; categoria: string; estado: string; creadaPorUserId: string | null }): ExcepcionCtx {
  return { tenantId: e.tenantId, agenteId: e.agenteId, tipo: e.tipo, categoria: e.categoria, estado: e.estado, creadaPorUserId: e.creadaPorUserId };
}

function nombreDe(actor: Actor): string {
  return actor.tipo === "operador" ? `${actor.nombre} (GSG)` : actor.nombre;
}

async function avisoEnElHilo(tx: Tx, tenantId: string, agenteId: string, texto: string): Promise<void> {
  await tx.mensajeCuadrilla.create({
    data: { tenantId, hilo: hiloDeAgente(agenteId), autorTipo: "SISTEMA", autor: "Consola", texto: texto.slice(0, 2000) },
  });
}

const VERBO: Record<"aprobar" | "rechazar" | "resolver", { estado: string; dicho: string }> = {
  aprobar: { estado: "APROBADA", dicho: "aprobó" },
  rechazar: { estado: "RECHAZADA", dicho: "rechazó" },
  resolver: { estado: "RESUELTA", dicho: "dio por resuelta" },
};

/**
 * Aprobar, rechazar o resolver UNA excepción. Para aprobar plata o un envío a terceros hace falta la huella
 * del contenido que la persona vio (`huellaVista`): si no coincide con la de la fila, no se aprueba.
 * La escritura es condicional (`estado = PENDIENTE`): dos personas a la vez no la deciden dos veces.
 */
export async function decidir(
  tx: Tx,
  actor: Actor,
  tenantId: string,
  excepcionId: string,
  op: "aprobar" | "rechazar" | "resolver",
  opciones: { huellaVista?: string; motivo?: string } = {},
): Promise<void> {
  const e = await tx.excepcionCuadrilla.findFirst({ where: { id: excepcionId, tenantId } });
  if (!e) throw new NoPermitido("No existe esa excepción en este negocio.");
  const contenidoVisto = opciones.huellaVista ? opciones.huellaVista === huellaDe(e.contenido) : false;
  if (op === "aprobar" && esNivel0(e.categoria) && opciones.huellaVista && !contenidoVisto) {
    throw new NoPermitido("El contenido cambió desde que lo abriste: miralo de nuevo antes de aprobar.");
  }
  exigir(puede(actor, op, { excepcion: aCtx(e), contenidoVisto }));
  const motivo = opciones.motivo?.trim().slice(0, 500) || null;
  const hecho = await tx.excepcionCuadrilla.updateMany({
    where: { id: e.id, tenantId, estado: "PENDIENTE" },
    data: { estado: VERBO[op].estado, decididaPor: nombreDe(actor), decididaEn: new Date(), motivo },
  });
  if (hecho.count !== 1) throw new NoPermitido("Esa excepción ya se decidió.");
  await avisoEnElHilo(tx, tenantId, e.agenteId, `${nombreDe(actor)} ${VERBO[op].dicho} «${e.titulo}»${motivo ? `: ${motivo}` : ""}.`);
}

/** Aprobar o rechazar varias. Aprobar en lote nunca incluye plata ni envíos a terceros (lo frena `puede`). */
export async function decidirLote(
  tx: Tx,
  actor: Actor,
  tenantId: string,
  ids: string[],
  op: "aprobar" | "rechazar",
  motivo?: string,
): Promise<number> {
  const unicos = [...new Set(ids)].slice(0, 51);
  const filas = await tx.excepcionCuadrilla.findMany({ where: { tenantId, id: { in: unicos } } });
  if (filas.length !== unicos.length) throw new NoPermitido("Alguna de las elegidas no existe en este negocio.");
  exigir(puede(actor, op === "aprobar" ? "aprobar_lote" : "rechazar_lote", { lote: filas.map(aCtx) }));
  const m = motivo?.trim().slice(0, 500) || null;
  let n = 0;
  for (const e of filas) {
    const hecho = await tx.excepcionCuadrilla.updateMany({
      where: { id: e.id, tenantId, estado: "PENDIENTE" },
      data: { estado: VERBO[op].estado, decididaPor: nombreDe(actor), decididaEn: new Date(), motivo: m },
    });
    if (hecho.count === 1) {
      n++;
      await avisoEnElHilo(tx, tenantId, e.agenteId, `${nombreDe(actor)} ${VERBO[op].dicho} «${e.titulo}» (en lote).`);
    }
  }
  return n;
}

/** Pausar o reanudar agentes (uno o varios). */
export async function cambiarEstadoDeAgentes(tx: Tx, actor: Actor, tenantId: string, agenteIds: string[], estado: "PAUSADO" | "ACTIVO"): Promise<number> {
  exigir(puede(actor, estado === "PAUSADO" ? "pausar" : "reanudar", { tenantId }));
  const ids = [...new Set(agenteIds)].slice(0, 50);
  const agentes = await tx.agenteCuadrilla.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true } });
  if (agentes.length !== ids.length) throw new NoPermitido("Algún agente elegido no es de este negocio.");
  const r = await tx.agenteCuadrilla.updateMany({ where: { tenantId, id: { in: ids } }, data: { estado } });
  for (const a of agentes) {
    await avisoEnElHilo(tx, tenantId, a.id, estado === "PAUSADO" ? `${nombreDe(actor)} te pausó: no sigas hasta que te reanuden.` : `${nombreDe(actor)} te reanudó.`);
  }
  return r.count;
}

/** Pasar excepciones pendientes a otro agente del MISMO negocio. */
export async function reasignar(tx: Tx, actor: Actor, tenantId: string, excepcionIds: string[], agenteDestinoId: string): Promise<number> {
  exigir(puede(actor, "reasignar", { tenantId }));
  const destino = await tx.agenteCuadrilla.findFirst({ where: { id: agenteDestinoId, tenantId }, select: { id: true, nombre: true } });
  if (!destino) throw new NoPermitido("Ese agente no es de este negocio.");
  const ids = [...new Set(excepcionIds)].slice(0, 50);
  const filas = await tx.excepcionCuadrilla.findMany({ where: { tenantId, id: { in: ids }, estado: "PENDIENTE" }, select: { id: true, titulo: true } });
  if (filas.length !== ids.length) throw new NoPermitido("Alguna de las elegidas no existe o ya se decidió.");
  const r = await tx.excepcionCuadrilla.updateMany({ where: { tenantId, id: { in: ids }, estado: "PENDIENTE" }, data: { agenteId: destino.id } });
  await avisoEnElHilo(tx, tenantId, destino.id, `${nombreDe(actor)} te pasó ${r.count === 1 ? `«${filas[0].titulo}»` : `${r.count} excepciones`}.`);
  return r.count;
}

/**
 * Escribir en un hilo (de un agente o de un equipo). El agente puede atar su mensaje a un pedido (`pedidoId`,
 * GSG-MIA-076): el servidor exige que el pedido sea SUYO y de SU negocio antes de escribir; si no, no escribe nada.
 * Una persona no ata: su mensaje en el hilo de un agente ABRE un pedido (`hablarOPedir`).
 */
export async function hablar(tx: Tx, actor: Actor, tenantId: string, hilo: string, texto: string, opciones: { pedidoId?: string } = {}): Promise<string> {
  const limpio = texto.trim().slice(0, 2000);
  if (!limpio) throw new NoPermitido("Escribí algo antes de mandar.");
  let hiloAgenteId: string | null = null;
  if (hilo.startsWith("agente:")) {
    hiloAgenteId = hilo.slice("agente:".length);
    const a = await tx.agenteCuadrilla.findFirst({ where: { id: hiloAgenteId, tenantId }, select: { id: true } });
    if (!a) throw new NoPermitido("Ese hilo no es de este negocio.");
  } else if (hilo.startsWith("equipo:")) {
    const equipo = hilo.slice("equipo:".length);
    const a = await tx.agenteCuadrilla.findFirst({ where: { equipo, tenantId }, select: { id: true } });
    if (!a) throw new NoPermitido("Ese equipo no es de este negocio.");
  } else {
    throw new NoPermitido("Ese hilo no existe.");
  }
  exigir(puede(actor, "hablar", { tenantId, hiloAgenteId }));
  let pedidoId: string | null = null;
  if (actor.tipo === "agente" && opciones.pedidoId?.trim()) {
    const p = await tx.pedidoCuadrilla.findFirst({ where: { id: opciones.pedidoId.trim(), tenantId, agenteId: actor.agenteId }, select: { id: true } });
    if (!p) throw new NoPermitido("Ese pedido no es tuyo o no es de este negocio.");
    pedidoId = p.id;
  }
  const m = await tx.mensajeCuadrilla.create({
    data: {
      tenantId,
      hilo,
      autorTipo: actor.tipo === "agente" ? "AGENTE" : "PERSONA",
      autor: nombreDe(actor),
      autorUserId: actor.tipo === "operador" ? null : actor.userId,
      agenteId: actor.tipo === "agente" ? actor.agenteId : null,
      pedidoId,
      texto: limpio,
    },
    select: { id: true },
  });
  if (actor.tipo === "agente") {
    await tx.agenteCuadrilla.updateMany({ where: { id: actor.agenteId, tenantId }, data: { ultimaSenal: new Date() } });
  }
  return m.id;
}

/** Un agente levanta una excepción (pide aprobación, avisa que se frenó, que el sistema lo rechazó o escala). */
export async function levantarExcepcion(
  tx: Tx,
  actor: Actor,
  tenantId: string,
  datos: { tipo: string; categoria: string; titulo: string; contenido: string },
): Promise<string> {
  exigir(puede(actor, "levantar_excepcion", { tenantId }));
  if (actor.tipo !== "agente") throw new NoPermitido("Las excepciones las levanta un agente.");
  const titulo = datos.titulo.trim().slice(0, 160);
  const contenido = datos.contenido.trim().slice(0, 4000);
  if (!titulo || !contenido) throw new NoPermitido("Falta el título o el contenido.");
  const e = await tx.excepcionCuadrilla.create({
    data: { tenantId, agenteId: actor.agenteId, tipo: datos.tipo, categoria: datos.categoria, titulo, contenido, creadaPorUserId: actor.userId },
    select: { id: true },
  });
  if (datos.tipo === "FRENADO") {
    await tx.agenteCuadrilla.updateMany({ where: { id: actor.agenteId, tenantId }, data: { estado: "FRENADO" } });
  }
  await tx.agenteCuadrilla.updateMany({ where: { id: actor.agenteId, tenantId }, data: { ultimaSenal: new Date() } });
  return e.id;
}

/** ¿Este usuario es el de un agente? Si lo es, es agente aunque su rol sea de dueña: nunca supervisa. */
export async function agenteDelUsuario(tx: Tx, tenantId: string, userId: string): Promise<{ id: string; nombre: string; estado: string } | null> {
  return tx.agenteCuadrilla.findFirst({ where: { tenantId, userId }, select: { id: true, nombre: true, estado: true } });
}
