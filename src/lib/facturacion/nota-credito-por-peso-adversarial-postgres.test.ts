// Ataques de la certificación a la NC simulada por peso (hallazgo 1: el cron ve las pendientes nuevas).
//   node scripts/qa/p1-pglite.mjs <este archivo>
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type NegocioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { StubAfipClient } from "@/plugins/arca/afip/stub";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";
import { MAX_INTENTOS_NC_PESO } from "@/lib/facturacion/nota-credito-por-peso-core";

test("adversarial NC por peso", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  prepararAccionesDeServidor();
  apuntarLaAppA(base);
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;

  const { tenantTransaction } = await import("@/lib/rls");
  const { insertOrder, cobrarPedidoEnTx } = await import("@/lib/order-core");
  const { createInvoice, crearNotaDeCredito, numeroUsadoPorOtraFactura } = await import("@/lib/invoice-core");
  const dispatch = await import("@/lib/arca-dispatch");
  const { ajustarPesoInTx } = await import("@/lib/ajuste-peso-cobrado");
  const nc = await import("@/lib/facturacion/nota-credito-por-peso");
  const { todayInBusinessTz } = await import("@/lib/datetime");
  const hoy = todayInBusinessTz();
  const HOY = fechaFiscalDelDia();

  const stubs = new Map<string, StubAfipClient>();
  const despDeps = {
    clientePara: (tenantId: string) =>
      stubs.get(tenantId) ?? stubs.set(tenantId, new StubAfipClient({ cuit: 20111111112, homologacion: true })).get(tenantId)!,
    numeroUsadoPorOtraFactura,
  };
  const despachar = (tenantId: string) => dispatch.procesarEnviosDelNegocio(tenantId, 50, despDeps);
  const deps = { enModoPrueba: async () => true, procesarEnviosDelNegocio: despachar };
  const fuera = { ...deps, enModoPrueba: async () => false };
  // El reloj de la ventana del intento: cada «corrida del cron» de los tests es otra vuelta (+11 min).
  const reloj = { t: Date.now() };
  const otraVuelta = () => (reloj.t += 11 * 60 * 1000);
  const conReloj = { ...deps, ahora: () => new Date(reloj.t) };

  const producto = (n: NegocioDePrueba, precio: number) =>
    duenio.product.create({
      data: { tenantId: n.id, name: "Vacío", unit: "kg", saleUnit: "WEIGHT", pricePerKg: precio, price: precio, stock: 500, trackStock: true, active: true },
      select: { id: true },
    });
  const tomar = async (n: NegocioDePrueba, productId: string, qty: number) => {
    const r = await ejecutarAccion({ negocio: n }, () =>
      insertOrder(n.id, {
        channel: "COUNTER", fulfillment: "PICKUP", customerName: "Marta", customerPhone: "", address: null, notes: null,
        scheduledFor: null, paid: false, paymentMethod: null, items: [{ productId, qty }],
      }),
    );
    assert.equal(r.tipo, "respuesta");
    return (r as { valor: { id: string } }).valor;
  };
  const cobrar = (n: NegocioDePrueba, orderId: string) =>
    tenantTransaction((tx) => cobrarPedidoEnTx(tx, n.id, { orderId, method: "EFECTIVO", actor: `user:${n.duenia.id}` }), { tenantId: n.id });
  const facturar = async (n: NegocioDePrueba, orderId: string) => {
    const total = Number((await duenio.order.findUniqueOrThrow({ where: { id: orderId }, select: { total: true } })).total);
    const id = await createInvoice({
      tenantId: n.id, concepto: 1, fecha: HOY,
      emisor: { cuit: 20111111112, condicionIva: "MONOTRIBUTO", puntoVenta: 1 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: total, iva: [{ alicuotaId: 3, base: total, importe: 0 }], total, vencimientoPago: HOY,
      origin: { type: "ORDER", id: orderId },
    });
    await despachar(n.id);
    return { id, total };
  };
  const ajustar = (n: NegocioDePrueba, productId: string, orderId: string, qty: number) =>
    tenantTransaction(
      (tx) =>
        ajustarPesoInTx(tx, n.id, {
          orderId, pedidas: [{ productId, qty }], actor: `user:${n.duenia.id}`, permiteNegativo: () => false,
          clave: `c-${randomUUID()}`, cerradoHasta: null, hoy, ahora: new Date(), arcaSimulado: true,
        }),
      { tenantId: n.id },
    );
  const notasDe = (facturaId: string) =>
    duenio.invoice.findMany({ where: { comprobanteAsociadoId: facturaId }, select: { total: true, status: true, cae: true } });

  const vA = await producto(a, 7777.77);

  await t.test("decimales: NC == EGRESO al centavo", async () => {
    const p = await tomar(a, vA.id, 1.333);
    await cobrar(a, p.id);
    const f = await facturar(a, p.id);
    const r = await ajustar(a, vA.id, p.id, 1.111);
    assert.equal(r.diferencia?.tipo, "devolver");
    const k = (r.notaDeCredito as { clave: string }).clave;
    const n = await nc.notaDeCreditoPorPeso(a.id, k, deps);
    assert.equal(n?.estado, "emitida");
    const eg = Number((await duenio.cashMovement.findFirstOrThrow({ where: { tenantId: a.id, orderId: p.id, type: "EGRESO" } })).amount);
    const notas = await notasDe(f.id);
    assert.equal(notas.length, 1);
    assert.equal(Math.round(Number(notas[0].total) * 100), Math.round(eg * 100), `NC ${notas[0].total} vs EGRESO ${eg}`);
  });

  await t.test("factura ya anulada entera: el ajuste se rechaza y la caja no devuelve nada", async () => {
    const p = await tomar(a, vA.id, 1);
    await cobrar(a, p.id);
    const f = await facturar(a, p.id);
    const m = await crearNotaDeCredito({ tenantId: a.id, facturaId: f.id, motivo: "anula todo", fecha: HOY });
    assert.equal(m.ok, true);
    await assert.rejects(() => ajustar(a, vA.id, p.id, 0.5), /anulada entera/);
    const egresos = await duenio.cashMovement.count({ where: { tenantId: a.id, orderId: p.id, type: "EGRESO" } });
    assert.equal(egresos, 0);
  });

  await t.test("aislamiento: clave de A pedida desde B = null; pendiente forjada en B con factura de A = rechazada", async () => {
    const p = await tomar(a, vA.id, 1);
    await cobrar(a, p.id);
    const f = await facturar(a, p.id);
    const r = await ajustar(a, vA.id, p.id, 0.9);
    const k = (r.notaDeCredito as { clave: string }).clave;
    assert.equal(await nc.notaDeCreditoPorPeso(b.id, k, deps), null);
    const forj = `ajuste-peso:nc:x:${randomUUID()}`;
    await duenio.auditLog.create({ data: { tenantId: b.id, actor: "x", action: "nc_peso_pendiente", entity: "NotaCreditoPorPeso", entityId: forj, channel: "admin", changes: { orderId: p.id, egresoId: "e", facturaId: f.id, importe: 100, code: 1 } } });
    const nb = await nc.notaDeCreditoPorPeso(b.id, forj, deps);
    assert.equal(nb?.estado, "rechazada");
    assert.equal((await notasDe(f.id)).length, 0, "B no emitió NC sobre la factura de A");
    await nc.notaDeCreditoPorPeso(a.id, k, deps);
  });

  await t.test("cron: más de 1000 notas ya resueltas no tapan a la pendiente nueva", async () => {
    const viejo = new Date(Date.now() - 86400000);
    await duenio.auditLog.createMany({
      data: Array.from({ length: 2002 }, (_, i) => ({ tenantId: a.id, actor: "system", action: i % 2 ? "nc_peso_emitida" : "nc_peso_pendiente", entity: "NotaCreditoPorPeso", entityId: `viejo-${Math.floor(i / 2)}`, channel: "admin", changes: { notaId: "x" }, createdAt: viejo })),
    });
    const p = await tomar(a, vA.id, 1);
    await cobrar(a, p.id);
    const f = await facturar(a, p.id);
    const r = await ajustar(a, vA.id, p.id, 0.8);
    const k = (r.notaDeCredito as { clave: string }).clave;
    assert.equal(await nc.notaDeCreditoPorPeso(a.id, k, fuera), null, "el clic no la emite (fuera de modo prueba en ese instante)");
    const re = await nc.reintentarNotasPorPesoPendientes(a.id, { deps });
    console.log("# ventana-1000: reintento", JSON.stringify(re), "notas", (await notasDe(f.id)).length);
    assert.equal(re.probadas, 1, "el cron debería ver la pendiente nueva");
  });
  await t.test("cron: una clave con pendientes duplicadas cuenta una vez; la ilegible se cierra y deja de acaparar", async () => {
    // Se limpian las abiertas que dejaron los casos anteriores para contar sólo las de este.
    await nc.reintentarNotasPorPesoPendientes(a.id, { deps, limite: 50 });
    const ilegible = { tenantId: a.id, actor: "system", action: "nc_peso_pendiente", entity: "NotaCreditoPorPeso", channel: "admin", changes: { roto: true } };
    await duenio.auditLog.createMany({
      data: [
        { ...ilegible, entityId: "dup" },
        { ...ilegible, entityId: "dup" },
        { ...ilegible, entityId: "otra" },
      ],
    });
    const r1 = await nc.reintentarNotasPorPesoPendientes(a.id, { deps, limite: 2 });
    assert.equal(r1.probadas, 2, "dos claves distintas, aunque «dup» tenga dos filas");
    assert.equal(r1.rechazadas, 2);
    const r2 = await nc.reintentarNotasPorPesoPendientes(a.id, { deps, limite: 2 });
    assert.equal(r2.probadas, 0, "las ilegibles quedaron cerradas");
  });
  await t.test("MEDIA: 20 pendientes con falla NO definitiva no acaparan el lote: la nueva se emite y las trabadas se cierran a los N intentos", async () => {
    // Las trabadas apuntan a una NOTA (no a una factura): «Eso ya es una nota», rechazo no definitivo.
    const p0 = await tomar(a, vA.id, 1);
    await cobrar(a, p0.id);
    const f0 = await facturar(a, p0.id);
    const m = await crearNotaDeCredito({ tenantId: a.id, facturaId: f0.id, motivo: "parcial", fecha: HOY, importe: 100 });
    assert.equal(m.ok, true);
    await despachar(a.id);
    const ncId = (m as { invoiceId: string }).invoiceId;
    assert.equal((await duenio.invoice.findUniqueOrThrow({ where: { id: ncId }, select: { status: true } })).status, "AUTHORIZED");
    const viejo = new Date(Date.now() - 86400000);
    await duenio.auditLog.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({ tenantId: a.id, actor: "system", action: "nc_peso_pendiente", entity: "NotaCreditoPorPeso", entityId: `trabada-${i}`, channel: "admin", changes: { orderId: p0.id, facturaId: ncId, importe: 50, code: 1 }, createdAt: viejo })),
    });
    const p = await tomar(a, vA.id, 1);
    await cobrar(a, p.id);
    const f = await facturar(a, p.id);
    const r = await ajustar(a, vA.id, p.id, 0.8);
    const k = (r.notaDeCredito as { clave: string }).clave;
    assert.equal(await nc.notaDeCreditoPorPeso(a.id, k, fuera), null);
    const corridas = [];
    for (let i = 0; i < 3; i++) {
      otraVuelta();
      corridas.push(await nc.reintentarNotasPorPesoPendientes(a.id, { deps: conReloj }));
    }
    console.log("# MEDIA corridas", JSON.stringify(corridas), "notas de la nueva", (await notasDe(f.id)).length);
    assert.equal((await notasDe(f.id)).length, 1, "la pendiente nueva debería emitirse en alguna corrida del cron");
    // Las trabadas se cierran al llegar a MAX_INTENTOS_NC_PESO, con el motivo a la vista; después el cron no las prueba más.
    for (let i = 0; i < MAX_INTENTOS_NC_PESO; i++) {
      otraVuelta();
      await nc.reintentarNotasPorPesoPendientes(a.id, { deps: conReloj });
    }
    const cerradas = await duenio.auditLog.findMany({
      where: { tenantId: a.id, entity: "NotaCreditoPorPeso", entityId: { startsWith: "trabada-" }, action: "nc_peso_cerrada" },
      select: { entityId: true, changes: true },
    });
    assert.equal(new Set(cerradas.map((c) => c.entityId)).size, 20, "las 20 trabadas quedan cerradas");
    assert.equal(cerradas.length, 20, "un solo cierre por clave");
    assert.match(String((cerradas[0].changes as { motivo?: string }).motivo), /Eso ya es una nota/);
    const intentos = await duenio.auditLog.count({ where: { tenantId: a.id, entityId: "trabada-0", action: "nc_peso_intento" } });
    assert.equal(intentos, MAX_INTENTOS_NC_PESO);
    const ultima = await nc.reintentarNotasPorPesoPendientes(a.id, { deps });
    assert.equal(ultima.probadas, 0, "ya no queda nada abierto");
    assert.equal((await notasDe(f.id)).length, 1, "una sola nota por clave");
  });
  await t.test("BAJA C1: dos crones a la vez son UNA vuelta: el intento cuenta una vez y la nota no se cierra antes de tiempo", async () => {
    const p0 = await tomar(a, vA.id, 1);
    await cobrar(a, p0.id);
    const f0 = await facturar(a, p0.id);
    const m = await crearNotaDeCredito({ tenantId: a.id, facturaId: f0.id, motivo: "parcial", fecha: HOY, importe: 100 });
    assert.equal(m.ok, true);
    await despachar(a.id);
    const ncId = (m as { invoiceId: string }).invoiceId;
    await duenio.auditLog.create({
      data: { tenantId: a.id, actor: "system", action: "nc_peso_pendiente", entity: "NotaCreditoPorPeso", entityId: "carrera", channel: "admin", changes: { orderId: p0.id, facturaId: ncId, importe: 50, code: 77 } },
    });
    const audit = (action: string) => duenio.auditLog.findMany({ where: { tenantId: a.id, entityId: "carrera", action }, select: { changes: true } });
    const intentos = async () => (await audit("nc_peso_intento")).map((f) => (f.changes as { intento: number }).intento).sort((x, y) => x - y);
    const dosALaVez = () => Promise.all([nc.reintentarNotasPorPesoPendientes(a.id, { deps: conReloj }), nc.reintentarNotasPorPesoPendientes(a.id, { deps: conReloj })]);
    for (let i = 0; i < MAX_INTENTOS_NC_PESO - 1; i++) {
      otraVuelta();
      await dosALaVez();
    }
    assert.deepEqual(await intentos(), [1, 2, 3, 4], "una vuelta con dos crones suma UN intento");
    assert.equal((await audit("nc_peso_cerrada")).length, 0, "con 4 vueltas todavía no se cierra");
    // Otro intento dentro de la misma ventana (p. ej. «Pesar y ajustar» repetido) tampoco suma.
    await nc.notaDeCreditoPorPeso(a.id, "carrera", conReloj);
    assert.equal((await intentos()).length, 4);
    otraVuelta();
    await dosALaVez();
    assert.deepEqual(await intentos(), [1, 2, 3, 4, 5]);
    assert.equal((await audit("nc_peso_cerrada")).length, 1, "se cierra a la 5.ª vuelta, una sola vez");
    assert.equal((await audit("nc_peso_rechazada")).length, 1);
  });
  await t.test("BAJA: las notas cerradas sin emitir se leen por negocio (aislamiento de B)", async () => {
    // «carrera» (A) quedó cerrada en el subtest anterior; «resuelta» (A) tiene cierre y emitida; «solo-b» es de B.
    const fila = (tenantId: string, entityId: string, action: string, changes: Record<string, string | number | boolean>) =>
      duenio.auditLog.create({ data: { tenantId, actor: "system", action, entity: "NotaCreditoPorPeso", entityId, channel: "admin", changes } });
    await fila(a.id, "resuelta", "nc_peso_cerrada", { motivo: "x" });
    await fila(a.id, "resuelta", "nc_peso_emitida", { notaId: "n", importe: 1 });
    await fila(b.id, "solo-b", "nc_peso_pendiente", { orderId: "o", facturaId: "f", importe: 12.5, code: 9 });
    await fila(b.id, "solo-b", "nc_peso_cerrada", { motivo: "La factura del pedido ya no está autorizada." });
    await fila(b.id, "carrera", "nc_peso_cerrada", { motivo: "de B" });
    const deA = await nc.notasPorPesoCerradasSinEmitir(a.id);
    const deB = await nc.notasPorPesoCerradasSinEmitir(b.id);
    const carrera = deA.find((n) => n.clave === "carrera");
    assert.ok(carrera, "la cerrada al 5.º intento aparece en Facturación");
    assert.match(carrera.motivo, /Se probó 5 veces y no se pudo emitir: .*Eso ya es una nota/);
    assert.equal(carrera.code, 77);
    assert.equal(carrera.importe, 50);
    assert.ok(carrera.fecha instanceof Date);
    assert.equal(deA.filter((n) => n.clave === "carrera").length, 1, "una por clave");
    assert.ok(!deA.some((n) => n.clave === "resuelta"), "la que se emitió no se muestra");
    assert.ok(!deA.some((n) => n.clave === "solo-b"), "A no ve las de B");
    // (B ya tiene otra cerrada del subtest de aislamiento: se miran sólo las de este.)
    const propias = deB.filter((n) => n.clave === "carrera" || n.clave === "solo-b");
    assert.ok(!deB.some((n) => n.clave === "resuelta"), "B no ve las de A");
    assert.deepEqual(propias.map((n) => [n.clave, n.motivo, n.code, n.importe]).sort(), [
      ["carrera", "de B", null, null],
      ["solo-b", "La factura del pedido ya no está autorizada.", 9, 12.5],
    ]);
    // El total es el real aunque la lista venga cortada: el aviso no se queda en el límite.
    const todasDeB = await nc.notasPorPesoCerradasSinEmitir(b.id);
    const cortada = await nc.notasPorPesoCerradasSinEmitir(b.id, 1);
    assert.equal(cortada.length, 1);
    assert.equal(cortada[0].total, todasDeB.length);
    assert.ok(todasDeB.length >= 2 && todasDeB.every((n) => n.total === todasDeB.length));
    assert.ok(deA.every((n) => n.total === deA.length), "el total de A no cuenta las de B");
  });
});
