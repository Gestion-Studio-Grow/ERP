// Delivery local · el «Entregué» del repartidor (token con propósito, una sola marca) y el viaje
// con varios pedidos (un WhatsApp, total de efectivo, cada pedido salido una vez).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACCION_ENTREGO,
  repartidorEntrego,
  rutaDeEntrega,
  tokenDeEntrega,
  verificarTokenDeEntrega,
  vistaDeLaEntrega,
  type DepsDeLaEntrega,
  type PedidoDeLaEntrega,
} from "./entrega";
import { tokenDeSeguimiento, verificarToken } from "./seguimiento";
import { mandarAlRepartidor, mandarViajeAlRepartidor, TOPE_DEL_VIAJE, type DepsDeLaSalida, type PedidoDelCajon } from "./salida";
import { efectivoDelViaje, mapaDeLaParada, textoDelViaje, type PedidoParaElRepartidor } from "./mensajes";

const SECRETO = "secreto-de-prueba-0123456789";
const NEGOCIO = "t-bitacora";
const OTRO = "t-otro";
const ID = "ord_bitacora_000001";

// ── El token ─────────────────────────────────────────────────────────────────────────────────────

test("token de entrega: vale para ESTE pedido de ESTE negocio", () => {
  const t = tokenDeEntrega(SECRETO, NEGOCIO, ID);
  assert.equal(verificarTokenDeEntrega(SECRETO, NEGOCIO, t), ID);
  assert.match(rutaDeEntrega(t), /^\/tienda\/entrega\//);
});

test("token de entrega: con propósito equivocado no sirve, en ninguna dirección", () => {
  const seguimiento = tokenDeSeguimiento(SECRETO, NEGOCIO, ID);
  const entrega = tokenDeEntrega(SECRETO, NEGOCIO, ID);
  assert.notEqual(seguimiento, entrega);
  assert.equal(verificarTokenDeEntrega(SECRETO, NEGOCIO, seguimiento), null, "el link del cliente no marca «Entregué»");
  assert.equal(verificarToken(SECRETO, NEGOCIO, entrega), null, "el link del repartidor no abre el seguimiento");
});

test("token de entrega: de otro negocio, con otro secreto o alterado → null", () => {
  const t = tokenDeEntrega(SECRETO, NEGOCIO, ID);
  assert.equal(verificarTokenDeEntrega(SECRETO, OTRO, t), null);
  assert.equal(verificarTokenDeEntrega("otro-secreto", NEGOCIO, t), null);
  const [id, firma] = t.split(".");
  const otraLetra = firma[0] === "A" ? "B" : "A";
  assert.equal(verificarTokenDeEntrega(SECRETO, NEGOCIO, `${id}.${otraLetra}${firma.slice(1)}`), null);
  assert.equal(verificarTokenDeEntrega(SECRETO, NEGOCIO, `ord_bitacora_000002.${firma}`), null, "la firma no se muda a otro pedido");
  assert.equal(verificarTokenDeEntrega(SECRETO, NEGOCIO, `${t}x`), null);
  assert.equal(verificarTokenDeEntrega(SECRETO, NEGOCIO, 42), null);
  assert.equal(verificarTokenDeEntrega("", NEGOCIO, t), null);
  assert.throws(() => tokenDeEntrega("", NEGOCIO, ID));
});

// ── La página y la acción ────────────────────────────────────────────────────────────────────────

function baseEntrega(p: Partial<PedidoDeLaEntrega> = {}) {
  const marcas: string[] = [];
  const deps: DepsDeLaEntrega = {
    pedido: async (tenantId, orderId) =>
      tenantId === NEGOCIO && orderId === ID ? { id: ID, code: 41, status: "READY", fulfillment: "DELIVERY", ...p } : null,
    yaAvisado: async (tenantId, orderId) => marcas.includes(`${tenantId}:${orderId}`),
    marcarEntregaUnaVez: async (tenantId, orderId) => {
      const k = `${tenantId}:${orderId}`;
      if (marcas.includes(k)) return "ya-estaba";
      marcas.push(k);
      return "grabada";
    },
  };
  return { deps, marcas };
}

const ctx = (token: unknown, tenantId = NEGOCIO, slug: string | null = "bitacora") => ({ tenantId, slug, secreto: SECRETO, token });

test("Entregué: doble toque = UN solo registro, y la página pasa a «ya avisaste»", async () => {
  const { deps, marcas } = baseEntrega();
  const t = tokenDeEntrega(SECRETO, NEGOCIO, ID);
  assert.deepEqual(await vistaDeLaEntrega(ctx(t), deps), { estado: "para-marcar", code: 41 });
  const [r1, r2] = await Promise.all([repartidorEntrego(ctx(t), deps), repartidorEntrego(ctx(t), deps)]);
  assert.equal(r1.ok && r2.ok, true);
  assert.equal(marcas.length, 1);
  const r3 = await repartidorEntrego(ctx(t), deps);
  assert.equal(r3.ok, true);
  if (r3.ok) assert.match(r3.mensaje, /Ya lo habías marcado/);
  assert.equal(marcas.length, 1);
  assert.deepEqual(await vistaDeLaEntrega(ctx(t), deps), { estado: "ya-avisado", code: 41 });
});

test("Entregué: otro negocio, token de seguimiento o delivery apagado → mensaje claro y nada grabado", async () => {
  const { deps, marcas } = baseEntrega();
  const t = tokenDeEntrega(SECRETO, NEGOCIO, ID);
  for (const c of [ctx(t, OTRO), ctx(tokenDeSeguimiento(SECRETO, NEGOCIO, ID)), ctx(t, NEGOCIO, null), { ...ctx(t), secreto: null }]) {
    const r = await repartidorEntrego(c, deps);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /no es de un pedido de este negocio/);
    const v = await vistaDeLaEntrega(c, deps);
    assert.equal(v.estado, "sin-efecto");
    assert.equal(v.code, null, "sin número: no se confirma que el pedido exista");
  }
  // El token de otro negocio verificado en el suyo da un pedido que acá no existe.
  const ajeno = tokenDeEntrega(SECRETO, OTRO, ID);
  assert.equal((await repartidorEntrego(ctx(ajeno), deps)).ok, false);
  assert.equal(marcas.length, 0);
});

test("Entregué: cancelado, ya entregado, sin salir o para retirar → sin efecto", async () => {
  const t = tokenDeEntrega(SECRETO, NEGOCIO, ID);
  const casos: [Partial<PedidoDeLaEntrega>, RegExp][] = [
    [{ status: "CANCELLED" }, /fue cancelado/],
    [{ status: "DELIVERED" }, /ya cerró el pedido #41/],
    [{ status: "PREPARING" }, /todavía no figura listo/],
    [{ fulfillment: "PICKUP" }, /no es de un pedido de este negocio/],
  ];
  for (const [p, motivo] of casos) {
    const { deps, marcas } = baseEntrega(p);
    const r = await repartidorEntrego(ctx(t), deps);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, motivo);
    assert.equal(marcas.length, 0);
  }
});

test("Entregué: el acceso a datos busca por {id, tenantId}, graba con candado y no toca el estado", () => {
  const src = readFileSync(new URL("../../app/tienda/entrega/[token]/datos.ts", import.meta.url), "utf8");
  assert.match(src, /where: \{ id: orderId, tenantId \}/);
  assert.match(src, /pg_advisory_xact_lock/);
  assert.ok(src.includes("action: ACCION_ENTREGO"));
  assert.ok(!/order\.(update|updateMany)\(/.test(src), "no cambia el pedido");
  assert.ok(!/customer(Name|Phone)|address/.test(src), "no lee datos del cliente");
  const accion = readFileSync(new URL("../../app/tienda/entrega/[token]/acciones.ts", import.meta.url), "utf8");
  assert.match(accion, /^"use server";/);
  assert.equal(ACCION_ENTREGO, "delivery-local:repartidor-entrego");
});

// ── El mensaje de a uno lleva el link ────────────────────────────────────────────────────────────

const PEDIDO: PedidoDelCajon = {
  id: ID,
  code: 41,
  status: "READY",
  fulfillment: "DELIVERY",
  customerName: "Ana Pérez",
  customerPhone: "11 5555-0101",
  address: "Alem 123",
  notes: null,
  total: 14_500,
  paid: false,
  items: [{ name: "Medialuna", quantity: 6 }],
};

function baseSalida(pedidos: Record<string, Partial<PedidoDelCajon>>, pagos: Record<string, unknown> = {}) {
  const salidas: string[] = [];
  const deps: DepsDeLaSalida = {
    pedido: async (tenantId, orderId) => (tenantId === NEGOCIO && pedidos[orderId] ? { ...PEDIDO, id: orderId, ...pedidos[orderId] } : null),
    cambiosDelAlta: async (tenantId, orderId) => (tenantId === NEGOCIO ? (pagos[orderId] ?? null) : null),
    marcarSalidaUnaVez: async (tenantId, orderId) => {
      const k = `${tenantId}:${orderId}`;
      if (salidas.includes(k)) return "ya-estaba";
      salidas.push(k);
      return "grabada";
    },
  };
  return { deps, salidas };
}

const efectivo = (pagaCon: number | null) => ({ entregaLocal: { pago: { medio: "efectivo", pagaCon } } });
const linkDeEntrega = (id: string) => `https://bitacora.example${rutaDeEntrega(tokenDeEntrega(SECRETO, NEGOCIO, id))}`;

test("mandarAlRepartidor: el WhatsApp lleva el link «Entregué» de ESE pedido; sin link, sale igual", async () => {
  const { deps } = baseSalida({ [ID]: {} });
  const r = await mandarAlRepartidor({ tenantId: NEGOCIO, slug: "bitacora", orderId: ID, linkDeEntrega }, deps);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const texto = decodeURIComponent(r.wa.split("text=")[1]);
  const link = /«Entregué»: (\S+)/.exec(texto)?.[1] ?? "";
  const token = decodeURIComponent(link.split("/tienda/entrega/")[1] ?? "");
  assert.equal(verificarTokenDeEntrega(SECRETO, NEGOCIO, token), ID);
  const sin = await mandarAlRepartidor({ tenantId: NEGOCIO, slug: "bitacora", orderId: ID, linkDeEntrega: () => null }, baseSalida({ [ID]: {} }).deps);
  assert.equal(sin.ok, true);
  if (sin.ok) assert.ok(!decodeURIComponent(sin.wa).includes("Entregué"));
});

// ── El viaje ─────────────────────────────────────────────────────────────────────────────────────

const A = "ord_bitacora_00000a";
const B = "ord_bitacora_00000b";
const C = "ord_bitacora_00000c";

test("viaje: total de efectivo con pagados mezclados, vuelto sumado y el sin confirmar aparte", () => {
  const base = { code: 1, negocio: "Bitácora", cliente: "x", telefono: "1", direccion: null, nota: null, renglones: [] };
  const paradas: PedidoParaElRepartidor[] = [
    { ...base, total: 10_000.1, pagado: false, medio: "efectivo", pagaCon: 20_000 },
    { ...base, total: 5_000.2, pagado: false, medio: "efectivo", pagaCon: null },
    { ...base, total: 99_999, pagado: true, medio: "efectivo", pagaCon: 100_000 },
    { ...base, total: 7_000, pagado: false, medio: "transferencia", pagaCon: null },
  ];
  const e = efectivoDelViaje(paradas);
  assert.equal(e.cobrar, 15_000.3, "sin arrastre de coma flotante");
  assert.equal(e.vuelto, 9_999.9);
  assert.equal(e.sinConfirmar, 1);
  const texto = textoDelViaje("Bitácora", paradas);
  assert.match(texto.split("\n")[1], /TOTAL A COBRAR EN EFECTIVO: \$15\.000/);
  assert.match(texto, /1 pedido sin pago confirmado/);
  assert.match(texto, /YA PAGÓ — no cobrar/);
});

test("mandarViajeAlRepartidor: UN WhatsApp con cada parada, cada pedido salido una vez", async () => {
  const { deps, salidas } = baseSalida(
    {
      [A]: { code: 41, address: "Alem 123", notes: "Ubicación: https://www.google.com/maps/search/?api=1&query=-38.0055,-57.5426 · timbre 2", total: 14_500 },
      [B]: { code: 42, address: "Colón 900", total: 8_000, paid: true },
      [C]: { code: 43, address: "Güemes 50", total: 3_000 },
    },
    { [A]: efectivo(20_000), [B]: efectivo(null), [C]: efectivo(null) },
  );
  const r = await mandarViajeAlRepartidor({ tenantId: NEGOCIO, slug: "bitacora", orderIds: [A, B, C, A], linkDeEntrega }, deps);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(salidas.length, 3);
  const texto = decodeURIComponent(r.wa.split("text=")[1]);
  assert.match(texto, /Viaje de 3 pedidos/);
  assert.match(texto, /TOTAL A COBRAR EN EFECTIVO: \$17\.500/);
  assert.match(texto, /Llevar \$5\.500 de cambio en total/);
  assert.match(texto, /Parada 1 · Pedido #41[\s\S]*Mapa: https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=-38\.0055,-57\.5426/);
  assert.match(texto, /Parada 3 · Pedido #43[\s\S]*Mapa: https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=G%C3%BCemes%2050/);
  assert.equal((texto.match(/«Entregué»: /g) ?? []).length, 3);
  // Otra vez: no se duplica ninguna salida.
  const r2 = await mandarViajeAlRepartidor({ tenantId: NEGOCIO, slug: "bitacora", orderIds: [A, B], linkDeEntrega }, deps);
  assert.equal(r2.ok, true);
  assert.equal(salidas.length, 3);
});

test("mandarViajeAlRepartidor: uno que no va → no sale NINGUNO, con el número que falló", async () => {
  for (const [malo, motivo] of [
    [{ status: "PREPARING" }, /#43 todavía no está «Listo»/],
    [{ fulfillment: "PICKUP" }, /#43 es para retirar/],
  ] as const) {
    const { deps, salidas } = baseSalida({ [A]: { code: 41 }, [C]: { code: 43, ...malo } });
    const r = await mandarViajeAlRepartidor({ tenantId: NEGOCIO, slug: "bitacora", orderIds: [A, C] }, deps);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, motivo);
    assert.equal(salidas.length, 0);
  }
  // De otro negocio: no se encuentra y nada se graba.
  const { deps, salidas } = baseSalida({ [A]: {}, [B]: {} });
  const ajeno = await mandarViajeAlRepartidor({ tenantId: OTRO, slug: "bitacora", orderIds: [A, B] }, deps);
  assert.equal(ajeno.ok, false);
  for (const orderIds of [[A], [A, A], "x", [A, "../x"], Array.from({ length: TOPE_DEL_VIAJE + 1 }, (_, i) => `ord_bitacora_${String(i).padStart(6, "0")}`)]) {
    assert.equal((await mandarViajeAlRepartidor({ tenantId: NEGOCIO, slug: "bitacora", orderIds }, deps)).ok, false);
  }
  assert.equal((await mandarViajeAlRepartidor({ tenantId: NEGOCIO, slug: null, orderIds: [A, B] }, deps)).ok, false);
  assert.equal(salidas.length, 0);
});

test("mapaDeLaParada: sólo coordenadas re-armadas; un link ajeno en la nota cae a la dirección", () => {
  assert.equal(mapaDeLaParada(null, "Ubicación: https://evil.example/?api=1&query=1,2"), null);
  assert.equal(
    mapaDeLaParada("Alem 1", "mirá https://evil.example/x https://www.google.com.evil/maps"),
    "https://www.google.com/maps/search/?api=1&query=Alem%201",
  );
  assert.equal(mapaDeLaParada("Alem\n1", null), "https://www.google.com/maps/search/?api=1&query=Alem%201");
});

test("acción del viaje: pide sesión del negocio antes de nada", () => {
  const src = readFileSync(new URL("../../app/admin/(dashboard)/pedidos/delivery-local/acciones.ts", import.meta.url), "utf8");
  const cuerpo = src.slice(src.indexOf("export async function mandarJuntosAlRepartidor"));
  assert.match(cuerpo.slice(0, 200), /const ctx = await contexto\(\);\s+if \(!ctx\) return/);
});
