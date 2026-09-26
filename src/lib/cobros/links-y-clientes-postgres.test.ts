// Links de cobro y lista de clientes a escala, contra Postgres real (src/test/base-efimera.ts:
// migraciones + RLS, la app conectada como `app_rls`, como producción).
//
// Siembra en el negocio A 10.000 fichas, 20.000 pedidos, 300.000 constancias de auditoría de
// otras cosas y 6.000 links de cobro (4.000 de pedidos y 2.000 libres); en el negocio B, fichas y
// links con un nombre, un concepto y un importe que A no tiene.
//   · aislamiento: A no ve ni cuenta nada de B (ni buscándolo), y con la sesión de A pedir los de
//     B por su id de negocio devuelve cero (RLS);
//   · los totales de links por estado son los de la base (conteo directo como dueño);
//   · cada página hace SIEMPRE dos consultas, sin N+1;
//   · p95 < 300 ms por página. También se mide la lectura del motor comercial (todas las fichas
//     con sus pedidos) que usan la lista con situación y el piloto, y la búsqueda por teléfono de
//     Vender. Informe: .qa/facturacion-escala/rendimiento-links-y-clientes.txt.
// Sin Postgres local se saltea y lo dice; en CI, falla.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, type BaseEfimera } from "@/test/base-efimera";
import { leerFiltrosLinks, type FiltrosLinks } from "./links-core";

const laBase = baseEfimeraDelArchivo();
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
    `INSERT INTO "Client" (id, "tenantId", name, phone, "updatedAt")
     SELECT 'cli_esc_' || g, $1, 'Cliente Escala ' || g, '11' || lpad(g::text, 8, '0'), now() FROM generate_series(1, 10000) g
     UNION ALL SELECT 'cli_tilde', $1, 'María Pérez Ñandú', '011 15 4000-7919', now()`,
    [a],
  );
  // 20.000 pedidos del último año: 1 de cada 3 cobrado, 1 de cada 25 anulado.
  await comoDuenio(
    base,
    `INSERT INTO "Order" (id, "tenantId", code, "customerName", "customerPhone", "clientId", paid, status, "createdAt", "updatedAt")
     SELECT 'ord_esc_' || g, $1, 100000 + g, 'Mostrador', '', 'cli_esc_' || (1 + g % 10000), g % 3 = 0,
            (CASE WHEN g % 25 = 0 THEN 'CANCELLED' ELSE 'PENDING' END)::"OrderStatus",
            now() - make_interval(hours => g % 8760), now()
     FROM generate_series(1, 20000) g`,
    [a],
  );
  // 300.000 constancias de otras cosas (el ruido que la lista de links tiene que saltear).
  await comoDuenio(
    base,
    `INSERT INTO "AuditLog" (id, "tenantId", actor, action, entity, "entityId", changes, "createdAt")
     SELECT 'aud_esc_' || g, $1, 'admin', (ARRAY['update','create','cancel'])[1 + g % 3],
            (ARRAY['Order','Appointment','Product','Client'])[1 + g % 4], 'x' || g, '{"campo":"valor"}'::jsonb,
            now() - make_interval(secs => g * 100)
     FROM generate_series(1, 300000) g`,
    [a],
  );
  // 4.000 links de pedidos y 2.000 libres, repartidos en el año.
  await comoDuenio(
    base,
    `INSERT INTO "AuditLog" (id, "tenantId", actor, action, entity, "entityId", changes, "createdAt")
     SELECT 'lnk_ped_' || g, $1, 'admin', 'link-de-pago', 'Order', 'ord_esc_' || g,
            jsonb_build_object('code', 100000 + g, 'monto', round((1000 + g % 9000)::numeric * 1.5, 2), 'preferenceId', 'pref_' || g,
                               'modo', 'stub', 'url', 'https://mp.test/checkout/' || g),
            now() - make_interval(secs => g * 7000)
     FROM generate_series(1, 4000) g
     UNION ALL
     SELECT 'lnk_lib_' || g, $1, 'admin', 'create', 'PaymentLink', 'pref_libre_' || g,
            jsonb_build_object('concepto', 'Seña número ' || g, 'monto', 2000 + g, 'referenciaExterna', 'Ref ' || g),
            now() - make_interval(secs => g * 13000)
     FROM generate_series(1, 2000) g`,
    [a],
  );
  // B: fichas, un pedido y links que A no tiene.
  await comoDuenio(
    base,
    `INSERT INTO "Client" (id, "tenantId", name, phone, "updatedAt")
     SELECT 'cli_bravo_' || g, $1, 'Cliente Bravo Exclusivo ' || g, '119999000' || g, now() FROM generate_series(1, 5) g`,
    [b],
  );
  await comoDuenio(
    base,
    `INSERT INTO "Order" (id, "tenantId", code, "customerName", "customerPhone", "clientId", "updatedAt")
     VALUES ('ord_bravo_link', $1, 900001, 'Receptor Bravo Exclusivo', '', 'cli_bravo_1', now())`,
    [b],
  );
  await comoDuenio(
    base,
    `INSERT INTO "AuditLog" (id, "tenantId", actor, action, entity, "entityId", changes, "createdAt")
     SELECT 'lnk_bravo_' || g, $1, 'admin', 'create', 'PaymentLink', 'pref_bravo_' || g,
            jsonb_build_object('concepto', 'Seña Bravo Exclusiva', 'monto', 777.77), now()
     FROM generate_series(1, 50) g
     UNION ALL
     SELECT 'lnk_bravo_ped', $1, 'admin', 'link-de-pago', 'Order', 'ord_bravo_link',
            jsonb_build_object('code', 900001, 'monto', 777.77, 'url', 'https://mp.test/bravo'), now()`,
    [b],
  );
  await comoDuenio(base, `ANALYZE "AuditLog"; ANALYZE "Client"; ANALYZE "Order";`);
}

function p95(ms: number[]): number {
  const o = [...ms].sort((x, y) => x - y);
  return o[Math.min(o.length - 1, Math.ceil(o.length * 0.95) - 1)];
}

type Tx = { $queryRaw: (q: never) => Promise<unknown> };

test("links de cobro y lista de clientes a escala: aislamiento, totales reales, dos consultas por página y p95 < 300 ms", { timeout: 900_000 }, async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
  await sembrar(base);
  const { tenantTransaction } = await import("@/lib/rls");
  const { paginaDeLinksEn, leerPaginaDeLinks } = await import("./links.server");
  const { paginaDeFichasEn, leerPaginaDeFichas } = await import("@/lib/clientes/lista-fichas.server");
  const { leerFichasConActividad, evaluarFichas, desdeHistorial } = await import("@/lib/crm/lecturas");
  const { buscarFichaPorTelefono } = await import("@/lib/clientes/ficha-por-telefono");
  const A = base.a.id;
  const B = base.b.id;
  const f = (sp: Record<string, string>) => leerFiltrosLinks(sp);

  // ── Links: aislamiento ────────────────────────────────────────────────────
  const todosA = await leerPaginaDeLinks(A, f({}));
  assert.equal(todosA.totales.cantidad, 6000, "A ve sus 6.000 links y ninguno de B");
  const todosB = await leerPaginaDeLinks(B, f({}));
  assert.equal(todosB.totales.cantidad, 51, "B ve sus 51 links");
  for (const q of ["Bravo", "777,77", "#900001"]) {
    assert.equal((await leerPaginaDeLinks(A, f({ q }))).totales.cantidad, 0, `A buscando «${q}» (de B) no encuentra nada`);
  }
  const cruzado = await tenantTransaction((tx) => paginaDeLinksEn(tx, B, f({})), { tenantId: A });
  assert.equal(cruzado.totales.cantidad, 0, "con la sesión de A, los links de B no existen");
  const bravo = await leerPaginaDeLinks(B, f({ q: "Receptor Bravo" }));
  assert.equal(bravo.totales.cantidad, 1, "el cliente del link sale del pedido (JOIN) en su negocio");

  // ── Links: estados y totales = conteo directo ──────────────────────────────
  const directo = await comoDuenio(
    base,
    `SELECT CASE WHEN o.status = 'CANCELLED' THEN 'anulado' WHEN o.paid THEN 'pagado' ELSE 'pendiente' END AS e, count(*)::int AS n
     FROM "AuditLog" l JOIN "Order" o ON o.id = l."entityId" WHERE l."tenantId" = $1 AND l.action = 'link-de-pago' GROUP BY 1`,
    [A],
  );
  for (const r of directo.rows as { e: "anulado" | "pagado" | "pendiente"; n: number }[]) {
    assert.equal(todosA.totales.porEstado[r.e].cantidad, r.n, `links ${r.e}`);
  }
  assert.equal(todosA.totales.porEstado["sin-seguimiento"].cantidad, 2000, "los libres no tienen seguimiento");
  const sumaLibres = await comoDuenio(base, `SELECT sum((changes->>'monto')::numeric)::text AS s FROM "AuditLog" WHERE "tenantId" = $1 AND entity = 'PaymentLink'`, [A]);
  assert.equal(todosA.totales.porEstado["sin-seguimiento"].importe, Number(sumaLibres.rows[0].s));
  assert.equal(todosA.renglones.length, 50);
  const creados = todosA.renglones.map((r) => r.creado);
  assert.deepEqual(creados, [...creados].sort().reverse(), "más nuevos primero");
  const pagados = await leerPaginaDeLinks(A, f({ estado: "pagado" }));
  assert.ok(pagados.renglones.length > 0 && pagados.renglones.every((r) => r.estado === "pagado"));
  assert.equal(pagados.paginas, Math.ceil(pagados.totales.porEstado.pagado.cantidad / 50));
  const porConcepto = await leerPaginaDeLinks(A, f({ q: "seña número 1234" }));
  assert.deepEqual(porConcepto.renglones.map((r) => r.id), ["lnk_lib_1234"]);
  const porPedido = await leerPaginaDeLinks(A, f({ q: "#100050" }));
  assert.deepEqual(porPedido.renglones.map((r) => r.id), ["lnk_ped_50"]);
  assert.equal(porPedido.renglones[0].url, "https://mp.test/checkout/50");
  assert.equal(porPedido.renglones[0].cliente, "Cliente Escala 51", "el nombre sale de la ficha del pedido");

  // ── Fichas: aislamiento y búsqueda ─────────────────────────────────────────
  const fichasA = await leerPaginaDeFichas(A, { q: "", pagina: 1, rubro: "servicios" });
  assert.equal(fichasA.total, 10_003, "A: sus 10.001 fichas sembradas + las 2 de la base");
  assert.equal(fichasA.filas.length, 50);
  const fichasB = await leerPaginaDeFichas(B, { q: "", pagina: 1, rubro: "servicios" });
  assert.equal(fichasB.total, 6);
  assert.equal((await leerPaginaDeFichas(A, { q: "Bravo", pagina: 1, rubro: "servicios" })).coinciden, 0, "A no encuentra fichas de B");
  assert.equal((await leerPaginaDeFichas(A, { q: "1199990001", pagina: 1, rubro: "servicios" })).coinciden, 0, "ni por su teléfono");
  const fichaCruzada = await tenantTransaction((tx) => paginaDeFichasEn(tx, B, { q: "", pagina: 1, rubro: "servicios" }), { tenantId: A });
  assert.equal(fichaCruzada.total, 0, "con la sesión de A, las fichas de B no existen");
  for (const q of ["maria perez", "ÑANDÚ", "1140007919", "+54 9 11 4000-7919", "15 4000"]) {
    const r = await leerPaginaDeFichas(A, { q, pagina: 1, rubro: "servicios" });
    assert.ok(r.filas.some((x) => x.id === "cli_tilde"), `«${q}» encuentra a María Pérez Ñandú`);
  }
  const lejos = await leerPaginaDeFichas(A, { q: "", pagina: 9999, rubro: "servicios" });
  assert.equal(lejos.pagina, lejos.paginas, "una página que no existe muestra la última");

  // ── Consultas por página y rendimiento ────────────────────────────────────
  const lineas: string[] = [];
  let peor = 0;
  async function medir(nombre: string, correr: (db: Tx) => Promise<number>, maxConsultas: number): Promise<void> {
    const ms: number[] = [];
    let consultas = 0;
    let cantidad = 0;
    for (let v = 0; v < VUELTAS; v++) {
      consultas = 0;
      const t0 = performance.now();
      cantidad = await tenantTransaction(
        (tx) => correr({ $queryRaw: ((q: never) => (consultas++, tx.$queryRaw(q))) as Tx["$queryRaw"] }),
        { tenantId: A },
      );
      ms.push(performance.now() - t0);
    }
    assert.ok(consultas <= maxConsultas, `${nombre}: ${consultas} consultas por página (máximo ${maxConsultas})`);
    const x = p95(ms);
    peor = Math.max(peor, x);
    lineas.push(`${nombre.padEnd(46)} ${String(cantidad).padStart(6)} en el filtro · ${consultas} consultas · p95 ${x.toFixed(1)} ms · mediana ${[...ms].sort((m, n) => m - n)[VUELTAS / 2].toFixed(1)} ms`);
  }
  const casosLinks: [string, FiltrosLinks][] = [
    ["links: todos, página 1", f({})],
    ["links: todos, página 100", f({ pagina: "100" })],
    ["links: sin pagar", f({ estado: "pendiente" })],
    ["links: pagados, página 20", f({ estado: "pagado", pagina: "20" })],
    ["links: buscar concepto «seña número 1234»", f({ q: "seña número 1234" })],
    ["links: buscar cliente «Cliente Escala 51»", f({ q: "Cliente Escala 51" })],
    ["links: buscar pedido «#100050»", f({ q: "#100050" })],
    ["links: buscar importe «3.450,00»", f({ q: "3.450,00" })],
  ];
  for (const [nombre, filtros] of casosLinks) {
    await medir(nombre, async (db) => (await paginaDeLinksEn(db as never, A, filtros)).totales.cantidad, 2);
  }
  const casosFichas: [string, { q: string; pagina: number }][] = [
    ["clientes (diseño de siempre): página 1", { q: "", pagina: 1 }],
    ["clientes (diseño de siempre): página 150", { q: "", pagina: 150 }],
    ["clientes: buscar nombre «escala 77»", { q: "escala 77", pagina: 1 }],
    ["clientes: buscar sin tildes «maria perez»", { q: "maria perez", pagina: 1 }],
    ["clientes: buscar teléfono «+54 9 11 4000-7919»", { q: "+54 9 11 4000-7919", pagina: 1 }],
  ];
  for (const [nombre, p] of casosFichas) {
    await medir(nombre, async (db) => (await paginaDeFichasEn(db as never, A, { ...p, rubro: "servicios" })).coinciden, 2);
  }

  // El motor comercial (lista con situación y piloto) lee TODAS las fichas con sus pedidos y
  // evalúa en memoria; se mide entero (lectura + evaluación), sin presupuesto de página: es el
  // número que dice hasta dónde escala sin pasar a agregados en SQL (BACKLOG).
  const ahora = new Date("2026-09-26T15:00:00Z");
  const msCrm: number[] = [];
  let fichasLeidas = 0;
  for (let v = 0; v < 5; v++) {
    const t0 = performance.now();
    const fichas = await tenantTransaction((tx) => leerFichasConActividad(tx, A, { desde: desdeHistorial(ahora), rubro: "mostrador" }), { tenantId: A });
    evaluarFichas(fichas, "mostrador", "2026-09-26", ahora);
    msCrm.push(performance.now() - t0);
    fichasLeidas = fichas.length;
  }
  const msTel: number[] = [];
  for (let v = 0; v < VUELTAS; v++) {
    const t0 = performance.now();
    const r = await tenantTransaction((tx) => buscarFichaPorTelefono(tx, A, "11 0000-0777"), { tenantId: A });
    msTel.push(performance.now() - t0);
    assert.equal(r?.id, "cli_esc_777");
  }

  const informe = [
    `Links de cobro y lista de clientes a escala — ${new Date().toISOString()}`,
    `Postgres local efímero (src/test/base-efimera.ts), conectado como app_rls con RLS; ${VUELTAS} vueltas por caso, tiempo de la página entera (en su transacción).`,
    "Negocio A: 10.001 fichas, 20.000 pedidos, 300.000 constancias de auditoría de otras cosas y 6.000 links (4.000 de pedidos, 2.000 libres). Negocio B: 6 fichas y 51 links.",
    `Presupuesto: p95 < ${P95_MAXIMO_MS} ms por página. Peor p95 medido: ${peor.toFixed(1)} ms.`,
    "",
    ...lineas,
    "",
    `Motor comercial (lista con situación del diseño nuevo y del piloto): ${fichasLeidas} fichas con sus pedidos, lectura + evaluación en memoria: p95 ${p95(msCrm).toFixed(1)} ms (5 vueltas). Sin presupuesto de página: es el techo medido antes de pasar a agregados en SQL.`,
    `Vender — buscar la ficha por teléfono (lee los teléfonos de todas las fichas): p95 ${p95(msTel).toFixed(1)} ms (${VUELTAS} vueltas).`,
    "",
    "Aislamiento: A cuenta 6.000 links y B 51; A buscando el concepto, el importe y el pedido de B: 0; A buscando fichas de B por nombre y teléfono: 0; con la sesión de A pidiendo links y fichas de B por su id: 0 (RLS).",
  ].join("\n");
  const dir = path.resolve(process.cwd(), ".qa/facturacion-escala");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "rendimiento-links-y-clientes.txt"), `${informe}\n`);
  assert.ok(peor < P95_MAXIMO_MS, `peor p95 ${peor.toFixed(1)} ms (presupuesto ${P95_MAXIMO_MS} ms)`);
});
