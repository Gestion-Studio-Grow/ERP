// RESETEO DE GO-LIVE contra Postgres efímero con RLS (app_rls): borra lo transaccional del negocio A,
// deja los maestros, el comprobante con CAE (desligado por la FK, con el trigger de inmutabilidad
// puesto), los días de caja cerrados, y no toca nada del negocio B. Sin Postgres local: se saltea.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const DIA_MS = 24 * 60 * 60 * 1000;

test("contra Postgres: el reseteo borra lo de prueba de A y nada más", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const duenio = await prismaComoDuenio(base);
  const { tenantTransaction } = await import("@/lib/rls");
  const { planificarReseteo, totalABorrar, ACTOR_RESETEO } = await import("@/lib/reset-golive");
  const { aplicarPlan, candadoDelReseteo, leerFoto, tablasExistentes, verificarVacio } = await import("@/lib/reset-golive-db");
  const { businessWallTimeToUtc, dateStrInBusinessTz } = await import("@/lib/datetime");
  const { a, b } = base;

  const inicio = new Date(Date.now() - 60_000);
  const hoy = dateStrInBusinessTz(new Date());
  const anteayer = dateStrInBusinessTz(new Date(Date.now() - 2 * DIA_MS));
  const [c0, c1] = a.clientes;
  const [o1, o2, o3] = a.pedidos;

  // Maestros de A.
  const box = await duenio.box.create({ data: { tenantId: a.id, name: "Box 1" } });
  const prof = await duenio.professional.create({ data: { tenantId: a.id, name: "Pro" } });
  const serv = await duenio.service.create({ data: { tenantId: a.id, name: "Limpieza", durationMin: 60, price: 1000 } });
  const prod = await duenio.product.create({ data: { tenantId: a.id, name: "Crema", stock: 8, trackStock: true } });
  const cupon = await duenio.coupon.create({ data: { tenantId: a.id, code: "HOLA", type: "PERCENT", value: 10, usedCount: 1 } });

  // Transaccional de A (el "día de pruebas").
  await duenio.order.update({ where: { id: o3 }, data: { clientId: c0 } });
  await duenio.orderItem.create({ data: { tenantId: a.id, orderId: o1, productId: prod.id, name: "Crema", quantity: 2, unitPrice: 100, lineTotal: 200 } });
  const turno = await duenio.appointment.create({
    data: { tenantId: a.id, clientId: c1, professionalId: prof.id, serviceId: serv.id, boxId: box.id, startsAt: new Date(), endsAt: new Date(Date.now() + 3600_000), couponCode: "HOLA" },
  });
  const pago = await duenio.payment.create({ data: { tenantId: a.id, appointmentId: turno.id, amount: 900, method: "EFECTIVO", status: "APPROVED" } });
  await duenio.review.create({ data: { tenantId: a.id, appointmentId: turno.id, professionalId: prof.id, clientName: "X", rating: 5 } });
  const sesion = await duenio.cashSession.create({ data: { tenantId: a.id, openedBy: "user:x", status: "OPEN" } });
  await duenio.cashMovement.createMany({
    data: [
      { tenantId: a.id, sessionId: sesion.id, type: "VENTA", amount: 200, orderId: o1, createdBy: "user:x" },
      { tenantId: a.id, sessionId: sesion.id, type: "VENTA", amount: 900, paymentId: pago.id, createdBy: "user:x" },
      // Lo que NO se toca: histórico de la planilla y corte inicial (día cerrado).
      { tenantId: a.id, type: "INGRESO", amount: 5000, occurredAt: businessWallTimeToUtc(anteayer, "10:00"), createdBy: "import:caja-historica:abcd1234" },
      { tenantId: a.id, type: "INGRESO", amount: 10, occurredAt: businessWallTimeToUtc(anteayer, "23:59"), createdBy: `corte-inicial:${anteayer}` },
    ],
  });
  await duenio.stockMovement.createMany({
    data: [
      { tenantId: a.id, productId: prod.id, type: "AJUSTE", qty: 10, balanceAfter: 10, reason: "Stock inicial", createdBy: "user:x" },
      { tenantId: a.id, productId: prod.id, type: "VENTA", qty: -2, balanceAfter: 8, orderId: o1, createdBy: "user:x" },
    ],
  });
  const fiscal = { puntoVenta: 1, concepto: 1, docTipo: 99, docNro: "0", fecha: hoy.replace(/-/g, ""), neto: 200, iva: 0, total: 200 };
  const conCae = await duenio.invoice.create({ data: { tenantId: a.id, ...fiscal, tipoComprobante: 11, status: "AUTHORIZED", cae: "12345678901234", numero: 1, orderId: o3 } });
  const pendiente = await duenio.invoice.create({ data: { tenantId: a.id, ...fiscal, status: "PENDING", orderId: o2 } });
  await duenio.envioComprobante.create({ data: { tenantId: a.id, invoiceId: pendiente.id, canal: "email", destino: "x@y.z" } });
  await duenio.outboxEvent.create({ data: { tenantId: a.id, type: "InvoiceCreated", payload: {} } });
  await duenio.waitlistEntry.create({ data: { tenantId: a.id, clientName: "Y", clientPhone: "1", serviceId: serv.id } });

  // B: algo de caja propio, para ver que no se toca.
  await duenio.cashMovement.create({ data: { tenantId: b.id, type: "VENTA", amount: 777, orderId: b.pedidos[0], createdBy: "user:b" } });
  const contarB = async () => ({
    orders: await duenio.order.count({ where: { tenantId: b.id } }),
    cash: await duenio.cashMovement.count({ where: { tenantId: b.id } }),
    clients: await duenio.client.count({ where: { tenantId: b.id } }),
  });
  const bAntes = await contarB();

  const opciones = { clientesCreadosDesde: inicio, conservarFuturo: false };
  const ahora = new Date();
  const correr = (alterar?: (p: ReturnType<typeof planificarReseteo>) => void) =>
    tenantTransaction(
      async (tx) => {
        await candadoDelReseteo(tx, a.id);
        const tablas = await tablasExistentes(tx);
        const foto = await leerFoto(tx, a.id, tablas, ahora);
        const plan = planificarReseteo(foto, opciones);
        alterar?.(plan);
        await aplicarPlan(tx, a.id, plan, { opciones, frontera: foto.frontera, ahora });
        await verificarVacio(tx, a.id, tablas, opciones, ahora);
        return { plan, frontera: foto.frontera };
      },
      { tenantId: a.id, timeoutMs: 60_000 },
    );

  // 1) Un plan adulterado (un id que no existe) hace fallar un paso: NO se borra nada.
  const ordenesAntes = await duenio.order.count({ where: { tenantId: a.id } });
  await assert.rejects(() => correr((p) => p.pasos.find((x) => x.paso === "Order")!.ids.push("no-existe")), /se planificó borrar/);
  assert.equal(await duenio.order.count({ where: { tenantId: a.id } }), ordenesAntes, "la transacción volvió atrás entera");
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: a.id } }), 4);

  // 2) La corrida de verdad.
  const { plan, frontera } = await correr();
  assert.equal(frontera, anteayer);
  assert.ok(totalABorrar(plan) > 0);

  // Transaccional de A: fuera, salvo la venta con CAE (o3), que se anula por nota de crédito.
  assert.deepEqual((await duenio.order.findMany({ where: { tenantId: a.id }, select: { id: true } })).map((o) => o.id), [o3]);
  assert.equal(await duenio.orderItem.count({ where: { tenantId: a.id } }), 0);
  assert.equal(await duenio.appointment.count({ where: { tenantId: a.id } }), 0);
  assert.equal(await duenio.payment.count({ where: { tenantId: a.id } }), 0);
  assert.equal(await duenio.review.count({ where: { tenantId: a.id } }), 0);
  assert.equal(await duenio.cashSession.count({ where: { tenantId: a.id } }), 0);
  assert.equal(await duenio.waitlistEntry.count({ where: { tenantId: a.id } }), 0);
  assert.equal(await duenio.outboxEvent.count({ where: { tenantId: a.id } }), 0);
  assert.equal(await duenio.envioComprobante.count({ where: { tenantId: a.id } }), 0);
  assert.equal(await duenio.invoice.findUnique({ where: { id: pendiente.id } }), null);

  // Caja: quedan el histórico y el corte (día cerrado), nada más.
  const caja = await duenio.cashMovement.findMany({ where: { tenantId: a.id }, select: { createdBy: true } });
  assert.deepEqual(caja.map((m) => m.createdBy).sort(), [`corte-inicial:${anteayer}`, "import:caja-historica:abcd1234"]);

  // CAE: sigue, intacto y enlazado a su venta.
  const cae = await duenio.invoice.findUniqueOrThrow({ where: { id: conCae.id } });
  assert.equal(cae.cae, "12345678901234");
  assert.equal(cae.status, "AUTHORIZED");
  assert.equal(cae.orderId, o3);

  // Maestros: intactos. Stock contado igual, con el ajuste que lo explica.
  assert.equal(await duenio.box.count({ where: { tenantId: a.id } }), 1);
  assert.equal(await duenio.professional.count({ where: { tenantId: a.id } }), 1);
  assert.equal(await duenio.service.count({ where: { tenantId: a.id } }), 1);
  assert.equal(await duenio.user.count({ where: { tenantId: a.id } }), 2);
  assert.equal((await duenio.product.findUniqueOrThrow({ where: { id: prod.id } })).stock, 8);
  const kardex = await duenio.stockMovement.findMany({ where: { tenantId: a.id }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(kardex.map((m) => [m.type, m.qty]), [["AJUSTE", 10], ["AJUSTE", -2]]);
  assert.equal(kardex[1].createdBy, ACTOR_RESETEO);
  assert.equal((await duenio.coupon.findUniqueOrThrow({ where: { id: cupon.id } })).usedCount, 0);

  // Clientes creados desde `inicio`: el del CAE queda; el otro se borra.
  const clientes = await duenio.client.findMany({ where: { tenantId: a.id }, select: { id: true } });
  assert.deepEqual(clientes.map((c) => c.id), [c0]);
  assert.ok(plan.clientesConservados.some((c) => c.id === c0 && c.motivo.includes("CAE")));

  // Constancia en AuditLog.
  const audit = await duenio.auditLog.findMany({ where: { tenantId: a.id, actor: ACTOR_RESETEO } });
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, "reset-golive");

  // B: intacto.
  assert.deepEqual(await contarB(), bAntes);
});
