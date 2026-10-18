// ============================================================================
// EL ESTADO DEL CLUB EN LA BASE DEL ERP — «modo foto», sin migración (BP-3).
// ============================================================================
//
// QUÉ SE GUARDA. El estado entero del club como una FOTO: el mismo sobre v1 del respaldo del piloto
// (`{ v, estado, secuencia, usuario?, guardado? }`, docs/tenants/breakpoint/FORMATO-RESPALDO.md). Cada guardado es
// una fila de `AuditLog` con `entity: "ClubEstado"` y `entityId: <tenantId>` (un documento por negocio). Es el
// patrón de src/lib/supermercado/config-repo.ts: la tabla ya tiene `tenantId` con su política de RLS, el rastro
// (quién y cuándo) sale gratis, y la purga de la auditoría no la toca (audit-retention.ts, PURGE_EXEMPT_ENTITIES).
// El modelo relacional del club es BP-4 (Gate 2): el día que exista, sólo cambia este archivo.
//
// LA FILA. `changes = { version, dia, sobre }` y `action = "<guardar|restaurar>:<version>:<dia>"`. La versión y el
// día van TAMBIÉN en `action` a propósito: así la versión vigente y la poda se calculan leyendo sólo `id` y
// `action`, sin traer la foto (un mes de club lleno pesa ~3 MB de texto).
//
// CONCURRENCIA. Versión optimista NUMÉRICA (un contador que sube de a 1 con cada foto; 0 = nunca se guardó):
// guardar exige la versión que se leyó y, si otra terminal guardó en el medio, se rechaza con
// `CAMBIO_MIENTRAS_MIRABAS` y la versión actual, en vez de pisarle el trabajo. Se corre en una transacción
// SERIALIZABLE con reintentos (`tenantTransaction`), así dos guardados a la vez no sacan la misma versión.
//
// PODA (al guardar, en la misma transacción). Quedan: la vigente, y la última foto de cada DÍA DE CAJA (de 12 a 12)
// de los últimos `DIAS_CON_FOTO` días. Una fila `restaurar` abre una «época» nueva: la última foto de antes se
// conserva aunque sea del mismo día. OJO: esa fila sólo la escribe `restaurar` (la acción `restaurarRespaldoDelClub`),
// que hoy no usa ninguna pantalla. La pantalla restaura con `almacen.restaurar` → `guardarYa()` → `guardar`: en la
// base es un guardado más, no abre época y la foto de antes del mismo día de caja se poda (la copia de antes queda en
// el navegador de esa compu). En el modo foto el servidor no distingue un guardado de un restaurar ni sabe qué cambió
// (PARIDAD-REACT.md, «Lo que el servidor no controla»; se cierra con los comandos / el back separado, G10). Sin la
// ventana, las fotos diarias crecerían con el cuadrado de los días (cada foto trae toda la historia) y el plan
// gratuito de Neon (0,5 GB) se llenaría en meses: ver las medidas en el reporte de BP-3.
//
// Las funciones `…EnTx` reciben el cliente por parámetro (los tests de integración y las acciones); `leerVigente`,
// `guardar` y `restaurar` abren su propia transacción con `tenantTransaction` (RLS: el GUC del negocio va primero).
//
// — Elaborado por GSG

import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/lib/capabilities";
import type { Fecha } from "./motor.mjs";
import { sumarDias } from "./motor.mjs";
import { ENTIDAD_CLUB_ESTADO } from "./marcas";
import { diaDeCajaEn, leerSobre, resumenDelRespaldo, type ResumenDelRespaldo, type Sobre } from "./foto";

export { ENTIDAD_CLUB_ESTADO };

type Db = Pick<Prisma.TransactionClient, "auditLog">;

/** Cuántos días de caja hacia atrás conservan su última foto (además de la vigente). */
export const DIAS_CON_FOTO = 14;

export const CAMBIO_MIENTRAS_MIRABAS = "CAMBIO_MIENTRAS_MIRABAS" as const;

export const MENSAJE_CAMBIO_MIENTRAS_MIRABAS =
  "Otra terminal guardó el club mientras trabajabas. Volvé a abrir la página para seguir desde lo último guardado.";

export type AccionDeFoto = "guardar" | "restaurar";

/** Lo que se sabe de una fila sin traer la foto. */
export interface MetaDeFoto {
  id: string;
  accion: AccionDeFoto;
  version: number;
  dia: Fecha;
}

export interface FotoVigente {
  /** El sobre como texto (lo que recibe el almacén). */
  texto: string;
  version: number;
  /** El `guardado` (ms) del sobre: lo que se compara con el espejo del equipo. */
  guardado: number | null;
  dia: Fecha;
  actualizada: Date;
  /** Quién la guardó (actor "user:<id>"). */
  por: string;
}

export type ResultadoDeGuardar =
  | { ok: true; version: number; podadas: number }
  | { ok: false; motivo: typeof CAMBIO_MIENTRAS_MIRABAS; version: number }
  | { ok: false; motivo: "FOTO_INVALIDA"; detalle: string };

export type ResultadoDeRestaurar =
  | { ok: true; version: number; resumen: ResumenDelRespaldo }
  | { ok: false; motivo: "FOTO_INVALIDA" | "SOLO_DUENIO"; detalle: string };

// ── la acción de la fila ─────────────────────────────────────────────────────

const ACCION = /^(guardar|restaurar):(\d{1,12}):(\d{4}-\d{2}-\d{2})$/;

export function accionDeFila(accion: AccionDeFoto, version: number, dia: Fecha): string {
  return `${accion}:${version}:${dia}`;
}

/** La metadata de una fila (null si la acción no es de una foto: se ignora). */
export function metaDeFila(f: { id: string; action: string }): MetaDeFoto | null {
  const m = ACCION.exec(f.action);
  return m ? { id: f.id, accion: m[1] as AccionDeFoto, version: Number(m[2]), dia: m[3] } : null;
}

// ── poda (pura) ──────────────────────────────────────────────────────────────

/**
 * Qué filas se borran. Quedan la de versión más alta y, por cada época (una restauración abre una nueva) y cada día
 * de caja dentro de la ventana (`dias` días hasta el día de la vigente), la de versión más alta.
 */
export function idsParaPodar(filas: readonly MetaDeFoto[], dias = DIAS_CON_FOTO): string[] {
  if (filas.length === 0) return [];
  const orden = [...filas].sort((a, b) => a.version - b.version);
  const vigente = orden[orden.length - 1];
  const desde = sumarDias(vigente.dia, -(dias - 1));
  const quedan = new Set<string>([vigente.id]);
  const ultimaPorClave = new Map<string, string>();
  let epoca = 0;
  for (const f of orden) {
    if (f.accion === "restaurar") epoca++;
    if (f.dia >= desde && f.dia <= vigente.dia) ultimaPorClave.set(`${epoca}|${f.dia}`, f.id);
  }
  for (const id of ultimaPorClave.values()) quedan.add(id);
  return orden.filter((f) => !quedan.has(f.id)).map((f) => f.id);
}

// ── con el cliente por parámetro ─────────────────────────────────────────────

const donde = (tenantId: string) => ({ tenantId, entity: ENTIDAD_CLUB_ESTADO, entityId: tenantId });

/** Las fotos del negocio, sin traer el contenido. */
export async function metasEnTx(db: Db, tenantId: string): Promise<MetaDeFoto[]> {
  const filas = await db.auditLog.findMany({ where: donde(tenantId), select: { id: true, action: true } });
  return filas.flatMap((f) => metaDeFila(f) ?? []).sort((a, b) => a.version - b.version);
}

/** La foto vigente del negocio, o null si nunca se guardó. */
export async function leerVigenteEnTx(db: Db, tenantId: string): Promise<FotoVigente | null> {
  const metas = await metasEnTx(db, tenantId);
  const ultima = metas[metas.length - 1];
  if (!ultima) return null;
  const fila = await db.auditLog.findFirst({
    where: { ...donde(tenantId), id: ultima.id },
    select: { changes: true, createdAt: true, actor: true },
  });
  const sobre = (fila?.changes as { sobre?: Sobre } | null)?.sobre;
  if (!fila || !sobre) return null;
  return {
    texto: JSON.stringify(sobre),
    version: ultima.version,
    guardado: typeof sobre.guardado === "number" ? sobre.guardado : null,
    dia: ultima.dia,
    actualizada: fila.createdAt,
    por: fila.actor,
  };
}

/**
 * Escribe una foto YA VALIDADA. `versionEsperada` null = sin control (restaurar). Poda en la misma transacción.
 * El llamador abre la transacción serializable.
 */
export async function escribirFotoEnTx(
  db: Db,
  tenantId: string,
  d: { sobre: Sobre; dia: Fecha; accion: AccionDeFoto; actor: string; versionEsperada: number | null; dias?: number },
): Promise<{ ok: true; version: number; podadas: number } | { ok: false; motivo: typeof CAMBIO_MIENTRAS_MIRABAS; version: number }> {
  const metas = await metasEnTx(db, tenantId);
  const actual = metas.length ? metas[metas.length - 1].version : 0;
  if (d.versionEsperada !== null && d.versionEsperada !== actual) return { ok: false, motivo: CAMBIO_MIENTRAS_MIRABAS, version: actual };
  const version = actual + 1;
  const nueva = await db.auditLog.create({
    data: {
      tenantId,
      actor: d.actor,
      action: accionDeFila(d.accion, version, d.dia),
      entity: ENTIDAD_CLUB_ESTADO,
      entityId: tenantId,
      changes: { version, dia: d.dia, sobre: d.sobre } as unknown as Prisma.InputJsonValue,
      channel: "admin",
    },
    select: { id: true },
  });
  const borrar = idsParaPodar([...metas, { id: nueva.id, accion: d.accion, version, dia: d.dia }], d.dias);
  let podadas = 0;
  if (borrar.length) podadas = (await db.auditLog.deleteMany({ where: { ...donde(tenantId), id: { in: borrar } } })).count;
  return { ok: true, version, podadas };
}

// ── con su transacción (RLS) ─────────────────────────────────────────────────

/** Corre `fn` en una transacción del negocio (RLS). Se reemplaza en los tests sin base. */
export type CorrerEnElNegocio = <T>(tenantId: string, fn: (db: Db) => Promise<T>, serializable: boolean) => Promise<T>;

const correrConRls: CorrerEnElNegocio = async (tenantId, fn, serializable) => {
  const { tenantTransaction } = await import("@/lib/rls");
  return tenantTransaction((tx) => fn(tx), serializable ? { tenantId, isolationLevel: "Serializable" } : { tenantId });
};

export interface RepoDelClub {
  leerVigente(tenantId: string): Promise<FotoVigente | null>;
  /** Guarda el sobre (texto del almacén) si nadie guardó desde `versionEsperada`. */
  guardar(tenantId: string, texto: string, versionEsperada: number, actor: string, ahoraMs?: number): Promise<ResultadoDeGuardar>;
  /** Pone un respaldo como estado vigente (sólo un dueño). No pide versión: es una decisión explícita. */
  restaurar(tenantId: string, texto: string, auth: { actor: string; rol: Role }, ahoraMs?: number): Promise<ResultadoDeRestaurar>;
}

export function crearRepoDelClub(correr: CorrerEnElNegocio = correrConRls, dias = DIAS_CON_FOTO): RepoDelClub {
  return {
    leerVigente: (tenantId) => correr(tenantId, (db) => leerVigenteEnTx(db, tenantId), false),

    async guardar(tenantId, texto, versionEsperada, actor, ahoraMs = Date.now()) {
      if (!Number.isInteger(versionEsperada) || versionEsperada < 0) return { ok: false, motivo: "FOTO_INVALIDA", detalle: "La versión no es válida." };
      // Se valida FUERA de la transacción: parsear una foto grande no tiene que alargar la transacción.
      const l = leerSobre(texto);
      if (!l.ok) return { ok: false, motivo: "FOTO_INVALIDA", detalle: l.motivo };
      const dia = diaDeCajaEn(l.estado, ahoraMs);
      return correr(tenantId, (db) => escribirFotoEnTx(db, tenantId, { sobre: l.sobre, dia, accion: "guardar", actor, versionEsperada, dias }), true);
    },

    async restaurar(tenantId, texto, auth, ahoraMs = Date.now()) {
      if (auth.rol !== "OWNER") return { ok: false, motivo: "SOLO_DUENIO", detalle: "Restaurar un respaldo lo hace un dueño." };
      const l = leerSobre(texto);
      if (!l.ok) return { ok: false, motivo: "FOTO_INVALIDA", detalle: l.motivo };
      const dia = diaDeCajaEn(l.estado, ahoraMs);
      const r = await correr(tenantId, (db) => escribirFotoEnTx(db, tenantId, { sobre: l.sobre, dia, accion: "restaurar", actor: auth.actor, versionEsperada: null, dias }), true);
      if (!r.ok) throw new Error("restaurar no controla versión: no puede chocar");
      return { ok: true, version: r.version, resumen: resumenDelRespaldo(l.estado) };
    },
  };
}

/** El repositorio de la app (con `tenantTransaction`). */
export const { leerVigente, guardar, restaurar } = crearRepoDelClub();
