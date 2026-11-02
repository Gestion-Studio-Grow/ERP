// ============================================================================
// CH · ANULAR POR LA FILA DE CERRADOS — la plata y el stock, contra Postgres efímero
// ============================================================================
//
// «¿Salió mal? Anular la venta» lleva a Pedidos, a Cerrados, y se anula con «Anular…» en la fila
// (anular-en-pedidos.test.ts). Acá, con las Server Actions reales y la sesión de cada rol: la venta
// recién hecha está en Cerrados, primera y anulable; lo que manda la fila (`camposDeLaAnulacion`, los
// campos de AnularDelPedido) la saca del total del día y de la caja, y devuelve el stock; con «La
// mercadería no volvió», la plata baja y el stock no vuelve. La otra venta del día no se mueve.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type NegocioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { aFormData, camposDeLaAnulacion } from "../pedidos/formularios-del-pedido";

const laBase = baseEfimeraDelArchivo();
const PRECIO = 12_000;

test("CH: la venta anulada por su fila de Cerrados baja del total y de la caja, y vuelve al stock", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "6", DB_CONNECT_TIMEOUT_MS: "15000" });
  const duenio = await prismaComoDuenio(base);
  await duenio.tenant.update({ where: { id: base.a.id }, data: { slug: "beauty-spa" } });

  const { createOrder, anularVenta, autorizarAnulacionVenta, getPosData } = await import("@/lib/order-actions");
  const { leerVentasMostrador } = await import("@/lib/reports/ventas-mostrador-lectura");
  const { armarTablero } = await import("../pedidos/tablero.server");
  const { alcanceDeAnulacion } = await import("@/lib/capabilities");
  const { todayInBusinessTz } = await import("@/lib/datetime");

  const negocio: NegocioDePrueba = base.a;
  const hoy = todayInBusinessTz();
  const producto = await duenio.product.create({
    data: { tenantId: negocio.id, name: "Crema", saleUnit: "UNIT", price: PRECIO, stock: 10, trackStock: true },
  });

  const respuesta = <R,>(r: { tipo: string; valor?: R }) => {
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return r.valor as R;
  };
  let n = 0;
  const vender = async () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({
      channel: "COUNTER",
      fulfillment: "PICKUP",
      customerName: "Mostrador",
      paid: "on",
      paymentMethod: "EFECTIVO",
      idempotencyKey: `cerrados-${++n}`,
    })) {
      fd.set(k, v);
    }
    fd.append("productId", producto.id);
    fd.append("quantity", "1");
    const v = respuesta(await ejecutarAccion({ negocio, usuario: negocio.recepcion }, () => createOrder(fd))) as { ok: boolean };
    assert.equal(v?.ok, true, JSON.stringify(v));
    const o = await duenio.order.findFirstOrThrow({ where: { tenantId: negocio.id }, orderBy: { createdAt: "desc" }, select: { id: true } });
    return o.id;
  };
  /** La fila de Cerrados de esa venta, armada como la arma la pantalla para ese rol. */
  const cerrados = async (rol: "duenia" | "recepcion") => {
    const d = respuesta(await ejecutarAccion({ negocio, usuario: negocio[rol] }, () => getPosData({ productos: "no" })));
    return armarTablero({
      abiertos: d.abiertos,
      cerrados: d.cerrados,
      comercio: false,
      hoy,
      local: null,
      links: new Map(),
      cupones: new Map(),
      avisados: new Map(),
      boutique: false,
      ofrecerLink: false,
      simulacion: false,
      alcance: alcanceDeAnulacion(rol === "duenia" ? "OWNER" : "RECEPTION"),
    }).cerrados;
  };
  /** Lo que el diálogo de la fila manda al servidor. */
  const anularPorLaFila = async (rol: "duenia" | "recepcion", id: string, extra: { stockNoVolvio?: boolean; codigo?: string } = {}) => {
    const fila = (await cerrados(rol))[0];
    assert.equal(fila.id, id, "la venta recién hecha es la primera de Cerrados");
    assert.equal(fila.anulable, true, `${rol}: la fila ofrece «Anular…»`);
    const fd = aFormData(camposDeLaAnulacion({ id: fila.id, motivo: "Se cobró de más en la prueba", stockNoVolvio: extra.stockNoVolvio ?? false, codigo: extra.codigo }));
    return respuesta(await ejecutarAccion({ negocio, usuario: negocio[rol] }, () => anularVenta(null, fd))) as { ok: boolean; error?: string };
  };
  const numeros = async () => {
    const stock = Number((await duenio.product.findUniqueOrThrow({ where: { id: producto.id }, select: { stock: true } })).stock);
    const ventas = await leerVentasMostrador(duenio as never, negocio.id, hoy, 1);
    const asientos = await duenio.cashMovement.findMany({ where: { tenantId: negocio.id }, select: { type: true, amount: true } });
    const caja = asientos.reduce((s, a) => s + (a.type === "EGRESO" ? -Number(a.amount) : Number(a.amount)), 0);
    return { stock, total: ventas.total, cantidad: ventas.cantidad, caja };
  };
  const estado = async (id: string) => (await duenio.order.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;

  // La otra venta del día: no se mueve en todo el recorrido.
  const queda = await vender();
  assert.deepEqual(await numeros(), { stock: 9, total: PRECIO, cantidad: 1, caja: PRECIO });

  // 1 · LA DUEÑA, directo: baja del total y de la caja, vuelve al stock.
  const deLaDuenia = await vender();
  assert.deepEqual(await numeros(), { stock: 8, total: 2 * PRECIO, cantidad: 2, caja: 2 * PRECIO });
  const r1 = await anularPorLaFila("duenia", deLaDuenia);
  assert.equal(r1?.ok, true, JSON.stringify(r1));
  assert.equal(await estado(deLaDuenia), "CANCELLED");
  assert.deepEqual(await numeros(), { stock: 9, total: PRECIO, cantidad: 1, caja: PRECIO });
  const anulada = (await cerrados("duenia")).find((f) => f.id === deLaDuenia);
  assert.equal(anulada?.status, "CANCELLED", "sigue en Cerrados, como anulada");
  assert.equal(anulada?.anulable, false, "y ya no se ofrece anularla otra vez");

  // 2 · RECEPCIÓN: sin el código no se mueve nada; con el de la dueña, igual que arriba.
  const deRecepcion = await vender();
  const antes = await numeros();
  assert.deepEqual(antes, { stock: 8, total: 2 * PRECIO, cantidad: 2, caja: 2 * PRECIO });
  const sinCodigo = await anularPorLaFila("recepcion", deRecepcion);
  assert.equal(sinCodigo?.ok, false, "sin el código de la dueña no se anula");
  assert.equal(await estado(deRecepcion), "DELIVERED");
  assert.deepEqual(await numeros(), antes);
  const aut = respuesta(
    await ejecutarAccion({ negocio, usuario: negocio.duenia }, () => autorizarAnulacionVenta(aFormData([["orderId", deRecepcion]]))),
  ) as { ok: boolean; codigo?: string };
  assert.equal(aut?.ok, true, JSON.stringify(aut));
  const conCodigo = await anularPorLaFila("recepcion", deRecepcion, { codigo: aut.codigo });
  assert.equal(conCodigo?.ok, true, JSON.stringify(conCodigo));
  assert.deepEqual(await numeros(), { stock: 9, total: PRECIO, cantidad: 1, caja: PRECIO });

  // 3 · «LA MERCADERÍA NO VOLVIÓ»: la plata baja, el stock no vuelve.
  const noVolvio = await vender();
  assert.deepEqual(await numeros(), { stock: 8, total: 2 * PRECIO, cantidad: 2, caja: 2 * PRECIO });
  const r3 = await anularPorLaFila("duenia", noVolvio, { stockNoVolvio: true });
  assert.equal(r3?.ok, true, JSON.stringify(r3));
  assert.deepEqual(await numeros(), { stock: 8, total: PRECIO, cantidad: 1, caja: PRECIO });

  assert.equal(await estado(queda), "DELIVERED", "la otra venta del día sigue en pie");
});
