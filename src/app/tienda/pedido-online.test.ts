// ============================================================================
// TIENDA ONLINE — lo que el pedido online decide, EJECUTADO con los números del criterio.
// ============================================================================
//
//   · Pedir más de lo que hay → el aviso va en ESA línea, sin decir cuánto hay.
//   · Envío $3.500 → el pedido de la bandeja suma $3.500: el alta REAL (`decidirAlta` +
//     `crearOrdenEnTx`) contra una base falsa que anota lo que se escribe, con la tarifa de la
//     marca que la tiene (Shine: $3.500, gratis desde $25.000). MAGRA no tiene tarifa: su envío
//     es gratis y el pedido no suma nada.
//   · «Pedir por WhatsApp» → el mensaje sale con el número del pedido registrado.
//   · MAGRA deja de prometer débito y crédito (su copy de marca y la franja de su vidriera).

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@/generated/prisma/client";
import {
  crearOrdenEnTx,
  decidirAlta,
  insertOrderGuarded,
  tomarPedidoOnlineGuarded,
  CuponRechazado,
  type InsertedOrder,
  type OrderInput,
} from "@/lib/order-core";
import { getStorefrontCopy } from "@/tenants/storefront";
import { descuentoDelAjuste, envioDeLasLineas, esLineaDeEnvio, NOMBRE_LINEA_ENVIO, validarLineaAMano } from "@/lib/venta-reglas";
import { MAGRA } from "@/tenants/magra-content";
import {
  disponibilidadDe,
  etiquetaDeDisponibilidad,
  mensajeWhatsAppDelPedido,
  problemasDeLaBolsa,
  propuestasConMediosDeLaMarca,
  textoDeMediosDePago,
  type ProductoParaBolsa,
} from "./reglas-tienda";

const VACIO: ProductoParaBolsa = {
  id: "p_vacio",
  trackStock: true,
  stock: 2.5,
  active: true,
  deletedAt: null,
  saleUnit: "WEIGHT",
  price: null,
  pricePerKg: 12500,
};

test("pedir más stock del que hay: el aviso va en la línea y no dice cuánto queda", () => {
  const p = problemasDeLaBolsa([VACIO], [{ productId: "p_vacio", qty: 3 }]);
  assert.deepEqual(Object.keys(p), ["p_vacio"]);
  assert.match(p.p_vacio, /No nos alcanza para esa cantidad/);
  assert.doesNotMatch(p.p_vacio, /2[.,]5/, "el stock no se publica");
  // Justo lo que hay, pasa; sumando dos líneas del mismo producto, no.
  assert.deepEqual(problemasDeLaBolsa([VACIO], [{ productId: "p_vacio", qty: 2.5 }]), {});
  assert.deepEqual(Object.keys(problemasDeLaBolsa([VACIO], [{ productId: "p_vacio", qty: 1.5 }, { productId: "p_vacio", qty: 1.5 }])), ["p_vacio"]);
});

test("sin stock, dado de baja o sin precio: cada línea dice lo suyo; sin control de stock, se vende", () => {
  const agotado = { ...VACIO, id: "a", stock: 0 };
  const pausado = { ...VACIO, id: "b", active: false };
  const sinPrecio = { ...VACIO, id: "c", pricePerKg: null };
  const libre = { ...VACIO, id: "d", trackStock: false, stock: -4 };
  const p = problemasDeLaBolsa(
    [agotado, pausado, sinPrecio, libre],
    ["a", "b", "c", "d", "e"].map((productId) => ({ productId, qty: 1 })),
  );
  assert.match(p.a, /Se agotó/);
  assert.match(p.b, /Ya no está a la venta/);
  assert.match(p.c, /Ya no está a la venta/);
  assert.equal(p.d, undefined, "un producto sin control de stock no se frena");
  assert.match(p.e, /Ya no está a la venta/, "un id que no es del negocio");
});

test("la vidriera dice 'Sin stock' o 'Últimas unidades', nunca el número", () => {
  assert.equal(disponibilidadDe({ trackStock: true, stock: 0, lowStockAt: 5 }), "sin-stock");
  assert.equal(disponibilidadDe({ trackStock: true, stock: -1.2, lowStockAt: 5 }), "sin-stock");
  assert.equal(disponibilidadDe({ trackStock: true, stock: 4, lowStockAt: 5 }), "ultimas");
  assert.equal(disponibilidadDe({ trackStock: true, stock: 5, lowStockAt: 5 }), "ultimas");
  assert.equal(disponibilidadDe({ trackStock: true, stock: 5.5, lowStockAt: 5 }), null);
  assert.equal(disponibilidadDe({ trackStock: false, stock: 0, lowStockAt: 5 }), null, "sin control, sin etiqueta");
  assert.equal(etiquetaDeDisponibilidad("sin-stock"), "Sin stock");
  assert.equal(etiquetaDeDisponibilidad("ultimas"), "Últimas unidades");
  assert.equal(etiquetaDeDisponibilidad(null), null);
});

// ── El envío entra como línea del pedido ─────────────────────────────────────

const VELA = { id: "p_vela", name: "Vela de soja", saleUnit: "UNIT" as const, price: 10000, pricePerKg: null, trackStock: true };

const PEDIDO_ONLINE: OrderInput = {
  channel: "ONLINE",
  fulfillment: "DELIVERY",
  customerName: "Ana",
  customerPhone: "11 4000-7919",
  address: "Av. Mitre 1234",
  notes: null,
  scheduledFor: null,
  paid: false,
  paymentMethod: null,
  items: [{ productId: "p_vela", qty: 2 }],
};

/** Base falsa: anota el `create` de la orden. */
function txFalsa() {
  const creadas: Record<string, unknown>[] = [];
  const tx = {
    order: {
      findFirst: async () => ({ code: 40 }),
      create: async (a: { data: Record<string, unknown> }) => {
        creadas.push(a.data);
        return { id: "ord_41", code: 41 };
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, creadas };
}

test("envío $3.500: el servidor lo calcula con la tarifa de la marca y el pedido de la bandeja lo suma", async () => {
  const envio = getStorefrontCopy("shinevelas")?.shipping ?? null;
  assert.deepEqual(envio, { flatRate: 3500, freeThreshold: 25000 });
  const alta = decidirAlta({ tenantId: "t_shine", input: PEDIDO_ONLINE, products: [VELA], opts: { envio } });
  assert.deepEqual([alta.subtotal, alta.descuento, alta.total, alta.envio], [23500, 0, 23500, 3500]);

  const { tx, creadas } = txFalsa();
  await crearOrdenEnTx(tx, { ...alta, clientId: null, writeKey: "k" });
  const orden = creadas[0] as { subtotal: number; total: number; paid: boolean; items: { create: { productId: string | null; name: string; lineTotal: number; quantity: number }[] } };
  assert.equal(orden.total, 23500, "la bandeja suma los $3.500");
  const lineas = orden.items.create;
  assert.equal(lineas.length, 2);
  const envioLinea = lineas.find((l) => esLineaDeEnvio(l));
  assert.deepEqual(envioLinea && { name: envioLinea.name, lineTotal: envioLinea.lineTotal, quantity: envioLinea.quantity }, {
    name: NOMBRE_LINEA_ENVIO,
    lineTotal: 3500,
    quantity: 1,
  });
  assert.equal(envioLinea?.productId, null, "sin producto: no mueve stock");
  assert.equal(orden.paid, false, "la tienda no cobra");
});

test("retiro en el local o compra desde $25.000: sin envío y sin línea", () => {
  const envio = getStorefrontCopy("shinevelas")?.shipping ?? null;
  const retiro = decidirAlta({ tenantId: "t", input: { ...PEDIDO_ONLINE, fulfillment: "PICKUP", address: null }, products: [VELA], opts: { envio } });
  assert.deepEqual([retiro.total, retiro.envio], [20000, undefined]);
  const grande = decidirAlta({ tenantId: "t", input: { ...PEDIDO_ONLINE, items: [{ productId: "p_vela", qty: 3 }] }, products: [VELA], opts: { envio } });
  assert.deepEqual([grande.total, grande.envio], [30000, undefined]);
});

test("MAGRA: envío gratis (su tarifa no existe) y sin promesa de débito ni crédito", () => {
  const magra = getStorefrontCopy("magra-lomas");
  assert.equal(magra?.shipping, undefined);
  const alta = decidirAlta({ tenantId: "t_magra", input: PEDIDO_ONLINE, products: [VELA], opts: { envio: magra?.shipping ?? null } });
  assert.equal(alta.total, 20000);
  const textos = [...(magra?.paymentMethods ?? []), ...(magra?.valueProps ?? []).map((v) => `${v.title} ${v.text}`)].join(" ");
  assert.doesNotMatch(textos, /d[ée]bito|cr[ée]dito|tarjeta/i);
  assert.match(textos, /Mercado Pago/);
});

test("MAGRA: la franja de su vidriera editorial (magra-content.ts) deja de prometer crédito y débito", () => {
  // La fuente ya no lo promete (integración de la ola 3), en ninguno de sus dos lugares.
  assert.doesNotMatch(MAGRA.valueProps.map((v) => `${v.title} ${v.text}`).join(" "), /d[ée]bito|cr[ée]dito|tarjeta|todos los medios/i);
  assert.doesNotMatch(MAGRA.paymentMethods, /d[ée]bito|cr[ée]dito|tarjeta/i);
  // Y lo que MagraFront pinta: las propuestas del copy editorial con los medios de la marca.
  const medios = getStorefrontCopy("magra-lomas")?.paymentMethods ?? null;
  const franja = propuestasConMediosDeLaMarca(MAGRA.valueProps, medios);
  assert.equal(franja.length, MAGRA.valueProps.length, "no se pierde ninguna propuesta");
  const pago = franja.find((v) => v.title === "Medios de pago");
  assert.equal(pago?.text, "Efectivo, transferencia y Mercado Pago.");
  assert.doesNotMatch(franja.map((v) => `${v.title} ${v.text}`).join(" "), /d[ée]bito|cr[ée]dito|tarjeta/i);
  // Sin medios de la marca, no se inventa nada.
  assert.deepEqual(propuestasConMediosDeLaMarca(MAGRA.valueProps, null), MAGRA.valueProps);
  assert.equal(textoDeMediosDePago(["Efectivo"]), "Efectivo.");
});

test("el nombre de la línea de envío no se puede usar como precio a mano (dejaría de marcarse)", () => {
  const r = validarLineaAMano({ nombre: "envio a domicilio", importe: "3500", motivo: "lo pidió el cliente" });
  assert.equal(r.ok, false);
  assert.ok(validarLineaAMano({ nombre: "Envío Canning", importe: "3500", motivo: "lo pidió el cliente" }).ok);
  assert.equal(esLineaDeEnvio({ productId: "p", name: NOMBRE_LINEA_ENVIO }), false, "con producto, no es el envío");
});

test("«Pedir por WhatsApp»: el mensaje sale con el número del pedido y lo que quedó grabado", () => {
  const texto = mensajeWhatsAppDelPedido({
    negocio: "MAGRA Canning",
    code: 41,
    cliente: "Ana",
    lineas: [
      { productId: "p_vacio", name: "Vacío", saleUnit: "WEIGHT", quantity: 1.25, lineTotal: 15625 },
      { productId: null, name: NOMBRE_LINEA_ENVIO, saleUnit: "UNIT", quantity: 1, lineTotal: 3500 },
    ],
    descuento: 1562.5,
    total: 17562.5,
    fulfillment: "DELIVERY",
    address: "Av. Mitre 1234",
  });
  assert.match(texto, /pedido #41/);
  assert.match(texto, /• 1,25 kg · Vacío/);
  assert.doesNotMatch(texto, /• 1 u · Envío/, "el envío no va como un producto");
  assert.match(texto, /Envío: \$ ?3\.500,00/);
  assert.match(texto, /Descuento: −\$ ?1\.562,50/);
  assert.match(texto, /Total: \$ ?17\.562,50/);
  assert.match(texto, /envío a domicilio \(Av\. Mitre 1234\)/);
});

// ── La clave anti-duplicado va ANTES que la bolsa ────────────────────────────
//
// `tomarPedidoOnlineGuarded` es el orden de las guardas de `placeOnlineOrder`. Se ejecuta con
// el alta real de las guardas (`insertOrderGuarded`) y la regla real de la bolsa
// (`problemasDeLaBolsa`) contra una tienda falsa: 1 kg de vacío en stock, y el alta descuenta
// con la misma guarda que la base (si no alcanza, aborta).

function tiendaFalsa(stock: number) {
  const m = { stock, pedidos: [] as { id: string; code: number; key: string | null }[], revisiones: 0 };
  const producto = (): ProductoParaBolsa => ({ ...VACIO, stock: m.stock });
  const buscarPorClave = async (key: string): Promise<InsertedOrder | null> => {
    const p = m.pedidos.find((x) => x.key === key);
    return p ? { id: p.id, code: p.code, subtotal: 12500, total: 12500, lines: 1, dedup: true } : null;
  };
  const tomar = (key: string | null, qty: number, opts: { cupon?: Error } = {}) =>
    tomarPedidoOnlineGuarded({
      idempotencyKey: key,
      buscarPorClave,
      revisarBolsa: async () => {
        m.revisiones += 1;
        return problemasDeLaBolsa([producto()], [{ productId: "p_vacio", qty }]);
      },
      insertar: () =>
        insertOrderGuarded({
          idempotencyKey: key,
          subtotal: 12500 * qty,
          lineCount: 1,
          findByKey: buscarPorClave,
          runInsert: async (writeKey) => {
            if (opts.cupon) throw opts.cupon;
            if (m.stock < qty) throw new Error('Sin stock suficiente de "Vacío" para descontar 1.');
            m.stock -= qty;
            const code = m.pedidos.length + 1;
            m.pedidos.push({ id: `ord_${code}`, code, key: writeKey });
            return { id: `ord_${code}`, code };
          },
        }),
    });
  return { m, tomar };
}

test("reintento con la MISMA clave después de llevarse el último kilo: devuelve el pedido ya tomado, no 'no nos alcanza'", async () => {
  const { m, tomar } = tiendaFalsa(1);
  const primero = await tomar("carrito-A", 1);
  assert.equal(primero.tipo, "tomado");
  assert.equal(m.stock, 0);

  // La red se cortó después del alta y el celular reenvía: mismo carrito, misma clave.
  m.revisiones = 0;
  const reintento = await tomar("carrito-A", 1);
  assert.equal(reintento.tipo, "tomado");
  assert.deepEqual(
    reintento.tipo === "tomado" ? [reintento.pedido.id, reintento.pedido.code, reintento.pedido.dedup] : null,
    ["ord_1", 1, true],
  );
  assert.equal(m.revisiones, 0, "con la clave ya tomada, la bolsa ni se mira");
  assert.equal(m.pedidos.length, 1, "un solo pedido");
  assert.equal(m.stock, 0, "el stock se descontó una vez");

  // Otro carrito (otra clave) con la misma bolsa sí choca con el stock, en su línea.
  const otro = await tomar("carrito-B", 1);
  assert.equal(otro.tipo, "bolsa");
  assert.match(otro.tipo === "bolsa" ? otro.porLinea.p_vacio : "", /Se agotó/);
  assert.equal(m.pedidos.length, 1);
});

test("la carrera: la bolsa pasó, otra compra se llevó lo último y el alta abortó → el aviso vuelve en la línea", async () => {
  const { m } = tiendaFalsa(1);
  const r = await tomarPedidoOnlineGuarded({
    idempotencyKey: "carrito-C",
    buscarPorClave: async () => null,
    revisarBolsa: async () => {
      m.revisiones += 1;
      // La primera mirada ve 1 kg; entre la mirada y el alta, otra compra se lo lleva.
      const vista = problemasDeLaBolsa([{ ...VACIO, stock: m.stock }], [{ productId: "p_vacio", qty: 1 }]);
      if (m.revisiones === 1) m.stock = 0;
      return vista;
    },
    insertar: async () => {
      throw new Error('Sin stock suficiente de "Vacío" para descontar 1.');
    },
  });
  assert.equal(r.tipo, "bolsa");
  assert.match(r.tipo === "bolsa" ? r.porLinea.p_vacio : "", /Se agotó/);
  assert.equal(m.revisiones, 2);
});

test("cupón rechazado, rechazo del alta y error de base: cada uno sale por su lado", async () => {
  const { tomar } = tiendaFalsa(5);
  const cupon = await tomar("k1", 1, { cupon: new CuponRechazado("El cupón VERANO10 ya se usó todas las veces que permitía.") });
  assert.deepEqual(cupon, { tipo: "cupon", error: "El cupón VERANO10 ya se usó todas las veces que permitía." });

  const rechazo = await tomarPedidoOnlineGuarded({
    idempotencyKey: null,
    buscarPorClave: async () => null,
    revisarBolsa: async () => ({}),
    insertar: async () => {
      throw new Error("Para el envío a domicilio necesitamos la dirección.");
    },
  });
  assert.deepEqual(rechazo, { tipo: "rechazo", error: "Para el envío a domicilio necesitamos la dirección." });

  class ErrorDeBase extends Error {}
  const base = await tomarPedidoOnlineGuarded({
    idempotencyKey: null,
    buscarPorClave: async () => null,
    revisarBolsa: async () => ({}),
    insertar: async () => {
      throw new ErrorDeBase("connection terminated unexpectedly");
    },
  });
  assert.equal(base.tipo, "error", "el texto de la base no se le muestra al cliente");
});

test("pesar y ajustar un pedido con envío y cupón: el envío no es base del descuento", () => {
  // $20.000 de productos + $3.500 de envío, cupón del 10 % sobre los productos ($2.000).
  const lineas = [
    { productId: "p_vacio", name: "Vacío", lineTotal: 20000 },
    { productId: null, name: NOMBRE_LINEA_ENVIO, lineTotal: 3500 },
    { productId: null, name: "Bolsa térmica", lineTotal: 500 }, // precio a mano: sí es base
  ];
  assert.equal(envioDeLasLineas(lineas), 3500);
  assert.equal(envioDeLasLineas([{ productId: null, name: "envio a domicilio", lineTotal: 3500 }]), 3500, "sin tilde ni mayúsculas");
  assert.equal(envioDeLasLineas([{ productId: "p", name: NOMBRE_LINEA_ENVIO, lineTotal: 3500 }]), 0, "con producto no es el envío");

  // Se pesó y los productos bajaron a $10.000: el descuento queda en el 10 % de $10.000.
  const d = descuentoDelAjuste({ descuentoAntes: 2000, subtotalAntes: 23500, subtotalNuevo: 13500, envio: 3500 });
  assert.deepEqual(d, { descuento: 1000, porcentaje: 10 });
  // Sin restar el envío, el descuento se estiraba sobre él: $1.148,94.
  assert.equal(descuentoDelAjuste({ descuentoAntes: 2000, subtotalAntes: 23500, subtotalNuevo: 13500 }).descuento, 1148.94);
  // Sin envío, la cuenta de siempre.
  assert.deepEqual(descuentoDelAjuste({ descuentoAntes: 625, subtotalAntes: 6250, subtotalNuevo: 15500, envio: 0 }), {
    descuento: 1550,
    porcentaje: 10,
  });
});
