// Lista de comprobantes a escala, contra Postgres real (src/test/base-efimera.ts: migraciones +
// RLS, la app conectada como `app_rls`, como producción).
//
// Siembra en el negocio A 10.000 clientes, 20.000 pedidos, 50.000 comprobantes repartidos en 12
// meses (autorizados, pendientes y rechazados; A, B, C y notas de crédito; tres puntos de venta) y
// 80.000 movimientos del banco (Facturación automática), 50.000 atados a un comprobante; en el
// negocio B, 500 comprobantes con un receptor, un documento y un importe que A no tiene, un
// movimiento del banco con un nombre que A no tiene y una factura de $10.000 anulada con su nota
// de crédito.
//   · aislamiento: A no ve ni cuenta nada de B (ni buscando su nombre, su CUIT, su importe o el
//     nombre que vino del banco), y con la sesión de A pedir los de B por su id de negocio
//     devuelve cero (RLS);
//   · los totales son los del filtro entero, calculados en la base, y las notas de crédito RESTAN
//     (la regla del Libro IVA, libro-iva.ts:272): se comparan con una suma directa con signo como
//     dueño de las tablas;
//   · el receptor de un comprobante sin venta ni turno sale de su movimiento del banco, y el de
//     uno con venta, de la ficha (misma precedencia que el comprobante impreso);
//   · cada página es UNA consulta (totales + renglones juntos), sin N+1;
//   · rendimiento: p95 de cada filtro y del buscador < 300 ms, CON los movimientos del banco
//     cargados. El detalle se escribe en .qa/facturacion-escala/rendimiento.txt.
// Sin Postgres local se saltea y lo dice; en CI, falla.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, type BaseEfimera } from "@/test/base-efimera";
import { leerFiltros, type FiltrosComprobantes } from "./lista-core";

const laBase = baseEfimeraDelArchivo();
const HOY = "2026-09-26";
const P95_MAXIMO_MS = 300;
const VUELTAS = 20;

async function comoDuenio(base: BaseEfimera, sql: string, params: unknown[] = []): Promise<pg.QueryResult> {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    return await c.query(sql, params);
  } finally {
    await c.end();
  }
}

async function sembrar(base: BaseEfimera): Promise<void> {
  const a = base.a.id;
  const b = base.b.id;
  await comoDuenio(
    base,
    `INSERT INTO "Client" (id, "tenantId", name, phone, "docTipo", "docNro", "updatedAt")
     SELECT 'cli_esc_' || g, $1, 'Cliente Escala ' || g, '11' || lpad(g::text, 8, '0'), 80, (20000000000 + g)::text, now()
     FROM generate_series(1, 10000) g`,
    [a],
  );
  await comoDuenio(
    base,
    `INSERT INTO "Order" (id, "tenantId", code, "customerName", "customerPhone", "clientId", "updatedAt")
     SELECT 'ord_esc_' || g, $1, 100000 + g, 'Mostrador', '', 'cli_esc_' || (1 + g % 10000), now()
     FROM generate_series(1, 20000) g`,
    [a],
  );
  // 50.000 comprobantes de A. Estado: 1 de cada 15 pendiente, 1 de cada 33 rechazado, el resto
  // autorizado. Fecha: 12 meses hasta septiembre de 2026. Los primeros 20.000 vienen de un pedido.
  await comoDuenio(
    base,
    `INSERT INTO "Invoice" (id, "tenantId", "puntoVenta", "tipoComprobante", concepto, "docTipo", "docNro", fecha,
                            neto, iva, total, status, cae, numero, "rechazoMotivo", "orderId", "createdAt", "updatedAt")
     SELECT 'fac_esc_' || g, $1, 1 + g % 3,
            CASE WHEN s = 'PENDING' THEN NULL ELSE (ARRAY[1, 6, 6, 6, 11, 3, 8])[1 + g % 7] END,
            1, CASE WHEN g % 4 = 0 THEN 99 ELSE 80 END,
            CASE WHEN g % 4 = 0 THEN '0' ELSE (20000000000 + (1 + g % 10000))::text END,
            to_char(DATE '2026-09-30' - (g % 365), 'YYYYMMDD'),
            round((1000 + g % 9000)::numeric, 2), round((1000 + g % 9000)::numeric * 0.21, 2),
            round((1000 + g % 9000)::numeric * 1.21, 2),
            s::"InvoiceStatus",
            CASE WHEN s = 'AUTHORIZED' THEN '86390000' || lpad(g::text, 6, '0') END,
            CASE WHEN s = 'PENDING' THEN NULL ELSE g END,
            CASE WHEN s = 'REJECTED' THEN '10015: prueba' END,
            CASE WHEN g <= 20000 THEN 'ord_esc_' || g END,
            now() - make_interval(secs => g), now()
     FROM (SELECT g, CASE WHEN g % 15 = 0 THEN 'PENDING' WHEN g % 33 = 0 THEN 'REJECTED' ELSE 'AUTHORIZED' END AS s
           FROM generate_series(1, 50000) g) x`,
    [a],
  );
  // B: 500 comprobantes con un receptor, un CUIT y un importe que A no tiene.
  await comoDuenio(
    base,
    `INSERT INTO "Order" (id, "tenantId", code, "customerName", "customerPhone", "updatedAt")
     VALUES ('ord_bravo', $1, 900000, 'Receptor Bravo Exclusivo', '', now())`,
    [b],
  );
  await comoDuenio(
    base,
    `INSERT INTO "Invoice" (id, "tenantId", "puntoVenta", "tipoComprobante", concepto, "docTipo", "docNro", fecha,
                            neto, iva, total, status, cae, numero, "orderId", "createdAt", "updatedAt")
     SELECT 'fac_bravo_' || g, $1, 1, 6, 1, 80, '27999999990', to_char(DATE '2026-09-20' - (g % 60), 'YYYYMMDD'),
            642.79, 134.98, 777.77, 'AUTHORIZED', '86399999' || lpad(g::text, 6, '0'), g,
            CASE WHEN g = 1 THEN 'ord_bravo' END, now(), now()
     FROM generate_series(1, 500) g`,
    [b],
  );
  // B: una factura B de $10.000 anulada con su nota de crédito B, en marzo de 2025 (lejos del resto).
  await comoDuenio(
    base,
    `INSERT INTO "Invoice" (id, "tenantId", "puntoVenta", "tipoComprobante", concepto, "docTipo", "docNro", fecha,
                            neto, iva, total, status, cae, numero, "createdAt", "updatedAt")
     VALUES ('fac_anulada', $1, 1, 6, 1, 99, '0', '20250315', 8264.46, 1735.54, 10000.00, 'AUTHORIZED', '86399990000001', 9001, now(), now())`,
    [b],
  );
  await comoDuenio(
    base,
    `INSERT INTO "Invoice" (id, "tenantId", "puntoVenta", "tipoComprobante", concepto, "docTipo", "docNro", fecha,
                            neto, iva, total, status, cae, numero, "comprobanteAsociadoId", "createdAt", "updatedAt")
     VALUES ('nc_anulada', $1, 1, 8, 1, 99, '0', '20250316', 8264.46, 1735.54, 10000.00, 'AUTHORIZED', '86399990000002', 9001, 'fac_anulada', now(), now())`,
    [b],
  );
  // El banco (Facturación automática). A: 80.000 movimientos, los primeros 50.000 atados cada uno a
  // su comprobante (también los que tienen pedido: ahí manda la ficha) y 30.000 sin facturar. B: un
  // movimiento atado a un comprobante sin pedido, con un nombre que A no tiene.
  for (const [negocio, sufijo] of [[a, "esc"], [b, "bravo"]] as const) {
    await comoDuenio(
      base,
      `INSERT INTO "ImportacionBancaria" (id, "tenantId", "nombreArchivo", origen, archivo, "mapeoJson", "updatedAt")
       VALUES ($2, $1, 'extracto.csv', 'banco', ''::bytea, '{}', now())`,
      [negocio, `imp_${sufijo}`],
    );
  }
  await comoDuenio(
    base,
    `INSERT INTO "MovimientoImportado" (id, "tenantId", "importacionId", hash, fecha, monto, descripcion, clasificacion,
                                        "estadoPropuesta", "nombreReceptor", "invoiceId", "updatedAt")
     SELECT 'mov_esc_' || g, $1, 'imp_esc', 'hash_' || g, to_char(DATE '2026-09-30' - (g % 365), 'YYYYMMDD'),
            round((1000 + g % 9000)::numeric * 1.21, 2), 'Transferencia recibida ' || g, 'venta'::"ClasificacionMovimientoBancario",
            (CASE WHEN g <= 50000 THEN 'emitida' ELSE 'revision' END)::"EstadoPropuestaMovimiento",
            'Receptor Banco ' || g, CASE WHEN g <= 50000 THEN 'fac_esc_' || g END, now()
     FROM generate_series(1, 80000) g`,
    [a],
  );
  await comoDuenio(
    base,
    `INSERT INTO "MovimientoImportado" (id, "tenantId", "importacionId", hash, fecha, monto, descripcion, clasificacion,
                                        "estadoPropuesta", "nombreReceptor", "invoiceId", "updatedAt")
     VALUES ('mov_bravo', $1, 'imp_bravo', 'hash_bravo', '20260918', 777.77, 'Transferencia recibida', 'venta', 'emitida',
             'Receptor Banco Bravo', 'fac_bravo_2', now())`,
    [b],
  );
  await comoDuenio(base, `ANALYZE "Invoice"; ANALYZE "Client"; ANALYZE "Order"; ANALYZE "MovimientoImportado";`);
}

/** EXPLAIN de una consulta de la lista tal como la corre la app: conectado como app_rls, con el negocio puesto. */
async function planComoApp(base: BaseEfimera, tenantId: string, q: { text: string; values: unknown[] }): Promise<string[]> {
  const c = new pg.Client({ connectionString: base.urlApp });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
    const r = await c.query(`EXPLAIN (ANALYZE, BUFFERS OFF, TIMING OFF) ${q.text}`, q.values);
    await c.query("ROLLBACK");
    return (r.rows as { "QUERY PLAN": string }[]).map((x) => `  ${x["QUERY PLAN"]}`);
  } finally {
    await c.end();
  }
}

function prepararEntorno(base: BaseEfimera): void {
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
}

function p95(ms: number[]): number {
  const o = [...ms].sort((x, y) => x - y);
  return o[Math.min(o.length - 1, Math.ceil(o.length * 0.95) - 1)];
}

// Una siembra para los cuatro tests del archivo (cada uno falla por su cuenta, sin tapar a los otros).
let sembrada = false;
async function baseSembrada(t: Parameters<typeof laBase>[0]): Promise<BaseEfimera | null> {
  const base = await laBase(t);
  if (!base) return null;
  if (!sembrada) {
    prepararEntorno(base);
    await sembrar(base);
    sembrada = true;
  }
  return base;
}

const deLaApp = async () => ({ ...(await import("@/lib/rls")), ...(await import("./lista.server")) });

test("aislamiento: el negocio A no ve, no cuenta ni encuentra nada del negocio B (tampoco lo que vino del banco)", { timeout: 600_000 }, async (t) => {
  const base = await baseSembrada(t);
  if (!base) return;
  const { tenantTransaction, paginaDeComprobantesEn, leerPaginaDeComprobantes } = await deLaApp();
  const A = base.a.id;
  const B = base.b.id;
  const todoA = await leerPaginaDeComprobantes(A, leerFiltros({ desde: "2000-01-01" }, HOY));
  assert.equal(todoA.totales.cantidad, 50_000, "A ve sus 50.000 y ninguno de B");
  const todoB = await leerPaginaDeComprobantes(B, leerFiltros({ desde: "2000-01-01" }, HOY));
  assert.equal(todoB.totales.cantidad, 502, "B ve sus 502 y ninguno de A");
  for (const q of ["Receptor Bravo", "27999999990", "777,77", "Banco Bravo"]) {
    const r = await leerPaginaDeComprobantes(A, leerFiltros({ q }, HOY));
    assert.equal(r.totales.cantidad, 0, `A buscando «${q}» (de B) no encuentra nada`);
  }
  const bravoEnB = await leerPaginaDeComprobantes(B, leerFiltros({ q: "Receptor Bravo" }, HOY));
  assert.equal(bravoEnB.totales.cantidad, 1, "el nombre del receptor sale del pedido (JOIN) en su negocio");
  const bancoEnB = await leerPaginaDeComprobantes(B, leerFiltros({ q: "Banco Bravo" }, HOY));
  assert.deepEqual(bancoEnB.renglones.map((r) => [r.id, r.receptor]), [["fac_bravo_2", "Receptor Banco Bravo"]], "y el del banco, en el suyo");
  // Con la sesión (GUC) de A, pedir los de B por su id de negocio: RLS devuelve cero.
  const cruzado = await tenantTransaction((tx) => paginaDeComprobantesEn(tx, B, leerFiltros({ desde: "2000-01-01" }, HOY)), { tenantId: A });
  assert.equal(cruzado.totales.cantidad, 0, "con la sesión de A, los de B no existen");
  const csvCruzado = await tenantTransaction((tx) => paginaDeComprobantesEn(tx, B, leerFiltros({ q: "27999999990" }, HOY)), { tenantId: A });
  assert.equal(csvCruzado.renglones.length, 0);
  const bancoCruzado = await tenantTransaction((tx) => paginaDeComprobantesEn(tx, B, leerFiltros({ q: "Banco Bravo" }, HOY)), { tenantId: A });
  assert.equal(bancoCruzado.totales.cantidad, 0, "con la sesión de A, el movimiento de B tampoco existe");
});

test("las notas de crédito restan en los totales, en el renglón y en el CSV (la regla del Libro IVA, libro-iva.ts:272)", async (t) => {
  const base = await baseSembrada(t);
  if (!base) return;
  const { leerPaginaDeComprobantes, leerParaExportar } = await deLaApp();
  const B = base.b.id;
  const marzo = leerFiltros({ desde: "2025-03-01", hasta: "2025-03-31" }, HOY);
  const anulada = await leerPaginaDeComprobantes(B, marzo);
  assert.equal(anulada.totales.porEstado.AUTHORIZED.cantidad, 2);
  assert.equal(anulada.totales.porEstado.AUTHORIZED.importe, 0, "factura de $10.000 anulada con su nota de crédito: $0, no $20.000");
  assert.deepEqual(
    anulada.renglones.map((r) => [r.id, r.total]),
    [["nc_anulada", -10000], ["fac_anulada", 10000]],
    "el renglón de la nota de crédito va en negativo: los renglones suman lo mismo que el total",
  );
  const soloNotas = await leerPaginaDeComprobantes(B, { ...marzo, tipo: "NC" });
  assert.equal(soloNotas.totales.porEstado.AUTHORIZED.importe, -10000, "sólo las notas de crédito: en negativo");
  const soloFacturasB = await leerPaginaDeComprobantes(B, { ...marzo, tipo: "B" });
  assert.equal(soloFacturasB.totales.porEstado.AUTHORIZED.importe, 10000);
  const csvMarzo = await leerParaExportar(B, marzo);
  assert.deepEqual(csvMarzo.renglones.map((r) => r.total), [-10000, 10000], "el CSV suma lo mismo que la pantalla");
});

test("los totales son los del filtro entero (suma con signo en la base) y el receptor sigue la precedencia del impreso", async (t) => {
  const base = await baseSembrada(t);
  if (!base) return;
  const { leerPaginaDeComprobantes, leerParaExportar } = await deLaApp();
  const A = base.a.id;
  // Códigos de ARCA de las notas de crédito (A 3, B 8, C 13), escritos acá a propósito: el test
  // no usa la lista del código que prueba.
  const sept = leerFiltros({}, HOY);
  const pSept = await leerPaginaDeComprobantes(A, sept);
  const directo = await comoDuenio(
    base,
    `SELECT status::text AS s, count(*)::int AS n,
            sum(CASE WHEN "tipoComprobante" IN (3, 8, 13) THEN -total ELSE total END)::text AS imp,
            count(*) FILTER (WHERE "tipoComprobante" IN (3, 8, 13))::int AS notas
     FROM "Invoice" WHERE "tenantId" = $1 AND fecha BETWEEN '20260901' AND '20260930' GROUP BY status`,
    [A],
  );
  const filasDirectas = directo.rows as { s: "PENDING" | "AUTHORIZED" | "REJECTED"; n: number; imp: string; notas: number }[];
  assert.ok(filasDirectas.some((r) => r.s === "AUTHORIZED" && r.notas > 0), "el mes tiene notas de crédito autorizadas: el signo se pone a prueba");
  for (const r of filasDirectas) {
    assert.equal(pSept.totales.porEstado[r.s].cantidad, r.n, `cantidad de ${r.s}`);
    assert.equal(pSept.totales.porEstado[r.s].importe, Number(r.imp), `suma con signo de ${r.s}`);
  }
  assert.equal(pSept.renglones.length, 50);
  assert.ok(pSept.paginas > 1);
  const orden = pSept.renglones.map((r) => r.fecha);
  assert.deepEqual(orden, [...orden].sort().reverse(), "más nuevos primero");
  assert.ok(pSept.renglones.some((r) => r.receptor?.startsWith("Cliente Escala")), "el nombre de la ficha llega por JOIN");

  // El receptor, renglón por renglón: con pedido, el de la ficha (aunque tenga movimiento); sin
  // pedido ni turno, el del movimiento del banco. La página 2 del mes mezcla los dos.
  const sept2 = await leerPaginaDeComprobantes(A, { ...sept, pagina: 2 });
  const numeroDe = (id: string) => Number(id.replace("fac_esc_", ""));
  assert.ok(sept2.renglones.some((r) => numeroDe(r.id) <= 20_000) && sept2.renglones.some((r) => numeroDe(r.id) > 20_000));
  for (const r of sept2.renglones) {
    const g = numeroDe(r.id);
    assert.equal(r.receptor, g <= 20_000 ? `Cliente Escala ${1 + (g % 10_000)}` : `Receptor Banco ${g}`, `receptor de ${r.id}`);
  }
  const porBanco = await leerPaginaDeComprobantes(A, leerFiltros({ q: "Receptor Banco 30001" }, HOY));
  assert.deepEqual(porBanco.renglones.map((r) => [r.id, r.receptor]), [["fac_esc_30001", "Receptor Banco 30001"]], "el buscador encuentra por el nombre del banco");
  const conPedido = await leerPaginaDeComprobantes(A, leerFiltros({ q: "Receptor Banco 12345" }, HOY));
  assert.equal(conPedido.totales.cantidad, 0, "con pedido manda la ficha: el nombre del banco no lo encuentra (la misma precedencia que el impreso)");

  // Pedir una página más allá de la última devuelve la última, no una lista vacía.
  const lejos = await leerPaginaDeComprobantes(A, { ...sept, pagina: 99_999 });
  assert.equal(lejos.pagina, lejos.paginas);
  assert.ok(lejos.renglones.length > 0);

  // CSV: el mismo filtro, entero, y sus renglones suman lo mismo que los totales de la pantalla
  // (en centavos enteros: suma exacta).
  const csv = await leerParaExportar(A, sept);
  assert.equal(csv.renglones.length, pSept.totales.cantidad);
  assert.equal(csv.recortado, false);
  const centavos = (n: number) => Math.round(n * 100);
  const enCsv = csv.renglones.reduce((s, r) => s + centavos(r.total), 0);
  const enPantalla = Object.values(pSept.totales.porEstado).reduce((s, e) => s + centavos(e.importe), 0);
  assert.equal(enCsv, enPantalla, "el CSV suma lo mismo que los totales de la pantalla");

  // El buscador encuentra por documento (todos los meses) y por punto de venta + número exacto.
  const porCuit = await leerPaginaDeComprobantes(A, leerFiltros({ q: "20-00000077-8" }, HOY));
  assert.ok(porCuit.totales.cantidad > 0 && porCuit.renglones.every((r) => r.docNro === "20000000778"));
  const porNumero = await leerPaginaDeComprobantes(A, leerFiltros({ q: "0002-00012346" }, HOY));
  assert.deepEqual(porNumero.renglones.map((r) => [r.puntoVenta, r.numero]), [[2, 12346]]);
});

test("cada página es una consulta y su p95 es < 300 ms con 50.000 comprobantes y 80.000 movimientos del banco", { timeout: 900_000 }, async (t) => {
  const base = await baseSembrada(t);
  if (!base) return;
  const { tenantTransaction, paginaDeComprobantesEn, consultaDePagina, consultaDeRenglones } = await deLaApp();
  const A = base.a.id;
  const sept = leerFiltros({}, HOY);
  const casos: [string, FiltrosComprobantes][] = [
    ["mes en curso (por defecto)", sept],
    ["mes en curso, página 20", { ...sept, pagina: 20 }],
    ["todos los meses (50.000)", leerFiltros({ desde: "2000-01-01" }, HOY)],
    ["todos los meses, página 900", { ...leerFiltros({ desde: "2000-01-01" }, HOY), pagina: 900 }],
    ["necesitan atención, todos los meses", leerFiltros({ estado: "atencion", desde: "2000-01-01" }, HOY)],
    ["rechazados del mes", leerFiltros({ estado: "rechazada" }, HOY)],
    ["autorizados del mes", leerFiltros({ estado: "autorizada" }, HOY)],
    ["Factura A del mes", leerFiltros({ tipo: "A" }, HOY)],
    ["notas de crédito del año", leerFiltros({ tipo: "NC", desde: "2026-01-01", hasta: "2026-12-31" }, HOY)],
    ["punto de venta 2 del mes", leerFiltros({ pv: "2" }, HOY)],
    ["período de un trimestre", leerFiltros({ desde: "2026-04-01", hasta: "2026-06-30" }, HOY)],
    ["buscar nombre «Cliente Escala 777»", leerFiltros({ q: "Cliente Escala 777" }, HOY)],
    ["buscar nombre del banco «Receptor Banco 3000»", leerFiltros({ q: "Receptor Banco 3000" }, HOY)],
    ["buscar CUIT «20-00000077-8»", leerFiltros({ q: "20-00000077-8" }, HOY)],
    ["buscar número «0002-00012346»", leerFiltros({ q: "0002-00012346" }, HOY)],
    ["buscar importe «5.445,00»", leerFiltros({ q: "5.445,00" }, HOY)],
    ["buscar nombre + mes + rechazados", leerFiltros({ q: "escala", estado: "rechazada", desde: "2026-09-01", hasta: "2026-09-30" }, HOY)],
  ];
  const lineas: string[] = [];
  let peor = 0;
  for (const [nombre, f] of casos) {
    let consultas = 0;
    const ms: number[] = [];
    let cantidad = 0;
    for (let v = 0; v < VUELTAS; v++) {
      consultas = 0;
      const t0 = performance.now();
      const r = await tenantTransaction(
        (tx) =>
          paginaDeComprobantesEn(
            { $queryRaw: ((q: Parameters<typeof tx.$queryRaw>[0]) => (consultas++, tx.$queryRaw(q))) as typeof tx.$queryRaw },
            A,
            f,
          ),
        { tenantId: A },
      );
      ms.push(performance.now() - t0);
      cantidad = r.totales.cantidad;
    }
    assert.equal(consultas, 1, `${nombre}: ${consultas} consultas por página (tiene que ser una)`);
    const x = p95(ms);
    peor = Math.max(peor, x);
    lineas.push(`${nombre.padEnd(46)} ${String(cantidad).padStart(6)} en el filtro · ${consultas} consulta · p95 ${x.toFixed(1)} ms · mediana ${[...ms].sort((m, n) => m - n)[VUELTAS / 2].toFixed(1)} ms`);
    t.diagnostic(lineas[lineas.length - 1]);
  }
  // Los planes de las consultas de verdad (las mismas que arma la app), como app_rls con RLS.
  const todosLosMeses = leerFiltros({ desde: "2000-01-01" }, HOY);
  const busquedaBanco = leerFiltros({ q: "Receptor Banco 3000" }, HOY);
  const planes: [string, { text: string; values: unknown[] }][] = [
    ["la página por defecto (mes en curso, página 1)", consultaDePagina(A, sept)],
    ["la página 900 de todos los meses", consultaDePagina(A, { ...todosLosMeses, pagina: 900 })],
    ["«buscar nombre del banco»", consultaDePagina(A, busquedaBanco)],
    ["el CSV del mes en curso", consultaDeRenglones(A, sept, 20_001)],
  ];
  const lineasDePlanes: string[] = [];
  for (const [nombre, q] of planes) lineasDePlanes.push("", `Plan: ${nombre}`, ...(await planComoApp(base, A, q)));
  const informe = [
    `Lista de comprobantes a escala — ${new Date().toISOString()}`,
    `Postgres local efímero (src/test/base-efimera.ts), conectado como app_rls con RLS; ${VUELTAS} vueltas por caso, tiempo de la página entera (totales + renglones en una consulta, en su transacción).`,
    `Negocio A: 10.000 clientes, 20.000 pedidos, 50.000 comprobantes en 12 meses, 80.000 movimientos del banco (50.000 atados a un comprobante). Negocio B: 502 comprobantes y 1 movimiento.`,
    `Presupuesto: p95 < ${P95_MAXIMO_MS} ms por página. Peor p95 medido: ${peor.toFixed(1)} ms.`,
    "",
    ...lineas,
    "",
    "Aislamiento: A cuenta 50.000 y B 502; A buscando el nombre, el CUIT, el importe y el nombre del banco de B: 0; con la sesión de A pidiendo los de B por su id: 0 (RLS).",
    "Notas de crédito: una factura de $10.000 anulada con su nota de crédito suma $0 (2 autorizados); el renglón de la nota va en −$10.000; el mes de A coincide con la suma directa con signo.",
    "",
    "Índices que faltan (ventana M1, BACKLOG ESC-01): Invoice (tenantId, fecha…) y MovimientoImportado (tenantId, invoiceId).",
    "Sin ellos: el orden por fecha recorre los comprobantes del negocio (Seq Scan + Sort) y el nombre del banco se busca",
    "recorriendo una vez los movimientos del negocio por consulta (Seq Scan + Hash), nunca uno por renglón.",
    ...lineasDePlanes,
  ].join("\n");
  const dir = path.resolve(process.cwd(), ".qa/facturacion-escala");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "rendimiento.txt"), `${informe}\n`);
  assert.ok(peor < P95_MAXIMO_MS, `peor p95 ${peor.toFixed(1)} ms (presupuesto ${P95_MAXIMO_MS} ms)`);
});
