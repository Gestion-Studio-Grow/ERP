// ============================================================================
// VENDER BOUTIQUE · EL COBRO EN UN VIAJE — la acción REAL contra Postgres efímero (tanda perf)
// ============================================================================
//
// `cobrarDelMostrador` con la sesión de cada usuario y RLS (`app_rls`), dos negocios en la base:
//   · C-2: el precio cambia entre el renglón y el cobro → se frena SIN grabar (ni venta ni caja) y
//     devuelve el de ahora; con el precio nuevo a la vista, se cobra a ese precio;
//   · un reintento de una venta ya grabada no se frena por el precio de hoy (lo contesta createOrder);
//   · C-4: dos envíos simultáneos del mismo cobro = UNA venta y UN movimiento de caja;
//   · B: con la misma clave graba la suya; un producto de A no se controla ni se vende desde B; el
//     control de precio de B mira sólo lo de B; nada de A cambia.
//   · sin `precioVisto` es `createOrder` tal cual (el camino del reintento y de registrar sin cobrar).

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();

test("cobro en un viaje: precio cambiado se frena sin grabar, doble envío = una venta, dos negocios aislados", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { cobrarDelMostrador } = await import("../acciones-del-mostrador");
  const { CAMPO_PRECIO_VISTO } = await import("./precio-del-renglon");

  // Sin tildes en la base: el clúster local es SQL_ASCII.
  const vacio = await duenio.product.create({
    data: { tenantId: base.a.id, name: "Vacio UAT", saleUnit: "WEIGHT", pricePerKg: 28600, unit: "kg", trackStock: false },
  });
  const chorizo = await duenio.product.create({
    data: { tenantId: base.a.id, name: "Chorizo UAT", saleUnit: "UNIT", price: 1900, unit: "u", trackStock: false },
  });
  const velaB = await duenio.product.create({
    data: { tenantId: base.b.id, name: "Vela UAT", saleUnit: "UNIT", price: 5000, unit: "u", trackStock: false },
  });

  type Renglon = { id: string; qty: string; price: number | null; pricePerKg: number | null };
  const formulario = (clave: string, renglones: Renglon[], conPrecios = true) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ channel: "COUNTER", fulfillment: "PICKUP", paid: "on", paymentMethod: "EFECTIVO", idempotencyKey: clave, conTicket: "1" }))
      fd.set(k, v);
    for (const r of renglones) {
      fd.append("productId", r.id);
      fd.append("quantity", r.qty);
      if (conPrecios) fd.append(CAMPO_PRECIO_VISTO, `${r.id}|${r.price ?? ""}|${r.pricePerKg ?? ""}`);
    }
    return fd;
  };
  const cobrar = async (quien: { negocio: typeof base.a; usuario: typeof base.a.duenia }, fd: FormData) => {
    const r = await ejecutarAccion(quien, () => cobrarDelMostrador(fd));
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: Awaited<ReturnType<typeof cobrarDelMostrador>> }).valor;
  };
  const duenaA = { negocio: base.a, usuario: base.a.duenia };
  const duenaB = { negocio: base.b, usuario: base.b.duenia };
  const foto = async (tenantId: string) => [
    await duenio.order.count({ where: { tenantId } }),
    await duenio.cashMovement.count({ where: { tenantId } }),
  ];
  const bAntes = await foto(base.b.id);

  // ── C-2: la pantalla sumó el vacío a $28.600; el dueño lo sube a $29.900 antes del cobro ──
  await duenio.product.update({ where: { id: vacio.id }, data: { pricePerKg: 29900 } });
  const aAntes = await foto(base.a.id);
  const frenado = await cobrar(
    duenaA,
    formulario("perf-1", [
      { id: vacio.id, qty: "1", price: null, pricePerKg: 28600 },
      { id: chorizo.id, qty: "2", price: 1900, pricePerKg: null },
    ]),
  );
  assert.ok(frenado && !frenado.ok && frenado.tipo === "precio-cambio", JSON.stringify(frenado));
  if (frenado && !frenado.ok && frenado.tipo === "precio-cambio") {
    assert.deepEqual(frenado.vigentes[vacio.id], { price: null, pricePerKg: 29900 });
    assert.deepEqual(frenado.cambios.map((c) => [c.id, c.antes, c.ahora]), [[vacio.id, 28600, 29900]]);
    assert.match(frenado.error, /Cambió un precio mientras cargabas/);
  }
  assert.deepEqual(await foto(base.a.id), aAntes, "no se grabó venta ni caja con el precio viejo");

  // Con el precio de ahora a la vista: se cobra a $29.900 (la misma clave estaba libre).
  const cobrada = await cobrar(
    duenaA,
    formulario("perf-1", [
      { id: vacio.id, qty: "1", price: null, pricePerKg: 29900 },
      { id: chorizo.id, qty: "2", price: 1900, pricePerKg: null },
    ]),
  );
  assert.ok(cobrada?.ok && cobrada.venta && !cobrada.yaEstaba, JSON.stringify(cobrada));
  assert.equal(cobrada?.ok ? cobrada.mensaje : "x", undefined, "sin aviso: lo grabado es lo que se veía");
  const orden = await duenio.order.findFirst({ where: { tenantId: base.a.id, idempotencyKey: "perf-1" }, include: { items: true } });
  assert.equal(orden?.total, 29900 + 3800);
  assert.equal(orden?.items.find((i) => i.productId === vacio.id)?.unitPrice, 29900);

  // Reintento de la ya grabada con el precio de ayer (la respuesta se había perdido y el dueño
  // volvió a cambiar el precio): no se frena; createOrder contesta la grabada, sin grabar otra.
  await duenio.product.update({ where: { id: vacio.id }, data: { pricePerKg: 31000 } });
  const reintento = await cobrar(
    duenaA,
    formulario("perf-1", [
      { id: vacio.id, qty: "1", price: null, pricePerKg: 29900 },
      { id: chorizo.id, qty: "2", price: 1900, pricePerKg: null },
    ]),
  );
  assert.ok(reintento?.ok && reintento.yaEstaba, JSON.stringify(reintento));
  assert.equal(await duenio.order.count({ where: { tenantId: base.a.id, idempotencyKey: "perf-1" } }), 1);

  // ── C-4: doble envío simultáneo del mismo cobro = UNA venta y UN movimiento de caja ──
  const antesDoble = await foto(base.a.id);
  const renglonesDoble = [{ id: chorizo.id, qty: "3", price: 1900, pricePerKg: null }];
  const [r1, r2] = await Promise.all([
    cobrar(duenaA, formulario("perf-doble", renglonesDoble)),
    cobrar(duenaA, formulario("perf-doble", renglonesDoble)),
  ]);
  assert.ok(r1?.ok && r2?.ok, JSON.stringify([r1, r2]));
  assert.equal([r1, r2].filter((r) => r?.ok && r.yaEstaba).length, 1, "uno grabó y el otro contestó la grabada");
  const despuesDoble = await foto(base.a.id);
  assert.deepEqual(despuesDoble, [antesDoble[0] + 1, antesDoble[1] + 1], "una venta y un asiento de caja");

  // ── Dos negocios ──
  const aAntesDeB = await foto(base.a.id);
  // B usa la MISMA clave que A: graba la suya (las claves son por negocio).
  const deB = await cobrar(duenaB, formulario("perf-doble", [{ id: velaB.id, qty: "1", price: 5000, pricePerKg: null }]));
  assert.ok(deB?.ok && !deB.yaEstaba, JSON.stringify(deB));
  assert.equal(await duenio.order.count({ where: { tenantId: base.b.id, idempotencyKey: "perf-doble" } }), 1);
  // El control de precio de B mira sólo lo de B: su vela subió y se frena; un id de A no cuenta.
  await duenio.product.update({ where: { id: velaB.id }, data: { price: 5500 } });
  const frenadoB = await cobrar(
    duenaB,
    formulario("perf-b-2", [{ id: velaB.id, qty: "1", price: 5000, pricePerKg: null }]),
  );
  assert.ok(frenadoB && !frenadoB.ok && frenadoB.tipo === "precio-cambio", JSON.stringify(frenadoB));
  if (frenadoB && !frenadoB.ok && frenadoB.tipo === "precio-cambio") {
    assert.deepEqual(Object.keys(frenadoB.vigentes), [velaB.id], "B no ve precios de A");
  }
  // B mandando un producto de A con el precio de A: no se controla (no es de B) y el alta lo rechaza.
  const ajeno = await cobrar(duenaB, formulario("perf-b-3", [{ id: vacio.id, qty: "1", price: null, pricePerKg: 31000 }]));
  assert.ok(ajeno && !ajeno.ok && ajeno.tipo !== "precio-cambio", JSON.stringify(ajeno));
  assert.deepEqual(await foto(base.a.id), aAntesDeB, "nada de A cambió por lo que hizo B");
  const bDespues = await foto(base.b.id);
  assert.deepEqual(bDespues, [bAntes[0] + 1, bAntes[1] + 1], "B: sólo su venta y su asiento");

  // ── Sin `precioVisto`: createOrder tal cual (reintento / registrar sin cobrar): sin control ──
  const sinControl = await cobrar(duenaA, formulario("perf-sin", [{ id: vacio.id, qty: "1", price: null, pricePerKg: 1 }], false));
  assert.ok(sinControl?.ok, JSON.stringify(sinControl));
  const ordenSin = await duenio.order.findFirst({ where: { tenantId: base.a.id, idempotencyKey: "perf-sin" } });
  assert.equal(ordenSin?.total, 31000, "el servidor cobra con la base, nunca con lo que manda la pantalla");
});
