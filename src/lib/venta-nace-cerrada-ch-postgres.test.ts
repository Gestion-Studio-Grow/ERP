// ============================================================================
// CH · LA VENTA COBRADA DE MOSTRADOR NACE CERRADA — sin mover stock, anulación ni reportes
// (UAT venta de productos, V.8)
// ============================================================================
//
// Con las Server Actions reales y la sesión de cada rol, la misma venta en dos negocios de servicios:
// `a` es CH (slug beauty-spa) y `b` el de control, que sigue como estaba. Cambia el estado de la venta
// y en qué lista de la bandeja cae. Todo lo demás —stock, libro, caja, Resultado, Margen y reporte de
// ventas— tiene que dar IGUAL en los dos, al vender y al anular.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type NegocioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { ventaNaceEntregada } from "@/lib/venta-reglas";

const laBase = baseEfimeraDelArchivo();

test("ventaNaceEntregada: CH sólo la cobrada del mostrador; el comercio como siempre; otro negocio de servicios, no", () => {
  const venta = { channel: "COUNTER", fulfillment: "PICKUP", paid: true, paymentMethod: "EFECTIVO", aCuenta: false };
  const ch = { isRetail: false, esEstetica: true };
  const comercio = { isRetail: true, esEstetica: false };
  const servicios = { isRetail: false, esEstetica: false };

  assert.equal(ventaNaceEntregada({ ...venta, ...ch }), true);
  assert.equal(ventaNaceEntregada({ ...venta, ...ch, paid: false, paymentMethod: null }), false, "sin cobrar sigue abierta");
  assert.equal(ventaNaceEntregada({ ...venta, ...ch, paid: true, paymentMethod: null, aCuenta: true }), false, "a cuenta: no se tocó en CH");
  assert.equal(ventaNaceEntregada({ ...venta, ...ch, channel: "ONLINE" }), false, "un pedido no");
  assert.equal(ventaNaceEntregada({ ...venta, ...ch, fulfillment: "DELIVERY" }), false, "con envío no");

  assert.equal(ventaNaceEntregada({ ...venta, ...comercio }), true);
  assert.equal(ventaNaceEntregada({ ...venta, ...comercio, paid: true, paymentMethod: null, aCuenta: true }), true);
  assert.equal(ventaNaceEntregada({ ...venta, ...servicios }), false);
});

test("CH: vender cobrado nace cerrado; anular devuelve plata y stock; stock, libro y reportes igual que el negocio de control", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "6", DB_CONNECT_TIMEOUT_MS: "15000" });
  const duenio = await prismaComoDuenio(base);
  await duenio.tenant.update({ where: { id: base.a.id }, data: { slug: "beauty-spa" } });

  const { createOrder, anularVenta, autorizarAnulacionVenta, getPosData } = await import("@/lib/order-actions");
  const { leerResultadoDelMes } = await import("@/lib/reports/resultado-lectura");
  const { leerVentasMostrador } = await import("@/lib/reports/ventas-mostrador-lectura");
  const { getMarginReport } = await import("@/lib/reports/margin-loader");
  const { getCierreDiarioData } = await import("@/lib/cierre-diario-actions");
  const { getLibroCajaData } = await import("@/lib/libro-caja-actions");
  const { todayInBusinessTz } = await import("@/lib/datetime");

  const hoy = todayInBusinessTz();
  const mes = hoy.slice(0, 7);
  const productoDe = new Map<string, string>();
  for (const negocio of [base.a, base.b]) {
    const p = await duenio.product.create({
      data: { tenantId: negocio.id, name: "Crema", saleUnit: "UNIT", price: 12_000, stock: 5, trackStock: true },
    });
    productoDe.set(negocio.id, p.id);
  }

  let n = 0;
  const vender = async (negocio: NegocioDePrueba, rol: "duenia" | "recepcion" = "recepcion") => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({
      channel: "COUNTER",
      fulfillment: "PICKUP",
      customerName: "Mostrador",
      paid: "on",
      paymentMethod: "EFECTIVO",
      idempotencyKey: `venta-ch-${++n}`,
    })) {
      fd.set(k, v);
    }
    fd.append("productId", productoDe.get(negocio.id)!);
    fd.append("quantity", "1");
    const r = await ejecutarAccion({ negocio, usuario: negocio[rol] }, () => createOrder(fd));
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    const v = (r as { valor: { ok: boolean } }).valor;
    assert.equal(v?.ok, true, JSON.stringify(r));
    const o = await duenio.order.findFirstOrThrow({ where: { tenantId: negocio.id }, orderBy: { createdAt: "desc" }, select: { id: true, status: true } });
    return o;
  };
  const respuesta = <R,>(r: { tipo: string; valor?: R }) => {
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return r.valor as R;
  };
  const anular = async (negocio: NegocioDePrueba, rol: "duenia" | "recepcion", id: string, codigo?: string) => {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("motivo", "Se cobró de más en la prueba");
    if (codigo) fd.set("codigo", codigo);
    return respuesta(await ejecutarAccion({ negocio, usuario: negocio[rol] }, () => anularVenta(null, fd)));
  };

  /** Todo lo que no puede cambiar, en números: lo mismo en los dos negocios. */
  const foto = async (negocio: NegocioDePrueba) => {
    const como = { negocio, usuario: negocio.duenia };
    const stock = (await duenio.product.findUniqueOrThrow({ where: { id: productoDe.get(negocio.id)! }, select: { stock: true } })).stock;
    const asientos = await duenio.cashMovement.findMany({
      where: { tenantId: negocio.id },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      select: { type: true, method: true, amount: true },
    });
    const movimientos = await duenio.stockMovement.count({ where: { tenantId: negocio.id } });
    const resultado = await leerResultadoDelMes(duenio as never, negocio.id, mes as never);
    const ventas = await leerVentasMostrador(duenio as never, negocio.id, hoy, 1);
    const cierre = respuesta(await ejecutarAccion(como, () => getCierreDiarioData()));
    const libro = respuesta(await ejecutarAccion(como, () => getLibroCajaData(mes)));
    const margen = respuesta(await ejecutarAccion(como, () => getMarginReport()));
    // Sin lo que es propio de cada negocio (ids, horas, número de venta): quedan los números.
    return JSON.parse(
      JSON.stringify(
        {
          stock: Number(stock),
          asientos: asientos.map((a) => `${a.type} ${a.method} ${Number(a.amount)}`),
          movimientos,
          resultado,
          ventas: { total: ventas.total, cantidad: ventas.cantidad, porMedio: ventas.porMedio, porProducto: ventas.porProducto },
          cierre,
          libro,
          margen,
        },
        (k, v) => {
          if (/(^id|Id|clave|referencia|At|^code|hora|desde|hasta)$/i.test(k)) return undefined;
          return typeof v === "string" ? v.replace(/#\d+/g, "#N") : v;
        },
      ),
    );
  };
  const bandeja = async (negocio: NegocioDePrueba) => {
    const d = respuesta(await ejecutarAccion({ negocio, usuario: negocio.recepcion }, () => getPosData({ productos: "no" })));
    return { abiertos: d.abiertos.map((o) => o.id), cerrados: d.cerrados.map((o) => o.id) };
  };

  // Antes de vender, los dos negocios son comparables.
  const sinVentas = await foto(base.b);
  assert.equal(sinVentas.stock, 5);

  // 1 · VENDER: el estado cambia sólo en CH.
  const enCH = await vender(base.a);
  const enControl = await vender(base.b);
  assert.equal(enCH.status, "DELIVERED", "en CH la venta cobrada nace cerrada");
  assert.equal(enControl.status, "CONFIRMED", "otro negocio de servicios sigue como estaba");

  // 2 · LA BANDEJA: en CH no queda como tarea, y sigue a mano en los cerrados para corregirla.
  const bandejaCH = await bandeja(base.a);
  assert.ok(!bandejaCH.abiertos.includes(enCH.id), "no queda «Para preparar»");
  assert.ok(bandejaCH.cerrados.includes(enCH.id), "queda en los cerrados, donde se anula");
  assert.ok((await bandeja(base.b)).abiertos.includes(enControl.id));

  // 3 · LO QUE NO PUEDE CAMBIAR: igual en los dos, y con los números de la venta.
  const vendido = await foto(base.a);
  assert.deepEqual(vendido, await foto(base.b));
  assert.equal(vendido.stock, 4, "bajó una unidad");
  assert.deepEqual(vendido.asientos, ["VENTA EFECTIVO 12000"]);
  assert.equal(vendido.ventas.total, 12_000);
  assert.equal(vendido.ventas.cantidad, 1);
  assert.equal(vendido.resultado.resultado, 12_000, "Resultado del mes");

  // 4 · ANULAR: la dueña, directo. Devuelve plata y stock; una sola vez.
  const anuladaCH = await anular(base.a, "duenia", enCH.id);
  assert.equal(anuladaCH?.ok, true, JSON.stringify(anuladaCH));
  assert.equal((await anular(base.b, "duenia", enControl.id))?.ok, true);
  assert.equal((await duenio.order.findUniqueOrThrow({ where: { id: enCH.id } })).status, "CANCELLED");
  const anulado = await foto(base.a);
  assert.deepEqual(anulado, await foto(base.b));
  assert.equal(anulado.stock, 5, "volvió al stock");
  assert.equal(anulado.ventas.total, 0, "el reporte de ventas no la cuenta");
  assert.equal(anulado.resultado.resultado, 0, "Resultado del mes");
  assert.equal(anulado.asientos.length, 2, "el asiento y su contrapartida");
  const repetida = await anular(base.a, "duenia", enCH.id);
  assert.equal((await foto(base.a)).stock, 5, `el doble clic no devuelve dos veces: ${JSON.stringify(repetida)}`);

  // 5 · RECEPCIÓN, nacida cerrada: como siempre, sin código no y con el de la dueña sí.
  const otra = await vender(base.a);
  assert.equal(otra.status, "DELIVERED");
  const sinCodigo = await anular(base.a, "recepcion", otra.id);
  assert.equal(sinCodigo?.ok, false, "sin el código de la dueña no se anula");
  assert.equal((await duenio.order.findUniqueOrThrow({ where: { id: otra.id } })).status, "DELIVERED");
  const fd = new FormData();
  fd.set("orderId", otra.id);
  const aut = respuesta(await ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, () => autorizarAnulacionVenta(fd))) as { ok: boolean; codigo?: string };
  assert.equal(aut?.ok, true, JSON.stringify(aut));
  const conCodigo = await anular(base.a, "recepcion", otra.id, aut.codigo);
  assert.equal(conCodigo?.ok, true, JSON.stringify(conCodigo));
  assert.equal((await foto(base.a)).stock, 5);
});
