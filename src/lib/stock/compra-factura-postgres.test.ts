// R3 del Challenger (cert. Magra T1) contra Postgres de verdad: la MISMA factura del proveedor
// cargada por el local (Recibir mercadería) y por la contadora («Mis Comprobantes Recibidos») es UNA
// compra, en los dos órdenes, y la ficha del proveedor la suma una sola vez.
//
//   1 · Local primero → la importación la reconoce por (CUIT + tipo + PV + número) y la COMPLETA con
//       el IVA de ARCA: no hay otra compra; re-importar no cambia nada.
//   2 · Contadora primero → el alta del local encuentra la importada (sin renglones) y le suma los
//       renglones, el stock y el pago: no hay otra compra.
//   3 · El local carga dos veces la misma factura → rechazo con el número de la compra, nada escrito.
//   4 · El CUIT de la factura no es el del proveedor elegido → rechazo, nada escrito.
//   5 · Aislamiento: el negocio B con el MISMO proveedor y el MISMO número tiene su propia compra; A
//       no ve ni toca la de B y viceversa.
//
// Base efímera con RLS (`app_rls`). Sin Postgres local, se saltea.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import type { ComprobanteRecibido } from "@/lib/contador/recibidos-formato";

const laBase = baseEfimeraDelArchivo();
const CUIT_PROVEEDOR = "20123456786";

function comprobante(numero: number, o: Partial<ComprobanteRecibido> = {}): ComprobanteRecibido {
  return {
    fila: numero,
    fecha: "20260810",
    tipo: 1,
    puntoVenta: 3,
    numero,
    cuitEmisor: CUIT_PROVEEDOR,
    emisor: "FRIGORIFICO UAT SA",
    codAutorizacion: "74123456789012",
    moneda: "PES",
    cotizacion: 1,
    neto: 10000,
    noGravado: 0,
    exento: 0,
    iva: 2100,
    otrosTributos: 0,
    total: 12100,
    desglose: [{ alicuotaId: 5, base: 10000, importe: 2100 }] as unknown as ComprobanteRecibido["desglose"],
    aRevisar: null,
    ...o,
  };
}

test("R3: la factura del proveedor es UNA compra aunque la carguen el local y la contadora, en los dos órdenes, y aislada por negocio", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { insertStockPurchase } = await import("@/lib/stock/purchase-core");
  const { guardarRecibidos, NOTA_IMPORTADO } = await import("@/lib/contador/recibidos-db");
  const { tenantTransaction } = await import("@/lib/rls");
  const { getFichaProveedor } = await import("@/lib/suppliers/supplier-repo");
  const { aRevisarDeNotas } = await import("@/lib/contador/recibidos-formato");

  const preparar = async (tenantId: string) => {
    const proveedor = await duenio.supplier.create({ data: { tenantId, name: "Frigorifico UAT", taxId: CUIT_PROVEEDOR } });
    const vacio = await duenio.product.create({
      data: { tenantId, name: "Vacio UAT", saleUnit: "WEIGHT", pricePerKg: 28600, unit: "kg", trackStock: true, stock: 0 },
    });
    return { proveedor, vacio };
  };
  const a = await preparar(base.a.id);
  const b = await preparar(base.b.id);

  const comoDuenia = <T>(negocio: typeof base.a, fn: () => Promise<T>) =>
    ejecutarAccion({ negocio, usuario: negocio.duenia }, fn).then((r) => {
      assert.equal(r.tipo, "respuesta", JSON.stringify(r));
      return (r as { valor: T }).valor;
    });
  const cargaDelLocal = (negocio: typeof base.a, datos: typeof a, numero: string, extra: { cuit?: string; qty?: number } = {}) =>
    comoDuenia(negocio, () =>
      insertStockPurchase(negocio.id, {
        kind: "COMPRA",
        supplierId: datos.proveedor.id,
        supplier: null,
        notes: "remito 42",
        createdBy: `user:${negocio.duenia.id}`,
        items: [{ productId: datos.vacio.id, qty: extra.qty ?? 2, unitCost: 5000 }],
        pago: { estado: "PAGADA", method: "EFECTIVO" },
        factura: { tipo: "1", puntoVenta: "0003", numero, cuit: extra.cuit ?? "", fecha: "2026-08-10" },
      }),
    ).catch((e: unknown) => e as Error);
  const importar = (tenantId: string, cs: ComprobanteRecibido[]) =>
    tenantTransaction((tx) => guardarRecibidos(tx, tenantId, cs, { actor: "estudio:test", por: "Contadora UAT", archivo: "r.csv" }), { tenantId });
  const comprasDelProveedor = (tenantId: string, supplierId: string) =>
    duenio.stockPurchase.findMany({
      where: { tenantId, supplierId },
      orderBy: { code: "asc" },
      select: { id: true, code: true, totalCost: true, notes: true, facturaNumero: true, facturaNeto: true, facturaIva: true, _count: { select: { items: true } } },
    });
  const fotoDe = async (tenantId: string) => ({
    compras: await duenio.stockPurchase.count({ where: { tenantId } }),
    renglones: await duenio.stockPurchaseItem.count({ where: { tenantId } }),
    movimientos: await duenio.stockMovement.count({ where: { tenantId } }),
    caja: await duenio.cashMovement.count({ where: { tenantId } }),
  });

  // ── 1 · LOCAL PRIMERO ────────────────────────────────────────────────────
  const r1 = await cargaDelLocal(base.a, a, "1234");
  assert.ok(!(r1 instanceof Error), String(r1));
  if (r1 instanceof Error) return;
  assert.deepEqual(r1.factura, { rotulo: "Factura A 00003-00001234", vinculada: false });
  let compras = await comprasDelProveedor(base.a.id, a.proveedor.id);
  assert.equal(compras.length, 1);
  assert.equal(compras[0].facturaNumero, 1234);
  assert.ok(aRevisarDeNotas(compras[0].notes), "sin el IVA de ARCA queda «a revisar» (no da crédito todavía)");

  const imp1 = await importar(base.a.id, [comprobante(1234)]);
  assert.equal(imp1.vinculados.length, 1, JSON.stringify(imp1));
  assert.equal(imp1.vinculados[0].compra, r1.code);
  assert.equal(imp1.yaCargados.length, 0);
  compras = await comprasDelProveedor(base.a.id, a.proveedor.id);
  assert.equal(compras.length, 1, "la importación NO creó otra compra");
  assert.equal(compras[0]._count.items, 1, "los renglones del local siguen");
  assert.equal(Number(compras[0].facturaNeto), 10000);
  assert.equal(Number(compras[0].facturaIva), 2100);
  assert.ok(compras[0].notes?.startsWith(NOTA_IMPORTADO), compras[0].notes ?? "");
  assert.equal(aRevisarDeNotas(compras[0].notes), null, "con el IVA de ARCA ya da crédito");
  assert.match(compras[0].notes ?? "", /remito 42/, "lo que escribió el local se conserva");
  assert.equal(Number(compras[0].totalCost), 10000, "el total es lo que pagó el local, una vez");
  // Re-importar el mismo archivo: ya estaba, no se duplica ni se vuelve a tocar.
  const imp1b = await importar(base.a.id, [comprobante(1234)]);
  assert.deepEqual([imp1b.vinculados.length, imp1b.yaCargados.length, imp1b.cargados.length], [0, 1, 0]);

  // ── 2 · CONTADORA PRIMERO ────────────────────────────────────────────────
  const imp2 = await importar(base.a.id, [comprobante(5678, { neto: 20000, iva: 4200, total: 24200 })]);
  assert.equal(imp2.cargados.length, 1);
  assert.equal(imp2.vinculados.length, 0);
  compras = await comprasDelProveedor(base.a.id, a.proveedor.id);
  assert.equal(compras.length, 2);
  const importada = compras.find((c) => c.facturaNumero === 5678)!;
  assert.equal(importada._count.items, 0);

  const stockAntes = (await duenio.product.findFirst({ where: { id: a.vacio.id, tenantId: base.a.id }, select: { stock: true } }))!.stock;
  const r2 = await cargaDelLocal(base.a, a, "00005678", { qty: 4 });
  assert.ok(!(r2 instanceof Error), String(r2));
  if (r2 instanceof Error) return;
  assert.deepEqual(r2.factura, { rotulo: "Factura A 00003-00005678", vinculada: true });
  assert.equal(r2.code, importada.code, "es la MISMA compra, con su número");
  compras = await comprasDelProveedor(base.a.id, a.proveedor.id);
  assert.equal(compras.length, 2, "el local NO creó otra compra");
  const vinculada = compras.find((c) => c.facturaNumero === 5678)!;
  assert.equal(vinculada._count.items, 1);
  assert.equal(Number(vinculada.totalCost), 20000);
  assert.equal(Number(vinculada.facturaIva), 4200, "los datos fiscales de ARCA quedan");
  assert.ok(vinculada.notes?.startsWith(NOTA_IMPORTADO));
  const stockDespues = (await duenio.product.findFirst({ where: { id: a.vacio.id, tenantId: base.a.id }, select: { stock: true } }))!.stock;
  assert.equal(stockDespues - stockAntes, 4, "el stock entró con la compra vinculada");
  assert.equal(r2.egreso.asentado, true, "el pago salió de la caja una vez");

  // La ficha del proveedor suma cada factura UNA vez: 10.000 + 20.000.
  const ficha = await comoDuenia(base.a, () => getFichaProveedor(base.a.id, a.proveedor.id));
  assert.equal(ficha?.totalDeCompras, 2);
  assert.equal(ficha?.comprado, 30000);

  // ── 3 · LA MISMA FACTURA DOS VECES POR EL LOCAL ──────────────────────────
  const antes3 = await fotoDe(base.a.id);
  const r3 = await cargaDelLocal(base.a, a, "1234");
  assert.ok(r3 instanceof Error);
  assert.match((r3 as Error).message, new RegExp(`ya está cargada en la compra #${r1.code}`));
  assert.deepEqual(await fotoDe(base.a.id), antes3, "nada escrito");

  // ── 4 · CUIT DE OTRO PROVEEDOR ───────────────────────────────────────────
  const r4 = await cargaDelLocal(base.a, a, "9999", { cuit: "27-12345678-0" });
  assert.ok(r4 instanceof Error);
  assert.match((r4 as Error).message, /no es el del proveedor elegido/);
  assert.deepEqual(await fotoDe(base.a.id), antes3, "nada escrito");

  // ── 5 · AISLAMIENTO ──────────────────────────────────────────────────────
  const fotoAAntes = await fotoDe(base.a.id);
  const rb = await cargaDelLocal(base.b, b, "1234");
  assert.ok(!(rb instanceof Error), String(rb));
  if (rb instanceof Error) return;
  assert.deepEqual(rb.factura, { rotulo: "Factura A 00003-00001234", vinculada: false }, "la de A no cuenta para B");
  const impB = await importar(base.b.id, [comprobante(1234), comprobante(5678)]);
  assert.deepEqual(
    [impB.vinculados.map((v) => v.compra), impB.cargados.length - impB.vinculados.length],
    [[rb.code], 1],
    "en B: la 1234 se vincula con la de B; la 5678 (que en A ya está) entra nueva en B",
  );
  assert.deepEqual(await fotoDe(base.a.id), fotoAAntes, "A quedó idéntico");
  assert.equal((await comprasDelProveedor(base.b.id, b.proveedor.id)).length, 2);
});
