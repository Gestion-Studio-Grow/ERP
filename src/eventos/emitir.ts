// ============================================================================
// emitirEvento — escribe un evento de dominio en el outbox, DENTRO de la transacción del hecho
// ============================================================================
//
//   await emitirEvento(tx, { tenantId, tipo: "pedido.cobrado", version: 1, clave: `pedido:${id}:cobrado`, datos });
//
// 1. VALIDA `datos` contra el catálogo (esquema de esa versión). Si no cumple, TIRA: la
//    transacción del hecho vuelve atrás entera. Un hecho sin su evento —o un evento con una forma
//    que rompe a los suscriptores— no se graba a medias (P2-C1, P2-C3).
// 2. REDACTA los textos libres (datos personales, §7.3) y arma el sobre común:
//    { id, tipo, version, negocio, ocurridoEn, clave, datos, enlaces? }.
// 3. ESCRIBE `OutboxEvent` con `type = "tipo@N"` por SQL parametrizado: el cliente de Prisma no
//    conoce `version` ni `clave` (son `// N2:` en schema.prisma hasta que se aplique N2_hub.sql),
//    y el SQL sirve en los dos estados de la base:
//      · CON las columnas (N2_hub aplicada): `version`, `clave` y
//        `ON CONFLICT ("tenantId","clave") DO NOTHING` sobre el UNIQUE de N2_hub → una fila por hecho.
//      · SIN las columnas (hoy en Neon): la clave va además en `payload._clave`.
//    En LOS DOS modos, antes de insertar se toma `pg_advisory_xact_lock` por (negocio, clave) y se
//    mira si ya está por `payload->>'clave'`, que el sobre trae siempre. Así la dedupe aguanta la
//    transición: una fila escrita sin N2_hub tiene `clave` NULL (el UNIQUE no la ve) y un proceso
//    con el probe todavía en false no ve la columna. Dos emisiones a la vez del mismo hecho se
//    ponen en fila: la segunda espera a que la primera confirme y la ve (READ COMMITTED: cada
//    sentencia ve lo confirmado). En SERIALIZABLE la foto es la del comienzo y el chequeo no
//    alcanza: ahí el que ataja es el UNIQUE de N2_hub (que el backfill de N2_hub completa).
// 4. ¿Hay columnas? Lo pregunta src/lib/schema-probe/probe.ts (caché por proceso), y la consulta
//    al catálogo de Postgres corre EN LA MISMA CONEXIÓN de la transacción: preguntar por otra
//    conexión del pool mientras la transacción retiene la suya puede dejar a 5 ventas simultáneas
//    esperando una conexión que no se libera. La consulta es a pg_catalog y no puede fallar por
//    datos; si fallara por la red, la transacción entera vuelve atrás (no queda a medias).
//
// `tenantId` explícito (ADR-018): sin RLS (`RLS_ENFORCEMENT` apagado) el GUC del negocio no está
// puesto en la transacción, así que no se lo puede leer de la base. Con RLS, la política del
// OutboxEvent rechaza un `tenantId` que no sea el de la transacción.
//
// Doble de test sin SQL: un `tx` falso de los tests de unidad (no tiene `$queryRawUnsafe`) no
// emite y devuelve `{ escrito: false, motivo: "sin-sql" }`. Un cliente de Prisma real siempre lo tiene.
// ============================================================================

import { crearSchemaProbe, type ConsultaSql } from "@/lib/schema-probe/probe";
import { definicionDe, type DatosDe, type TipoEvento, type VersionDe } from "./catalogo";
import { erroresDe } from "./esquema";

/** Lo mínimo del cliente de transacción que usa el emisor (Prisma.TransactionClient lo cumple). */
export interface TxConSql {
  $queryRawUnsafe<T = unknown>(sql: string, ...valores: unknown[]): Promise<T>;
}

export interface EventoAEmitir<T extends TipoEvento, V extends VersionDe<T>> {
  tenantId: string;
  tipo: T;
  version: V;
  /** Única por hecho (`pedido:<id>:cobrado`). Reemitir el mismo hecho no duplica. */
  clave: string;
  datos: DatosDe<T, V>;
  /** Cuándo pasó el hecho (por omisión, ahora). */
  ocurridoEn?: Date;
  enlaces?: Record<string, string>;
}

export type ResultadoEmision =
  | { escrito: true; id: string; modo: "columnas" | "payload" }
  | { escrito: false; motivo: "duplicado"; modo: "columnas" | "payload" }
  | { escrito: false; motivo: "sin-sql" };

export class EventoInvalido extends Error {
  constructor(
    readonly evento: string,
    readonly errores: readonly string[],
  ) {
    super(`El evento ${evento} no cumple el catálogo: ${errores.slice(0, 5).join("; ")}`);
    this.name = "EventoInvalido";
  }
}

// ── ¿Están las columnas de N2_hub? ────────────────────────────────────────────

// Sin `node:async_hooks` ni `node:crypto`: este módulo lo arrastran order-core y order-anulacion,
// que también entran en los paquetes del navegador (sus partes puras). La transacción de la
// consulta se pasa por una variable que se lee SINCRÓNICAMENTE: `crearSchemaProbe` llama a
// `consultar` en el mismo tick en que se le pregunta (antes de su primer await), así que dos
// emisiones simultáneas no se pisan. Si la respuesta ya está en caché, no se llama.
let txDeLaConsulta: TxConSql | null = null;

const consultarEnLaTx: ConsultaSql = (sql, params) => {
  const tx = txDeLaConsulta;
  if (!tx) return Promise.reject(new Error("schema-probe del outbox sin transacción"));
  return tx.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...params);
};

const probeDelOutbox = crearSchemaProbe(consultarEnLaTx);

function hayColumnaEnLaTx(tx: TxConSql, columna: string): Promise<boolean> {
  txDeLaConsulta = tx;
  try {
    return probeDelOutbox.hayColumna("OutboxEvent", columna);
  } finally {
    txDeLaConsulta = null;
  }
}

/** ¿El OutboxEvent tiene `version` y `clave` (N2_hub.sql)? Consulta en la conexión de `tx`. */
export async function outboxConColumnasN2(tx: TxConSql): Promise<boolean> {
  // Una después de la otra: es la conexión de la transacción (nada de consultas en paralelo).
  // N2_hub agrega las dos juntas; cacheadas en true, no se vuelve a preguntar.
  return (await hayColumnaEnLaTx(tx, "clave")) && (await hayColumnaEnLaTx(tx, "version"));
}

/** Tests: olvidar lo que el probe sabe (después de aplicar N2_hub en la base efímera). */
export function olvidarColumnasDelOutbox(): void {
  probeDelOutbox.olvidar();
}

// ── SQL ───────────────────────────────────────────────────────────────────────

export const SQL_INSERTAR_CON_COLUMNAS = `INSERT INTO "OutboxEvent" ("id", "tenantId", "type", "payload", "version", "clave")
  VALUES ($1, $2, $3, $4::jsonb, $5::int, $6)
  ON CONFLICT ("tenantId", "clave") DO NOTHING
  RETURNING "id"`;

export const SQL_CANDADO = `SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtextextended($1, 0))) AS candado`;

// Por `payload->>'clave'` (el sobre), no por `_clave` ni por la columna: lo tienen las filas de
// los dos modos.
export const SQL_YA_ESTA = `SELECT "id" FROM "OutboxEvent"
  WHERE "tenantId" = $1 AND "type" = $2 AND "payload"->>'clave' = $3
  LIMIT 1`;

export const SQL_INSERTAR_SIN_COLUMNAS = `INSERT INTO "OutboxEvent" ("id", "tenantId", "type", "payload")
  VALUES ($1, $2, $3, $4::jsonb)
  RETURNING "id"`;

// ── El emisor ─────────────────────────────────────────────────────────────────

/** La clave que se guarda: la del hecho, con `@N` si la versión es ≥ 2 (doble emisión en la ventana). */
export function claveGuardada(clave: string, version: number): string {
  return version === 1 ? clave : `${clave}@${version}`;
}

/** ¿Es un cliente que puede escribir SQL (Prisma real) o un doble de test de unidad? */
export function tieneSql(tx: object): tx is TxConSql {
  return typeof (tx as Partial<TxConSql>).$queryRawUnsafe === "function";
}

/** Valida, redacta y arma el sobre. Puro: lo usa el emisor y el test de redacción. */
export function armarSobre<T extends TipoEvento, V extends VersionDe<T>>(
  ev: EventoAEmitir<T, V>,
  id: string = `evt_${globalThis.crypto.randomUUID().replace(/-/g, "")}`,
): { id: string; type: string; clave: string; payload: Record<string, unknown> } {
  const nombre = `${ev.tipo}@${ev.version}`;
  const def = definicionDe(ev.tipo, ev.version);
  if (!def) throw new EventoInvalido(nombre, ["no está en el catálogo"]);
  const errores = erroresDe(def.esquema, ev.datos);
  if (!ev.tenantId) errores.push("tenantId: falta el negocio");
  const clave = ev.clave?.trim() ?? "";
  if (!clave || clave.length > 300) errores.push("clave: tiene que tener entre 1 y 300 caracteres");
  if (errores.length) throw new EventoInvalido(nombre, errores);

  const guardada = claveGuardada(clave, ev.version);
  const payload: Record<string, unknown> = {
    id,
    tipo: ev.tipo,
    version: ev.version,
    negocio: ev.tenantId,
    ocurridoEn: (ev.ocurridoEn ?? new Date()).toISOString(),
    clave: guardada,
    datos: def.esquema.redactar(ev.datos),
    ...(ev.enlaces ? { enlaces: ev.enlaces } : {}),
  };
  return { id, type: nombre, clave: guardada, payload };
}

/**
 * Emite `tipo@version` en el outbox, dentro de `tx` (la transacción del hecho). Tira
 * `EventoInvalido` si `datos` no cumple el catálogo; un error de la base también sube. En los
 * dos casos la transacción del llamador vuelve atrás entera.
 */
export async function emitirEvento<T extends TipoEvento, V extends VersionDe<T>>(
  tx: object,
  ev: EventoAEmitir<T, V>,
): Promise<ResultadoEmision> {
  const sobre = armarSobre(ev);
  if (!tieneSql(tx)) return { escrito: false, motivo: "sin-sql" };
  const sql = tx;

  const conColumnas = await outboxConColumnasN2(sql);
  const modo = conColumnas ? "columnas" : "payload";
  await sql.$queryRawUnsafe(SQL_CANDADO, `outbox:${ev.tenantId}:${sobre.clave}`);
  const previas = await sql.$queryRawUnsafe<{ id: string }[]>(SQL_YA_ESTA, ev.tenantId, sobre.type, sobre.clave);
  if (previas.length) return { escrito: false, motivo: "duplicado", modo };

  if (conColumnas) {
    const filas = await sql.$queryRawUnsafe<{ id: string }[]>(
      SQL_INSERTAR_CON_COLUMNAS,
      sobre.id,
      ev.tenantId,
      sobre.type,
      JSON.stringify(sobre.payload),
      ev.version,
      sobre.clave,
    );
    return filas.length ? { escrito: true, id: filas[0].id, modo: "columnas" } : { escrito: false, motivo: "duplicado", modo: "columnas" };
  }

  const filas = await sql.$queryRawUnsafe<{ id: string }[]>(
    SQL_INSERTAR_SIN_COLUMNAS,
    sobre.id,
    ev.tenantId,
    sobre.type,
    JSON.stringify({ ...sobre.payload, _clave: sobre.clave }),
  );
  return { escrito: true, id: filas[0].id, modo: "payload" };
}
