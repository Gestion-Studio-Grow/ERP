// ============================================================================
// STOCK REAL DE MATERIALES EN LA BASE (T6 · taller de Ale): una pieza no puede apuntar al producto de otro negocio
// (FK compuesta); descontar dos veces a la vez deja UN juego de movimientos (FOR UPDATE del proyecto + único
// proyecto/pieza); si cambia el despiece sólo se descuenta la diferencia; un faltante no deja nada escrito; devolver
// dos veces = una sola devolución; otro negocio no ve los consumos (FORCE RLS). Base efímera local (saltea sin Postgres).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { RechazoDelStock, recordMovement } from "@/lib/stock/ledger";
import { SELECT_INGRESOS, costoVigenteEnTx, ultimoIngresoDe } from "@/lib/stock/costo";
import { costearInsumos, type SalidaDeStock } from "@/lib/reports/costo-vendido";
import { salidaDeStockDe, whereSalidasDelMes } from "@/lib/reports/resultado-lectura";
import { demandaDe } from "@/lib/suppliers/sugerido";
import { mesDelNegocio } from "@/lib/libros/fecha-fiscal";
import { descontarMaterialesTx, devolverMaterialesTx, TALLER_DEVOLUCION_ACTOR_PREFIX } from "./consumo";

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

test("consumo de materiales: descontar → devolver → descontar deja costo y demanda netos; el costo vigente no cambia", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  const db = await prismaComoDuenio(base);
  const A = base.a.id;
  const enA = <T>(fn: (tx: typeof db) => Promise<T>) =>
    db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${A}, true)`;
      return fn(tx as unknown as typeof db);
    }, { timeout: 20_000 });

  const proy = await enA((tx) => tx.proyecto.create({ data: { tenantId: A, clientId: base.a.clientes[0], numero: 7, nombre: "Stand costo", servicio: "EVENTOS" }, select: { id: true } }));
  const mdf = await enA((tx) => tx.product.create({ data: { tenantId: A, name: "MDF costo", stock: 0, trackStock: true }, select: { id: true } }));
  await enA((tx) => recordMovement(tx, { tenantId: A, productId: mdf.id, type: "COMPRA", qty: 10, unitCost: 1000, createdBy: "user:compra" }));
  const panel = await enA((tx) => tx.tallerPieza.create({ data: { tenantId: A, nombre: "Panel", productId: mdf.id }, select: { id: true } }));
  await enA((tx) => tx.tallerDespiece.create({ data: { tenantId: A, proyectoId: proy.id, piezaId: panel.id, cantidad: 4 } }));
  const d = { tenantId: A, proyectoId: proy.id, autor: "user:ale" };
  const neto = async () => {
    const movs = await enA((tx) => tx.stockMovement.findMany({ where: { productId: mdf.id }, orderBy: { createdAt: "asc" }, select: { type: true, orderId: true, productId: true, qty: true, unitCost: true, createdBy: true, reason: true } }));
    const salidas = movs.map(salidaDeStockDe).filter((s): s is SalidaDeStock => s !== null && (s.type === "CONSUMO"));
    return { costo: costearInsumos(salidas, {}).costo, demanda: demandaDe(movs) };
  };
  const consumoFila = () => enA((tx) => tx.tallerConsumo.findFirstOrThrow({ where: { proyectoId: proy.id }, select: { cantidad: true, costoTotal: true } }));

  await enA((tx) => descontarMaterialesTx(tx, d));
  assert.deepEqual(await consumoFila(), { cantidad: 4, costoTotal: 4000 });
  assert.deepEqual(await neto(), { costo: 4000, demanda: 4 });

  // Una compra más cara entre medio: el costo vigente pasa a 1500 y la devolución NO lo pisa.
  await enA((tx) => recordMovement(tx, { tenantId: A, productId: mdf.id, type: "COMPRA", qty: 1, unitCost: 1500, createdBy: "user:compra" }));
  await enA((tx) => devolverMaterialesTx(tx, d));
  assert.deepEqual(await consumoFila(), { cantidad: 0, costoTotal: 0 });
  const rep = await enA((tx) => tx.stockMovement.findFirstOrThrow({ where: { productId: mdf.id, type: "REPOSICION" }, select: { qty: true, unitCost: true, createdBy: true, createdAt: true } }));
  assert.deepEqual({ ...rep, createdAt: undefined }, { createdAt: undefined,  qty: 4, unitCost: 1000, createdBy: `${TALLER_DEVOLUCION_ACTOR_PREFIX}user:ale` });
  assert.deepEqual(await neto(), { costo: 0, demanda: 0 }, "descontar 4 y devolver 4 = neto 0");
  assert.equal(await enA((tx) => costoVigenteEnTx(tx, A, mdf.id)), 1500, "la devolución no es último ingreso (SQL)");
  const leido = await enA((tx) => tx.product.findUniqueOrThrow({ where: { id: mdf.id }, select: SELECT_INGRESOS }));
  assert.equal(ultimoIngresoDe(leido), 1500, "la devolución no es último ingreso (Prisma)");
  assert.equal(await enA((tx) => tx.product.findUniqueOrThrow({ where: { id: mdf.id }, select: { stock: true } })).then((p) => p.stock), 11);

  // Descontar de nuevo: al costo vigente (1500) → costo 6000, demanda 4.
  await enA((tx) => descontarMaterialesTx(tx, d));
  assert.deepEqual(await consumoFila(), { cantidad: 4, costoTotal: 6000 });
  assert.deepEqual(await neto(), { costo: 6000, demanda: 4 });

  // El where del mes del reporte trae la devolución (y nada de otro negocio).
  const mes = mesDelNegocio(rep.createdAt);
  const delMes = await enA((tx) => tx.stockMovement.findMany({ where: whereSalidasDelMes(A, mes), select: { type: true, productId: true } }));
  assert.ok(delMes.some((m) => m.type === "REPOSICION" && m.productId === mdf.id));
  assert.ok(!delMes.some((m) => m.type === "COMPRA"));
});

test("consumo de materiales: salida mezclada (una parte sin costo, otra con costo) vuelve neta 0 al devolver", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  const db = await prismaComoDuenio(base);
  const A = base.a.id;
  const enA = <T>(fn: (tx: typeof db) => Promise<T>) =>
    db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${A}, true)`;
      return fn(tx as unknown as typeof db);
    }, { timeout: 20_000 });

  const proy = await enA((tx) => tx.proyecto.create({ data: { tenantId: A, clientId: base.a.clientes[0], numero: 8, nombre: "Stand mixto", servicio: "EVENTOS" }, select: { id: true } }));
  const tela = await enA((tx) => tx.product.create({ data: { tenantId: A, name: "Tela sin costo", stock: 10, trackStock: true }, select: { id: true } }));
  const pieza = await enA((tx) => tx.tallerPieza.create({ data: { tenantId: A, nombre: "Lona", productId: tela.id }, select: { id: true } }));
  await enA((tx) => tx.tallerDespiece.create({ data: { tenantId: A, proyectoId: proy.id, piezaId: pieza.id, cantidad: 4 } }));
  const d = { tenantId: A, proyectoId: proy.id, autor: "user:ale" };
  const fila = () => enA((tx) => tx.tallerConsumo.findFirstOrThrow({ where: { proyectoId: proy.id }, select: { cantidad: true, costoTotal: true, cantidadConCosto: true } }));
  // El reporte valúa lo que salió sin costo al costo vigente de hoy (1500 después de la compra).
  const costo = async () => {
    const movs = await enA((tx) => tx.stockMovement.findMany({ where: { productId: tela.id }, select: { type: true, orderId: true, productId: true, qty: true, unitCost: true, createdBy: true, reason: true } }));
    const salidas = movs.map(salidaDeStockDe).filter((s): s is SalidaDeStock => s !== null && s.type !== "VENTA");
    return { costo: costearInsumos(salidas, { [tela.id]: 1500 }).costo, demanda: demandaDe(movs) };
  };

  await enA((tx) => descontarMaterialesTx(tx, d)); // 4 sin costo vigente
  assert.deepEqual(await fila(), { cantidad: 4, costoTotal: 0, cantidadConCosto: 0 });
  await enA((tx) => recordMovement(tx, { tenantId: A, productId: tela.id, type: "COMPRA", qty: 10, unitCost: 1500, createdBy: "user:compra" }));
  await enA((tx) => tx.tallerDespiece.updateMany({ where: { proyectoId: proy.id }, data: { cantidad: 6 } }));
  await enA((tx) => descontarMaterialesTx(tx, d)); // 2 más, a 1500
  assert.deepEqual(await fila(), { cantidad: 6, costoTotal: 3000, cantidadConCosto: 2 });
  assert.deepEqual(await costo(), { costo: 9000, demanda: 6 });

  await enA((tx) => devolverMaterialesTx(tx, d));
  assert.deepEqual(await fila(), { cantidad: 0, costoTotal: 0, cantidadConCosto: 0 });
  const reps = await enA((tx) => tx.stockMovement.findMany({ where: { productId: tela.id, type: "REPOSICION" }, select: { qty: true, unitCost: true }, orderBy: { qty: "asc" } }));
  assert.deepEqual(reps, [{ qty: 2, unitCost: 1500 }, { qty: 4, unitCost: null }]);
  assert.deepEqual(await costo(), { costo: 0, demanda: 0 }, "todo devuelto = neto 0");
  assert.equal(await enA((tx) => costoVigenteEnTx(tx, A, tela.id)), 1500);
  assert.equal(await enA((tx) => tx.product.findUniqueOrThrow({ where: { id: tela.id }, select: { stock: true } })).then((p) => p.stock), 20);
});
