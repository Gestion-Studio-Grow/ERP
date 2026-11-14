// ============================================================================
// MANTENIMIENTO GSG — la API que llama la sesión disparada (MANT-004, diseño §15.5).
// ============================================================================
//
// GET  /api/soporte/agente?ref=<slug>#<n>         → el ticket, con el texto del cliente en <texto_del_cliente>
// POST /api/soporte/agente  { ref, borrador }      → guarda el borrador y cierra el despacho
// Siempre: `Authorization: Bearer <clave del nivel>` y `x-mant-despacho: <nonce del disparo>`.
//
//   · El NIVEL sale de la credencial (MANT_AGENTE_N1_CLAVE / _N2_, tiempo constante), nunca del pedido.
//   · El NEGOCIO lo resuelve el servidor: un despacho abierto de ese nivel, de menos de 2 h, cuya huella
//     de nonce coincide, en el ticket de la ref. Nunca un tenantId del cuerpo o la query.
//   · Cualquier falla después de autenticar (ref de otro negocio, nonce de otro nivel o inventado, sin
//     permiso, CH, ticket cerrado, despacho cerrado o vencido) → el MISMO 404. Credencial mala → 401.
//   · Límites: por credencial (en memoria, por proceso) y tope de llamadas por despacho (en AuditLog).
//   · Rastro: cada llamada autenticada con negocio conocido deja un AuditLog (actor agente:<nivel>, ticket,
//     endpoint, sesión de Claude, resultado), escrito por la consola parada en ese negocio.
//   · Lee y escribe con el rol `gsg_agente` (agente-db.ts: permiso del titular, candado de CH y de ticket
//     abierto). Sin AGENTE_DATABASE_URL o sin claves → 503 { apagado: true, motivo }.
// Lo prueba despacho-postgres.test.ts.

import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { enElNegocio, operatorPrisma } from "@/lib/operator-db";
import { clientIpFromRequest, createRateLimiter, type RateLimiter } from "@/lib/rate-limit";
import { agenteDb, guardarBorradorComoAgente, leerTicketComoAgente } from "./agente-db";
import { urlDeAgente, validarBorradorDeAgente } from "./agente-core";
import { esTablaAusente } from "./alta.server";
import { PRIORIDADES, TIPOS_TICKET } from "./config";
import {
  HEADER_DEL_NONCE,
  TOPE_DE_LLAMADAS_POR_DESPACHO,
  bloqueDelCliente,
  despachoActual,
  leerRef,
  nivelDeLaCredencial,
  vigenteParaElAgente,
  type NivelDeDespacho,
} from "./despacho-core";
import { anotarListo, candadoDelDespacho, eventosDelDespacho, type DependenciasDelDespacho } from "./despacho.server";

/** Llamadas por credencial (por nivel) por minuto. Provisional a confirmar. */
const limitadorPorCredencial = createRateLimiter({ max: 60, windowMs: 60_000 });
/** Credenciales malas por IP en 15 min. */
const fallasPorIp = createRateLimiter({ max: 10, windowMs: 15 * 60_000 });
const LARGO_MAXIMO_DEL_PEDIDO = 16_384;
export const RUTA_DEL_AGENTE = "/api/soporte/agente";

export interface DependenciasDeLaApi extends DependenciasDelDespacho {
  /** La conexión de los agentes; si no se pasa, la de AGENTE_DATABASE_URL. */
  agente?: PrismaClient | null;
  limitador?: RateLimiter;
  fallas?: RateLimiter;
  tope?: number;
}

export interface Respuesta {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

const NO_DISPONIBLE: Respuesta = { status: 404, body: { error: "no_disponible" } };
const NO_AUTORIZADO: Respuesta = { status: 401, body: { error: "no_autorizado" } };
const apagado = (motivo: string): Respuesta => ({ status: 503, body: { apagado: true, motivo } });
const demasiadas = (segundos: number): Respuesta => ({ status: 429, body: { error: "demasiadas_llamadas" }, headers: { "retry-after": String(Math.max(1, segundos)) } });

interface ContextoDelDespacho {
  tenantId: string;
  slug: string;
  ticketId: string;
  numero: number;
  clienteTenantId: string | null;
  despachoId: string;
  sesionId: string | null;
}

/**
 * Busca el despacho que abre esta llamada y deja el AuditLog, todo en una transacción de la consola parada
 * en el negocio de la ref, con el candado del despacho (el tope se cuenta sin carrera).
 */
async function resolverDespacho(
  p: { nivel: NivelDeDespacho; slug: string; numero: number; nonce: string; endpoint: string },
  db: PrismaClient,
  ahora: () => Date,
  tope: number,
): Promise<{ ok: true; ctx: ContextoDelDespacho } | { ok: false; respuesta: Respuesta }> {
  const negocio = await db.tenant.findUnique({ where: { slug: p.slug }, select: { id: true, slug: true } });
  if (!negocio?.slug) return { ok: false, respuesta: NO_DISPONIBLE };
  const tenantId = negocio.id;
  const actor = `agente:${p.nivel}`;
  return enElNegocio(
    tenantId,
    async (tx) => {
      const rastro = (entityId: string | null, cambios: Record<string, unknown>) =>
        tx.auditLog.create({
          data: { tenantId, actor, action: "soporte.agente.llamada", entity: "SupportTicket", entityId, channel: "agente", changes: { endpoint: p.endpoint, numero: p.numero, ...cambios } },
        });
      const [t] = await tx.$queryRaw<{ id: string; clienteTenantId: string | null }[]>`
        SELECT id, "clienteTenantId" FROM "SupportTicket" WHERE "tenantId" = ${tenantId} AND numero = ${p.numero}`;
      if (!t) {
        await rastro(null, { resultado: "sin_despacho" });
        return { ok: false as const, respuesta: NO_DISPONIBLE };
      }
      await candadoDelDespacho(tx, t.id, p.nivel);
      const d = despachoActual(await eventosDelDespacho(tx, tenantId, t.id), p.nivel);
      if (!d || !vigenteParaElAgente(d, p.nonce, ahora())) {
        await rastro(t.id, { resultado: "sin_despacho" });
        return { ok: false as const, respuesta: NO_DISPONIBLE };
      }
      const [{ n }] = await tx.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM "AuditLog"
        WHERE "tenantId" = ${tenantId} AND entity = 'SupportTicket' AND "entityId" = ${t.id}
          AND action = 'soporte.agente.llamada' AND changes->>'despachoId' = ${d.id} AND changes->>'resultado' <> 'tope'`;
      if (n >= tope) {
        await rastro(t.id, { despachoId: d.id, sesion: d.sesionId, resultado: "tope" });
        return { ok: false as const, respuesta: demasiadas(60) };
      }
      await rastro(t.id, { despachoId: d.id, sesion: d.sesionId, resultado: "ok" });
      return {
        ok: true as const,
        ctx: { tenantId, slug: negocio.slug, ticketId: t.id, numero: p.numero, clienteTenantId: d.clienteTenantId /* el del despacho: si el ticket cambió de cliente, agente-db no lo ve */, despachoId: d.id, sesionId: d.sesionId },
      };
    },
    db,
  );
}

async function leerCuerpo(req: Request): Promise<Record<string, unknown> | null> {
  const texto = await req.text();
  if (texto.length > LARGO_MAXIMO_DEL_PEDIDO) return null;
  try {
    const x = JSON.parse(texto);
    return typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Atiende un pedido de la sesión. La ruta sólo traduce la respuesta a HTTP. */
export async function atenderAgente(req: Request, deps: DependenciasDeLaApi = {}): Promise<Respuesta> {
  const env = deps.env ?? process.env;
  const db = deps.db ?? operatorPrisma;
  const ahora = deps.ahora ?? (() => new Date());
  const limitador = deps.limitador ?? limitadorPorCredencial;
  const fallas = deps.fallas ?? fallasPorIp;
  const metodo = req.method === "POST" ? "POST" : req.method === "GET" ? "GET" : null;
  if (!metodo) return { status: 405, body: { error: "metodo" }, headers: { allow: "GET, POST" } };

  // 1. Encendido: sin la conexión de los agentes o sin claves, apagado (sin tocar la base).
  if (!urlDeAgente(env) && !deps.agente) return apagado("Sin AGENTE_DATABASE_URL: los agentes con datos están apagados y el ticket lo atiende una persona.");
  const cred = nivelDeLaCredencial(req.headers.get("authorization"), env);
  if (cred.estado === "apagado") return apagado(cred.motivo);
  const agente = "agente" in deps ? (deps.agente ?? null) : agenteDb(env);
  if (!agente) return apagado("Sin AGENTE_DATABASE_URL: los agentes con datos están apagados y el ticket lo atiende una persona.");

  // 2. Credencial (con freno por IP a los intentos fallidos) y límite por credencial.
  const ip = `agente-auth:${clientIpFromRequest(req)}`;
  if (fallas.blocked(ip)) return demasiadas(Math.ceil(fallas.retryAfterMs(ip) / 1000));
  if (cred.estado !== "ok") {
    fallas.fail(ip);
    return NO_AUTORIZADO;
  }
  const nivel = cred.nivel;
  const clave = `agente:${nivel}`;
  if (limitador.blocked(clave)) return demasiadas(Math.ceil(limitador.retryAfterMs(clave) / 1000));
  limitador.fail(clave); // cuenta la llamada

  // 3. Pedido: sólo ref y nonce (y el borrador en POST).
  const nonce = req.headers.get(HEADER_DEL_NONCE)?.trim() ?? "";
  let cuerpo: Record<string, unknown> | null = null;
  if (metodo === "POST") {
    cuerpo = await leerCuerpo(req);
    if (!cuerpo) return { status: 400, body: { error: "pedido_invalido" } };
  }
  const ref = leerRef(metodo === "GET" ? new URL(req.url).searchParams.get("ref") : cuerpo?.ref);
  if (!ref) return { status: 400, body: { error: "ref_invalida", formato: "slug#numero" } };
  if (metodo === "POST") {
    const v = validarBorradorDeAgente(cuerpo?.borrador);
    if (!v.ok) return { status: 400, body: { error: "borrador_invalido", motivo: v.error } };
  }
  if (!nonce) return NO_DISPONIBLE;

  try {
    // 4. El despacho decide el negocio y el ticket; deja el AuditLog.
    const r = await resolverDespacho({ nivel, slug: ref.slug, numero: ref.numero, nonce, endpoint: `${metodo} ${RUTA_DEL_AGENTE}` }, db, ahora, deps.tope ?? TOPE_DE_LLAMADAS_POR_DESPACHO);
    if (!r.ok) return r.respuesta;
    const { ctx } = r;
    const pedido = { tenantId: ctx.tenantId, slug: ctx.slug, nivel, numero: ctx.numero, clienteTenantId: ctx.clienteTenantId };

    // 5. Con el rol de los agentes.
    if (metodo === "GET") {
      const leido = await leerTicketComoAgente(pedido, { db: agente });
      if (!leido.ok) return leido.apagado ? apagado(leido.motivo) : NO_DISPONIBLE;
      const t = leido.ticket;
      return {
        status: 200,
        body: { ref: `${ctx.slug}#${t.numero}`, numero: t.numero, tipo: t.tipo, prioridad: t.prioridad, estado: t.estado, canal: t.canal, creado: t.createdAt, texto: bloqueDelCliente(t), valores: { tipos: TIPOS_TICKET, prioridades: PRIORIDADES } },
      };
    }
    const guardado = await guardarBorradorComoAgente(
      { ...pedido, borrador: cuerpo?.borrador },
      {
        db: agente,
        // En la transacción del agente, con el mismo candado: el despacho sigue abierto y es el mismo.
        // El `borrador_ia` que escribe guardarBorradorEnTx lo cierra (listo) en esa misma transacción.
        antesDeGuardar: async (tx) => {
          await candadoDelDespacho(tx, ctx.ticketId, nivel);
          const d = despachoActual(await eventosDelDespacho(tx, ctx.tenantId, ctx.ticketId), nivel);
          return d?.id === ctx.despachoId && vigenteParaElAgente(d, nonce, ahora()) ? null : "El despacho ya no está abierto.";
        },
      },
    );
    if (!guardado.ok) return guardado.apagado ? apagado(guardado.motivo) : NO_DISPONIBLE;
    try {
      await anotarListo({ tenantId: ctx.tenantId, ticketId: ctx.ticketId, nivel, despachoId: ctx.despachoId }, { ...deps, db });
    } catch {
      // El despacho ya quedó listo por el borrador_ia; el evento de métricas se puede perder sin daño.
    }
    return { status: 200, body: { ok: true, ref: `${ctx.slug}#${ctx.numero}` } };
  } catch (e) {
    if (esTablaAusente(e)) return apagado("Todavía no está la tabla de tickets (falta aplicar la migración).");
    throw e;
  }
}
