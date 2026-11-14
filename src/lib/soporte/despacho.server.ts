// ============================================================================
// MANTENIMIENTO GSG — despacho de tickets a las tareas de Claude (MANT-004, diseño §15.2, §15.3).
// ============================================================================
//
// Conexión de la CONSOLA (operator-db, sujeta a RLS): todo lo de un ticket corre en `enElNegocio(<su
// negocio>)`. Sin tabla nueva: el despacho son eventos `despacho:<nivel>:<estado>` (despacho-core.ts).
//
// IDEMPOTENCIA: clave `<ticketId>:<nivel>`. Crear, reclamar el disparo, anotar el resultado, vencer y
// cerrar toman `pg_advisory_xact_lock` sobre esa clave y releen el despacho en la MISMA transacción: dos
// pedidos a la vez crean un solo despacho y disparan un solo /fire. El /fire corre FUERA de la
// transacción (no se tiene una conexión abierta esperando la red); antes se reclama: la huella del
// nonce queda guardada como `disparado`, así la sesión puede volver aunque llegue antes que la respuesta.
//
// INTERRUPTOR `MANT_MOTOR`: apagado (defecto: no se toca la base) · manual · automatico. Sin
// MANT_RUTINA_<N>_URL/_TOKEN, ese nivel queda apagado y lo dice. Lo prueba despacho-postgres.test.ts.

import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { enElNegocio, operatorPrisma } from "@/lib/operator-db";
import { esTablaAusente } from "./alta.server";
import { consentimientoVigente, SIN_CONSENTIMIENTO, type Consentimiento, type FilaDeConsentimiento } from "./consentimiento-core";
import { leerConsentimiento } from "./consentimiento.server";
import { quienApruebaElBorrador } from "./agentes-permisos";
import { ESTADOS_ABIERTOS } from "./config";
import {
  AVISO_SIN_IA,
  ESTADOS_ABIERTOS_DE_DESPACHO,
  NIVELES_DE_DESPACHO,
  accionDelDrenaje,
  despachoActual,
  dispararRutina,
  huellaDelNonce,
  modoDelMotor,
  nonceNuevo,
  puedeDespachar,
  rutinaDelNivel,
  siguienteTrasFalla,
  textoDelDisparo,
  tipoDeEvento,
  type Despacho,
  type EstadoDeDespacho,
  type EventoCrudo,
  type FetchDeRutina,
  type NivelDeDespacho,
} from "./despacho-core";

type Tx = Prisma.TransactionClient;
export const ACTOR_DEL_DESPACHO = "sistema:despacho";

export interface DependenciasDelDespacho {
  db?: PrismaClient;
  env?: Record<string, string | undefined>;
  ahora?: () => Date;
  fetch?: FetchDeRutina;
}

const resolver = (d: DependenciasDelDespacho) => ({
  db: d.db ?? operatorPrisma,
  env: d.env ?? process.env,
  ahora: d.ahora ?? (() => new Date()),
  fetch: d.fetch,
});

const abierto = (d: Despacho | null) => !!d && (ESTADOS_ABIERTOS_DE_DESPACHO as readonly string[]).includes(d.estado);

/** El candado de la clave `<ticketId>:<nivel>`, hasta el fin de la transacción. Sirve con cualquier rol. */
export async function candadoDelDespacho(tx: Tx, ticketId: string, nivel: NivelDeDespacho): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`mant-despacho:${ticketId}:${nivel}`}, 0))`;
}

/** Los eventos del ticket que cuentan para el despacho (los suyos y los borradores). Sirve con cualquier rol. */
export function eventosDelDespacho(tx: Tx, tenantId: string, ticketId: string): Promise<EventoCrudo[]> {
  return tx.$queryRaw<EventoCrudo[]>`
    SELECT tipo, actor, datos, "createdAt" FROM "SupportTicketEvento"
    WHERE "tenantId" = ${tenantId} AND "ticketId" = ${ticketId} AND (tipo LIKE 'despacho:%' OR tipo = 'borrador_ia')
    ORDER BY "createdAt", id`;
}

/** Anota un estado del despacho. La hora, con reloj de pared en UTC (la columna es sin zona). */
async function anotar(
  tx: Tx,
  t: { tenantId: string; ticketId: string },
  nivel: NivelDeDespacho,
  estado: EstadoDeDespacho,
  datos: Record<string, unknown>,
  texto: string | null = null,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "SupportTicketEvento" (id, "tenantId", "ticketId", tipo, actor, texto, datos, "createdAt")
    VALUES (${randomUUID()}, ${t.tenantId}, ${t.ticketId}, ${tipoDeEvento(nivel, estado)}, ${ACTOR_DEL_DESPACHO}, ${texto},
            ${JSON.stringify(datos)}::jsonb, (clock_timestamp() AT TIME ZONE 'UTC'))`;
}

interface FilaDeTicket {
  id: string;
  numero: number;
  estado: string;
  prioridad: string;
  clienteTenantId: string | null;
}

async function ticketEnTx(tx: Tx, tenantId: string, donde: { numero: number } | { id: string }): Promise<FilaDeTicket | null> {
  const filas =
    "numero" in donde
      ? await tx.$queryRaw<FilaDeTicket[]>`SELECT id, numero, estado, prioridad, "clienteTenantId" FROM "SupportTicket" WHERE "tenantId" = ${tenantId} AND numero = ${donde.numero}`
      : await tx.$queryRaw<FilaDeTicket[]>`SELECT id, numero, estado, prioridad, "clienteTenantId" FROM "SupportTicket" WHERE "tenantId" = ${tenantId} AND id = ${donde.id}`;
  return filas[0] ?? null;
}

/** El permiso vigente del negocio fijado en la transacción. Sin tabla (Gate 2 sin aplicar): sin permiso. */
async function permisoEnTx(tx: Tx, tenantId: string): Promise<Consentimiento> {
  const [hay] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('"SoporteConsentimiento"') IS NOT NULL AS ok`;
  if (!hay?.ok) return SIN_CONSENTIMIENTO;
  const filas = await tx.$queryRaw<FilaDeConsentimiento[]>`
    SELECT nivel, aceptado, "versionTexto", "createdAt" FROM "SoporteConsentimiento" WHERE "tenantId" = ${tenantId}`;
  return consentimientoVigente(filas);
}

const slugDe = async (db: PrismaClient, id: string | null) => (id ? ((await db.tenant.findUnique({ where: { id }, select: { slug: true } }))?.slug ?? null) : null);

export type ResultadoDeCrear = { ok: true; creado: boolean; despacho: Despacho; ticketId: string } | { ok: false; motivo: string };

/**
 * Crea el despacho del ticket para el nivel, si corresponde y si no hay uno abierto (si lo hay, lo
 * devuelve con `creado: false`). Motor apagado o sin rutina → no toca la base.
 */
export async function crearDespacho(
  p: { tenantId: string; numero: number; nivel: NivelDeDespacho; origen: "manual" | "automatico" },
  deps: DependenciasDelDespacho = {},
): Promise<ResultadoDeCrear> {
  const { db, env, ahora } = resolver(deps);
  if (!(NIVELES_DE_DESPACHO as readonly string[]).includes(p.nivel)) return { ok: false, motivo: "Nivel sin despacho (sólo n1 y n2)." };
  const motor = modoDelMotor(env);
  if (motor.modo === "apagado") return { ok: false, motivo: motor.motivo };
  const rutina = rutinaDelNivel(env, p.nivel);
  if (!rutina.ok) return { ok: false, motivo: rutina.motivo };
  try {
    const slug = await slugDe(db, p.tenantId);
    // El permiso del cliente de cartera vive en su negocio: se lee parado en él, antes.
    const previo = await enElNegocio(p.tenantId, (tx) => ticketEnTx(tx, p.tenantId, { numero: p.numero }), db);
    if (!previo) return { ok: false, motivo: "No existe el ticket." };
    const cliente = previo.clienteTenantId;
    const permisoCliente = cliente ? await leerConsentimiento(cliente, db) : null;
    const slugCliente = await slugDe(db, cliente);
    return await enElNegocio(
      p.tenantId,
      async (tx): Promise<ResultadoDeCrear> => {
        await candadoDelDespacho(tx, previo.id, p.nivel);
        const t = await ticketEnTx(tx, p.tenantId, { id: previo.id });
        if (!t || t.clienteTenantId !== cliente) return { ok: false, motivo: "El ticket cambió: probá de nuevo." };
        const propio = await permisoEnTx(tx, p.tenantId);
        const permiso = { n1: propio.n1 && (!permisoCliente || permisoCliente.n1), n2: propio.n2 && (!permisoCliente || permisoCliente.n2) };
        const decision = puedeDespachar({ modo: motor.modo, origen: p.origen, nivel: p.nivel, slugs: cliente ? [slug, slugCliente] : [slug], estadoTicket: t.estado, permiso });
        if (!decision.puede) return { ok: false, motivo: decision.motivo };
        const eventos = await eventosDelDespacho(tx, p.tenantId, t.id);
        const actual = despachoActual(eventos, p.nivel);
        if (abierto(actual)) {
          // Un disparado de más de 30 min se vence ACÁ, en el mismo paso y con el candado (certificación,
          // hallazgo 2): no depende de que el drenaje lo vea (mira sólo 48 h). Después se crea uno nuevo.
          if (accionDelDrenaje(actual, ahora()) !== "vencer") return { ok: true, creado: false, despacho: actual!, ticketId: t.id };
          await anotar(tx, { tenantId: p.tenantId, ticketId: t.id }, p.nivel, "vencido", { despachoId: actual!.id, el: ahora().toISOString(), aviso: true }, AVISO_SIN_IA);
        }
        const el = ahora().toISOString();
        const datos = { despachoId: randomUUID(), intento: 0, el, proximoEn: el, prioridad: t.prioridad, clienteTenantId: cliente, origen: p.origen };
        await anotar(tx, { tenantId: p.tenantId, ticketId: t.id }, p.nivel, "pendiente", datos);
        const nuevo = despachoActual([{ tipo: tipoDeEvento(p.nivel, "pendiente"), actor: ACTOR_DEL_DESPACHO, datos, createdAt: new Date() }], p.nivel)!;
        return { ok: true, creado: true, despacho: nuevo, ticketId: t.id };
      },
      db,
    );
  } catch (e) {
    if (esTablaAusente(e)) return { ok: false, motivo: "Todavía no está la tabla de tickets (falta aplicar la migración)." };
    throw e;
  }
}

export type ResultadoDelIntento =
  | { ok: true; disparado: true; despachoId: string; sesionUrl: string | null }
  | { ok: true; disparado: false; motivo: string; estado?: EstadoDeDespacho }
  | { ok: false; apagado: true; motivo: string };

/**
 * Si el despacho del ticket está pendiente y le toca, lo reclama (guarda la huella de un nonce nuevo
 * como `disparado`), llama al /fire y anota la sesión, o el reintento (1/5/15 min) o el fallo con aviso.
 * Ticket cerrado o CH al momento de disparar → fallido, sin /fire.
 */
export async function intentarDisparo(
  p: { tenantId: string; ticketId: string; nivel: NivelDeDespacho },
  deps: DependenciasDelDespacho = {},
): Promise<ResultadoDelIntento> {
  const { db, env, ahora, fetch } = resolver(deps);
  const motor = modoDelMotor(env);
  if (motor.modo === "apagado") return { ok: false, apagado: true, motivo: motor.motivo };
  const rutina = rutinaDelNivel(env, p.nivel);
  if (!rutina.ok) return { ok: false, apagado: true, motivo: rutina.motivo };
  const slug = await slugDe(db, p.tenantId);
  const donde = { tenantId: p.tenantId, ticketId: p.ticketId };

  const reclamo = await enElNegocio(
    p.tenantId,
    async (tx) => {
      await candadoDelDespacho(tx, p.ticketId, p.nivel);
      const t = await ticketEnTx(tx, p.tenantId, { id: p.ticketId });
      const actual = despachoActual(t ? await eventosDelDespacho(tx, p.tenantId, p.ticketId) : [], p.nivel);
      const accion = t && actual ? accionDelDrenaje(actual, ahora()) : "nada";
      if (accion === "vencer") {
        // Mismo paso que el drenaje, sin depender de su ventana de 48 h (hallazgo 2).
        await anotar(tx, donde, p.nivel, "vencido", { despachoId: actual!.id, el: ahora().toISOString(), aviso: true }, AVISO_SIN_IA);
        return { tipo: "nada" as const, estado: "vencido" as const };
      }
      if (!t || !actual || accion !== "disparar") return { tipo: "nada" as const, estado: actual?.estado };
      const el = ahora().toISOString();
      if (!(ESTADOS_ABIERTOS as readonly string[]).includes(t.estado) || quienApruebaElBorrador(slug) === "duenio") {
        await anotar(tx, donde, p.nivel, "fallido", { despachoId: actual.id, el, error: "Ticket cerrado o de CH: no se dispara." });
        return { tipo: "nada" as const, estado: "fallido" as const };
      }
      const nonce = nonceNuevo();
      // El texto se arma (y se valida: slug, número, nonce) ANTES de reclamar (hallazgo 9): si no sirve,
      // el despacho queda fallido con aviso, nunca «disparado» sin /fire.
      let texto: string;
      try {
        texto = textoDelDisparo(p.nivel, slug ?? "", t.numero, nonce);
      } catch {
        await anotar(tx, donde, p.nivel, "fallido", { despachoId: actual.id, el, error: "El negocio no tiene un slug válido: no se dispara.", aviso: true }, AVISO_SIN_IA);
        return { tipo: "nada" as const, estado: "fallido" as const };
      }
      const intento = actual.intento + 1;
      await anotar(tx, donde, p.nivel, "disparado", { despachoId: actual.id, intento, el, nonceHash: huellaDelNonce(nonce) });
      return { tipo: "reclamado" as const, despacho: actual, texto, intento };
    },
    db,
  );
  if (reclamo.tipo === "nada") return { ok: true, disparado: false, motivo: "No le toca disparar.", estado: reclamo.estado };

  const r = await dispararRutina(rutina, reclamo.texto, fetch);
  const id = reclamo.despacho.id;
  await enElNegocio(
    p.tenantId,
    async (tx) => {
      await candadoDelDespacho(tx, p.ticketId, p.nivel);
      const actual = despachoActual(await eventosDelDespacho(tx, p.tenantId, p.ticketId), p.nivel);
      if (actual?.id !== id) return;
      const el = ahora().toISOString();
      if (r.ok) {
        // Aunque el borrador ya haya llegado (la sesión puede ganarle a la respuesta), la sesión se anota.
        await anotar(tx, donde, p.nivel, "disparado", { despachoId: id, el, sesionId: r.sesionId, sesionUrl: r.sesionUrl });
        return;
      }
      if (actual.estado !== "disparado") return;
      const sig = siguienteTrasFalla({ intentosHechos: reclamo.intento, reintentable: r.reintentable, prioridad: reclamo.despacho.prioridad, ahora: ahora() });
      if (sig.estado === "pendiente") {
        await anotar(tx, donde, p.nivel, "pendiente", { despachoId: id, intento: reclamo.intento, el, proximoEn: sig.proximoEn.toISOString(), error: r.error, aviso: sig.aviso }, sig.aviso ? AVISO_SIN_IA : null);
      } else {
        await anotar(tx, donde, p.nivel, "fallido", { despachoId: id, intento: reclamo.intento, el, error: r.error, aviso: true }, AVISO_SIN_IA);
      }
    },
    db,
  );
  return r.ok ? { ok: true, disparado: true, despachoId: id, sesionUrl: r.sesionUrl } : { ok: true, disparado: false, motivo: r.error };
}

export type ResultadoDeDespachar = (Extract<ResultadoDeCrear, { ok: true }> & { disparo: ResultadoDelIntento }) | { ok: false; motivo: string };

/** Crear + disparar: lo que hace «Preparar con IA» (manual) y la entrada del ticket (automático, sólo n1). */
export async function despacharTicket(
  p: { tenantId: string; numero: number; nivel: NivelDeDespacho; origen: "manual" | "automatico" },
  deps: DependenciasDelDespacho = {},
): Promise<ResultadoDeDespachar> {
  const c = await crearDespacho(p, deps);
  if (!c.ok) return c;
  const disparo = await intentarDisparo({ tenantId: p.tenantId, ticketId: c.ticketId, nivel: p.nivel }, deps);
  return { ...c, disparo };
}

/**
 * Cierra el despacho al quedar el borrador. El cierre real ya ocurrió (el `borrador_ia` del agente, en
 * la misma transacción del borrador); esto deja el evento `despacho:<nivel>:listo` para las métricas.
 */
export async function anotarListo(p: { tenantId: string; ticketId: string; nivel: NivelDeDespacho; despachoId: string }, deps: DependenciasDelDespacho = {}): Promise<void> {
  const { db, ahora } = resolver(deps);
  await enElNegocio(
    p.tenantId,
    async (tx) => {
      await candadoDelDespacho(tx, p.ticketId, p.nivel);
      const eventos = await eventosDelDespacho(tx, p.tenantId, p.ticketId);
      const actual = despachoActual(eventos, p.nivel);
      if (actual?.id !== p.despachoId || actual.estado !== "listo") return;
      const ya = eventos.some((e) => e.tipo === tipoDeEvento(p.nivel, "listo") && (e.datos as { despachoId?: string } | null)?.despachoId === p.despachoId);
      if (!ya) await anotar(tx, p, p.nivel, "listo", { despachoId: p.despachoId, el: ahora().toISOString(), sesionId: actual.sesionId });
    },
    db,
  );
}

export type ResultadoDelDrenaje =
  | { apagado: true; motivo: string }
  | { apagado: false; negocios: number; disparados: number; vencidos: number; reintentos: number; errores: number; niveles: Record<NivelDeDespacho, string> };

/**
 * El cron: recorre los negocios y, en cada uno, dispara los pendientes a los que les toca y vence los
 * disparados de más de 30 min sin borrador. Motor apagado → no toca la base. Un negocio que falla no
 * frena a los demás. Deuda anotada: una transacción por negocio por corrida (la consola está sujeta a
 * RLS y no puede listar eventos de todos los negocios de una vez). Mira sólo 48 h: un disparado más viejo
 * (cron caído) lo vencen crearDespacho e intentarDisparo en el mismo paso, sin depender de esta ventana.
 */
export async function drenarCola(deps: DependenciasDelDespacho = {}): Promise<ResultadoDelDrenaje> {
  const { db, env, ahora } = resolver(deps);
  const motor = modoDelMotor(env);
  if (motor.modo === "apagado") return { apagado: true, motivo: motor.motivo };
  const niveles = Object.fromEntries(NIVELES_DE_DESPACHO.map((n) => {
    const r = rutinaDelNivel(env, n);
    return [n, r.ok ? "encendido" : r.motivo];
  })) as Record<NivelDeDespacho, string>;
  const resumen = { apagado: false as const, negocios: 0, disparados: 0, vencidos: 0, reintentos: 0, errores: 0, niveles };
  const negocios = await db.tenant.findMany({ select: { id: true } });
  for (const { id: tenantId } of negocios) {
    try {
      const filas = await enElNegocio(
        tenantId,
        (tx) => tx.$queryRaw<(EventoCrudo & { ticketId: string })[]>`
          SELECT "ticketId", tipo, actor, datos, "createdAt" FROM "SupportTicketEvento"
          WHERE "tenantId" = ${tenantId} AND (tipo LIKE 'despacho:%' OR tipo = 'borrador_ia')
            AND "createdAt" > (now() AT TIME ZONE 'UTC') - interval '48 hours'
          ORDER BY "createdAt", id`,
        db,
      );
      resumen.negocios++;
      const porTicket = new Map<string, EventoCrudo[]>();
      for (const f of filas) porTicket.set(f.ticketId, [...(porTicket.get(f.ticketId) ?? []), f]);
      for (const [ticketId, eventos] of porTicket) {
        for (const nivel of NIVELES_DE_DESPACHO) {
          const accion = accionDelDrenaje(despachoActual(eventos, nivel), ahora());
          if (accion === "vencer") {
            if (await vencer({ tenantId, ticketId, nivel }, db, ahora)) resumen.vencidos++;
          } else if (accion === "disparar" && niveles[nivel] === "encendido") {
            const r = await intentarDisparo({ tenantId, ticketId, nivel }, deps);
            if (r.ok && r.disparado) resumen.disparados++;
            else if (r.ok) resumen.reintentos++;
          }
        }
      }
    } catch (e) {
      if (esTablaAusente(e)) continue;
      resumen.errores++;
      console.error("[soporte-despacho] un negocio falló al drenar:", e instanceof Error ? e.name : "error");
    }
  }
  return resumen;
}

async function vencer(p: { tenantId: string; ticketId: string; nivel: NivelDeDespacho }, db: PrismaClient, ahora: () => Date): Promise<boolean> {
  return enElNegocio(
    p.tenantId,
    async (tx) => {
      await candadoDelDespacho(tx, p.ticketId, p.nivel);
      const actual = despachoActual(await eventosDelDespacho(tx, p.tenantId, p.ticketId), p.nivel);
      if (!actual || accionDelDrenaje(actual, ahora()) !== "vencer") return false;
      await anotar(tx, p, p.nivel, "vencido", { despachoId: actual.id, el: ahora().toISOString(), aviso: true }, AVISO_SIN_IA);
      return true;
    },
    db,
  );
}
