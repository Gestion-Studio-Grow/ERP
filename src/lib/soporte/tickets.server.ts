// ============================================================================
// CONSOLA DE SOPORTE GSG — la base de los tickets (T1).
// ============================================================================
//
// Sin "use server" (no es un endpoint): lo llaman `pedido-soporte.server.ts` (el alta, con la
// transacción del ESTUDIO) y las actions de /operador/soporte (después de la sesión de operador y
// la guardia de CH). Recibe la base por parámetro, como la bandeja de pedidos de la cartera.
//
// CON RLS: cada ticket es del negocio que pidió. La consola (sujeta a RLS en producción, ver
// operator-db.ts) lee y escribe parada en cada negocio con `enElNegocio`, uno por transacción.
//
// GATE 2: la migración 20261106120000_support_ticket puede no estar aplicada. Sin la tabla, el alta
// no hace nada (el pedido sigue quedando en AuditLog como hasta hoy), la lista dice que falta y la
// ficha no existe. Nada de esto rompe la pantalla de la contadora.

import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { crearTicketEnTx, esTablaAusente, hayTablaDeTickets } from "./alta.server";
import { enElNegocio } from "@/lib/operator-db";
import { MODULO_CARTERA } from "@/lib/cartera-core";
import {
  ACCION_PEDIDO_RESUELTO,
  ACCION_PEDIDO_SOPORTE,
  desdeDeLaVentana,
  ENTIDAD_PEDIDO_SOPORTE,
  pedidosAbiertos,
} from "@/app/contador/pedido-soporte";
import { ESTADOS_ABIERTOS, type EstadoTicket, type Prioridad, type TipoTicket, type Canal } from "./config";
import {
  esCanal,
  estadoLeido,
  fechasPorEstado,
  ordenarTickets,
  prioridadLeida,
  ticketDesdeFilaDePedido,
  tipoLeido,
  validarCambioDeEstado,
  validarCambioDePrioridad,
  validarNotaInterna,
  validarRespuesta,
  venceElPara,
  type Filtros,
  type SugerenciaIa,
} from "./tickets-core";

/**
 * Trae a la consola los pedidos de la cartera ABIERTOS que todavía no tienen ticket (los de antes de
 * la migración, o uno cuyo ticket falló). Idempotente: correrlo dos veces no duplica nada.
 */
export async function traerPedidosSinTicket(
  db: PrismaClient,
  /** La guardia del operador por negocio (CH sólo el dueño): un estudio que no puede tocar se saltea. */
  puedeTocar: (slug: string) => boolean,
): Promise<{ creados: number } | { sinTabla: true }> {
  if (!(await hayTablaDeTickets(db))) return { sinTabla: true };
  const estudios = await db.tenant.findMany({ where: { modules: { has: MODULO_CARTERA } }, select: { id: true, slug: true } });
  let creados = 0;
  for (const e of estudios) {
    if (!puedeTocar(e.slug)) continue;
    creados += await enElNegocio(
      e.id,
      async (tx) => {
        const filas = await tx.auditLog.findMany({
          where: { tenantId: e.id, entity: ENTIDAD_PEDIDO_SOPORTE, action: { in: [ACCION_PEDIDO_SOPORTE, ACCION_PEDIDO_RESUELTO] }, createdAt: { gte: desdeDeLaVentana() } },
          orderBy: { createdAt: "asc" },
          take: 2000,
          select: { id: true, actor: true, action: true, entityId: true, changes: true, createdAt: true },
        });
        const abiertos = new Set(pedidosAbiertos(filas).map((a) => a.id));
        let n = 0;
        for (const f of filas) {
          if (!abiertos.has(f.id)) continue;
          const d = ticketDesdeFilaDePedido(f);
          if (!d) continue;
          const r = await crearTicketEnTx(tx, e.id, d);
          if (r?.nuevo) n++;
        }
        return n;
      },
      db,
    );
  }
  return { creados };
}

// ── Lectura ─────────────────────────────────────────────────────────────────────────────────────

export interface TicketResumen {
  id: string;
  negocio: { id: string; nombre: string; slug: string };
  numero: number;
  tipo: TipoTicket;
  prioridad: Prioridad;
  estado: EstadoTicket;
  asunto: string;
  canal: Canal | null;
  asignadoA: string | null;
  createdAt: Date;
  venceEl: Date | null;
}

const SELECT_RESUMEN = {
  id: true,
  tenantId: true,
  numero: true,
  tipo: true,
  prioridad: true,
  estado: true,
  asunto: true,
  canal: true,
  asignadoA: true,
  createdAt: true,
  venceEl: true,
} as const;

function whereDeFiltros(tenantId: string, f: Filtros): Prisma.SupportTicketWhereInput {
  return {
    tenantId,
    ...(f.estado === "abiertos" ? { estado: { in: [...ESTADOS_ABIERTOS] } } : f.estado ? { estado: f.estado } : {}),
    ...(f.prioridad ? { prioridad: f.prioridad } : {}),
    ...(f.tipo ? { tipo: f.tipo } : {}),
  };
}

/**
 * Los tickets de todos los negocios que pasan los filtros, ordenados (P1 y lo que vence antes arriba).
 *
 * DECISIÓN EXPLÍCITA (certificación T1, hallazgo 3): todo operador con sesión LEE los tickets de
 * TODOS los negocios, CH incluido (lista y ficha: asunto, detalle, historial). La guardia por negocio
 * (CH sólo el dueño de GSG, guardia-negocio-core) se aplica a lo que ESCRIBE (actions.ts: cambiar,
 * sugerir con IA, traer pedidos), no a la lectura: Soporte necesita ver la cola entera para
 * priorizar. Si un negocio exige que ni la lectura salga del dueño, filtrar acá con la misma guardia.
 * Doc: docs/producto/soporte/consola-soporte-t1.md.
 */
export async function listarTickets(db: PrismaClient, f: Filtros, limite = 100): Promise<{ sinTabla: true } | { tickets: TicketResumen[] }> {
  if (!(await hayTablaDeTickets(db))) return { sinTabla: true };
  const negocios = await db.tenant.findMany({ select: { id: true, name: true, slug: true } });
  const porNegocio = await Promise.all(
    negocios.map((n) =>
      enElNegocio(n.id, (tx) => tx.supportTicket.findMany({ where: whereDeFiltros(n.id, f), orderBy: { createdAt: "asc" }, take: limite, select: SELECT_RESUMEN }), db),
    ),
  );
  const negocio = new Map(negocios.map((n) => [n.id, { id: n.id, nombre: n.name, slug: n.slug }]));
  const tickets = porNegocio.flat().flatMap((t): TicketResumen[] => {
    const n = negocio.get(t.tenantId);
    if (!n) return [];
    return [
      {
        id: t.id,
        negocio: n,
        numero: t.numero,
        tipo: tipoLeido(t.tipo),
        prioridad: prioridadLeida(t.prioridad),
        estado: estadoLeido(t.estado),
        asunto: t.asunto,
        canal: esCanal(t.canal) ? t.canal : null,
        asignadoA: t.asignadoA,
        createdAt: t.createdAt,
        venceEl: t.venceEl,
      },
    ];
  });
  return { tickets: ordenarTickets(tickets).slice(0, limite) };
}

export interface EventoDeTicket {
  id: string;
  tipo: string;
  actor: string;
  texto: string | null;
  datos: unknown;
  createdAt: Date;
}

export interface FichaDeTicket extends TicketResumen {
  detalle: string | null;
  creadoPor: string;
  respuesta: string | null;
  borradorIa: SugerenciaIa | null;
  respondidoEl: Date | null;
  resueltoEl: Date | null;
  cliente: { id: string; nombre: string } | null;
  whatsappDelNegocio: string | null;
  eventos: EventoDeTicket[];
}

function borradorLeido(x: unknown): SugerenciaIa | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;
  if (typeof o.respuesta !== "string") return null;
  return { tipo: tipoLeido(o.tipo), prioridad: prioridadLeida(o.prioridad), respuesta: o.respuesta, motivo: typeof o.motivo === "string" ? o.motivo : "" };
}

/** La ficha de un ticket, parada en su negocio. null si no existe (o la tabla todavía no está). */
export async function fichaDeTicket(db: PrismaClient, tenantId: string, numero: number): Promise<FichaDeTicket | null> {
  if (!Number.isInteger(numero) || numero < 1) return null;
  const negocio = await db.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, slug: true } });
  if (!negocio || !(await hayTablaDeTickets(db))) return null;
  const leido = await enElNegocio(
    tenantId,
    async (tx) => {
      const t = await tx.supportTicket.findUnique({
        where: { tenantId_numero: { tenantId, numero } },
        include: { eventos: { orderBy: { createdAt: "asc" }, select: { id: true, tipo: true, actor: true, texto: true, datos: true, createdAt: true } } },
      });
      if (!t) return null;
      const ajustes = await tx.businessSettings.findUnique({ where: { tenantId }, select: { whatsapp: true } });
      return { t, whatsapp: ajustes?.whatsapp ?? null };
    },
    db,
  );
  if (!leido) return null;
  const { t } = leido;
  // `Tenant` no tiene RLS: el nombre del cliente de la cartera se lee directo.
  const cliente = t.clienteTenantId ? await db.tenant.findUnique({ where: { id: t.clienteTenantId }, select: { id: true, name: true } }) : null;
  return {
    id: t.id,
    negocio: { id: negocio.id, nombre: negocio.name, slug: negocio.slug },
    numero: t.numero,
    tipo: tipoLeido(t.tipo),
    prioridad: prioridadLeida(t.prioridad),
    estado: estadoLeido(t.estado),
    asunto: t.asunto,
    canal: esCanal(t.canal) ? t.canal : null,
    asignadoA: t.asignadoA,
    createdAt: t.createdAt,
    venceEl: t.venceEl,
    detalle: t.detalle,
    creadoPor: t.creadoPor,
    respuesta: t.respuesta,
    borradorIa: borradorLeido(t.borradorIa),
    respondidoEl: t.respondidoEl,
    resueltoEl: t.resueltoEl,
    cliente: cliente ? { id: cliente.id, nombre: cliente.name } : null,
    whatsappDelNegocio: leido.whatsapp,
    eventos: t.eventos,
  };
}

// ── Cambios desde la consola ────────────────────────────────────────────────────────────────────

export type CambioDeTicket =
  | { que: "estado"; valor: unknown }
  | { que: "prioridad"; valor: unknown }
  | { que: "nota"; texto: unknown }
  | { que: "respuesta"; texto: unknown }
  | { que: "tomar" }
  | { que: "borrador"; sugerencia: SugerenciaIa };

class Rechazo extends Error {}

/**
 * Un cambio sobre un ticket, con su fila de historial, en UNA transacción parada en el negocio y con
 * candado por ticket (dos clics no dejan dos cambios). El estado y la prioridad se validan contra el
 * valor ACTUAL leído adentro del candado, no contra lo que mostraba la pantalla.
 */
export async function cambiarTicket(
  db: PrismaClient,
  p: { tenantId: string; numero: number; operador: string; cambio: CambioDeTicket },
  ahora: Date = new Date(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = `operator:${p.operador}`;
  try {
    return await enElNegocio(
      p.tenantId,
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`soporte-ticket:${p.tenantId}:${p.numero}`}))`;
        const t = await tx.supportTicket.findUnique({
          where: { tenantId_numero: { tenantId: p.tenantId, numero: p.numero } },
          select: { id: true, estado: true, prioridad: true, createdAt: true, respondidoEl: true },
        });
        if (!t) throw new Rechazo("Ese ticket no existe.");
        const evento = (tipo: string, texto: string | null, datos?: Prisma.InputJsonValue) =>
          tx.supportTicketEvento.create({ data: { tenantId: p.tenantId, ticketId: t.id, tipo, actor, texto, ...(datos ? { datos } : {}) }, select: { id: true } });
        const c = p.cambio;
        switch (c.que) {
          case "estado": {
            const v = validarCambioDeEstado(estadoLeido(t.estado), c.valor);
            if (!v.ok) throw new Rechazo(v.error);
            await tx.supportTicket.update({ where: { id: t.id }, data: { estado: v.valor, ...fechasPorEstado(v.valor, ahora) } });
            await evento("estado", null, { de: t.estado, a: v.valor });
            break;
          }
          case "prioridad": {
            const v = validarCambioDePrioridad(prioridadLeida(t.prioridad), c.valor);
            if (!v.ok) throw new Rechazo(v.error);
            // El vencimiento se recalcula desde que entró el ticket, con el tiempo de la prioridad nueva.
            await tx.supportTicket.update({ where: { id: t.id }, data: { prioridad: v.valor, venceEl: venceElPara(v.valor, t.createdAt) } });
            await evento("prioridad", null, { de: t.prioridad, a: v.valor });
            break;
          }
          case "nota": {
            const v = validarNotaInterna(c.texto);
            if (!v.ok) throw new Rechazo(v.error);
            await tx.supportTicket.update({ where: { id: t.id }, data: { updatedAt: ahora } });
            await evento("nota", v.valor);
            break;
          }
          case "respuesta": {
            const v = validarRespuesta(c.texto);
            if (!v.ok) throw new Rechazo(v.error);
            await tx.supportTicket.update({ where: { id: t.id }, data: { respuesta: v.valor, respondidoEl: t.respondidoEl ?? ahora } });
            await evento("respuesta", v.valor);
            break;
          }
          case "tomar": {
            await tx.supportTicket.update({ where: { id: t.id }, data: { asignadoA: p.operador } });
            await evento("asignado", null, { a: p.operador });
            break;
          }
          case "borrador": {
            const s = c.sugerencia;
            const borrador = { tipo: s.tipo, prioridad: s.prioridad, respuesta: s.respuesta, motivo: s.motivo, el: ahora.toISOString() };
            await tx.supportTicket.update({ where: { id: t.id }, data: { borradorIa: borrador } });
            await evento("borrador_ia", null, { tipo: s.tipo, prioridad: s.prioridad });
            break;
          }
        }
        return { ok: true as const };
      },
      db,
    );
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, error: e.message };
    if (esTablaAusente(e)) return { ok: false, error: "Todavía no está la tabla de tickets (falta aplicar la migración)." };
    throw e;
  }
}
