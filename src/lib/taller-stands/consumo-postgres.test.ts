// ============================================================================
// STOCK REAL DE MATERIALES EN LA BASE (T6 · taller de Ale): una pieza no puede apuntar al producto de otro negocio
// (FK compuesta); descontar dos veces a la vez deja UN juego de movimientos (FOR UPDATE del proyecto + único
// proyecto/pieza); si cambia el despiece sólo se descuenta la diferencia; un faltante no deja nada escrito; devolver
// dos veces = una sola devolución; otro negocio no ve los consumos (FORCE RLS). Base efímera local (saltea sin Postgres).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { RechazoDelStock } from "@/lib/stock/ledger";
import { descontarMaterialesTx, devolverMaterialesTx } from "./consumo";

const fk = (e: unknown) => /foreign key|P2003/i.test(String((e as { code?: string }).code ?? "") + String(e));

test("consumo de materiales: FK de producto, 2× simultáneo = 1 juego, diferencia, faltante, devolver 2×, RLS", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  const db = await prismaComoDuenio(base);
  const A = base.a.id;
  const B = base.b.id;
  const enNegocio = <T>(tenantId: string, fn: (tx: typeof db) => Promise<T>) =>
    db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return fn(tx as unknown as typeof db);
    }, { timeout: 20_000 });

  const proyA = await enNegocio(A, (tx) => tx.proyecto.create({ data: { tenantId: A, clientId: base.a.clientes[0], numero: 1, nombre: "Stand", servicio: "EVENTOS" }, select: { id: true } }));
  const mdf = await enNegocio(A, (tx) => tx.product.create({ data: { tenantId: A, name: "MDF 18 mm", stock: 10, trackStock: true }, select: { id: true } }));
  const tornillo = await enNegocio(A, (tx) => tx.product.create({ data: { tenantId: A, name: "Tornillo", stock: 100, trackStock: false }, select: { id: true } }));
  const ajeno = await enNegocio(B, (tx) => tx.product.create({ data: { tenantId: B, name: "Ajeno", stock: 50, trackStock: true }, select: { id: true } }));

  // FK compuesta: la pieza de A no puede apuntar al producto de B, ni al crearla ni al cambiarla.
  await assert.rejects(enNegocio(A, (tx) => tx.tallerPieza.create({ data: { tenantId: A, nombre: "Panel", productId: ajeno.id } })), fk, "producto ajeno al crear");
  const panel = await enNegocio(A, (tx) => tx.tallerPieza.create({ data: { tenantId: A, nombre: "Panel", productId: mdf.id }, select: { id: true } }));
  const bulon = await enNegocio(A, (tx) => tx.tallerPieza.create({ data: { tenantId: A, nombre: "Bulón", productId: tornillo.id }, select: { id: true } }));
  await assert.rejects(enNegocio(A, (tx) => tx.tallerPieza.update({ where: { id: panel.id }, data: { productId: ajeno.id } })), fk, "producto ajeno al cambiar");

  await enNegocio(A, (tx) => tx.tallerDespiece.createMany({ data: [
    { tenantId: A, proyectoId: proyA.id, piezaId: panel.id, cantidad: 4 },
    { tenantId: A, proyectoId: proyA.id, piezaId: bulon.id, cantidad: 20 },
  ] }));
  const stock = async (id: string, tenantId = A) => (await enNegocio(tenantId, (tx) => tx.product.findUniqueOrThrow({ where: { id }, select: { stock: true } }))).stock;
  const movs = async (productId: string, type: "CONSUMO" | "REPOSICION") => enNegocio(A, (tx) => tx.stockMovement.count({ where: { productId, type } }));
  const descontar = () => enNegocio(A, (tx) => descontarMaterialesTx(tx, { tenantId: A, proyectoId: proyA.id, autor: "Ale" }));
  const devolver = () => enNegocio(A, (tx) => devolverMaterialesTx(tx, { tenantId: A, proyectoId: proyA.id, autor: "Ale" }));

  // Doble clic / dos pestañas: dos descuentos a la vez → un solo juego de movimientos; el segundo no tiene nada que hacer.
  const r = await Promise.all([descontar(), descontar()]);
  assert.deepEqual(r.map((x) => x.movimientos).sort(), [0, 1]);
  assert.equal(await stock(mdf.id), 6);
  assert.equal(await stock(tornillo.id), 100, "sin control de stock no se descuenta");
  assert.equal(await movs(mdf.id, "CONSUMO"), 1);
  assert.equal(await movs(tornillo.id, "CONSUMO"), 0);

  // Cambia el despiece: sólo se descuenta la diferencia.
  await enNegocio(A, (tx) => tx.tallerDespiece.updateMany({ where: { proyectoId: proyA.id, piezaId: panel.id }, data: { cantidad: 7 } }));
  assert.equal((await descontar()).movimientos, 1);
  assert.equal(await stock(mdf.id), 3);
  const consumo = await enNegocio(A, (tx) => tx.tallerConsumo.findFirstOrThrow({ where: { proyectoId: proyA.id, piezaId: panel.id }, select: { cantidad: true, productId: true, movementId: true } }));
  assert.deepEqual({ ...consumo, movementId: undefined }, { cantidad: 7, productId: mdf.id, movementId: undefined });
  const mov = await enNegocio(A, (tx) => tx.stockMovement.findUniqueOrThrow({ where: { id: consumo.movementId }, select: { type: true, qty: true } }));
  assert.deepEqual(mov, { type: "CONSUMO", qty: -3 }, "movementId apunta al último movimiento del ledger");

  // Faltante: piden 10 más y hay 3 → RechazoDelStock y nada escrito (ni stock, ni movimiento, ni consumo).
  await enNegocio(A, (tx) => tx.tallerDespiece.updateMany({ where: { proyectoId: proyA.id, piezaId: panel.id }, data: { cantidad: 17 } }));
  await assert.rejects(descontar(), (e: unknown) => e instanceof RechazoDelStock);
  assert.equal(await stock(mdf.id), 3);
  assert.equal(await movs(mdf.id, "CONSUMO"), 2);
  assert.equal((await enNegocio(A, (tx) => tx.tallerConsumo.findFirstOrThrow({ where: { proyectoId: proyA.id, piezaId: panel.id } }))).cantidad, 7);

  // Otro negocio no ve los consumos ni puede descontar/devolver el proyecto de A.
  assert.equal(await enNegocio(B, (tx) => tx.tallerConsumo.count()), 0);
  assert.equal((await enNegocio(B, (tx) => descontarMaterialesTx(tx, { tenantId: B, proyectoId: proyA.id, autor: "x" }))).ok, false);
  assert.equal((await enNegocio(B, (tx) => devolverMaterialesTx(tx, { tenantId: B, proyectoId: proyA.id, autor: "x" }))).ok, false);
  assert.equal(await stock(ajeno.id, B), 50);

  // Devolver dos veces a la vez: una sola devolución (vuelven las 7 planchas), la otra no encuentra nada.
  const d = await Promise.all([devolver(), devolver()]);
  assert.deepEqual(d.map((x) => x.movimientos).sort(), [0, 1]);
  assert.equal(await stock(mdf.id), 10);
  assert.equal(await movs(mdf.id, "REPOSICION"), 1);
  assert.equal((await enNegocio(A, (tx) => tx.tallerConsumo.findFirstOrThrow({ where: { proyectoId: proyA.id, piezaId: panel.id } }))).cantidad, 0);
  assert.equal((await devolver()).movimientos, 0);
});
