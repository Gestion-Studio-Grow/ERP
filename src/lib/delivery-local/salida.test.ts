// Delivery local · las acciones del cajón (núcleo con datos inyectados) y lo que se lee del alta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACCION_SALIO,
  mandarAlRepartidor,
  pagoDelAlta,
  rutaDeSeguimiento,
  seguimientoParaElCliente,
  type DepsDeLaSalida,
  type PedidoDelCajon,
} from "./salida";
import { tokenDeSeguimiento, verificarToken } from "./seguimiento";

const NEGOCIO = "t-bitacora";
const OTRO = "t-otro";
const ID = "ord_bitacora_000001";

const PEDIDO: PedidoDelCajon = {
  id: ID,
  code: 41,
  status: "READY",
  fulfillment: "DELIVERY",
  customerName: "Ana Pérez",
  customerPhone: "11 5555-0101",
  address: "Alem 123",
  notes: "Paga en efectivo con $20.000 (llevar vuelto)",
  total: 14_500,
  paid: false,
  items: [{ name: "Medialuna", quantity: 6 }],
};

/** Base falsa: el pedido sólo existe en NEGOCIO; la salida se graba una vez. */
function base(p: Partial<PedidoDelCajon> = {}) {
  const salidas: string[] = [];
  const deps: DepsDeLaSalida = {
    pedido: async (tenantId, orderId) => (tenantId === NEGOCIO && orderId === ID ? { ...PEDIDO, ...p } : null),
    cambiosDelAlta: async (tenantId) =>
      tenantId === NEGOCIO ? { code: 41, entregaLocal: { ubicacion: null, pago: { medio: "efectivo", pagaCon: 20_000 } } } : null,
    marcarSalidaUnaVez: async (tenantId, lista) => {
      let nuevas = 0;
      for (const { id } of lista) {
        const k = `${tenantId}:${id}`;
        if (salidas.includes(k)) continue;
        salidas.push(k);
        nuevas += 1;
      }
      return { ok: true, nuevas };
    },
  };
  return { deps, salidas };
}

test("pagoDelAlta: lee medio y «paga con» de la fila del alta; lo raro da null", () => {
  assert.deepEqual(pagoDelAlta({ entregaLocal: { pago: { medio: "efectivo", pagaCon: 20000 } } }), { medio: "efectivo", pagaCon: 20000 });
  assert.deepEqual(pagoDelAlta({ entregaLocal: { pago: { medio: "transferencia", pagaCon: 5 } } }), { medio: "transferencia", pagaCon: null });
  assert.equal(pagoDelAlta({ entregaLocal: { pago: { medio: "bitcoin" } } }), null);
  assert.equal(pagoDelAlta({ entregaLocal: { pago: null } }), null);
  assert.equal(pagoDelAlta({ code: 1 }), null);
  assert.equal(pagoDelAlta(null), null);
  assert.equal(pagoDelAlta("x"), null);
});

test("mandarAlRepartidor: graba la salida UNA vez y arma el WhatsApp con cobro y vuelto", async () => {
  const { deps, salidas } = base();
  const r1 = await mandarAlRepartidor({ tenantId: NEGOCIO, slug: "bitacora", orderId: ID }, deps);
  assert.equal(r1.ok, true);
  if (!r1.ok) return;
  assert.match(r1.wa, /^https:\/\/wa\.me\/\?text=/);
  const texto = decodeURIComponent(r1.wa.split("text=")[1]);
  assert.match(texto, /Pedido #41/);
  assert.match(texto, /Alem 123/);
  assert.match(texto, /llevar \$5\.500 de vuelto/);
  const r2 = await mandarAlRepartidor({ tenantId: NEGOCIO, slug: "bitacora", orderId: ID }, deps);
  assert.equal(r2.ok, true);
  assert.deepEqual(salidas, [`${NEGOCIO}:${ID}`]);
  if (r2.ok) assert.match(r2.mensaje, /ya figuraba en camino/);
});

test("mandarAlRepartidor: el pedido de otro negocio no se encuentra y no se graba nada", async () => {
  const { deps, salidas } = base();
  const r = await mandarAlRepartidor({ tenantId: OTRO, slug: "bitacora", orderId: ID }, deps);
  assert.equal(r.ok, false);
  assert.deepEqual(salidas, []);
});

test("mandarAlRepartidor: sin el producto, retiro, no listo o id raro → rechazo sin grabar", async () => {
  for (const [ctx, p] of [
    [{ slug: "magra" }, {}],
    [{ slug: null }, {}],
    [{}, { fulfillment: "PICKUP" }],
    [{}, { status: "PREPARING" }],
    [{}, { status: "CANCELLED" }],
    [{ orderId: "x" }, {}],
    [{ orderId: { id: ID } }, {}],
  ] as const) {
    const { deps, salidas } = base(p as Partial<PedidoDelCajon>);
    const contexto: { tenantId: string; slug: string | null; orderId: unknown } = { tenantId: NEGOCIO, slug: "bitacora", orderId: ID };
    const r = await mandarAlRepartidor(Object.assign(contexto, ctx), deps);
    assert.equal(r.ok, false, JSON.stringify(ctx) + JSON.stringify(p));
    assert.deepEqual(salidas, []);
  }
});

test("seguimientoParaElCliente: link absoluto con token de ESTE negocio, al teléfono del pedido", async () => {
  const { deps } = base();
  const r = await seguimientoParaElCliente(
    {
      tenantId: NEGOCIO,
      slug: "bitacora",
      orderId: ID,
      origen: "https://bitacora.gsgapp.com.ar",
      token: (id) => tokenDeSeguimiento("s3cr3t", NEGOCIO, id),
      waAlCliente: (tel, texto) => `wa:${tel}:${texto}`,
    },
    deps,
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.ok(r.url?.startsWith("https://bitacora.gsgapp.com.ar/tienda/pedido/"));
  const token = decodeURIComponent(r.url!.split("/tienda/pedido/")[1]);
  assert.equal(verificarToken("s3cr3t", NEGOCIO, token), ID);
  assert.equal(verificarToken("s3cr3t", OTRO, token), null);
  assert.match(r.wa, /^wa:11 5555-0101:¡Hola Ana! .*#41 de Bitácora Café/);
  // Otro negocio: no hay pedido.
  const otro = await seguimientoParaElCliente(
    { tenantId: OTRO, slug: "bitacora", orderId: ID, origen: "https://x", token: () => "t", waAlCliente: () => "w" },
    deps,
  );
  assert.equal(otro.ok, false);
  // Teléfono que no es celular: rechazo con el link para copiar.
  const sinCel = await seguimientoParaElCliente(
    { tenantId: NEGOCIO, slug: "bitacora", orderId: ID, origen: "https://x", token: () => "t.k", waAlCliente: () => null },
    deps,
  );
  assert.equal(sinCel.ok, false);
});

test("rutaDeSeguimiento: la ruta pública del token", () => {
  assert.equal(rutaDeSeguimiento("abc.def"), "/tienda/pedido/abc.def");
});

// Las acciones "use server": permiso, tenant de la sesión igual al del host, y la marca con candado.
test("acciones del cajón: piden orders:manage ANTES de leer y buscan por {id, tenantId}", () => {
  const src = readFileSync(new URL("../../app/admin/(dashboard)/pedidos/delivery-local/acciones.ts", import.meta.url), "utf8");
  assert.match(src, /^"use server";/);
  const ctx = src.slice(src.indexOf("async function contexto"));
  assert.ok(ctx.indexOf('requireCapability("orders:manage")') < ctx.indexOf("prisma."), "el permiso va primero");
  assert.match(ctx, /tenantId !== \(await getCurrentTenantId\(\)\)\) return null/);
  assert.match(src, /where: \{ id: orderId, tenantId \}/);
  assert.match(src, /pg_advisory_xact_lock/);
  assert.ok(src.includes(`action: ACCION_SALIO`));
  for (const nombre of ["mandarAlRepartidor", "mandarSeguimientoAlCliente"]) {
    const cuerpo = src.slice(src.indexOf(`export async function ${nombre}`));
    assert.match(cuerpo.slice(0, 200), /const ctx = await contexto\(\);\s+if \(!ctx\) return/);
  }
  assert.equal(ACCION_SALIO, "delivery-local:salio");
});
