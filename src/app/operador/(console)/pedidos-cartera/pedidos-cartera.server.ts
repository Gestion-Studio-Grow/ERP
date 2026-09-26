// ============================================================================
// PEDIDOS DE LA CARTERA (Soporte GSG) — el servidor de la bandeja.
// ============================================================================
//
// La otra punta de «Pedir a Soporte GSG» de la ficha del cliente (src/app/contador/pedido-soporte.ts).
// La contadora deja el pedido en la auditoría de SU estudio (`cartera.pedido_soporte`); acá Soporte
// lo ve, lo resuelve en la consola (dirección, CUIT, plan: lo de siempre) y lo CIERRA con otra fila
// (`cartera.pedido_soporte_resuelto`, `changes.pedidoId`), también en el estudio. Nada se edita.
// Con ese cierre el pedido sale de la bandeja, deja de estar marcado en la ficha y la contadora ve
// la respuesta (y puede volver a pedirlo si hace falta).
//
// NO lleva "use server": lo llama `actions.ts` después de la sesión de operador, y los tests lo
// ejecutan contra Postgres con el cliente del operador. Recibe la base por parámetro.
// CH (beauty-spa) sólo la toca el dueño de GSG: la misma guardia que el resto de la consola.

import "server-only";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { decidirOperadorParaNegocios } from "@/lib/operador/guardia-negocio-core";
import {
  ACCION_PEDIDO_RESUELTO,
  ACCION_PEDIDO_SOPORTE,
  desdeDeLaVentana,
  ENTIDAD_PEDIDO_SOPORTE,
  pedidosAbiertos,
  validarResolucion,
  type PedidoAbierto,
} from "@/app/contador/pedido-soporte";

type Tx = Prisma.TransactionClient;

/** Un pedido abierto, con lo que Soporte necesita para resolverlo sin salir a buscar. */
export interface PedidoDeCartera extends PedidoAbierto {
  estudio: { id: string; nombre: string; slug: string; whatsapp: string | null };
  cliente: { id: string; nombre: string; slug: string; alias: string; cuitActual: string | null; plan: string | null; subdominio: string | null };
  nota: string | null;
  pedidoPor: { nombre: string; email: string } | null;
}

function campo(c: unknown, k: string): unknown {
  return typeof c === "object" && c !== null && !Array.isArray(c) ? (c as Record<string, unknown>)[k] : undefined;
}

/** Filas de pedidos y cierres de todos los estudios, dentro de la misma ventana que ve la contadora. */
function filasDePedidos(db: PrismaClient | Tx, estudioId?: string) {
  return db.auditLog.findMany({
    where: {
      ...(estudioId ? { tenantId: estudioId } : {}),
      entity: ENTIDAD_PEDIDO_SOPORTE,
      action: { in: [ACCION_PEDIDO_SOPORTE, ACCION_PEDIDO_RESUELTO] },
      createdAt: { gte: desdeDeLaVentana() },
    },
    orderBy: { createdAt: "asc" },
    take: 2000,
    select: { id: true, tenantId: true, actor: true, action: true, entityId: true, changes: true, createdAt: true },
  });
}

/** Los pedidos abiertos de todos los estudios, del más viejo al más nuevo (paginado: `limite`). */
export async function listarPedidosDeCartera(db: PrismaClient, limite = 50): Promise<PedidoDeCartera[]> {
  const filas = await filasDePedidos(db);
  const porId = new Map(filas.map((f) => [f.id, f]));
  const abiertos = pedidosAbiertos(filas).slice(0, limite);
  if (abiertos.length === 0) return [];

  const estudioIds = [...new Set(abiertos.map((a) => porId.get(a.id)!.tenantId))];
  const clienteIds = [...new Set(abiertos.map((a) => a.clienteTenantId))];
  const userIds = [
    ...new Set(
      abiertos.map((a) => porId.get(a.id)!.actor).filter((x) => x.startsWith("user:")).map((x) => x.slice("user:".length)),
    ),
  ];
  const [estudios, clientes, usuarios, carteras] = await Promise.all([
    db.tenant.findMany({ where: { id: { in: estudioIds } }, select: { id: true, name: true, slug: true, businessSettings: { select: { whatsapp: true } } } }),
    db.tenant.findMany({ where: { id: { in: clienteIds } }, select: { id: true, name: true, slug: true, arcaCuit: true, plan: true, subdomain: true } }),
    db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }),
    db.carteraCliente.findMany({
      where: { tenantId: { in: estudioIds }, clienteTenantId: { in: clienteIds } },
      select: { tenantId: true, clienteTenantId: true, alias: true },
    }),
  ]);
  const estudio = new Map(estudios.map((e) => [e.id, e]));
  const cliente = new Map(clientes.map((c) => [c.id, c]));
  const usuario = new Map(usuarios.map((u) => [u.id, u]));
  const alias = new Map(carteras.map((c) => [`${c.tenantId}:${c.clienteTenantId}`, c.alias]));

  const salida: PedidoDeCartera[] = [];
  for (const a of abiertos) {
    const fila = porId.get(a.id)!;
    const e = estudio.get(fila.tenantId);
    const c = cliente.get(a.clienteTenantId);
    if (!e || !c) continue;
    const u = fila.actor.startsWith("user:") ? usuario.get(fila.actor.slice("user:".length)) : undefined;
    const aliasGuardado = campo(fila.changes, "alias");
    const nota = campo(fila.changes, "nota");
    salida.push({
      ...a,
      estudio: { id: e.id, nombre: e.name, slug: e.slug, whatsapp: e.businessSettings?.whatsapp ?? null },
      cliente: {
        id: c.id,
        nombre: c.name,
        slug: c.slug,
        alias: alias.get(`${e.id}:${c.id}`) ?? (typeof aliasGuardado === "string" ? aliasGuardado : c.name),
        cuitActual: c.arcaCuit,
        plan: c.plan,
        subdominio: c.subdomain,
      },
      nota: typeof nota === "string" && nota ? nota : null,
      pedidoPor: u ? { nombre: u.name, email: u.email } : null,
    });
  }
  return salida;
}

class Rechazo extends Error {}

/**
 * Soporte cierra un pedido: «hecho» (ya lo resolvió en la consola) o «no corresponde» (con el
 * porqué, que la contadora lee en la ficha). Una transacción con candado por pedido: dos clics
 * cierran una vez. La fila va al ESTUDIO (con su RLS puesto), igual que el pedido.
 */
export async function resolverPedidoDeCartera(
  db: PrismaClient,
  opts: { pedidoId: string; estudioTenantId?: string; sesion: { nombre: string; esDuenio: boolean }; resultado: unknown; respuesta: unknown },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const v = validarResolucion({ resultado: opts.resultado, respuesta: opts.respuesta });
  if (!v.ok) return v;
  try {
    return await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pedido-soporte-resolver:${opts.pedidoId}`}))`;
      const pedido = await tx.auditLog.findUnique({
        where: { id: opts.pedidoId },
        select: { id: true, tenantId: true, action: true, entity: true, entityId: true, tenant: { select: { slug: true } } },
      });
      if (!pedido || pedido.action !== ACCION_PEDIDO_SOPORTE || pedido.entity !== ENTIDAD_PEDIDO_SOPORTE || !pedido.entityId) {
        throw new Rechazo("Ese pedido no existe.");
      }
      // La acción pasó la guardia con el estudio del formulario: el pedido tiene que ser de ESE estudio.
      if (opts.estudioTenantId !== undefined && pedido.tenantId !== opts.estudioTenantId) throw new Rechazo("Ese pedido no existe.");
      const abierto = pedidosAbiertos(await filasDePedidos(tx, pedido.tenantId)).some((a) => a.id === pedido.id);
      if (!abierto) throw new Rechazo("Ese pedido ya estaba resuelto.");
      const cliente = await tx.tenant.findUnique({ where: { id: pedido.entityId }, select: { slug: true } });
      const g = decidirOperadorParaNegocios(opts.sesion, [pedido.tenant.slug, cliente?.slug]);
      if (!g.ok) throw new Rechazo(g.motivo);
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${pedido.tenantId}, true)`;
      await tx.auditLog.create({
        data: {
          tenantId: pedido.tenantId,
          actor: `operator:${opts.sesion.nombre}`,
          action: ACCION_PEDIDO_RESUELTO,
          entity: ENTIDAD_PEDIDO_SOPORTE,
          entityId: pedido.entityId,
          channel: "admin",
          changes: { pedidoId: pedido.id, resultado: v.resolucion.resultado, respuesta: v.resolucion.respuesta, operador: opts.sesion.nombre },
        },
        select: { id: true },
      });
      return { ok: true as const };
    });
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, error: e.message };
    throw e;
  }
}
