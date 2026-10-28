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
//    mira si ya está. Sin columnas, por `payload->>'clave'`, que el sobre trae siempre. Con
//    columnas, por la columna (índice UNIQUE) O por `payload->>'clave'` en las filas con `clave`
//    NULL (índice parcial de N2_hub): así la dedupe aguanta la transición —una fila escrita sin
//    N2_hub, o por un proceso con el probe todavía en false, tiene `clave` NULL y el UNIQUE no la
//    ve— sin recorrer el outbox del negocio en cada venta (v2-d, CERT-P2). Dos emisiones a la vez del mismo hecho se
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
import { bienFormado, erroresDe } from "./esquema";

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

// SIN columnas (Neon hoy): por `payload->>'clave'` (el sobre), que tienen las filas de los dos
// modos. Recorre las filas del negocio y de ese tipo por el índice de tenantId: sin N2_hub no hay
// índice posible sobre la clave (costo medido en CERT-P2, vuelta 4).
export const SQL_YA_ESTA = `SELECT "id" FROM "OutboxEvent"
  WHERE "tenantId" = $1 AND "type" = $2 AND "payload"->>'clave' = $3
  LIMIT 1`;

// CON columnas: la columna (UNIQUE tenantId+clave) o, en las filas con `clave` NULL (escritas
// antes de N2_hub o por un proceso con el probe viejo), la del sobre por el índice parcial
// `OutboxEvent_tenantId_payloadClave_sinClave_idx`. Dos ramas indexadas: no recorre el outbox.
export const SQL_YA_ESTA_CON_COLUMNAS = `SELECT "id" FROM "OutboxEvent"
  WHERE "tenantId" = $1 AND "type" = $2
    AND ("clave" = $3 OR ("clave" IS NULL AND "payload"->>'clave' = $3))
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

/** Cambia, en el lugar, todo sustituto suelto de los textos de un objeto JSON por U+FFFD. */
function sanearTextos(o: Record<string, unknown> | unknown[]): void {
  const entradas: [string | number, unknown][] = Array.isArray(o) ? o.map((v, i) => [i, v]) : Object.entries(o);
  for (const [k, v] of entradas) {
    let nuevo = v;
    if (typeof v === "string") nuevo = bienFormado(v);
    else if (v && typeof v === "object") sanearTextos(v as Record<string, unknown>);
    if (nuevo !== v) (o as Record<string | number, unknown>)[k] = nuevo;
  }
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
  // Una clave armada con un texto de la persona tampoco puede llevar un sustituto suelto (O-v4-3).
  const clave = bienFormado(ev.clave?.trim() ?? "");
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
  // Red de seguridad (O-v4-3, CERT-P2): ningún texto del sobre —un `id`, un `texto`, un nombre de
  // producto— lleva un sustituto suelto. jsonb lo rechaza (22P02) y tumbaría el hecho entero.
  sanearTextos(payload);
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
  const previas = await sql.$queryRawUnsafe<{ id: string }[]>(conColumnas ? SQL_YA_ESTA_CON_COLUMNAS : SQL_YA_ESTA, ev.tenantId, sobre.type, sobre.clave);
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

// ── En lote (F7, CERT-P2 vuelta 5) ────────────────────────────────────────────
//
// Una operación masiva (aumento de precios de hasta 2000 productos, la planilla, la lista de la
// marca, un recuento grande) emite un evento por fila. Uno por uno son tres viajes a la base por
// evento (candado, dedupe, INSERT): con ~1300 productos la transacción pasaba el tope de 5 s de
// Prisma y se deshacía entera. En lote son TRES sentencias en total, con el mismo contrato:
//   · cada evento se valida, se redacta y se arma igual que en `emitirEvento` (`armarSobre`);
//     si uno no cumple, TIRA antes de escribir nada y la transacción vuelve atrás;
//   · el MISMO candado por (negocio, clave) que toma `emitirEvento`, uno por clave, en una
//     sentencia y en orden del hash: una emisión suelta del mismo hecho se pone en fila igual,
//     y dos lotes no se traban entre sí;
//   · la misma dedupe (columna, o `payload->>'clave'` en las filas con `clave` NULL; sin
//     columnas, por el sobre) con `unnest` de las claves: una sola pasada, no una por evento;
//   · un INSERT … SELECT FROM unnest, con `ON CONFLICT DO NOTHING` si están las columnas.
// Dentro del lote, una clave repetida sale una vez (la primera); las demás, `duplicado`.
// Devuelve un resultado por evento, en el orden de entrada.

/** Un evento cualquiera del catálogo (para el lote, que mezcla tipos). */
export type EventoDelCatalogo = { [T in TipoEvento]: EventoAEmitir<T, VersionDe<T>> }[TipoEvento];

export const SQL_CANDADOS_DEL_LOTE = `SELECT count(*)::int AS n FROM (
    SELECT pg_advisory_xact_lock(h) AS l FROM (
      SELECT DISTINCT hashtextextended(k, 0) AS h FROM unnest($1::text[]) AS k ORDER BY 1
    ) AS orden
  ) AS candados`;

const LOTE_PEDIDO = `unnest($1::text[], $2::text[], $3::text[]) WITH ORDINALITY AS p("t", "ty", "c", "i")`;

export const SQL_YA_ESTAN_DEL_LOTE = `SELECT p."i"::int AS i FROM ${LOTE_PEDIDO}
  WHERE EXISTS (SELECT 1 FROM "OutboxEvent" o WHERE o."tenantId" = p."t" AND o."type" = p."ty" AND o."payload"->>'clave' = p."c")`;

export const SQL_YA_ESTAN_DEL_LOTE_CON_COLUMNAS = `SELECT p."i"::int AS i FROM ${LOTE_PEDIDO}
  WHERE EXISTS (SELECT 1 FROM "OutboxEvent" o WHERE o."tenantId" = p."t" AND o."type" = p."ty" AND o."clave" = p."c")
     OR EXISTS (SELECT 1 FROM "OutboxEvent" o WHERE o."tenantId" = p."t" AND o."type" = p."ty" AND o."clave" IS NULL AND o."payload"->>'clave' = p."c")`;

export const SQL_INSERTAR_LOTE_CON_COLUMNAS = `INSERT INTO "OutboxEvent" ("id", "tenantId", "type", "payload", "version", "clave")
  SELECT f."id", f."t", f."ty", f."pl"::jsonb, f."v", f."c"
  FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::int[], $6::text[]) AS f("id", "t", "ty", "pl", "v", "c")
  ON CONFLICT ("tenantId", "clave") DO NOTHING
  RETURNING "id"`;

export const SQL_INSERTAR_LOTE_SIN_COLUMNAS = `INSERT INTO "OutboxEvent" ("id", "tenantId", "type", "payload")
  SELECT f."id", f."t", f."ty", f."pl"::jsonb
  FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) AS f("id", "t", "ty", "pl")
  RETURNING "id"`;

/**
 * Emite varios eventos en el outbox, dentro de `tx`, en tres sentencias (candados, dedupe,
 * INSERT). Mismo contrato que `emitirEvento` por evento; ver el bloque de arriba.
 */
export async function emitirEventosEnLote(tx: object, eventos: readonly EventoDelCatalogo[]): Promise<ResultadoEmision[]> {
  // Primero se arman TODOS: uno que no cumple tira antes de escribir nada.
  const sobres = eventos.map((ev) => armarSobre(ev as EventoAEmitir<TipoEvento, VersionDe<TipoEvento>>));
  if (!tieneSql(tx)) return sobres.map(() => ({ escrito: false, motivo: "sin-sql" }) as const);
  if (sobres.length === 0) return [];
  const sql = tx;
  const conColumnas = await outboxConColumnasN2(sql);
  const modo = conColumnas ? "columnas" : "payload";
  const duplicado: ResultadoEmision = { escrito: false, motivo: "duplicado", modo };
  const salida: ResultadoEmision[] = sobres.map(() => duplicado);

  // Una clave repetida en el lote: vale la primera (como dos `emitirEvento` seguidos).
  const vistas = new Set<string>();
  const unicos: number[] = [];
  sobres.forEach((s, i) => {
    const llave = `outbox:${eventos[i].tenantId}:${s.clave}`;
    if (vistas.has(llave)) return;
    vistas.add(llave);
    unicos.push(i);
  });

  await sql.$queryRawUnsafe(SQL_CANDADOS_DEL_LOTE, [...vistas]);
  const yaEstan = await sql.$queryRawUnsafe<{ i: number }[]>(
    conColumnas ? SQL_YA_ESTAN_DEL_LOTE_CON_COLUMNAS : SQL_YA_ESTAN_DEL_LOTE,
    unicos.map((i) => eventos[i].tenantId),
    unicos.map((i) => sobres[i].type),
    unicos.map((i) => sobres[i].clave),
  );
  const previos = new Set(yaEstan.map((f) => unicos[Number(f.i) - 1]));
  const aEscribir = unicos.filter((i) => !previos.has(i));
  if (aEscribir.length === 0) return salida;

  const ids = aEscribir.map((i) => sobres[i].id);
  const tenants = aEscribir.map((i) => eventos[i].tenantId);
  const tipos = aEscribir.map((i) => sobres[i].type);
  const filas = conColumnas
    ? await sql.$queryRawUnsafe<{ id: string }[]>(
        SQL_INSERTAR_LOTE_CON_COLUMNAS,
        ids,
        tenants,
        tipos,
        aEscribir.map((i) => JSON.stringify(sobres[i].payload)),
        aEscribir.map((i) => eventos[i].version),
        aEscribir.map((i) => sobres[i].clave),
      )
    : await sql.$queryRawUnsafe<{ id: string }[]>(
        SQL_INSERTAR_LOTE_SIN_COLUMNAS,
        ids,
        tenants,
        tipos,
        aEscribir.map((i) => JSON.stringify({ ...sobres[i].payload, _clave: sobres[i].clave })),
      );
  const escritos = new Set(filas.map((f) => f.id));
  for (const i of aEscribir) {
    if (escritos.has(sobres[i].id)) salida[i] = { escrito: true, id: sobres[i].id, modo };
  }
  return salida;
}
