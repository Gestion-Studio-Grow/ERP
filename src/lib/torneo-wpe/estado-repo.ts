// ============================================================================
// EL TORNEO WPE EN LA BASE DEL ERP — «modo foto» con comandos del servidor, sin migración (GSG-PLAT-016).
// ============================================================================
//
// QUÉ SE GUARDA. El torneo serializado por el motor del sitio (`wpe-torneo@1`, ~720 KB de JSON) comprimido en gzip
// y en base64 (~100 KB). Cada versión es una fila de `AuditLog` con `entity: "TorneoEstado"` y `entityId: <tenantId>`
// (un torneo por negocio), como la foto del club de Break Point (src/lib/club/estado-repo.ts): la tabla ya tiene
// `tenantId` con su política de RLS y la purga no la toca (audit-retention.ts, PURGE_EXEMPT_ENTITIES).
// Decisión del modelo (subagente Opus, 16/11/2026): opción A, sin migración; el disparador para pasar a una tabla
// propia (que sólo cambiaría este archivo) es un segundo negocio real, una foto de más de 1 MB comprimida o
// contención frecuente.
//
// LAS FILAS. Por cada mutación, en UNA transacción:
//   · `TorneoEstado`: `action = "<tipo>:<version>"`, `changes = { version, gz }`. La versión va también en
//     `action` para calcular la vigente y la poda leyendo sólo `id` y `action`, sin traer la foto.
//   · `TorneoMutacion`: el rastro (quién en `actor`, qué en `changes`: partido, código, antes → después). Va
//     aparte porque la poda borra fotos y no puede llevarse el rastro.
//
// QUIÉN DECIDE. El navegador NUNCA manda el estado: manda un comando (comandos.ts) con la versión que vio. El
// servidor lee la foto vigente, aplica el motor y guarda. Si la versión cambió en el medio, rechaza con
// `CAMBIO_MIENTRAS_MIRABAS` (nadie pisa a nadie). Transacción SERIALIZABLE con reintentos (`tenantTransaction`):
// dos comandos a la vez con la misma versión no pueden sacar la misma versión nueva.
//
// PODA (en la misma transacción): quedan la vigente, las `FOTOS_ANTERIORES` anteriores y la de la generación.
//
// — Elaborado por GSG

import { gunzipSync, gzipSync } from "node:zlib";
import type { Prisma } from "@/generated/prisma/client";
import { aplicarComando, type Comando, type Rastro } from "./comandos";
import { ENTIDAD_TORNEO_ESTADO, ENTIDAD_TORNEO_MUTACION } from "./marcas";
import type { MotorTorneo, Torneo } from "./tipos";

type Db = Pick<Prisma.TransactionClient, "auditLog">;

export const FOTOS_ANTERIORES = 10;
/** Tope al descomprimir: una foto rota no puede inflarse a gigas. */
const TOPE_TEXTO = 20 * 1024 * 1024;
export const CAMBIO_MIENTRAS_MIRABAS = "CAMBIO_MIENTRAS_MIRABAS" as const;
export const MENSAJE_CAMBIO_MIENTRAS_MIRABAS =
  "Mientras mirabas, otra persona cambió el torneo. Ya te mostramos lo último: revisalo y volvé a cargarlo si hace falta.";

/** El torneo de demostración del sitio (el mismo que ve el cliente: 600 parejas, 13 sedes, semilla 2026). */
export const AVANCE_DEMO = 0.6;
export const SEMILLA_DEMO = 2026;

interface Meta {
  id: string;
  version: number;
}

export interface TorneoVigente {
  torneo: Torneo;
  version: number;
  actualizada: Date;
  por: string;
}

export type PedidoDeMutacion = { tipo: "generar" } | Comando;

export type ResultadoDeMutar =
  | { ok: true; version: number; rastro: Rastro | null; advertencias: string[] }
  | { ok: false; motivo: typeof CAMBIO_MIENTRAS_MIRABAS; version: number }
  | { ok: false; motivo: "SIN_TORNEO" | "YA_HAY_TORNEO" | "RECHAZADO"; version: number; errores: string[] };

const donde = (tenantId: string) => ({ tenantId, entity: ENTIDAD_TORNEO_ESTADO, entityId: tenantId });

/** La versión de una fila por su `action` (`"<tipo>:<version>"`); null si no es una foto. */
export function versionDeAccion(action: string): number | null {
  const v = Number(action.slice(action.lastIndexOf(":") + 1));
  return Number.isInteger(v) && v > 0 ? v : null;
}

/** Qué fotos se borran: todas menos la vigente, las `anteriores` previas y la versión 1. */
export function idsParaPodar(metas: readonly Meta[], anteriores = FOTOS_ANTERIORES): string[] {
  const orden = [...metas].sort((a, b) => b.version - a.version);
  return orden.slice(anteriores + 1).filter((m) => m.version !== 1).map((m) => m.id);
}

export function comprimirTorneo(motor: MotorTorneo, torneo: Torneo): string {
  return gzipSync(motor.serializar(torneo)).toString("base64");
}

export function descomprimirTorneo(motor: MotorTorneo, gz: string): Torneo {
  return motor.deserializar(gunzipSync(Buffer.from(gz, "base64"), { maxOutputLength: TOPE_TEXTO }).toString("utf8"));
}

export async function metasEnTx(db: Db, tenantId: string): Promise<Meta[]> {
  const filas = await db.auditLog.findMany({ where: donde(tenantId), select: { id: true, action: true } });
  return filas
    .map((f) => ({ id: f.id, version: versionDeAccion(f.action) }))
    .filter((m): m is Meta => m.version !== null)
    .sort((a, b) => a.version - b.version);
}

export async function leerVersionEnTx(db: Db, tenantId: string): Promise<number> {
  const metas = await metasEnTx(db, tenantId);
  return metas.length ? metas[metas.length - 1].version : 0;
}

export async function leerVigenteEnTx(db: Db, tenantId: string, motor: MotorTorneo): Promise<TorneoVigente | null> {
  const metas = await metasEnTx(db, tenantId);
  const ultima = metas[metas.length - 1];
  if (!ultima) return null;
  const fila = await db.auditLog.findFirst({ where: { ...donde(tenantId), id: ultima.id }, select: { changes: true, createdAt: true, actor: true } });
  const gz = (fila?.changes as { gz?: unknown } | null)?.gz;
  if (!fila || typeof gz !== "string") return null;
  return { torneo: descomprimirTorneo(motor, gz), version: ultima.version, actualizada: fila.createdAt, por: fila.actor };
}

/** Aplica el pedido sobre la foto vigente si nadie cambió el torneo desde `versionEsperada`. Abre su transacción el llamador. */
export async function mutarEnTx(
  db: Db,
  tenantId: string,
  motor: MotorTorneo,
  d: { pedido: PedidoDeMutacion; versionEsperada: number; actor: string },
): Promise<ResultadoDeMutar> {
  const metas = await metasEnTx(db, tenantId);
  const actual = metas.length ? metas[metas.length - 1].version : 0;
  if (d.versionEsperada !== actual) return { ok: false, motivo: CAMBIO_MIENTRAS_MIRABAS, version: actual };

  let torneo: Torneo;
  let rastro: Rastro | null = null;
  let advertencias: string[] = [];
  if (d.pedido.tipo === "generar") {
    if (actual !== 0) return { ok: false, motivo: "YA_HAY_TORNEO", version: actual, errores: ["Este negocio ya tiene su torneo."] };
    torneo = motor.generarTorneoEnCurso(motor.CONFIG_DEMO, AVANCE_DEMO, SEMILLA_DEMO);
  } else {
    if (actual === 0) return { ok: false, motivo: "SIN_TORNEO", version: 0, errores: ["Todavía no hay torneo en este negocio."] };
    const vigente = await leerVigenteEnTx(db, tenantId, motor);
    if (!vigente) return { ok: false, motivo: "SIN_TORNEO", version: actual, errores: ["No se pudo leer el torneo guardado."] };
    const r = aplicarComando(motor, vigente.torneo, d.pedido);
    if (!r.ok) return { ok: false, motivo: "RECHAZADO", version: actual, errores: r.errores };
    ({ torneo, rastro, advertencias } = r);
  }

  const version = actual + 1;
  const nueva = await db.auditLog.create({
    data: {
      tenantId,
      actor: d.actor,
      action: `${d.pedido.tipo}:${version}`,
      entity: ENTIDAD_TORNEO_ESTADO,
      entityId: tenantId,
      changes: { version, gz: comprimirTorneo(motor, torneo) },
      channel: "admin",
    },
    select: { id: true },
  });
  await db.auditLog.create({
    data: {
      tenantId,
      actor: d.actor,
      action: `torneo.${d.pedido.tipo}`,
      entity: ENTIDAD_TORNEO_MUTACION,
      entityId: rastro?.partidoId ?? tenantId,
      changes: JSON.parse(JSON.stringify({ version, ...(rastro ?? {}) })) as Prisma.InputJsonValue,
      channel: "admin",
    },
  });
  const borrar = idsParaPodar([...metas, { id: nueva.id, version }]);
  if (borrar.length) await db.auditLog.deleteMany({ where: { ...donde(tenantId), id: { in: borrar } } });
  return { ok: true, version, rastro, advertencias };
}

// ── con su transacción (RLS) ─────────────────────────────────────────────────

/** Corre `fn` en una transacción del negocio (RLS). Se reemplaza en los tests sin base. */
export type CorrerEnElNegocio = <T>(tenantId: string, fn: (db: Db) => Promise<T>, serializable: boolean) => Promise<T>;

const correrConRls: CorrerEnElNegocio = async (tenantId, fn, serializable) => {
  const { tenantTransaction } = await import("@/lib/rls");
  return tenantTransaction((tx) => fn(tx), serializable ? { tenantId, isolationLevel: "Serializable" } : { tenantId });
};

export interface RepoDelTorneo {
  leerVigente(tenantId: string): Promise<TorneoVigente | null>;
  leerVersion(tenantId: string): Promise<number>;
  mutar(tenantId: string, d: { pedido: PedidoDeMutacion; versionEsperada: number; actor: string }): Promise<ResultadoDeMutar>;
}

export function crearRepoDelTorneo(motor: () => MotorTorneo, correr: CorrerEnElNegocio = correrConRls): RepoDelTorneo {
  return {
    leerVigente: (tenantId) => correr(tenantId, (db) => leerVigenteEnTx(db, tenantId, motor()), false),
    leerVersion: (tenantId) => correr(tenantId, (db) => leerVersionEnTx(db, tenantId), false),
    mutar: (tenantId, d) => {
      if (!Number.isInteger(d.versionEsperada) || d.versionEsperada < 0) {
        return Promise.resolve({ ok: false, motivo: "RECHAZADO", version: 0, errores: ["La versión no es válida."] } as const);
      }
      return correr(tenantId, (db) => mutarEnTx(db, tenantId, motor(), d), true);
    },
  };
}
