// ============================================================================
// MANTENIMIENTO GSG — conexión de los AGENTES de soporte (rol `gsg_agente`, MANT-003, diseño §7.4, §15.5).
// ============================================================================
//
// SIN CAÍDA: usa sólo AGENTE_DATABASE_URL. Sin la variable (o si apunta a la misma URL que la app o la
// consola), `agenteDb()` da null y todo sigue como hoy: el ticket lo atiende una persona. Perezosa: no
// abre nada hasta que un agente la pide. Fail-closed también adentro: cada transacción comprueba que
// el rol conectado sea `gsg_agente` (un rol exento de RLS saltearía el candado) y si no, aborta.
//
// Lo que puede un agente acá: LEER un ticket de su negocio y GUARDAR UN BORRADOR (columna "borradorIa"),
// con su evento y su AuditLog en la misma transacción. NUNCA escribe `respuesta` ni envía nada: el
// borrador lo revisa y lo manda una persona. Antes de tocar la base decide `decidirAccionDeAgente`: CH
// («beauty-spa») o un negocio sin slug → no toca la base (D5: el borrador de CH lo guarda la consola).
// La base, además, lo impide sola (prisma/pending-gate2/MANT_roles_soporte.sql, sin aplicar: Gate 2).
// Prueba: agente-db-postgres.test.ts (Postgres efímero, conectando como gsg_agente).

import "server-only";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { decidirAccionDeAgente, NIVELES_DE_AGENTE, type NivelDeAgente, type Decision } from "./agentes-permisos";
import { agentePuedeEnTicket, urlDeAgente, validarBorradorDeAgente } from "./agente-core";
import { ESTADOS_ABIERTOS } from "./config";
import { codigosDelError, esTablaAusente } from "./alta.server";

export const ROL_DEL_AGENTE = "gsg_agente";

const globalParaAgente = globalThis as unknown as { agentePrisma?: { url: string; db: PrismaClient } };

/** El cliente de Prisma de los agentes, o null si la conexión está apagada (sin AGENTE_DATABASE_URL). */
export function agenteDb(env: Record<string, string | undefined> = process.env): PrismaClient | null {
  const url = urlDeAgente(env);
  if (!url) return null;
  const actual = globalParaAgente.agentePrisma;
  if (actual?.url === url) return actual.db;
  if (actual) void actual.db.$disconnect().catch(() => {});
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  globalParaAgente.agentePrisma = { url, db };
  return db;
}

/** Cierra la conexión de los agentes si está abierta (tests y apagado ordenado). */
export async function cerrarAgenteDb(): Promise<void> {
  const actual = globalParaAgente.agentePrisma;
  globalParaAgente.agentePrisma = undefined;
  if (actual) await actual.db.$disconnect();
}

export type EnElNegocioComoAgente<T> = { apagado: true } | { apagado: false; valor: T };

/**
 * Una transacción de agente PARADA EN UN NEGOCIO: comprueba el rol, y pone `app.current_tenant_id`,
 * `app.actor = 'agente:<nivel>'` y `app.cliente_tenant_id` (el cliente de cartera del ticket del
 * despacho; vacío si no es de cartera) locales a la transacción (pooling-safe, ADR-018). La base sólo
 * deja ver tickets de cartera de ESE cliente y con su permiso (MANT_roles_soporte.sql §4 bis). Sin
 * conexión → `{ apagado: true }` sin tocar nada. Si `fn` falla, no queda nada escrito.
 */
export async function enElNegocioComoAgente<T>(
  tenantId: string,
  nivel: NivelDeAgente,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  db: PrismaClient | null = agenteDb(),
  contexto: { clienteTenantId?: string | null } = {},
): Promise<EnElNegocioComoAgente<T>> {
  if (typeof tenantId !== "string" || !tenantId.trim()) throw new Error("enElNegocioComoAgente: falta el negocio.");
  if (!(NIVELES_DE_AGENTE as readonly string[]).includes(nivel)) throw new Error("enElNegocioComoAgente: nivel desconocido.");
  if (!db) return { apagado: true };
  const valor = await db.$transaction(async (tx) => {
    const [quien] = await tx.$queryRaw<{ rol: string }[]>`SELECT current_user::text AS rol`;
    if (quien?.rol !== ROL_DEL_AGENTE) throw new Error(`La conexión de los agentes no es ${ROL_DEL_AGENTE}: no se usa (fail-closed).`);
    const cliente = contexto.clienteTenantId?.trim() ?? "";
    await tx.$queryRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true), set_config('app.actor', ${`agente:${nivel}`}, true),
                              set_config('app.cliente_tenant_id', ${cliente}, true)`;
    return fn(tx);
  });
  return { apagado: false, valor };
}

export interface TicketParaElAgente {
  id: string;
  numero: number;
  tipo: string;
  prioridad: string;
  estado: string;
  asunto: string;
  detalle: string | null;
  canal: string;
  clienteTenantId: string | null;
  borradorIa: unknown;
  createdAt: Date;
}

export type ResultadoDelAgente<T> =
  | ({ ok: true } & T)
  | { ok: false; apagado?: true; decision?: Decision; motivo: string };

const NO_DISPONIBLE = "No hay un ticket que el agente pueda ver (no existe, no hay permiso o es de CH).";
const APAGADO = "Sin AGENTE_DATABASE_URL: los agentes con datos están apagados y el ticket lo atiende una persona.";

class Rechazo extends Error {}

interface PedidoDeTicket {
  tenantId: string;
  /** El slug del negocio donde vive el ticket: decide CH antes de tocar la base. */
  slug: string | null | undefined;
  nivel: unknown;
  numero: number;
  /**
   * El cliente de cartera del ticket, como lo trae el despacho del ERP (null si no es de cartera). Si el
   * ticket es de cartera y no coincide, el agente no lo ve (falla cerrado).
   */
  clienteTenantId?: string | null;
}

/** Lo que decide el código antes de abrir la base. null = sigue; si no, la respuesta sin tocar nada. */
function antesDeLaBase(p: PedidoDeTicket, accion: "leer_ticket" | "borrador_respuesta"): { ok: false; decision?: Decision; motivo: string } | null {
  const d = decidirAccionDeAgente(p.nivel, accion, p.slug);
  if (d.decision !== "permitido") return { ok: false, decision: d.decision, motivo: d.motivo };
  if (!Number.isInteger(p.numero) || p.numero < 1) return { ok: false, motivo: "Número de ticket inválido." };
  return null;
}

/**
 * El ticket, si el agente lo puede ver: el slug del negocio coincide con el de la base, el candado de la
 * base lo deja ver y, en código, el permiso del estudio y (si es de cartera) el del cliente están
 * vigentes y ninguno es CH. null si no (indistinguible a propósito: no existe / sin permiso / CH).
 */
async function ticketVisibleEnTx(tx: Prisma.TransactionClient, p: PedidoDeTicket, nivel: NivelDeAgente, accion: "leer_ticket" | "borrador_respuesta"): Promise<TicketParaElAgente | null> {
  // El agente no lee `Tenant` ni `SoporteConsentimiento` (MANT_roles_soporte.sql §5): el slug y el
  // permiso (de cada nivel) salen de funciones SECURITY DEFINER sin parámetros, sobre el negocio FIJADO.
  const [negocio] = await tx.$queryRaw<{ slug: string | null }[]>`SELECT gsg_slug_del_negocio() AS slug`;
  if (!negocio?.slug || negocio.slug !== p.slug || decidirAccionDeAgente(nivel, accion, negocio.slug).decision !== "permitido") return null;
  const [t] = await tx.$queryRaw<TicketParaElAgente[]>`
    SELECT id, numero, tipo, prioridad, estado, asunto, detalle, canal, "clienteTenantId", "borradorIa", "createdAt"
    FROM "SupportTicket" WHERE "tenantId" = ${p.tenantId} AND numero = ${p.numero}`;
  if (!t || (t.clienteTenantId ?? null) !== (p.clienteTenantId?.trim() || null)) return null;
  const [permiso] = await tx.$queryRaw<{ estudio: boolean; cliente: boolean }[]>`
    SELECT gsg_permiso_n1_vigente() AS estudio, gsg_permiso_n1_cliente_de_cartera() AS cliente`;
  let cliente: { slug: string | null; n1: boolean } | null = null;
  if (t.clienteTenantId) {
    const [c] = await tx.$queryRaw<{ slug: string | null }[]>`SELECT gsg_slug_del_cliente() AS slug`;
    cliente = { slug: c?.slug ?? null, n1: permiso?.cliente === true };
  }
  const v = agentePuedeEnTicket({ estudio: { slug: negocio.slug, n1: permiso?.estudio === true }, cliente });
  if (!v.puede) return null;
  // El permiso DEL NIVEL (certificación MANT-004, hallazgo 1): n2 exige además el n2 vigente del estudio y,
  // si es de cartera, el del cliente. n3 alcanza con el n1, como en `nivelesPermitidos` (consentimiento-core).
  // Se lee en esta misma transacción, en GET y en POST: una revocación vale desde la siguiente llamada.
  if (nivel === "n2") {
    const [n2] = await tx.$queryRaw<{ estudio: boolean; cliente: boolean }[]>`
      SELECT gsg_permiso_n2_vigente() AS estudio, gsg_permiso_n2_cliente_de_cartera() AS cliente`;
    if (n2?.estudio !== true || (t.clienteTenantId && n2?.cliente !== true)) return null;
  }
  return t;
}

type Opciones = {
  db?: PrismaClient | null;
  /**
   * Sólo para el borrador: corre DENTRO de la transacción del agente, antes de guardar. Devuelve un
   * motivo para rechazar (no se escribe nada) o null para seguir. Lo usa el despacho (despacho.server.ts)
   * para comprobar, con su candado, que el despacho sigue abierto: así el borrador y el cierre van juntos.
   */
  antesDeGuardar?: (tx: Prisma.TransactionClient) => Promise<string | null>;
};
const dbDe = (o: Opciones) => ("db" in o ? (o.db ?? null) : agenteDb());

/** Lee un ticket como agente (acción «leer_ticket»). CH o slug vacío → no toca la base. */
export async function leerTicketComoAgente(p: PedidoDeTicket, opciones: Opciones = {}): Promise<ResultadoDelAgente<{ ticket: TicketParaElAgente }>> {
  const corte = antesDeLaBase(p, "leer_ticket");
  if (corte) return corte;
  const nivel = p.nivel as NivelDeAgente;
  try {
    const r = await enElNegocioComoAgente(p.tenantId, nivel, (tx) => ticketVisibleEnTx(tx, p, nivel, "leer_ticket"), dbDe(opciones), p);
    if (r.apagado) return { ok: false, apagado: true, motivo: APAGADO };
    return r.valor ? { ok: true, ticket: r.valor } : { ok: false, motivo: NO_DISPONIBLE };
  } catch (e) {
    if (esTablaAusente(e)) return { ok: false, motivo: "Todavía no está la tabla de tickets (falta aplicar la migración)." };
    throw e;
  }
}

/**
 * Dentro de una transacción de agente ya parada en el negocio: guarda el borrador (sólo "borradorIa" y
 * "updatedAt"), su evento (actor `agente:<nivel>`) y su AuditLog (SQL crudo sin RETURNING: el rol no lee
 * AuditLog). Si entre la lectura y la escritura el negocio o el cliente sacaron el permiso, la escritura
 * no encuentra la fila (0 filas, o la base la rechaza) y se aborta todo. Nunca toca `respuesta`.
 */
export async function guardarBorradorEnTx(
  tx: Prisma.TransactionClient,
  p: PedidoDeTicket & { borrador: unknown; despachoId?: string | null },
): Promise<{ ticketId: string }> {
  const nivel = p.nivel as NivelDeAgente;
  const v = validarBorradorDeAgente(p.borrador);
  if (!v.ok) throw new Rechazo(v.error);
  const t = await ticketVisibleEnTx(tx, p, nivel, "borrador_respuesta");
  if (!t) throw new Rechazo(NO_DISPONIBLE);
  if (!(ESTADOS_ABIERTOS as readonly string[]).includes(t.estado)) throw new Rechazo("El ticket ya está resuelto o cerrado.");
  const actor = `agente:${nivel}`;
  const borrador = { ...v.valor, el: new Date().toISOString(), autor: actor };
  // Las horas, en UTC explícito (certificación, hallazgo 3): las columnas son sin zona y su DEFAULT
  // depende de la zona de la sesión; con otra zona el borrador_ia quedaba «antes» del disparo y no lo
  // cerraba. Además el evento lleva el despacho que cierra (despachoActual lo exige si viene).
  const filas = await tx.$executeRaw`
    UPDATE "SupportTicket" SET "borradorIa" = ${JSON.stringify(borrador)}::jsonb, "updatedAt" = (clock_timestamp() AT TIME ZONE 'UTC')
    WHERE id = ${t.id} AND "tenantId" = ${p.tenantId}`;
  if (filas !== 1) throw new Rechazo("El ticket dejó de estar disponible para el agente (¿se sacó el permiso?).");
  const datos = { tipo: v.valor.tipo, prioridad: v.valor.prioridad, ...(p.despachoId ? { despachoId: p.despachoId } : {}) };
  await tx.$executeRaw`
    INSERT INTO "SupportTicketEvento" (id, "tenantId", "ticketId", tipo, actor, datos, "createdAt")
    VALUES (${randomUUID()}, ${p.tenantId}, ${t.id}, 'borrador_ia', ${actor}, ${JSON.stringify(datos)}::jsonb, (clock_timestamp() AT TIME ZONE 'UTC'))`;
  await tx.$executeRaw`
    INSERT INTO "AuditLog" (id, "tenantId", actor, action, entity, "entityId", changes, channel, "createdAt")
    VALUES (${randomUUID()}, ${p.tenantId}, ${actor}, 'soporte.agente.borrador', 'SupportTicket', ${t.id},
            ${JSON.stringify({ numero: t.numero, nivel })}::jsonb, 'agente', (clock_timestamp() AT TIME ZONE 'UTC'))`;
  return { ticketId: t.id };
}

/** Guarda el borrador de un agente (acción «borrador_respuesta»). CH o slug vacío → no toca la base. */
export async function guardarBorradorComoAgente(
  p: PedidoDeTicket & { borrador: unknown; despachoId?: string | null },
  opciones: Opciones = {},
): Promise<ResultadoDelAgente<{ ticketId: string }>> {
  const corte = antesDeLaBase(p, "borrador_respuesta");
  if (corte) return corte;
  const v = validarBorradorDeAgente(p.borrador);
  if (!v.ok) return { ok: false, motivo: v.error };
  try {
    const r = await enElNegocioComoAgente(
      p.tenantId,
      p.nivel as NivelDeAgente,
      async (tx) => {
        const rechazo = opciones.antesDeGuardar ? await opciones.antesDeGuardar(tx) : null;
        if (rechazo) throw new Rechazo(rechazo);
        return guardarBorradorEnTx(tx, p);
      },
      dbDe(opciones),
      p,
    );
    if (r.apagado) return { ok: false, apagado: true, motivo: APAGADO };
    return { ok: true, ticketId: r.valor.ticketId };
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, motivo: e.message };
    if (codigosDelError(e).postgres === "42501") return { ok: false, motivo: "La base no dejó escribir al agente (permiso o CH)." };
    if (esTablaAusente(e)) return { ok: false, motivo: "Todavía no está la tabla de tickets (falta aplicar la migración)." };
    throw e;
  }
}
