// ============================================================================
// PEDIDOS DE MATERIALES EN LA BASE (T4 · taller de Ale): la base rechaza un pedido con proyecto, proveedor o gasto de
// otro negocio (FK compuestas); recibir dos veces a la vez deja UN solo gasto (FOR UPDATE + transición condicional +
// único de gastoId); anular un recibido no borra el gasto; RLS forzada. Base efímera local (saltea sin Postgres).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { anularPedidoTx, recibirPedidoTx } from "./pedidos";

const fk = (e: unknown) => /foreign key|P2003/i.test(String((e as { code?: string }).code ?? "") + String(e));
const unico = (e: unknown) => /unique|P2002/i.test(String((e as { code?: string }).code ?? "") + String(e));

test("pedidos: nada de otro negocio, recibir 2× simultáneo = 1 gasto, anular no borra el gasto, RLS", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  const db = await prismaComoDuenio(base);
  const A = base.a.id;
  const B = base.b.id;
  const enNegocio = <T>(tenantId: string, fn: (tx: typeof db) => Promise<T>) =>
    db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return fn(tx as unknown as typeof db);
    });

  const proyA = await enNegocio(A, (tx) => tx.proyecto.create({ data: { tenantId: A, clientId: base.a.clientes[0], numero: 1, nombre: "Stand", servicio: "EVENTOS" }, select: { id: true } }));
  const proyB = await enNegocio(B, (tx) => tx.proyecto.create({ data: { tenantId: B, clientId: base.b.clientes[0], numero: 1, nombre: "Otro", servicio: "EVENTOS" }, select: { id: true } }));
  const supA = await enNegocio(A, (tx) => tx.supplier.create({ data: { tenantId: A, name: "Maderera" }, select: { id: true } }));
  const supB = await enNegocio(B, (tx) => tx.supplier.create({ data: { tenantId: B, name: "Ajena" }, select: { id: true } }));
  const gastoB = await enNegocio(B, (tx) => tx.proyectoGasto.create({ data: { tenantId: B, proyectoId: proyB.id, descripcion: "x", neto: 1 }, select: { id: true } }));
  const base0 = { proveedorNombre: "Maderera", descripcion: "MDF", total: 1000, iva: 210 };

  await assert.rejects(enNegocio(A, (tx) => tx.tallerPedido.create({ data: { tenantId: A, proyectoId: proyB.id, ...base0 } })), fk, "proyecto ajeno");
  await assert.rejects(enNegocio(A, (tx) => tx.tallerPedido.create({ data: { tenantId: A, proyectoId: proyA.id, supplierId: supB.id, ...base0 } })), fk, "proveedor ajeno");
  await assert.rejects(enNegocio(A, (tx) => tx.tallerPedido.create({ data: { tenantId: A, proyectoId: proyA.id, gastoId: gastoB.id, ...base0 } })), fk, "gasto ajeno");

  const ped = await enNegocio(A, (tx) => tx.tallerPedido.create({ data: { tenantId: A, proyectoId: proyA.id, supplierId: supA.id, ...base0 }, select: { id: true } }));
  // Doble clic / dos pestañas: dos recepciones a la vez → un gasto; la segunda espera el bloqueo y ve RECIBIDO.
  const recibir = () => enNegocio(A, (tx) => recibirPedidoTx(tx, { tenantId: A, pedidoId: ped.id, proyectoId: proyA.id, autor: "Ale" }));
  const r = await Promise.all([recibir(), recibir()]);
  assert.equal(r.filter((x) => x.ok).length, 1);
  assert.deepEqual(r.find((x) => !x.ok), { ok: false, motivo: "YA_RECIBIDO" });
  const gastos = await enNegocio(A, (tx) => tx.proyectoGasto.findMany({ where: { proyectoId: proyA.id }, select: { id: true, rubro: true, neto: true, iva: true, supplierId: true, pagadoEl: true } }));
  assert.equal(gastos.length, 1);
  assert.deepEqual({ ...gastos[0], id: undefined }, { id: undefined, rubro: "Materiales", neto: 1000, iva: 210, supplierId: supA.id, pagadoEl: null });
  const recibido = await enNegocio(A, (tx) => tx.tallerPedido.findUniqueOrThrow({ where: { id: ped.id }, select: { estado: true, gastoId: true } }));
  assert.deepEqual(recibido, { estado: "RECIBIDO", gastoId: gastos[0].id });

  // Única barrera de la base: otro pedido no puede apuntar al mismo gasto.
  await assert.rejects(enNegocio(A, (tx) => tx.tallerPedido.create({ data: { tenantId: A, proyectoId: proyA.id, gastoId: gastos[0].id, ...base0 } })), unico, "gasto repetido");

  // Anular el recibido: el pedido queda ANULADO y el gasto sigue (se anula desde Costos).
  assert.equal(await enNegocio(A, (tx) => anularPedidoTx(tx, { tenantId: A, pedidoId: ped.id, proyectoId: proyA.id })), "ANULADO_CON_GASTO");
  assert.equal(await enNegocio(A, (tx) => tx.proyectoGasto.count({ where: { proyectoId: proyA.id, anuladoEl: null } })), 1);
  assert.deepEqual(await enNegocio(A, (tx) => recibirPedidoTx(tx, { tenantId: A, pedidoId: ped.id, proyectoId: proyA.id, autor: "Ale" })), { ok: false, motivo: "YA_RECIBIDO" });

  // Otro negocio no ve ni puede recibir el pedido de A (FORCE RLS + filtro por tenant).
  assert.equal(await enNegocio(B, (tx) => tx.tallerPedido.count()), 0);
  assert.deepEqual(await enNegocio(B, (tx) => recibirPedidoTx(tx, { tenantId: B, pedidoId: ped.id, proyectoId: proyA.id, autor: "x" })), { ok: false, motivo: "NO_EXISTE" });
});
