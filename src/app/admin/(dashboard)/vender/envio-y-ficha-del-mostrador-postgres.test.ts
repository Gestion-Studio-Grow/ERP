// ============================================================================
// VENDER · EL ENVÍO POR ZONA Y LA FICHA ELEGIDA — la acción REAL contra Postgres efímero
// (reingeniería Magra, MG-030/031; cierra el cable que dejó 1B)
// ============================================================================
//
// `createOrder` como la ejecuta la dueña desde Vender, con su sesión y RLS (`app_rls`):
//   · pedido con envío a una zona → el renglón «Envío · <zona>» con el costo de la zona que dice la
//     BASE, aunque el formulario mande otro costo; el pago dividido suma el total CON el envío;
//   · el reintento con la misma clave y la misma zona es «ya estaba» (sin falso «distinta»); con
//     otra zona, «ya grabada distinta» y nada nuevo;
//   · en el mostrador no frenan el mínimo de la tienda ni la tienda pausada; sí la zona que falta;
//   · la ficha elegida (`clientId`) queda en el pedido y gana sobre la del teléfono; la de OTRO
//     negocio se rechaza con su motivo y no se graba nada;
//   · un negocio sin zonas, o un formulario que no trae el campo, sigue exactamente como hoy.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { CONFIG_MAGRA } from "@/app/tienda/envio-de-la-tienda.fixture";

const laBase = baseEfimeraDelArchivo();

test("createOrder (Vender): envío por zona decidido en el servidor, reintento con zona, mínimo/pausa no frenan el mostrador, ficha elegida y de otro negocio, sin zonas igual que hoy", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { createOrder } = await import("@/lib/order-actions");
  const { guardarConfigEnviosEnTx } = await import("@/lib/envios/config");
  const { FICHA_DE_OTRO_NEGOCIO } = await import("@/lib/order-core");

  const caja = await duenio.product.create({ data: { tenantId: base.a.id, name: "Caja parrillera", saleUnit: "UNIT", price: 45000, unit: "u", trackStock: false } });
  const chorizo = await duenio.product.create({ data: { tenantId: base.a.id, name: "Chorizo", saleUnit: "UNIT", price: 12000, unit: "u", trackStock: false } });
  const v1 = await guardarConfigEnviosEnTx(duenio as never, base.a.id, { config: CONFIG_MAGRA, actor: "test", versionLeida: null });

  let n = 0;
  const formulario = (o: Record<string, string | null>, productId: string, extra: [string, string][] = []) => {
    const fd = new FormData();
    const campos: Record<string, string | null> = {
      channel: "ONLINE",
      customerName: "Ana UAT",
      customerPhone: "11 5555 1234",
      fulfillment: "DELIVERY",
      address: "Los Álamos 123",
      idempotencyKey: `vender-envio-${++n}`,
      ...o,
    };
    for (const [k, v] of Object.entries(campos)) if (v !== null) fd.set(k, v);
    fd.append("productId", productId);
    fd.append("quantity", "1");
    for (const [k, v] of extra) fd.append(k, v);
    return fd;
  };
  const vender = (negocio: typeof base.a, fd: FormData) => ejecutarAccion({ negocio, usuario: negocio.duenia }, () => createOrder(fd));
  const valor = (r: Awaited<ReturnType<typeof vender>>) => {
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: Awaited<ReturnType<typeof createOrder>> }).valor;
  };
  const ultimo = (tenantId: string) =>
    duenio.order.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, total: true, clientId: true, items: { select: { name: true, productId: true, lineTotal: true } } },
    });
  const contar = (tenantId: string) => duenio.order.count({ where: { tenantId } });
  const renglonDeEnvio = (p: Awaited<ReturnType<typeof ultimo>>) => {
    const e = p?.items.find((i) => i.productId === null);
    return e ? { name: e.name, lineTotal: e.lineTotal } : null;
  };

  // 1 · MG-031: pedido con envío a «barrios» por $45.000 con un «costo» inventado en el formulario.
  const fd1 = formulario({ envioZona: "barrios", envioCosto: "0", envio: "0", shipping: "1", idempotencyKey: "vender-zona-1" }, caja.id);
  const r1 = valor(await vender(base.a, fd1));
  assert.equal(r1?.ok, true, JSON.stringify(r1));
  const p1 = await ultimo(base.a.id);
  assert.equal(p1?.total, 49000);
  assert.deepEqual(renglonDeEnvio(p1), { name: "Envío · Canning – barrios cerrados", lineTotal: 4000 });

  // 2 · El reintento IDÉNTICO (misma clave, misma zona): «ya estaba», sin falso «distinta».
  const antes = await contar(base.a.id);
  const r2 = valor(await vender(base.a, formulario({ envioZona: "barrios", idempotencyKey: "vender-zona-1" }, caja.id)));
  assert.deepEqual([r2?.ok, r2 && "yaEstaba" in r2 ? r2.yaEstaba : null], [true, true], JSON.stringify(r2));
  //   … con OTRA zona: «ya grabada distinta», la diferencia dicha en palabras y nada nuevo.
  const r3 = valor(await vender(base.a, formulario({ envioZona: "ezeiza", idempotencyKey: "vender-zona-1" }, caja.id)));
  assert.ok(r3 && !r3.ok && r3.tipo === "ya-grabada-distinta", JSON.stringify(r3));
  assert.ok(
    r3.grabada.diferencias.some((d) => /Zona de envío: se grabó «Canning – barrios cerrados»; ahora «Ezeiza \/ Monte Grande»/.test(d)),
    JSON.stringify(r3.grabada.diferencias),
  );
  assert.equal(await contar(base.a.id), antes, "ningún reintento grabó otro pedido");

  // 3 · Cobrado con pago dividido: los pagos suman el total CON el envío ($49.000) y se graba.
  const r4 = valor(
    await vender(
      base.a,
      formulario({ envioZona: "barrios", paymentMethod: "EFECTIVO", pagado: "1", paid: "on" }, caja.id, [
        ["pago.medio", "EFECTIVO"],
        ["pago.monto", "30000"],
        ["pago.medio", "TRANSFERENCIA"],
        ["pago.monto", "19000"],
      ]),
    ),
  );
  assert.equal(r4?.ok, true, JSON.stringify(r4));
  assert.equal((await ultimo(base.a.id))?.total, 49000);

  // 4 · El mínimo de envío de la tienda ($20.000) no frena el mostrador: Chorizo $12.000 + $4.000.
  const r5 = valor(await vender(base.a, formulario({ envioZona: "barrios" }, chorizo.id)));
  assert.equal(r5?.ok, true, JSON.stringify(r5));
  const p5 = await ultimo(base.a.id);
  assert.deepEqual([p5?.total, renglonDeEnvio(p5)?.lineTotal], [16000, 4000]);
  //   … la tienda pausada tampoco (pausar es dejar de tomar pedidos por la web).
  await guardarConfigEnviosEnTx(duenio as never, base.a.id, {
    config: { ...CONFIG_MAGRA, tiendaPausada: { mensaje: "Hoy no tomamos pedidos por la web" } },
    actor: "test",
    versionLeida: v1,
  });
  const r6 = valor(await vender(base.a, formulario({ envioZona: "ezeiza" }, caja.id)));
  assert.equal(r6?.ok, true, JSON.stringify(r6));
  const p6 = await ultimo(base.a.id);
  assert.deepEqual([p6?.total, renglonDeEnvio(p6)], [51000, { name: "Envío · Ezeiza / Monte Grande", lineTotal: 6000 }]);

  // 5 · La zona SÍ se exige: vacía o una que no existe → rechazo con su motivo y nada grabado.
  const cuenta = await contar(base.a.id);
  const sinZona = valor(await vender(base.a, formulario({ envioZona: "" }, caja.id)));
  assert.ok(sinZona && !sinZona.ok && /zona/i.test(sinZona.error), JSON.stringify(sinZona));
  const inventada = valor(await vender(base.a, formulario({ envioZona: "gratis" }, caja.id)));
  assert.ok(inventada && !inventada.ok && /zona/i.test(inventada.error), JSON.stringify(inventada));
  assert.equal(await contar(base.a.id), cuenta, "los rechazos de zona no grabaron");

  // 6 · La ficha elegida queda en el pedido y GANA sobre la del teléfono.
  const delTelefono = await duenio.client.create({ data: { tenantId: base.a.id, name: "Ana por teléfono", phone: "11 5555 1234" } });
  const elegida = base.a.clientes[0];
  const r7 = valor(await vender(base.a, formulario({ fulfillment: "PICKUP", address: "", clientId: elegida }, chorizo.id)));
  assert.equal(r7?.ok, true, JSON.stringify(r7));
  assert.equal((await ultimo(base.a.id))?.clientId, elegida);
  //   … sin ficha elegida, la del teléfono (lo de siempre).
  const r8 = valor(await vender(base.a, formulario({ fulfillment: "PICKUP", address: "" }, chorizo.id)));
  assert.equal(r8?.ok, true, JSON.stringify(r8));
  assert.equal((await ultimo(base.a.id))?.clientId, delTelefono.id);
  //   … la ficha de OTRO negocio (o una que no existe): rechazo claro, nada grabado.
  const cuenta2 = await contar(base.a.id);
  const ajena = valor(await vender(base.a, formulario({ fulfillment: "PICKUP", address: "", clientId: base.b.clientes[0] }, chorizo.id)));
  assert.deepEqual(ajena && !ajena.ok ? ajena.error : null, FICHA_DE_OTRO_NEGOCIO, JSON.stringify(ajena));
  const inexistente = valor(await vender(base.a, formulario({ clientId: "cli_que_no_existe", envioZona: "barrios" }, caja.id)));
  assert.deepEqual(inexistente && !inexistente.ok ? inexistente.error : null, FICHA_DE_OTRO_NEGOCIO);
  assert.equal(await contar(base.a.id), cuenta2, "la ficha ajena no grabó nada");

  // 7 · Un formulario que no trae el campo de zona (el POS de la bandeja): como hoy, sin renglón.
  const r9 = valor(await vender(base.a, formulario({ envioZona: null }, chorizo.id)));
  assert.equal(r9?.ok, true, JSON.stringify(r9));
  const p9 = await ultimo(base.a.id);
  assert.deepEqual([p9?.total, renglonDeEnvio(p9)], [12000, null]);

  // 8 · Sin zonas (el negocio B: CH, Shine): con o sin el campo, nada cambia — ni renglón ni rechazo.
  const vela = await duenio.product.create({ data: { tenantId: base.b.id, name: "Vela", saleUnit: "UNIT", price: 20000, unit: "u", trackStock: false } });
  for (const envioZona of ["barrios", ""]) {
    const rb = valor(await vender(base.b, formulario({ envioZona }, vela.id)));
    assert.equal(rb?.ok, true, JSON.stringify(rb));
    const pb = await ultimo(base.b.id);
    assert.deepEqual([pb?.total, renglonDeEnvio(pb)], [20000, null]);
  }
});
