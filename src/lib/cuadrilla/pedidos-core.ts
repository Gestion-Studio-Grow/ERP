// PEDIDOS A LA CUADRILLA · escrituras y lecturas (GSG-MIA-062, criterio 8). Mismas reglas que consola-core:
// todo sobre UNA transacción parada en UN negocio (`tenantTransaction` o `enElNegocio`), cada consulta filtra
// tenantId además de RLS, y antes de escribir se pregunta a `permisos.ts` con la fila leída acá.
//
// · Una persona que escribe en el hilo de un agente hace un PEDIDO, con su tope (minutos y turnos).
// · El agente lo cierra por UNA salida: HECHO, NEGADO (ajeno, con la regla del manual) u OPORTUNIDAD (texto
//   fijo de traspaso, dueño COM). Cada turno que usa cuenta; al llegar al tope el sistema lo ESCALA y lo frena.
// · Un pedido sin respuesta igual queda visible: la lista sale de la tabla, no del texto del hilo.
import type { Prisma } from "@/generated/prisma/client";
import { NoPermitido, hablar, hiloDeAgente } from "./consola-core";
import { puede, type Actor, type Resultado } from "./permisos";
import { armarCierre, dondeDeLaVista, pasoElTope, TOPE, topeDe, type CierrePedido, type VistaPedidos } from "./pedidos";

type Tx = Prisma.TransactionClient;

function exigir(r: Resultado): void {
  if (!r.ok) throw new NoPermitido(r.motivo);
}

export type PedidoVista = {
  id: string;
  tenantId: string;
  agenteId: string;
  agenteNombre: string;
  texto: string;
  pedidoPor: string;
  topeMinutos: number;
  topeTurnos: number;
  turnosUsados: number;
  estado: string;
  salida: string | null;
  regla: string | null;
  duenio: string | null;
  respuesta: string | null;
  createdAt: Date;
  cerradoEn: Date | null;
};

const SELECCION = {
  id: true,
  tenantId: true,
  agenteId: true,
  texto: true,
  pedidoPor: true,
  topeMinutos: true,
  topeTurnos: true,
  turnosUsados: true,
  estado: true,
  salida: true,
  regla: true,
  duenio: true,
  respuesta: true,
  createdAt: true,
  cerradoEn: true,
  agente: { select: { nombre: true } },
} as const;

type Fila = Prisma.PedidoCuadrillaGetPayload<{ select: typeof SELECCION }>;
const aVista = ({ agente, ...p }: Fila): PedidoVista => ({ ...p, agenteNombre: agente.nombre });

/**
 * Lo que escribe una persona en un hilo. En el hilo de un agente es además un PEDIDO con su tope; en el de un
 * equipo, sólo un mensaje. El agente que habla en su hilo nunca crea pedidos (contesta).
 */
export async function hablarOPedir(
  tx: Tx,
  actor: Actor,
  tenantId: string,
  hilo: string,
  texto: string,
  topes: { minutos?: unknown; turnos?: unknown } = {},
): Promise<string | null> {
  await hablar(tx, actor, tenantId, hilo, texto);
  if (actor.tipo === "agente" || !hilo.startsWith("agente:")) return null;
  exigir(puede(actor, "pedir", { tenantId }));
  const agenteId = hilo.slice("agente:".length);
  const p = await tx.pedidoCuadrilla.create({
    data: {
      tenantId,
      agenteId,
      texto: texto.trim().slice(0, 2000),
      pedidoPor: actor.tipo === "operador" ? `${actor.nombre} (GSG)` : actor.nombre,
      pedidoPorUserId: actor.tipo === "operador" ? null : actor.userId,
      topeMinutos: topeDe(topes.minutos, TOPE.minutos),
      topeTurnos: topeDe(topes.turnos, TOPE.turnos),
    },
    select: { id: true },
  });
  return p.id;
}

async function avisoEnElHilo(tx: Tx, tenantId: string, agenteId: string, texto: string, autorTipo: "SISTEMA" | "AGENTE", autor: string): Promise<void> {
  await tx.mensajeCuadrilla.create({
    data: { tenantId, hilo: hiloDeAgente(agenteId), autorTipo, autor, agenteId: autorTipo === "AGENTE" ? agenteId : null, texto: texto.slice(0, 2000) },
  });
}

/** Escala por tope (condicionado a ABIERTO: dos lecturas a la vez escalan una sola vez) y frena al agente en ese pedido. */
async function escalarPorTope(tx: Tx, tenantId: string, p: { id: string; agenteId: string; texto: string }, porque: "minutos" | "turnos"): Promise<boolean> {
  const r = await tx.pedidoCuadrilla.updateMany({
    where: { id: p.id, tenantId, estado: "ABIERTO" },
    data: { estado: "ESCALADO", salida: "TOPE", cerradoEn: new Date() },
  });
  if (r.count !== 1) return false;
  const cual = porque === "minutos" ? "de minutos" : "de turnos";
  await tx.excepcionCuadrilla.create({
    data: {
      tenantId,
      agenteId: p.agenteId,
      tipo: "ESCALADO",
      categoria: "OTRA",
      titulo: `Un pedido llegó al tope ${cual}`,
      contenido: `El agente se frenó en este pedido y no sigue sin una persona: «${p.texto.slice(0, 600)}»`,
    },
  });
  await avisoEnElHilo(tx, tenantId, p.agenteId, `Este pedido llegó al tope ${cual}: me frené y lo pasé a una persona.`, "SISTEMA", "Sistema");
  return true;
}

/** Escala los pedidos abiertos de este negocio que ya pasaron su tope de minutos. Se llama al leer. */
export async function vencerPedidos(tx: Tx, tenantId: string, ahora: Date = new Date()): Promise<number> {
  const abiertos = await tx.pedidoCuadrilla.findMany({
    where: { tenantId, estado: "ABIERTO" },
    select: { id: true, agenteId: true, texto: true, createdAt: true, topeMinutos: true, topeTurnos: true, turnosUsados: true },
    take: 200,
  });
  let n = 0;
  for (const p of abiertos) {
    const porque = pasoElTope(p, ahora);
    if (porque && (await escalarPorTope(tx, tenantId, p, porque))) n++;
  }
  return n;
}

async function pedidoParaCerrar(tx: Tx, actor: Actor, tenantId: string, pedidoId: string) {
  const p = await tx.pedidoCuadrilla.findFirst({
    where: { id: pedidoId, tenantId },
    select: { id: true, tenantId: true, agenteId: true, estado: true, salida: true, texto: true, createdAt: true, topeMinutos: true, topeTurnos: true, turnosUsados: true },
  });
  if (!p) throw new NoPermitido("No existe ese pedido en este negocio.");
  if (p.salida === "TOPE" && actor.tipo === "agente" && actor.agenteId === p.agenteId) {
    throw new NoPermitido("Pasaste el tope: este pedido ya pasó a una persona y no se puede seguir ni dar por terminado.");
  }
  exigir(puede(actor, "cerrar_pedido", { pedido: p }));
  return p;
}

/**
 * El agente usa un turno en el pedido (contesta y sigue). Si ya estaba en el tope, NO se hace: se escala y se
 * devuelve "tope" (sin tirar error: la escalada tiene que quedar guardada). Si con este turno llega al tope,
 * se contesta y queda escalado: no sigue.
 */
export async function avanzarPedido(tx: Tx, actor: Actor, tenantId: string, pedidoId: string, texto: string, ahora: Date = new Date()): Promise<"sigue" | "escalado" | "tope"> {
  const p = await pedidoParaCerrar(tx, actor, tenantId, pedidoId);
  if (actor.tipo !== "agente") throw new NoPermitido("Un pedido lo avanza el agente que lo recibió.");
  const limpio = texto.trim().slice(0, 2000);
  if (!limpio) throw new NoPermitido("Escribí qué avanzaste.");
  const antes = pasoElTope(p, ahora);
  if (antes) {
    await escalarPorTope(tx, tenantId, p, antes);
    return "tope";
  }
  const r = await tx.pedidoCuadrilla.updateMany({
    where: { id: p.id, tenantId, estado: "ABIERTO", turnosUsados: p.turnosUsados },
    data: { turnosUsados: { increment: 1 } },
  });
  if (r.count !== 1) throw new NoPermitido("El pedido cambió mientras tanto: recargá y probá de nuevo.");
  await avisoEnElHilo(tx, tenantId, p.agenteId, limpio, "AGENTE", actor.nombre);
  const despues = pasoElTope({ ...p, turnosUsados: p.turnosUsados + 1 }, ahora);
  if (despues) {
    await escalarPorTope(tx, tenantId, p, despues);
    return "escalado";
  }
  return "sigue";
}

/**
 * El agente cierra el pedido por una salida. La respuesta queda en el hilo; la fila, en la consola.
 * Fuera de alcance (negado u oportunidad) se puede contestar aunque haya pasado el tope: no hace el trabajo.
 * HECHO con el tope vencido no: se escala y se devuelve "TOPE" (sin tirar error, para que quede guardado).
 */
export async function cerrarPedido(tx: Tx, actor: Actor, tenantId: string, pedidoId: string, cierre: CierrePedido, ahora: Date = new Date()): Promise<string> {
  const p = await pedidoParaCerrar(tx, actor, tenantId, pedidoId);
  if (actor.tipo !== "agente") throw new NoPermitido("Un pedido lo cierra el agente que lo recibió.");
  const c = armarCierre(cierre);
  if (!c.ok) throw new NoPermitido(c.motivo);
  const tope = pasoElTope(p, ahora);
  if (tope && cierre.salida === "HECHO") {
    await escalarPorTope(tx, tenantId, p, tope);
    return "TOPE";
  }
  const r = await tx.pedidoCuadrilla.updateMany({
    where: { id: p.id, tenantId, estado: "ABIERTO" },
    data: { estado: c.estado, salida: c.salida, regla: c.regla, duenio: c.duenio, respuesta: c.respuesta, cerradoEn: ahora },
  });
  if (r.count !== 1) throw new NoPermitido("Ese pedido ya está cerrado.");
  await avisoEnElHilo(tx, tenantId, p.agenteId, c.respuesta, "AGENTE", actor.nombre);
  return c.estado;
}

/** La lista de pedidos de un negocio para la consola: por vista (negados, oportunidades, …) y agente. */
export async function leerPedidos(tx: Tx, tenantId: string, filtros: { vista?: VistaPedidos; agenteId?: string } = {}): Promise<PedidoVista[]> {
  const donde = dondeDeLaVista(filtros.vista ?? "todos");
  const filas = await tx.pedidoCuadrilla.findMany({
    where: { tenantId, ...donde, ...(filtros.agenteId ? { agenteId: filtros.agenteId } : {}) },
    select: SELECCION,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return filas.map(aVista);
}

/** Los pedidos abiertos de un agente (su pantalla), del más viejo al más nuevo. */
export async function pedidosAbiertosDelAgente(tx: Tx, tenantId: string, agenteId: string): Promise<PedidoVista[]> {
  const filas = await tx.pedidoCuadrilla.findMany({
    where: { tenantId, agenteId, estado: "ABIERTO" },
    select: SELECCION,
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  return filas.map(aVista);
}
