// ============================================================================
// ENVÍOS EN LA TIENDA · la acción REAL contra Postgres efímero (reingeniería Magra 1H)
// ============================================================================
//
// `placeOnlineOrder` como la ejecuta un anónimo de la vidriera, con RLS: el servidor lee la
// configuración de Envíos del negocio, ignora el costo que mande el navegador, graba el renglón
// «Envío · <zona>» con el costo de `costoDeEnvio`, frena el mínimo y la tienda pausada, y el otro
// negocio no ve las zonas. Lo puro está en src/tenants/storefront.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { sumarDias } from "./reglas-tienda";
import { CONFIG_MAGRA } from "./envio-de-la-tienda.fixture";

const laBase = baseEfimeraDelArchivo();

test("placeOnlineOrder: recalcula el envío con la zona de la base, ignora el costo del navegador, graba «Envío · <zona>»; mínimo, pausa y el otro negocio sin zonas (MG-032/034/036/037)", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { placeOnlineOrder } = await import("@/lib/order-actions");
  const { guardarConfigEnviosEnTx } = await import("@/lib/envios/config");

  const caja = await duenio.product.create({ data: { tenantId: base.a.id, name: "Caja parrillera", saleUnit: "UNIT", price: 45000, unit: "u", trackStock: false } });
  const chorizo = await duenio.product.create({ data: { tenantId: base.a.id, name: "Chorizo", saleUnit: "UNIT", price: 12000, unit: "u", trackStock: false } });
  const v1 = await guardarConfigEnviosEnTx(duenio as never, base.a.id, { config: CONFIG_MAGRA, actor: "test", versionLeida: null });

  const manana = sumarDias(dateStrInBusinessTz(new Date()), 1);
  const formulario = (o: Record<string, string>, productId: string) => {
    const fd = new FormData();
    const campos = { customerName: "Ana UAT", customerPhone: "11 5555 1234", fulfillment: "DELIVERY", address: "Los Álamos 123", ...o };
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    fd.append("productId", productId);
    fd.append("quantity", "1");
    return fd;
  };
  const tomar = (negocio: typeof base.a, fd: FormData) => ejecutarAccion({ negocio }, () => placeOnlineOrder(null, fd));
  const rechazo = (r: Awaited<ReturnType<typeof tomar>>) => (r.tipo === "respuesta" && r.valor && !r.valor.ok ? r.valor.error : null);

  // 1 · Envío a la zona, con un «costo» de $0 inventado en el formulario: no cuenta.
  const r = await tomar(base.a, formulario({ envioZona: "barrios", envioCosto: "0", envio: "0", shipping: "0", franja: "L-S 17-19", dia: manana, notes: "jugoso" }, caja.id));
  assert.equal(r.tipo, "redireccion", JSON.stringify(r));
  const pedido = await duenio.order.findFirst({
    where: { tenantId: base.a.id },
    orderBy: { createdAt: "desc" },
    select: { total: true, scheduledFor: true, notes: true, items: { select: { name: true, productId: true, lineTotal: true } } },
  });
  assert.ok(pedido);
  assert.equal(pedido.total, 49000);
  const envio = pedido.items.find((i) => i.productId === null);
  assert.deepEqual(envio && { name: envio.name, lineTotal: envio.lineTotal }, { name: "Envío · Canning – barrios cerrados", lineTotal: 4000 });
  assert.ok(pedido.scheduledFor && dateStrInBusinessTz(pedido.scheduledFor) === manana);
  assert.match(pedido.notes ?? "", /^Zona: Canning – barrios cerrados · Franja: L-S 17-19 \(.+\) · jugoso$/);

  const antes = await duenio.order.count({ where: { tenantId: base.a.id } });
  // 2 · Bajo el mínimo: no se graba y se dice cuánto falta y lo del retiro (MG-034).
  const minimo = await tomar(base.a, formulario({ envioZona: "barrios", franja: "L-S 17-19", dia: manana }, chorizo.id));
  assert.match(rechazo(minimo) ?? "", /te faltan \$8\.000/, JSON.stringify(minimo));
  // 3 · Una zona que no existe, o sin franja: tampoco.
  assert.ok(rechazo(await tomar(base.a, formulario({ envioZona: "gratis", franja: "L-S 17-19", dia: manana }, caja.id))));
  assert.match(rechazo(await tomar(base.a, formulario({ envioZona: "barrios" }, caja.id))) ?? "", /franja/);
  assert.equal(await duenio.order.count({ where: { tenantId: base.a.id } }), antes, "ninguno de los rechazos grabó");

  // 4 · Retiro en el local: sin mínimo ni envío.
  const retiro = await tomar(base.a, formulario({ fulfillment: "PICKUP", address: "" }, chorizo.id));
  assert.equal(retiro.tipo, "redireccion", JSON.stringify(retiro));
  const pedidoRetiro = await duenio.order.findFirst({ where: { tenantId: base.a.id }, orderBy: { createdAt: "desc" }, select: { total: true, items: { select: { productId: true } } } });
  assert.deepEqual([pedidoRetiro?.total, pedidoRetiro?.items.every((i) => i.productId !== null)], [12000, true]);

  // 5 · Tienda pausada (MG-036): el mensaje del dueño y nada grabado.
  await guardarConfigEnviosEnTx(duenio as never, base.a.id, {
    config: { ...CONFIG_MAGRA, tiendaPausada: { mensaje: "Hoy no tomamos pedidos por la web" } },
    actor: "test",
    versionLeida: v1,
  });
  const cuenta = await duenio.order.count({ where: { tenantId: base.a.id } });
  const pausa = await tomar(base.a, formulario({ fulfillment: "PICKUP", address: "" }, chorizo.id));
  assert.equal(rechazo(pausa), "Hoy no tomamos pedidos por la web");
  assert.equal(await duenio.order.count({ where: { tenantId: base.a.id } }), cuenta);

  // 6 · El otro negocio no ve las zonas de A: su envío no lleva renglón ni nota de esa zona (MG-037).
  const vela = await duenio.product.create({ data: { tenantId: base.b.id, name: "Vela", saleUnit: "UNIT", price: 20000, unit: "u", trackStock: false } });
  const rb = await tomar(base.b, formulario({ envioZona: "barrios" }, vela.id));
  assert.equal(rb.tipo, "redireccion", JSON.stringify(rb));
  const pedidoB = await duenio.order.findFirst({ where: { tenantId: base.b.id }, orderBy: { createdAt: "desc" }, select: { notes: true, items: { select: { name: true } } } });
  assert.ok(pedidoB && pedidoB.items.every((i) => !/Canning/.test(i.name)) && !/Canning/.test(pedidoB.notes ?? ""));
});
