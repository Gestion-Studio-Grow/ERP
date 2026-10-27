// ============================================================================
// UN SOLO FIADO Y LA CAJA DESDE VENDER CONTRA POSTGRES (Magra, tanda 2 · 2D)
// ============================================================================
//
// Con el rol de la app (app_rls, sin BYPASSRLS) y RLS encendido, ejecutando las Server Actions
// REALES con la sesión de la dueña o de la recepción:
//
//   · MG-058: «Queda a cobrar» (`entregarPedido`) de un pedido con ficha deja UNA deuda en la
//     cuenta del cliente (`AccountReceivable` con `orderId`) y el pedido saldado contra la cuenta;
//   · doble entrega (otra vez, y dos a la vez con dos usuarios): sigue habiendo UNA deuda;
//   · el pedido ya no se cobra como pedido (`cobrarPedido`: nada en el libro, nunca dos veces);
//   · cobro parcial de la cuenta con asiento en el libro (INGRESO con `collectionId`); de más, no;
//   · la ficha suma lo que debe (cuenta + pedidos entregados sin cobrar);
//   · sin ficha, o en un negocio sin cuentas corrientes: la entrega de siempre, sin deuda;
//   · aislamiento: desde B no se entrega, no se cobra ni se lee nada de A;
//   · MG-057: «Abrí la caja» con el fondo sugerido abre sin diferencia; «Conté otro» la asienta
//     UNA vez; el doble toque contesta «ya abierta» sin grabar nada.
//
// Base efímera propia (src/test/base-efimera.ts); sin Postgres local, se saltea y lo dice.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor, type SalidaDeAccion } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();

function formulario(pares: [string, string][]): FormData {
  const fd = new FormData();
  for (const [n, v] of pares) fd.append(n, v);
  return fd;
}

/** El `ok` de una respuesta de acción (puede venir null). */
function ok(r: unknown): boolean | undefined {
  return (r as { ok?: boolean } | null)?.ok;
}

/** El mensaje de una respuesta que salió bien (falla el test si no salió). */
function mensajeDe(r: unknown): string {
  const x = r as { ok?: boolean; mensaje?: string } | null;
  assert.equal(x?.ok, true, JSON.stringify(r));
  return x?.mensaje ?? "";
}

function valor<T>(s: SalidaDeAccion<T>): T {
  assert.equal(s.tipo, "respuesta", JSON.stringify(s));
  return (s as { valor: T }).valor;
}

test("un solo fiado contra Postgres: entrega a la cuenta, idempotencia, cobro parcial con asiento, aislamiento y la caja desde Vender", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  // La variable de siempre, apagada: lo que prende las cuentas corrientes en A es el interruptor.
  delete process.env.CUENTAS_CORRIENTES_ENABLED;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const modulos = ["pos", "catalog", "clients", "cuentas-a-cobrar"];
  for (const n of [base.a, base.b]) {
    await duenio.tenant.update({ where: { id: n.id }, data: { blueprintId: "carniceria", modules: modulos } });
  }
  const prender = (tenantId: string, entityId: string, action = "interruptor.encender") =>
    duenio.auditLog.create({
      data: { tenantId, actor: "operator:test", action, entity: "Interruptor", entityId, channel: "operador", changes: {} },
    });
  // A: mostrador boutique + cuentas corrientes. B: sólo el mostrador (cuentas corrientes sin tocar).
  await prender(base.a.id, "mostrador-boutique");
  await prender(base.a.id, "cuentas-corrientes");
  // «Trabaja por apps» (como Magra en el piloto): con él, la app de Fiado se abre por el módulo
  // asignado. Sin él y sin motor de perfiles, «Fiado y cuentas de clientes» no se abre en ningún
  // negocio, y entonces la entrega no deja la deuda en una cuenta que nadie podría cobrar.
  await prender(base.a.id, "inicio-por-apps");
  await prender(base.b.id, "mostrador-boutique");

  const { entregarPedido, cobrarPedido } = await import("@/lib/order-actions");
  const { registerReceivableCollection } = await import("@/app/admin/(dashboard)/cuentas-a-cobrar/actions");
  const { openCashSession, getAperturaEnVender } = await import("@/lib/caja-actions");
  const { cargarMostradorDeLaFicha } = await import("./fiado.server");
  const duenaA = { negocio: base.a, usuario: base.a.duenia };
  const recepA = { negocio: base.a, usuario: base.a.recepcion };
  const duenaB = { negocio: base.b, usuario: base.b.duenia };

  const ana = base.a.clientes[0];
  const deB = base.b.clientes[0];
  let code = 9000;
  const pedidoListo = async (tenantId: string, clientId: string | null, total: number) =>
    duenio.order.create({
      data: {
        tenantId,
        code: ++code,
        status: "READY",
        channel: "ONLINE",
        fulfillment: "PICKUP",
        clientId,
        customerName: "Ana UAT",
        customerPhone: "11 5555 1234",
        subtotal: total,
        total,
        items: { create: [{ tenantId, name: "Vacío", saleUnit: "WEIGHT", quantity: 0.9, unitPrice: total / 0.9, lineTotal: total }] },
      },
      select: { id: true, code: true },
    });
  const entregarSinCobrar = (sesion: typeof duenaA, id: string) =>
    ejecutarAccion(sesion, () => entregarPedido(null, formulario([["id", id], ["quedaACobrar", "on"]])));
  const deudasDe = (orderId: string) => duenio.accountReceivable.findMany({ where: { orderId }, select: { id: true, amount: true, clientId: true, concept: true, tenantId: true } });

  // ── 1 · MG-058: entregar sin cobrar deja UNA deuda en la cuenta de Ana ──────────────────────
  const p1 = await pedidoListo(base.a.id, ana, 25700);
  const r1 = valor(await entregarSinCobrar(duenaA, p1.id));
  assert.equal(ok(r1), true, JSON.stringify(r1));
  assert.match(mensajeDe(r1), /quedó en la cuenta de Ana UAT/);
  const o1 = await duenio.order.findUnique({ where: { id: p1.id }, select: { status: true, paid: true, paymentMethod: true } });
  assert.deepEqual(o1, { status: "DELIVERED", paid: true, paymentMethod: null }, "saldado contra la cuenta, sin medio");
  let d1 = await deudasDe(p1.id);
  assert.equal(d1.length, 1);
  assert.deepEqual([Number(d1[0].amount), d1[0].clientId, d1[0].concept, d1[0].tenantId], [25700, ana, `Pedido #${p1.code}`, base.a.id]);
  assert.equal(await duenio.cashMovement.count({ where: { orderId: p1.id } }), 0, "no entró plata: nada en el libro");

  // ── 2 · Doble entrega: otra vez, y dos a la vez con dos usuarios → UNA deuda ───────────────
  const r1b = valor(await entregarSinCobrar(duenaA, p1.id));
  assert.equal(ok(r1b), true);
  d1 = await deudasDe(p1.id);
  assert.equal(d1.length, 1, "la segunda entrega no crea otra deuda");
  const p2 = await pedidoListo(base.a.id, ana, 12345.67);
  const [ra, rb] = await Promise.all([entregarSinCobrar(duenaA, p2.id), entregarSinCobrar(recepA, p2.id)]);
  assert.equal(ok(valor(ra)), true, JSON.stringify(ra));
  assert.equal(ok(valor(rb)), true, JSON.stringify(rb));
  const d2 = await deudasDe(p2.id);
  assert.equal(d2.length, 1, "dos entregas a la vez: una sola deuda");
  assert.equal(Number(d2[0].amount), 12345.67);

  // ── 3 · El pedido ya no se cobra como pedido: nunca dos veces la misma plata ──────────────
  const rc = valor(await ejecutarAccion(duenaA, () => cobrarPedido(null, formulario([["id", p1.id], ["paymentMethod", "EFECTIVO"]]))));
  assert.equal(await duenio.cashMovement.count({ where: { orderId: p1.id } }), 0, `cobrarPedido no asienta nada: ${JSON.stringify(rc)}`);
  assert.equal(await duenio.collection.count({ where: { originId: p1.id } }), 0);

  // ── 4 · Cobro parcial de la cuenta, con su asiento en el libro ─────────────────────────────
  const cobrar = (sesion: typeof duenaA, id: string, monto: string, metodo = "EFECTIVO") =>
    ejecutarAccion(sesion, () => registerReceivableCollection({ estado: "inicial" } as never, formulario([["id", id], ["monto", monto], ["metodo", metodo]])));
  const c1 = valor(await cobrar(duenaA, d1[0].id, "10000"));
  assert.equal(c1.estado, "ok", JSON.stringify(c1));
  assert.match(c1.mensaje, /Queda debiendo/);
  assert.match(c1.mensaje, /libro de caja/, "con cuentas corrientes prendidas en el negocio, el cobro entra al libro");
  const cobros = await duenio.collection.findMany({ where: { originType: "RECEIVABLE", originId: d1[0].id }, select: { id: true, amount: true } });
  assert.deepEqual(cobros.map((c) => Number(c.amount)), [10000]);
  const asiento = await duenio.cashMovement.findMany({ where: { collectionId: cobros[0].id }, select: { type: true, amount: true, method: true, tenantId: true } });
  assert.deepEqual(asiento, [{ type: "INGRESO", amount: 10000, method: "EFECTIVO", tenantId: base.a.id }]);
  //   … de más, no: queda lo que había.
  const c2 = valor(await cobrar(duenaA, d1[0].id, "50000"));
  assert.equal(c2.estado, "error", JSON.stringify(c2));
  assert.equal(await duenio.collection.count({ where: { originType: "RECEIVABLE", originId: d1[0].id } }), 1);

  // ── 5 · La ficha: lo que debe Ana, uno solo ────────────────────────────────────────────────
  const ficha = valor(await ejecutarAccion(duenaA, () => cargarMostradorDeLaFicha(ana)));
  assert.ok(ficha);
  assert.equal(ficha.deuda.cuenta, 28045.67, "15.700 + 12.345,67");
  assert.equal(ficha.deuda.total, 28045.67);
  assert.ok(ficha.ultimos.some((u) => u.code === p1.code));

  // ── 6 · Sin ficha: la entrega de siempre («Entregado · a cobrar»), sin deuda ───────────────
  const p3 = await pedidoListo(base.a.id, null, 5000);
  const r3 = valor(await entregarSinCobrar(duenaA, p3.id));
  assert.equal(ok(r3), true);
  assert.match(mensajeDe(r3), /No tiene ficha de cliente/);
  assert.deepEqual(await duenio.order.findUnique({ where: { id: p3.id }, select: { status: true, paid: true } }), { status: "DELIVERED", paid: false });
  assert.equal((await deudasDe(p3.id)).length, 0);

  // ── 7 · B sin cuentas corrientes (nunca tocadas, variable apagada): la entrega de siempre ──
  const pb = await pedidoListo(base.b.id, deB, 7000);
  const rB = valor(await entregarSinCobrar(duenaB, pb.id));
  assert.equal(ok(rB), true);
  assert.match(mensajeDe(rB), /Entregado · a cobrar/);
  assert.deepEqual(await duenio.order.findUnique({ where: { id: pb.id }, select: { status: true, paid: true } }), { status: "DELIVERED", paid: false });
  assert.equal((await deudasDe(pb.id)).length, 0);

  // ── 7b · O-2: B con cuentas corrientes pero SIN «Trabaja por apps» → no deja una deuda que
  //    nadie podría cobrar, y lo DICE (nunca en silencio) ───────────────────────────────────
  await prender(base.b.id, "cuentas-corrientes");
  const pb2 = await pedidoListo(base.b.id, deB, 8000);
  const rB2 = valor(await entregarSinCobrar(duenaB, pb2.id));
  assert.equal(ok(rB2), true);
  assert.match(mensajeDe(rB2), /NO quedó en la cuenta del cliente.*Trabaja por apps.*Entregado · a cobrar/);
  assert.deepEqual(await duenio.order.findUnique({ where: { id: pb2.id }, select: { status: true, paid: true } }), { status: "DELIVERED", paid: false });
  assert.equal((await deudasDe(pb2.id)).length, 0);

  // ── 8 · Aislamiento: desde B nada de A ─────────────────────────────────────────────────────
  const p4 = await pedidoListo(base.a.id, ana, 3000);
  const rX = valor(await entregarSinCobrar(duenaB, p4.id));
  assert.equal(ok(rX), false, "un pedido de A no se encuentra desde B");
  assert.deepEqual(await duenio.order.findUnique({ where: { id: p4.id }, select: { status: true, paid: true } }), { status: "READY", paid: false });
  assert.equal((await deudasDe(p4.id)).length, 0);
  const cX = valor(await cobrar(duenaB, d1[0].id, "1000"));
  assert.equal(cX.estado, "error", "la cuenta de A no se cobra desde B");
  assert.equal(await duenio.collection.count({ where: { originType: "RECEIVABLE", originId: d1[0].id } }), 1);
  assert.equal(valor(await ejecutarAccion(duenaB, () => cargarMostradorDeLaFicha(ana))), null, "la ficha de A no se lee desde B");

  // ── 9 · MG-057: la caja desde Vender ───────────────────────────────────────────────────────
  const apA = valor(await ejecutarAccion(duenaA, () => getAperturaEnVender()));
  assert.ok(apA, "caja cerrada: hay tarjeta");
  assert.equal(apA.esperado, 10000, "el fondo sugerido es el efectivo del libro (el cobro del fiado)");
  assert.equal(apA.ultimoCierre, null);
  const movsA = () => duenio.cashMovement.count({ where: { tenantId: base.a.id } });
  const antes = await movsA();
  //   «Conté otro»: 12.000 contra 10.000 → la diferencia, UNA vez.
  const abrir = (sesion: typeof duenaA, fondo: string, esperado: number) =>
    ejecutarAccion(sesion, () => openCashSession(null, formulario([["openingFloat", fondo], ["esperadoConfirmado", String(esperado)]])));
  const o = valor(await abrir(duenaA, "12000", apA.esperado));
  assert.deepEqual(o, { ok: true });
  assert.equal(await movsA(), antes + 2, "la APERTURA del turno y UNA diferencia");
  const dif = await duenio.cashMovement.findMany({ where: { tenantId: base.a.id, sessionId: null, type: "INGRESO", amount: 2000 }, select: { id: true } });
  assert.equal(dif.length, 1);
  //   El doble toque: «ya abierta», nada grabado.
  const o2 = valor(await abrir(duenaA, "12000", apA.esperado));
  assert.deepEqual([o2?.ok, o2 && !o2.ok ? o2.yaAbierta : null], [false, true]);
  assert.equal(await movsA(), antes + 2);
  assert.equal(valor(await ejecutarAccion(duenaA, () => getAperturaEnVender())), null, "con la caja abierta, no hay tarjeta");
  //   B: «Abrir con $X» con el sugerido → sin diferencia.
  const apB = valor(await ejecutarAccion(duenaB, () => getAperturaEnVender()));
  assert.ok(apB);
  const movsB = await duenio.cashMovement.count({ where: { tenantId: base.b.id } });
  assert.deepEqual(valor(await abrir(duenaB, String(apB.esperado), apB.esperado)), { ok: true });
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: base.b.id } }), movsB + 1, "sólo la APERTURA: abrir con el sugerido no deja diferencia");
});
