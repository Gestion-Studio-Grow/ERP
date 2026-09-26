// ============================================================================
// LISTA DE COMPROBANTES — la consulta a la base (paginada, con totales del filtro).
// ============================================================================
//
// UNA consulta por página, siempre la misma, tenga 10 o 50.000 comprobantes el negocio, que trae:
//   · cantidad y suma por estado de TODO el filtro (GROUP BY en la base, suma en numeric y CON
//     SIGNO: las notas de crédito restan, la regla del Libro IVA — lista-core.ts);
//   · los 50 renglones de la página: primero se eligen los 50 (sólo con columnas del comprobante)
//     y DESPUÉS se les busca el nombre del receptor a esos 50, sin N+1.
// Van dentro de `tenantTransaction`: el GUC del negocio queda puesto y RLS filtra; además cada
// consulta lleva su `"tenantId" = ...` explícito (la regla de las consultas crudas, rls.ts:88).
//
// SQL crudo a propósito: el nombre del receptor vive en la ficha del cliente (por la venta o el
// turno), en el pedido o en el movimiento del banco del que salió el comprobante. Es la MISMA
// precedencia que usa el comprobante impreso (comprobante-pdf-datos.ts:163): el banco, sólo si la
// venta no da un nombre.
//
// Índices (medido en .qa/facturacion-escala/rendimiento.txt, 50.000 comprobantes y 80.000
// movimientos del banco en un negocio): hoy existen `Invoice(tenantId, status)` y la única de
// numeración; FALTAN `Invoice(tenantId, fecha, …)` y `MovimientoImportado(tenantId, invoiceId)`
// (BACKLOG ESC-01, ventana M1). Mientras tanto la consulta está armada para no depender de ellos:
//   · el orden y el período recorren los comprobantes del negocio UNA vez (Seq Scan + Sort), sin
//     juntar pedidos, fichas ni movimientos antes de elegir la página;
//   · los movimientos del banco se recorren a lo sumo UNA vez por consulta y sólo cuando hacen falta
//     (el nombre de los renglones de la página que no lo tienen por la venta, o buscar un nombre),
//     nunca un DISTINCT ON de todos los movimientos del negocio ni una búsqueda por renglón.

import { Prisma } from "@/generated/prisma/client";
import { tenantTransaction } from "@/lib/rls";
import { redondearAlCentavo, textoAlCentavo } from "@/lib/dinero/redondeo";
import {
  CON_TILDE,
  POR_PAGINA,
  SIN_TILDE,
  TIPOS_NOTA_DE_CREDITO,
  patronAmplio,
  textoComparable,
  TOPE_CSV,
  escaparLike,
  estadosDelFiltro,
  interpretarBusqueda,
  paginasPara,
  tiposDelFiltro,
  totalesVacios,
  type EstadoComprobante,
  type FiltrosComprobantes,
  type PaginaDeComprobantes,
  type RenglonComprobante,
} from "./lista-core";

/** Lo único que esta consulta necesita de la transacción (así el test cuenta las idas a la base). */
export interface ConsultaCruda {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
}

/**
 * El nombre que da la venta: la ficha (por el pedido o el turno) o el nombre anotado en el pedido.
 * Una nota de crédito no tiene venta propia (el pedido ya es de la factura): su receptor es el de
 * la factura que anula (ARCA exige el mismo), así que sin venta propia vale la de esa factura. Si
 * no, la nota salía como «Consumidor final» o con el documento y la búsqueda por nombre la dejaba
 * afuera: el total del cliente quedaba sin restar sus notas. La factura asociada se busca SÓLO
 * para las notas (CASE: las demás no pagan nada), por clave primaria.
 */
function receptorDeLaVenta(tenantId: string): Prisma.Sql {
  return Prisma.sql`COALESCE(NULLIF(c."razonSocial", ''), NULLIF(c.name, ''), NULLIF(o."customerName", ''),
    CASE WHEN i."comprobanteAsociadoId" IS NOT NULL THEN (
      SELECT COALESCE(NULLIF(ca."razonSocial", ''), NULLIF(ca.name, ''), NULLIF(oa."customerName", ''))
      FROM "Invoice" ia
      LEFT JOIN "Order" oa ON oa.id = ia."orderId" AND oa."tenantId" = ${tenantId}
      LEFT JOIN "Appointment" aa ON aa.id = ia."appointmentId" AND aa."tenantId" = ${tenantId}
      LEFT JOIN "Client" ca ON ca.id = COALESCE(oa."clientId", aa."clientId") AND ca."tenantId" = ${tenantId}
      WHERE ia.id = i."comprobanteAsociadoId" AND ia."tenantId" = ${tenantId}) END)`;
}

/** El total con signo: la nota de crédito resta (lista-core.ts, `TIPOS_NOTA_DE_CREDITO`). */
const IMPORTE_CON_SIGNO = Prisma.sql`(CASE WHEN i."tipoComprobante" IN (${Prisma.join([...TIPOS_NOTA_DE_CREDITO])}) THEN -i.total ELSE i.total END)`;

/** El comprobante del que sale el nombre del banco: el que anula la nota, o el mismo. */
const ORIGEN_DEL_BANCO = Prisma.sql`COALESCE(i."comprobanteAsociadoId", i.id)`;

/**
 * ¿El texto `x` de la base contiene lo buscado, sin tildes ni mayúsculas de los dos lados?
 * (lista-core.ts, `textoComparable`). Primero el LIKE amplio, barato (`patronAmplio`); sólo a lo
 * que pasa se le sacan las tildes (CASE: la base no evalúa la rama que no toca).
 */
function coincideSinTildes(x: Prisma.Sql, texto: string): Prisma.Sql {
  return Prisma.sql`(CASE WHEN lower(${x}) LIKE ${`%${patronAmplio(texto)}%`}
    THEN translate(lower(${x}), ${CON_TILDE}, ${SIN_TILDE}) LIKE ${`%${escaparLike(textoComparable(texto))}%`} ELSE FALSE END)`;
}

/** Pedido, turno y ficha del comprobante `i` (LEFT JOIN por clave primaria, del mismo negocio). */
function juntarLaVenta(tenantId: string): Prisma.Sql {
  return Prisma.sql`
    LEFT JOIN "Order" o ON o.id = i."orderId" AND o."tenantId" = ${tenantId}
    LEFT JOIN "Appointment" a ON a.id = i."appointmentId" AND a."tenantId" = ${tenantId}
    LEFT JOIN "Client" c ON c.id = COALESCE(o."clientId", a."clientId") AND c."tenantId" = ${tenantId}`;
}

/** ¿El filtro busca un nombre? Sólo entonces el WHERE necesita la venta y el banco. */
function buscaNombre(f: FiltrosComprobantes): boolean {
  return interpretarBusqueda(f.q).texto !== null;
}

/** El FROM del filtro: el comprobante solo, o con su venta si hay que buscar un nombre. */
function desde(tenantId: string, f: FiltrosComprobantes): Prisma.Sql {
  return buscaNombre(f) ? Prisma.sql`FROM "Invoice" i ${juntarLaVenta(tenantId)}` : Prisma.sql`FROM "Invoice" i`;
}

/** El WHERE del filtro (va con el FROM de `desde`). Exportado para el test de la regla. */
export function condiciones(tenantId: string, f: FiltrosComprobantes): Prisma.Sql {
  const c: Prisma.Sql[] = [Prisma.sql`i."tenantId" = ${tenantId}`];
  const estados = estadosDelFiltro(f.estado);
  if (estados) c.push(Prisma.sql`i.status IN (${Prisma.join(estados.map((e) => Prisma.sql`${e}::"InvoiceStatus"`))})`);
  const tipos = tiposDelFiltro(f.tipo);
  if (tipos) c.push(Prisma.sql`i."tipoComprobante" IN (${Prisma.join(tipos)})`);
  if (f.puntoVenta) c.push(Prisma.sql`i."puntoVenta" = ${f.puntoVenta}`);
  if (f.desde) c.push(Prisma.sql`i.fecha >= ${f.desde.replaceAll("-", "")}`);
  if (f.hasta) c.push(Prisma.sql`i.fecha <= ${f.hasta.replaceAll("-", "")}`);

  const b = interpretarBusqueda(f.q);
  const o: Prisma.Sql[] = [];
  if (b.texto) {
    // El nombre de la venta; si la venta no da nombre, el del movimiento del banco del que salió
    // (el de la factura que anula, si es una nota de crédito). Sin tildes ni mayúsculas de los
    // dos lados. Los movimientos que coinciden se juntan UNA vez (subconsulta sin correlación) y
    // se cruzan por id del comprobante.
    o.push(Prisma.sql`(${coincideSinTildes(receptorDeLaVenta(tenantId), b.texto)} OR (${receptorDeLaVenta(tenantId)} IS NULL AND ${ORIGEN_DEL_BANCO} IN (
      SELECT m."invoiceId" FROM "MovimientoImportado" m
      WHERE m."tenantId" = ${tenantId} AND m."invoiceId" IS NOT NULL AND ${coincideSinTildes(Prisma.sql`m."nombreReceptor"`, b.texto)})))`);
  }
  if (b.documento) o.push(Prisma.sql`i."docNro" LIKE ${`${b.documento}%`}`);
  if (b.numero !== null) {
    o.push(
      b.puntoVenta !== null
        ? Prisma.sql`(i.numero = ${b.numero} AND i."puntoVenta" = ${b.puntoVenta})`
        : Prisma.sql`i.numero = ${b.numero}`,
    );
  }
  if (b.importe !== null) o.push(Prisma.sql`i.total = ${textoAlCentavo(b.importe)}::numeric`);
  // Algo escrito que no es nada buscable (por ejemplo «-»): sin resultados, no «todo».
  if (f.q && o.length === 0) c.push(Prisma.sql`FALSE`);
  else if (o.length > 0) c.push(Prisma.sql`(${Prisma.join(o, " OR ")})`);
  return Prisma.join(c, " AND ");
}

const ORDEN = Prisma.sql`fecha DESC, "createdAt" DESC, id DESC`;

/**
 * Los renglones de los comprobantes elegidos. Va después de una CTE `elegidos(id)` (los ids de la
 * página, ya recortados) y deja la CTE `renglones`:
 *   · `pagina`: las columnas de esos comprobantes (por clave primaria);
 *   · `con_venta`: el nombre que da la venta (pedido, turno, ficha);
 *   · `banco`: a los que la venta no les da nombre, el del movimiento del banco (el primero por id).
 */
function ctesDeRenglones(tenantId: string): Prisma.Sql {
  return Prisma.sql`
    pagina AS MATERIALIZED (
      SELECT i.id, i.fecha, i."tipoComprobante", i."puntoVenta", i.numero, i.status, i.total, i."docTipo", i."docNro",
             i.cae, i."rechazoMotivo", i."createdAt", i."orderId", i."appointmentId", i."comprobanteAsociadoId"
      FROM "Invoice" i
      WHERE i."tenantId" = ${tenantId} AND i.id IN (SELECT e.id FROM elegidos e)
    ),
    con_venta AS MATERIALIZED (
      SELECT i.*, ${receptorDeLaVenta(tenantId)} AS receptor_venta, ${ORIGEN_DEL_BANCO} AS origen_banco
      FROM pagina i ${juntarLaVenta(tenantId)}
    ),
    banco AS (
      SELECT DISTINCT ON (m."invoiceId") m."invoiceId", m."nombreReceptor"
      FROM "MovimientoImportado" m
      WHERE m."tenantId" = ${tenantId}
        AND m."invoiceId" IN (SELECT v.origen_banco FROM con_venta v WHERE v.receptor_venta IS NULL)
      ORDER BY m."invoiceId", m.id
    ),
    renglones AS (
      SELECT i.id, i.fecha, i."tipoComprobante", i."puntoVenta", i.numero, i.status::text AS status,
             ${IMPORTE_CON_SIGNO}::text AS total, i."docTipo", i."docNro",
             COALESCE(i.receptor_venta, b."nombreReceptor") AS receptor, i.cae, i."rechazoMotivo", i."createdAt"
      FROM con_venta i
      LEFT JOIN banco b ON b."invoiceId" = i.origen_banco
    )`;
}

/**
 * UNA consulta por página: los totales por estado de todo el filtro (suma con signo) y los 50
 * renglones de la página, en una fila con dos columnas JSON. El filtro se evalúa una sola vez
 * cuando busca un nombre (lo caro: la venta y el banco de cada comprobante), y la página se
 * recorta a la última si se pidió una más allá (el mismo cálculo que `paginasPara`).
 * Exportada para mirar su plan en el test (EXPLAIN de la consulta de verdad).
 */
export function consultaDePagina(tenantId: string, f: FiltrosComprobantes): Prisma.Sql {
  const salto = (f.pagina - 1) * POR_PAGINA;
  const materializar = buscaNombre(f) ? Prisma.sql`MATERIALIZED` : Prisma.sql`NOT MATERIALIZED`;
  return Prisma.sql`
    WITH filtro AS ${materializar} (
      SELECT i.id, i.fecha, i."createdAt", i.status, ${IMPORTE_CON_SIGNO} AS importe
      ${desde(tenantId, f)}
      WHERE ${condiciones(tenantId, f)}
    ),
    totales AS MATERIALIZED (
      SELECT status::text AS status, count(*)::int AS cantidad, COALESCE(sum(importe), 0)::text AS importe
      FROM filtro GROUP BY status
    ),
    elegidos AS MATERIALIZED (
      SELECT id FROM filtro
      ORDER BY ${ORDEN}
      LIMIT ${POR_PAGINA}
      OFFSET LEAST(${salto}::bigint, (GREATEST((SELECT COALESCE(sum(t.cantidad), 0) FROM totales t), 1) - 1) / ${POR_PAGINA} * ${POR_PAGINA})
    ),
    ${ctesDeRenglones(tenantId)}
    SELECT
      (SELECT COALESCE(json_agg(t), '[]'::json) FROM totales t) AS totales,
      (SELECT COALESCE(json_agg(r ORDER BY r.fecha DESC, r."createdAt" DESC, r.id DESC), '[]'::json) FROM renglones r) AS renglones`;
}

/** Los primeros `limite` renglones del filtro, sin totales (el CSV). Exportada para mirar su plan en el test. */
export function consultaDeRenglones(tenantId: string, f: FiltrosComprobantes, limite: number): Prisma.Sql {
  return Prisma.sql`
    WITH elegidos AS MATERIALIZED (
      SELECT i.id ${desde(tenantId, f)}
      WHERE ${condiciones(tenantId, f)}
      ORDER BY i.fecha DESC, i."createdAt" DESC, i.id DESC
      LIMIT ${limite}
    ),
    ${ctesDeRenglones(tenantId)}
    SELECT id, fecha, "tipoComprobante", "puntoVenta", numero, status, total, "docTipo", "docNro", receptor, cae, "rechazoMotivo"
    FROM renglones
    ORDER BY ${ORDEN}`;
}

type FilaCruda = Omit<RenglonComprobante, "total"> & { total: string };

function aRenglon(f: FilaCruda): RenglonComprobante {
  return {
    id: f.id,
    fecha: f.fecha,
    tipoComprobante: f.tipoComprobante,
    puntoVenta: f.puntoVenta,
    numero: f.numero,
    status: f.status,
    total: redondearAlCentavo(Number(f.total)),
    docTipo: f.docTipo,
    docNro: f.docNro,
    receptor: f.receptor,
    cae: f.cae,
    rechazoMotivo: f.rechazoMotivo,
  };
}

/** Una columna JSON como la devuelva el driver (ya leída o como texto). */
function deJson<T>(v: unknown): T {
  return (typeof v === "string" ? JSON.parse(v) : v) as T;
}

/**
 * Una página de comprobantes con los totales del filtro. `db` es la transacción del negocio
 * (la pasa `leerPaginaDeComprobantes`); el test la envuelve para contar las consultas.
 */
export async function paginaDeComprobantesEn(
  db: ConsultaCruda,
  tenantId: string,
  f: FiltrosComprobantes,
): Promise<PaginaDeComprobantes> {
  const [fila] = await db.$queryRaw<{ totales: unknown; renglones: unknown }[]>(consultaDePagina(tenantId, f));
  const t = totalesVacios();
  for (const r of deJson<{ status: EstadoComprobante; cantidad: number; importe: string }[]>(fila?.totales ?? [])) {
    t.porEstado[r.status] = { cantidad: r.cantidad, importe: redondearAlCentavo(Number(r.importe)) };
    t.cantidad += r.cantidad;
  }
  const paginas = paginasPara(t.cantidad);
  const renglones = deJson<FilaCruda[]>(fila?.renglones ?? []).map(aRenglon);
  return { renglones, totales: t, pagina: Math.min(f.pagina, paginas), paginas };
}

/** La página pedida, dentro de la transacción del negocio (RLS con su GUC). Sin chequeo de rol: lo hace quien llama. */
export function leerPaginaDeComprobantes(tenantId: string, f: FiltrosComprobantes): Promise<PaginaDeComprobantes> {
  return tenantTransaction((tx) => paginaDeComprobantesEn(tx, tenantId, f), { tenantId });
}

/**
 * Todo el filtro para el CSV, hasta `TOPE_CSV` renglones. `recortado` avisa si había más: el
 * archivo lo dice en su primera línea para que nadie crea que tiene todo.
 */
export function leerParaExportar(
  tenantId: string,
  f: FiltrosComprobantes,
): Promise<{ renglones: RenglonComprobante[]; recortado: boolean }> {
  return tenantTransaction(async (tx) => {
    const filas = (await tx.$queryRaw<FilaCruda[]>(consultaDeRenglones(tenantId, f, TOPE_CSV + 1))).map(aRenglon);
    return { renglones: filas.slice(0, TOPE_CSV), recortado: filas.length > TOPE_CSV };
  }, { tenantId });
}
