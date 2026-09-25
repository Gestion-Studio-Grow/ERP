// El reintento del mostrador CONTRA POSTGRES, con el rol de la app (app_rls, sin BYPASSRLS) y
// RLS encendido: el alta de verdad (`insertOrder`) y la respuesta de verdad al reintento
// (`respuestaAlReintento`, la que llama `createOrder` en su rama de clave repetida). Es el
// camino que el refutador rompió: con la misma clave, otro cliente (R1), otra entrega (R2) u
// otro descuento (R4) volvían como "ya estaba registrada" y lo pedido se perdía sin aviso.
//
// Corre en una base efímera propia (src/test/base-efimera.ts: todas las migraciones, RLS y
// `app_rls`), donde se crea un negocio `qa-reintento-*` con sus productos, fichas y cupón. La base
// se borra al terminar. Sin Postgres local el test se saltea y lo dice; en CI, falla.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest } from "@/test/base-efimera";

test("contra Postgres (app_rls + RLS): el reintento con una clave grabada se compara con lo grabado", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  apuntarLaAppA(laBase);
  const e = process.env as Record<string, string | undefined>;
  Object.assign(e, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
  const { operatorPrisma } = await import("@/lib/operator-db");
  const { basePrisma } = await import("@/lib/prisma-base");
  const rol = await basePrisma.$queryRaw<{ bypass: boolean }[]>`
    SELECT rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`;
  assert.equal(rol[0]?.bypass, false, "la app tiene que correr con un rol sin BYPASSRLS");

  const { insertOrder, motivoDelRechazoDelAlta } = await import("@/lib/order-core");
  const { respuestaAlReintento } = await import("@/lib/respuesta-al-reintento");
  const { prisma } = await import("@/lib/prisma");

  const slug = `qa-reintento-${Date.now().toString(36)}`;
  const tn = await operatorPrisma.tenant.create({ data: { name: slug, slug, blueprintId: "carniceria", modules: ["pos", "catalog", "clients"] } });
  const tenantId = tn.id;
  try {
    const vacio = await operatorPrisma.product.create({
      data: { tenantId, name: "Vacío", saleUnit: "WEIGHT", pricePerKg: 12500, unit: "kg", trackStock: true, stock: 30 },
    });
    const entrana = await operatorPrisma.product.create({
      data: { tenantId, name: "Entraña", saleUnit: "WEIGHT", pricePerKg: 17500, unit: "kg", trackStock: true, stock: 0.5 },
    });
    const maria = await operatorPrisma.client.create({ data: { tenantId, name: "María Pérez", phone: "11 4000 0000" } });
    await operatorPrisma.client.create({ data: { tenantId, name: "Juan Gómez", phone: "11 5000 0000" } });
    await operatorPrisma.coupon.create({ data: { tenantId, code: "VERANO10", type: "PERCENT", value: 10, maxUses: 1 } });
    e.FORCE_TENANT_SLUG = slug;

    const base = {
      channel: "COUNTER" as const,
      fulfillment: "PICKUP" as const,
      customerName: "María Pérez",
      customerPhone: "11 4000 0000",
      address: null,
      notes: null,
      scheduledFor: null,
      paid: false,
      paymentMethod: null,
      items: [{ productId: vacio.id, qty: 1.24 }],
    };
    const ordenesCon = (idempotencyKey: string) => operatorPrisma.order.count({ where: { tenantId, idempotencyKey } });

    // ── R1: a cuenta de María; el reintento llega con Juan ────────────────────────────────
    const k1 = `qa-k1-${slug}`;
    const aCuenta = { idempotencyKey: k1, aCuenta: { createdBy: "user:qa" }, imputarCajaActor: "user:qa" };
    const r1 = await insertOrder(tenantId, base, aCuenta);
    assert.ok(!r1.dedup);
    const juan = await insertOrder(tenantId, { ...base, customerName: "Juan Gómez", customerPhone: "11 5000 0000" }, aCuenta);
    assert.equal(juan.dedup, true);
    assert.equal(juan.id, r1.id);
    const resp1 = await respuestaAlReintento(tenantId, juan, { conTicket: true });
    assert.equal(resp1.ok, false);
    assert.ok(!resp1.ok && resp1.tipo === "ya-grabada-distinta");
    assert.equal(resp1.grabada.code, r1.code);
    assert.equal(resp1.grabada.como, "a cuenta");
    assert.deepEqual(resp1.grabada.diferencias, ["Teléfono del cliente: se grabó 11 4000 0000; ahora 11 5000 0000."]);
    assert.equal(resp1.grabada.faltante, null, "otra deuda no se 'completa' con otra venta");
    assert.equal(
      resp1.error,
      `La venta #${r1.code} ya se había grabado con $15.500,00 (a cuenta, María Pérez). Lo que cambiaste (Teléfono del cliente: se grabó 11 4000 0000; ahora 11 5000 0000) no se registró.`,
    );
    // No se grabó nada nuevo: una venta, una deuda (de María), el stock descontado una vez.
    assert.equal(await ordenesCon(k1), 1);
    const deudas = await operatorPrisma.accountReceivable.findMany({ where: { tenantId }, select: { clientId: true, amount: true } });
    assert.deepEqual(deudas.map((d) => ({ clientId: d.clientId, amount: Number(d.amount) })), [{ clientId: maria.id, amount: 15500 }]);
    assert.equal((await operatorPrisma.product.findUniqueOrThrow({ where: { id: vacio.id } })).stock, 28.76);
    // El mismo reintento, igual (el teléfono escrito de otra forma): la grabada, con su ticket.
    const igual = await insertOrder(tenantId, { ...base, customerPhone: "1140000000" }, aCuenta);
    const resp1b = await respuestaAlReintento(tenantId, igual, { conTicket: true });
    assert.ok(resp1b.ok);
    assert.equal(resp1b.mensaje, `Esa venta ya estaba registrada (#${r1.code}): no se registró dos veces.`);
    assert.equal(resp1b.venta?.aCuenta, true);
    assert.equal(await ordenesCon(k1), 1);

    // ── R2: pedido con envío; el reintento llega para retirar, sin dirección ni horario ──
    const k2 = `qa-k2-${slug}`;
    const sabado = new Date("2026-09-26T13:00:00.000Z");
    const pedido = {
      ...base,
      channel: "ONLINE" as const,
      fulfillment: "DELIVERY" as const,
      address: "Av. Mitre 1234",
      scheduledFor: sabado,
      notes: "en milanesas",
      items: [{ productId: vacio.id, qty: 2 }],
    };
    const r2 = await insertOrder(tenantId, pedido, { idempotencyKey: k2 });
    const cambiado = await insertOrder(tenantId, { ...pedido, fulfillment: "PICKUP", address: null, scheduledFor: null }, { idempotencyKey: k2 });
    const resp2 = await respuestaAlReintento(tenantId, cambiado, { conTicket: true });
    assert.ok(!resp2.ok && resp2.tipo === "ya-grabada-distinta");
    assert.equal(resp2.grabada.esPedido, true);
    assert.deepEqual(resp2.grabada.diferencias, [
      "Entrega: se grabó «envío a domicilio»; ahora «retira en el local».",
      "Dirección: se grabó «Av. Mitre 1234»; ahora sin dirección.",
      "Horario: se grabó 26/09/2026 10:00; ahora sin horario.",
    ]);
    assert.match(resp2.error, new RegExp(`^El pedido #${r2.code} ya se había registrado con \\$25\\.000,00 \\(sin cobrar, María Pérez\\)\\.`));
    assert.equal(await ordenesCon(k2), 1);
    const grabado2 = await operatorPrisma.order.findUniqueOrThrow({ where: { id: r2.id } });
    assert.equal(grabado2.address, "Av. Mitre 1234", "lo grabado no se tocó");
    const igual2 = await respuestaAlReintento(tenantId, await insertOrder(tenantId, pedido, { idempotencyKey: k2 }), { conTicket: true });
    assert.ok(igual2.ok);
    assert.equal(igual2.mensaje, `Ese pedido ya estaba registrado (#${r2.code}): no se registró dos veces.`);

    // ── R4: cupón de UN uso; el reintento cambia el cupón por un 10 % a mano del mismo monto ──
    const k4 = `qa-k4-${slug}`;
    const efectivo = { ...base, customerName: "", customerPhone: "", paid: true, paymentMethod: "EFECTIVO" as const, items: [{ productId: vacio.id, qty: 1 }] };
    const r4 = await insertOrder(tenantId, efectivo, { idempotencyKey: k4, cupon: "VERANO10", imputarCajaActor: "user:qa" });
    assert.equal(r4.total, 11250);
    // El mismo cupón (ya agotado: lo gastó la grabada) → la misma venta.
    const mismoCupon = await respuestaAlReintento(
      tenantId,
      await insertOrder(tenantId, efectivo, { idempotencyKey: k4, cupon: "VERANO10", imputarCajaActor: "user:qa" }),
      { conTicket: true },
    );
    assert.ok(mismoCupon.ok, JSON.stringify(mismoCupon));
    assert.equal(mismoCupon.mensaje, `Esa venta ya estaba registrada (#${r4.code}): no se cobró dos veces.`);
    const aMano = await respuestaAlReintento(
      tenantId,
      await insertOrder(tenantId, efectivo, {
        idempotencyKey: k4,
        descuento: { pedido: { tipo: "porcentaje", valor: 10 }, topePct: null },
        imputarCajaActor: "user:qa",
      }),
      { conTicket: true },
    );
    assert.ok(!aMano.ok && aMano.tipo === "ya-grabada-distinta");
    assert.deepEqual(aMano.grabada.diferencias, ["Cupón: se grabó el cupón VERANO10; ahora sin cupón."]);
    assert.equal(await ordenesCon(k4), 1);
    assert.equal((await operatorPrisma.coupon.findFirstOrThrow({ where: { tenantId, code: "VERANO10" } })).usedCount, 1);
    assert.equal(await operatorPrisma.cashMovement.count({ where: { tenantId, orderId: r4.id } }), 1, "un solo asiento en el libro");

    // ── Anulada: el mismo reintento no la devuelve como cobrada ─────────────────────────
    await operatorPrisma.order.update({ where: { id: r4.id }, data: { status: "CANCELLED" } });
    const anulada = await respuestaAlReintento(
      tenantId,
      await insertOrder(tenantId, efectivo, { idempotencyKey: k4, cupon: "VERANO10", imputarCajaActor: "user:qa" }),
      { conTicket: true },
    );
    assert.ok(!anulada.ok && anulada.tipo === "ya-grabada-distinta");
    assert.equal(anulada.grabada.anulada, true);
    assert.deepEqual(anulada.grabada.diferencias, []);
    assert.equal(anulada.error, `La venta #${r4.code} ya se había grabado con $11.250,00 (cobrada en Efectivo) y después se anuló. No se volvió a cobrar.`);

    // ── Lo que la base decide sola NO es "lo que cambiaste" (refutador S1, S2, S3) ──────────
    const k6 = `qa-k6-${slug}`;
    const ana = { ...efectivo, customerName: "Ana", customerPhone: "11 7000 0000" };
    const r6 = await insertOrder(tenantId, ana, { idempotencyKey: k6, imputarCajaActor: "user:qa" });
    // S1: la dueña cambia el precio; S2: aparece la ficha de ese teléfono; S3: desactiva el producto.
    await operatorPrisma.product.update({ where: { id: vacio.id }, data: { pricePerKg: 13000 } });
    await operatorPrisma.client.create({ data: { tenantId, name: "Ana", phone: "1170000000" } });
    await operatorPrisma.product.update({ where: { id: vacio.id }, data: { active: false } });
    const reintento6 = await insertOrder(tenantId, ana, { idempotencyKey: k6, imputarCajaActor: "user:qa" });
    assert.equal(reintento6.dedup, true, "la clave se busca antes de validar: no es un rechazo");
    const resp6 = await respuestaAlReintento(tenantId, reintento6, { conTicket: true });
    assert.ok(resp6.ok, JSON.stringify(resp6));
    assert.equal(resp6.mensaje, `Esa venta ya estaba registrada (#${r6.code}): no se cobró dos veces.`);
    assert.equal(resp6.venta?.total, 12500, "el ticket es lo grabado, al precio de entonces");
    await operatorPrisma.product.update({ where: { id: vacio.id }, data: { active: true, pricePerKg: 12500 } });

    // ── Todo lo distinto es de más: lo que falta, con el nombre del producto (nunca su precio) ─
    const k7 = `qa-k7-${slug}`;
    await insertOrder(tenantId, efectivo, { idempotencyKey: k7, imputarCajaActor: "user:qa" });
    const conEntrana = await insertOrder(
      tenantId,
      { ...efectivo, items: [{ productId: vacio.id, qty: 1 }, { productId: entrana.id, qty: 0.3 }] },
      { idempotencyKey: k7, imputarCajaActor: "user:qa" },
    );
    const resp7 = await respuestaAlReintento(tenantId, conEntrana, { conTicket: true });
    assert.ok(!resp7.ok && resp7.tipo === "ya-grabada-distinta");
    assert.deepEqual(resp7.grabada.faltante, { productos: [{ productId: entrana.id, nombre: "Entraña", porPeso: true, cantidad: 0.3 }], aMano: [] });
    assert.match(resp7.error, /Lo que agregaste \(Entraña 0,3 kg\) no se registró\.$/);
    assert.equal(await ordenesCon(k7), 1);

    // ── Un rechazo de negocio de verdad (sin stock) es "no se cobró": y no quedó nada ─────
    let antes = await operatorPrisma.order.count({ where: { tenantId } });
    let rechazo: unknown = null;
    try {
      await insertOrder(tenantId, { ...efectivo, customerName: "", items: [{ productId: entrana.id, qty: 2 }] }, { idempotencyKey: `qa-k5-${slug}` });
    } catch (err) {
      rechazo = err;
    }
    assert.match(motivoDelRechazoDelAlta(rechazo) ?? "", /^Sin stock suficiente de "Entraña"/);
    assert.equal(await operatorPrisma.order.count({ where: { tenantId } }), antes, "el rechazo no grabó nada");

    // ── M4: rechazo de negocio con clave: ¿quedó algo grabado con ella? ──────────────────────
    const { rechazoDelAltaConClave } = await import("@/lib/respuesta-al-reintento");
    const { pedidoDelReintento } = await import("@/lib/reintento-de-venta");
    const ultima = await operatorPrisma.product.create({
      data: { tenantId, name: "Crema", saleUnit: "UNIT", price: 9000, unit: "u", trackStock: true, stock: 1 },
    });
    const crema = { ...efectivo, items: [{ productId: ultima.id, qty: 1 }] };
    const kGrabada = `qa-k8-${slug}`;
    await insertOrder(tenantId, crema, { idempotencyKey: kGrabada, imputarCajaActor: "user:qa" });
    // Otra clave, sin stock: rechazo; con esa clave no hay nada → `claveLibre` (la pantalla dice "no se cobró").
    const kNueva = `qa-k9-${slug}`;
    let sinStock: unknown = null;
    await insertOrder(tenantId, crema, { idempotencyKey: kNueva, imputarCajaActor: "user:qa" }).catch((e) => (sinStock = e));
    const motivoStock = motivoDelRechazoDelAlta(sinStock);
    assert.match(motivoStock ?? "", /^Sin stock suficiente de "Crema"/);
    assert.deepEqual(
      await rechazoDelAltaConClave(tenantId, kNueva, motivoStock!, { solicitado: pedidoDelReintento(crema), conTicket: true }),
      { ok: false, error: motivoStock, claveLibre: true },
    );
    // Con la clave de la que SÍ se grabó (el envío cortado ganó el stock): se contesta con ella.
    const conLaGrabada = await rechazoDelAltaConClave(tenantId, kGrabada, motivoStock!, { solicitado: pedidoDelReintento(crema), conTicket: true });
    assert.ok(conLaGrabada.ok && conLaGrabada.yaEstaba, JSON.stringify(conLaGrabada));

    // ── La vidriera pública NO encuentra claves de otro espacio (refutador rf-ext) ───────────
    // Un pedido de la ingesta externa (clave "ext:<número>", secuencial) y una venta del mostrador.
    const { claveDeLaVidriera, tomarPedidoOnlineGuarded, pedidoConClave } = await import("@/lib/order-core");
    await insertOrder(tenantId, { ...pedido, customerName: "Laura Víctima", address: "Calle Privada 742" }, { idempotencyKey: "ext:1001" });
    for (const ajena of ["ext:1001", k1]) {
      // Lo que hace `placeOnlineOrder` con la clave que manda un anónimo: no tiene la forma → sin clave.
      assert.equal(claveDeLaVidriera(ajena), null, ajena);
      // Y aunque llegara tal cual a la guarda, no se busca fuera del espacio `web:`.
      let tomo = false;
      const toma = await tomarPedidoOnlineGuarded({
        idempotencyKey: ajena,
        buscarPorClave: (k) => pedidoConClave(tenantId, k),
        revisarBolsa: async () => ({}),
        insertar: async () => {
          tomo = true;
          throw new Error("no se llega a grabar en este test");
        },
      });
      assert.notEqual(toma.tipo, "tomado", `la vidriera encontró ${ajena}`);
      assert.equal(tomo, true, "se intentó un alta nueva, sin devolver el pedido ajeno");
    }
    // La clave propia de la tienda sí se encuentra (el reintento del mismo carrito).
    const web = claveDeLaVidriera("6F1C2A3B-4D5E-4F60-8A7B-9C0D1E2F3A4B")!;
    assert.equal(web, "web:6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b");
    const propio = await insertOrder(tenantId, pedido, { idempotencyKey: web });
    const retoma = await tomarPedidoOnlineGuarded({
      idempotencyKey: web,
      buscarPorClave: (k) => pedidoConClave(tenantId, k),
      revisarBolsa: async () => ({}),
      insertar: async () => {
        throw new Error("no tenía que volver a grabar");
      },
    });
    assert.ok(retoma.tipo === "tomado" && retoma.pedido.id === propio.id);

    // Todo lo de arriba se leyó y escribió como la app (RLS): el negocio de al lado no ve nada.
    antes = await operatorPrisma.order.count({ where: { tenantId } });
    assert.equal(await prisma.order.count({ where: { tenantId } }), antes);
  } finally {
    // El negocio de prueba se va con la base efímera; los clientes de Prisma los cierra el arnés.
    delete e.FORCE_TENANT_SLUG;
  }
});
