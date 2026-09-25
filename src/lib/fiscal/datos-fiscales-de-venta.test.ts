// DATOS FISCALES DE UNA VENTA (R1-F5) · el reparto del descuento, EJECUTADO; y la lectura contra
// Postgres de verdad (rol app_rls, RLS encendido): la venta de otro negocio no se ve.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renglonesDeLaVenta } from "./datos-fiscales-de-venta";
import { calcularImpuestosPorAlicuota } from "./impuestos-por-alicuota";
import { apuntarLaAppA, baseEfimeraDelArchivo } from "@/test/base-efimera";

const centavos = (renglones: { total: number }[]) => renglones.reduce((a, r) => a + Math.round(r.total * 100), 0);

test("sin descuento, cada renglón es lo cobrado por el producto, con su alícuota (o sin ella: no se inventa)", () => {
  assert.deepEqual(
    renglonesDeLaVenta({ items: [{ lineTotal: 1210, alicuotaIva: 5 }, { lineTotal: 552.5, alicuotaIva: 4 }, { lineTotal: 10, alicuotaIva: null }], discount: 0 }),
    [{ total: 1210, alicuotaIva: 5 }, { total: 552.5, alicuotaIva: 4 }, { total: 10, alicuotaIva: null }],
  );
});

test("el descuento de la venta se reparte entre los productos en proporción y al centavo: la suma da lo vendido menos el descuento", () => {
  assert.deepEqual(
    renglonesDeLaVenta({ items: [{ lineTotal: 1000, alicuotaIva: 5 }, { lineTotal: 500, alicuotaIva: 4 }], discount: 150 }),
    [{ total: 900, alicuotaIva: 5 }, { total: 450, alicuotaIva: 4 }],
  );
  // Un centavo que no se divide: va al de mayor resto, y la suma cierra.
  const r = renglonesDeLaVenta({ items: [1, 1, 1].map((lineTotal) => ({ lineTotal, alicuotaIva: 5 })), discount: 0.01 });
  assert.equal(centavos(r), 299);
  // 3000 ventas al azar (1 a 6 productos, hasta 50 millones cada uno): siempre al centavo, nada negativo.
  let semilla = 7;
  const azar = (n: number) => ((semilla = (semilla * 48271) % 2147483647), semilla % n);
  for (let i = 0; i < 3000; i++) {
    const items = Array.from({ length: 1 + azar(6) }, () => ({ lineTotal: (1 + azar(5_000_000_000)) / 100, alicuotaIva: 5 }));
    const suma = items.reduce((a, x) => a + Math.round(x.lineTotal * 100), 0);
    const descuento = azar(suma + 1);
    const renglones = renglonesDeLaVenta({ items, discount: descuento / 100 });
    assert.equal(centavos(renglones), suma - descuento, `venta ${i}`);
    renglones.forEach((x, k) => assert.ok(x.total >= 0 && x.total <= items[k].lineTotal, `venta ${i} renglón ${k}`));
  }
});

test("un descuento que no se puede repartir no se inventa: los renglones quedan como están y el IVA dice que no suman lo cobrado", () => {
  const items = [{ lineTotal: 100, alicuotaIva: 5 }];
  const r = renglonesDeLaVenta({ items, discount: 150 });
  assert.deepEqual(r, [{ total: 100, alicuotaIva: 5 }]);
  const calculo = calcularImpuestosPorAlicuota("RESPONSABLE_INSCRIPTO", { total: -50, renglones: r });
  assert.equal(calculo.ok, false);
});

const laBase = baseEfimeraDelArchivo();

test("lee de la base la ficha del cliente y los productos de la venta con su alícuota; la venta de otro negocio da null", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
  const { operatorPrisma } = await import("@/lib/operator-db");
  const { tenantTransaction } = await import("@/lib/rls");
  const { leerDatosFiscalesDeVenta } = await import("./datos-fiscales-de-venta");
  const a = base.a;
  const [venta, mostrador] = a.pedidos;
  const cliente = a.clientes[0];
  const ficha = { docTipo: 80, docNro: "30500000003", razonSocial: "Distribuidora del Sur SA", condicionIva: "RESPONSABLE_INSCRIPTO", domicilio: "Av. Mitre 1234, Avellaneda" };
  await operatorPrisma.client.update({ where: { id: cliente }, data: ficha });
  const al21 = await operatorPrisma.product.create({ data: { tenantId: a.id, name: "Vacío", price: 1000, alicuotaIva: 5 } });
  const al105 = await operatorPrisma.product.create({ data: { tenantId: a.id, name: "Pan", price: 500, alicuotaIva: 4 } });
  await operatorPrisma.order.update({ where: { id: venta }, data: { clientId: cliente, subtotal: 1500, discount: 150, total: 1350 } });
  for (const [producto, lineTotal] of [[al21, 1000], [al105, 500]] as const) {
    await operatorPrisma.orderItem.create({
      data: { tenantId: a.id, orderId: venta, productId: producto.id, name: producto.name, quantity: 1, unitPrice: lineTotal, lineTotal },
    });
  }

  const leido = await tenantTransaction((tx) => leerDatosFiscalesDeVenta(tx, venta), { tenantId: a.id });
  assert.deepEqual(leido?.receptor, ficha);
  assert.deepEqual(
    [...(leido?.renglones ?? [])].sort((x, y) => (y.alicuotaIva ?? 0) - (x.alicuotaIva ?? 0)),
    [{ total: 900, alicuotaIva: 5 }, { total: 450, alicuotaIva: 4 }],
  );
  const calculo = calcularImpuestosPorAlicuota("RESPONSABLE_INSCRIPTO", { total: 1350, renglones: leido!.renglones });
  assert.ok(calculo.ok, "con los datos leídos el IVA del inscripto se calcula");

  const sinCliente = await tenantTransaction((tx) => leerDatosFiscalesDeVenta(tx, mostrador), { tenantId: a.id });
  assert.deepEqual(sinCliente, { receptor: null, renglones: [] });

  // Aislamiento: desde el otro negocio, la venta (y su cliente) no existen.
  const ajena = await tenantTransaction((tx) => leerDatosFiscalesDeVenta(tx, venta), { tenantId: base.b.id });
  assert.equal(ajena, null);
});
