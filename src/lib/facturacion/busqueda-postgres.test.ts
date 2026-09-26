// QA vuelta 1 de Facturación a escala, contra Postgres real (src/test/base-efimera.ts: migraciones +
// RLS, la app conectada como `app_rls`, como producción). Una siembra chica, a mano:
//   · buscar un nombre sin tildes encuentra al que las tiene («monica perez» → «Mónica Pérez»),
//     también el nombre que vino del banco;
//   · la nota de crédito lleva el nombre de la factura que anula: la búsqueda por nombre la trae y
//     el total del cliente por nombre es igual al total por su CUIT;
//   · «Facturado del mes» del Inicio resta las notas de crédito;
//   · la lista de clientes de siempre cuenta compras en un comercio y turnos en un negocio de turnos;
//   · aislamiento: nada de eso ve lo del negocio B, que tiene una clienta con el mismo nombre.
// Sin Postgres local se saltea y lo dice; en CI, falla.

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, type BaseEfimera } from "@/test/base-efimera";
import { todayInBusinessTz } from "@/lib/datetime";
import { leerFiltros } from "./lista-core";

const laBase = baseEfimeraDelArchivo();
const HOY = "2026-09-26";

async function comoDuenio(base: BaseEfimera, sql: string, params: unknown[] = []): Promise<void> {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    await c.query(sql, params);
  } finally {
    await c.end();
  }
}

const COLUMNAS = `(id, "tenantId", "puntoVenta", "tipoComprobante", concepto, "docTipo", "docNro", fecha, neto, iva, total, status, cae, numero, "orderId", "comprobanteAsociadoId", "createdAt", "updatedAt")`;

let sembrada: Promise<void> | null = null;
async function baseSembrada(t: Parameters<typeof laBase>[0]): Promise<BaseEfimera | null> {
  const base = await laBase(t);
  if (!base) return null;
  sembrada ??= (async () => {
    apuntarLaAppA(base);
    Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
    const [a, b] = [base.a.id, base.b.id];
    // Este mes fiscal (para «Facturado del mes»): la fecha del comprobante es la del día del negocio.
    const fecha = todayInBusinessTz().replaceAll("-", "");
    for (const [negocio, s] of [[a, "a"], [b, "b"]] as const) {
      await comoDuenio(base, `INSERT INTO "Client" (id, "tenantId", name, phone, "updatedAt") VALUES ($2, $1, 'Mónica Pérez', '1140000001', now())`, [negocio, `cli_monica_${s}`]);
      await comoDuenio(base, `INSERT INTO "Order" (id, "tenantId", code, "customerName", "customerPhone", "clientId", "updatedAt") VALUES ($2, $1, $3, 'Mostrador', '', $4, now())`, [negocio, `ord_monica_${s}`, s === "a" ? 700_001 : 700_002, `cli_monica_${s}`]);
      await comoDuenio(base, `INSERT INTO "Invoice" ${COLUMNAS} VALUES ($2, $1, 1, 6, 1, 96, '27888999', $3, 826.45, 173.55, 1000.00, 'AUTHORIZED', '86390000000001', $4, $5, NULL, now(), now())`, [negocio, `fac_monica_${s}`, fecha, s === "a" ? 1 : 2, `ord_monica_${s}`]);
    }
    // A: una compra anulada de Mónica (no cuenta) y Ñandú SRL, con una factura A y su nota de crédito (sin pedido propio).
    await comoDuenio(base, `INSERT INTO "Order" (id, "tenantId", code, "customerName", "customerPhone", "clientId", status, "updatedAt") VALUES ('ord_monica_anulada', $1, 700003, 'Mostrador', '', 'cli_monica_a', 'CANCELLED', now())`, [a]);
    await comoDuenio(base, `INSERT INTO "Client" (id, "tenantId", name, phone, "updatedAt") VALUES ('cli_nandu', $1, 'Ñandú SRL', '1140000002', now())`, [a]);
    await comoDuenio(base, `INSERT INTO "Order" (id, "tenantId", code, "customerName", "customerPhone", "clientId", "updatedAt") VALUES ('ord_nandu', $1, 700004, 'Mostrador', '', 'cli_nandu', now())`, [a]);
    await comoDuenio(base, `INSERT INTO "Invoice" ${COLUMNAS} VALUES ('fac_nandu', $1, 1, 1, 1, 80, '30715558889', $2, 4132.23, 867.77, 5000.00, 'AUTHORIZED', '86390000000002', 2, 'ord_nandu', NULL, now(), now())`, [a, fecha]);
    await comoDuenio(base, `INSERT INTO "Invoice" ${COLUMNAS} VALUES ('nc_nandu', $1, 1, 3, 1, 80, '30715558889', $2, 1000.00, 210.00, 1210.00, 'AUTHORIZED', '86390000000003', 1, NULL, 'fac_nandu', now(), now())`, [a, fecha]);
    // A: una factura que salió del banco (sin venta) con su nota de crédito.
    await comoDuenio(base, `INSERT INTO "Invoice" ${COLUMNAS} VALUES ('fac_banco', $1, 1, 6, 1, 99, '0', $2, 661.16, 138.84, 800.00, 'AUTHORIZED', '86390000000004', 3, NULL, NULL, now(), now())`, [a, fecha]);
    await comoDuenio(base, `INSERT INTO "Invoice" ${COLUMNAS} VALUES ('nc_banco', $1, 1, 8, 1, 99, '0', $2, 661.16, 138.84, 800.00, 'AUTHORIZED', '86390000000005', 2, NULL, 'fac_banco', now(), now())`, [a, fecha]);
    await comoDuenio(base, `INSERT INTO "ImportacionBancaria" (id, "tenantId", "nombreArchivo", origen, archivo, "mapeoJson", "updatedAt") VALUES ('imp_a', $1, 'extracto.csv', 'banco', ''::bytea, '{}', now())`, [a]);
    await comoDuenio(
      base,
      `INSERT INTO "MovimientoImportado" (id, "tenantId", "importacionId", hash, fecha, monto, descripcion, clasificacion, "estadoPropuesta", "nombreReceptor", "invoiceId", "updatedAt")
       VALUES ('mov_a', $1, 'imp_a', 'hash_a', $2, 800.00, 'Transferencia recibida', 'venta', 'emitida', 'PERALTA CAROLINA', 'fac_banco', now())`,
      [a, fecha],
    );
  })();
  await sembrada;
  return base;
}

const deLaApp = async () => ({ ...(await import("@/lib/rls")), ...(await import("./lista.server")) });

test("buscar un nombre sin tildes encuentra al que las tiene (y al revés), también el nombre que vino del banco", async (t) => {
  const base = await baseSembrada(t);
  if (!base) return;
  const { leerPaginaDeComprobantes } = await deLaApp();
  const A = base.a.id;
  for (const q of ["monica perez", "MONICA PEREZ", "Mónica Pérez", "mónica", "perez"]) {
    const r = await leerPaginaDeComprobantes(A, leerFiltros({ q }, HOY));
    assert.deepEqual(r.renglones.map((x) => x.id), ["fac_monica_a"], `«${q}» encuentra a Mónica Pérez (sólo la de A)`);
  }
  const banco = await leerPaginaDeComprobantes(A, leerFiltros({ q: "carolina peralta".split(" ")[1] }, HOY));
  assert.deepEqual(banco.renglones.map((x) => x.id).sort(), ["fac_banco", "nc_banco"], "el nombre del banco, sin distinguir mayúsculas; la nota lleva el de su factura");
});

test("la nota de crédito lleva el nombre de la factura que anula: la búsqueda por nombre la trae y el total por nombre es el total por CUIT", async (t) => {
  const base = await baseSembrada(t);
  if (!base) return;
  const { leerPaginaDeComprobantes, leerParaExportar } = await deLaApp();
  const A = base.a.id;
  const porNombre = await leerPaginaDeComprobantes(A, leerFiltros({ q: "nandu" }, HOY));
  const porCuit = await leerPaginaDeComprobantes(A, leerFiltros({ q: "30-71555888-9" }, HOY));
  assert.deepEqual(porNombre.renglones.map((x) => [x.id, x.receptor, x.total]).sort(), [["fac_nandu", "Ñandú SRL", 5000], ["nc_nandu", "Ñandú SRL", -1210]]);
  assert.equal(porNombre.totales.porEstado.AUTHORIZED.importe, 3790, "la nota resta");
  assert.equal(porNombre.totales.porEstado.AUTHORIZED.importe, porCuit.totales.porEstado.AUTHORIZED.importe);
  assert.equal(porNombre.totales.cantidad, porCuit.totales.cantidad);
  const csv = await leerParaExportar(A, leerFiltros({ q: "Ñandú" }, HOY));
  assert.deepEqual(csv.renglones.map((x) => x.receptor), ["Ñandú SRL", "Ñandú SRL"], "el CSV dice lo mismo");
});

test("«Facturado del mes» del Inicio resta las notas de crédito (lo mismo que la lista)", async (t) => {
  const base = await baseSembrada(t);
  if (!base) return;
  const { kpisFacturacionBancaria } = await import("@/lib/bancos-glue");
  const { leerPaginaDeComprobantes } = await deLaApp();
  const A = base.a.id;
  const kpis = await kpisFacturacionBancaria(A);
  // 1.000 (Mónica) + 5.000 − 1.210 (Ñandú) + 800 − 800 (banco).
  assert.equal(kpis.montoFacturadoMes, 4790);
  const lista = await leerPaginaDeComprobantes(A, leerFiltros({}, todayInBusinessTz()));
  assert.equal(kpis.montoFacturadoMes, lista.totales.porEstado.AUTHORIZED.importe, "el Inicio y la lista dicen lo mismo");
  assert.equal((await kpisFacturacionBancaria(base.b.id)).montoFacturadoMes, 1000, "B, sólo lo suyo");
});

test("la lista de clientes de siempre cuenta compras (no anuladas) en un comercio y turnos en un negocio de turnos", async (t) => {
  const base = await baseSembrada(t);
  if (!base) return;
  const { tenantTransaction } = await deLaApp();
  const { paginaDeFichasEn } = await import("@/lib/clientes/lista-fichas.server");
  const A = base.a.id;
  const comercio = await tenantTransaction((tx) => paginaDeFichasEn(tx, A, { q: "monica perez", pagina: 1, rubro: "mostrador" }), { tenantId: A });
  assert.deepEqual(comercio.filas.map((f) => [f.id, f.actividad]), [["cli_monica_a", 1]], "una compra; la anulada no cuenta");
  assert.equal(comercio.rubro, "mostrador");
  const turnos = await tenantTransaction((tx) => paginaDeFichasEn(tx, A, { q: "monica perez", pagina: 1, rubro: "servicios" }), { tenantId: A });
  assert.deepEqual(turnos.filas.map((f) => [f.id, f.actividad]), [["cli_monica_a", 0]], "sin turnos: 0 turnos, como siempre");
  const cruzado = await tenantTransaction((tx) => paginaDeFichasEn(tx, base.b.id, { q: "monica", pagina: 1, rubro: "mostrador" }), { tenantId: A });
  assert.equal(cruzado.coinciden, 0, "con la sesión de A, las fichas de B no existen");
});
