// Delivery local en el alta de la vidriera y en el seguimiento público.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { notaDelPedido } from "./reglas-tienda";
import { configDeliveryLocal } from "@/lib/delivery-local/config";
import { decidirAlta, tomarPedidoOnlineGuarded, LINEA_QUE_SE_CAYO, type InsertedOrder, type OrderInput } from "@/lib/order-core";
import { RechazoDeDominio } from "@/lib/rechazo-de-dominio";

test("notaDelPedido: los extras van después de zona y franja y ANTES de lo de la clienta", () => {
  assert.equal(
    notaDelPedido({
      zona: "Centro",
      franja: "Franja: 9-12 (hoy 10/11)",
      extras: ["Ubicación: https://maps.google.com/?q=1,2", "Paga en efectivo, justo"],
      deLaClienta: " timbre 2B ",
    }),
    "Zona: Centro · Franja: 9-12 (hoy 10/11) · Ubicación: https://maps.google.com/?q=1,2 · Paga en efectivo, justo · timbre 2B",
  );
  assert.equal(notaDelPedido({ zona: null, franja: null, extras: [], deLaClienta: null }), null);
  assert.equal(notaDelPedido({ zona: null, franja: null, extras: ["Paga por transferencia"], deLaClienta: "" }), "Paga por transferencia");
});

test("sin extras, la nota es la de siempre", () => {
  const base = { zona: "Canning centro", franja: "Franja: L-S 11-13 (mañana 23/10)", deLaClienta: " jugoso " };
  assert.equal(notaDelPedido(base), "Zona: Canning centro · Franja: L-S 11-13 (mañana 23/10) · jugoso");
  assert.equal(notaDelPedido({ ...base, extras: [] }), notaDelPedido(base));
});

test("los negocios provisionados no tienen el delivery local: su alta sigue idéntica", () => {
  for (const slug of ["beauty-spa", "magra", "shinevelas", "adosmanos", "quebienoles", "", null, undefined, "__proto__", "toString"]) {
    assert.equal(configDeliveryLocal(slug), null, String(slug));
  }
  assert.ok(configDeliveryLocal("bitacora"));
});

test("placeOnlineOrder: el delivery local sólo corre con config; sin ella, la nota, la auditoría y el redirect de siempre", () => {
  const src = readFileSync(new URL("../../lib/order-actions.ts", import.meta.url), "utf8");
  const cuerpo = src.slice(src.indexOf("export async function placeOnlineOrder"), src.indexOf("async function subtotalDeLaBolsaEnBase"));
  assert.match(cuerpo, /const deliveryLocal = configDeliveryLocal\(tenant\?\.slug\);/);
  assert.match(cuerpo, /const extrasLocal = deliveryLocal \? extrasDelAlta\(deliveryLocal, formData, fulfillment === "DELIVERY"\) : null;/);
  // Un pago mal formado frena ANTES de grabar.
  assert.ok(cuerpo.indexOf("if (extrasLocal && !extrasLocal.ok)") < cuerpo.indexOf("tomarPedidoOnlineGuarded("));
  assert.match(cuerpo, /\.\.\.\(extrasLocal\?\.ok \? \{ extras: \[\.\.\.extrasLocal\.renglones, \.\.\.\(opcionesLocal\?\.ok \? opcionesLocal\.renglones : \[\]\)\] \} : \{\}\)/);
  // Fuera de horario y con opciones mal elegidas, se frena ANTES de grabar pero DESPUÉS de
  // buscar la clave (M2): dentro de `insertar`, antes de `insertOrder`. Ningún `return` previo.
  assert.doesNotMatch(cuerpo, /if \(cerrado\) return/);
  assert.doesNotMatch(cuerpo, /if \(opcionesLocal && !opcionesLocal\.ok\) return/);
  const insertar = cuerpo.indexOf("insertar: async () => {");
  const alta = cuerpo.indexOf("return insertOrder(tenantId,");
  for (const guarda of ["if (cerrado) throw new RechazoDeDominio(cerrado);", "if (opcionesLocal && !opcionesLocal.ok) throw new RechazoDeDominio(opcionesLocal.error);"]) {
    const i = cuerpo.indexOf(guarda);
    assert.ok(cuerpo.indexOf("buscarPorClave:") < insertar && insertar < i && i < alta, guarda);
  }
  // M1: el mínimo de la zona se compara con el subtotal CON el recargo de las opciones.
  assert.match(cuerpo, /const recargoDeOpciones = opcionesLocal\?\.ok \? opcionesLocal\.lineasAMano\.reduce\(\(s, l\) => s \+ l\.importe, 0\) : 0;/);
  assert.match(cuerpo, /const subtotalDeLaBase = conZonas \? round2\(\(await subtotalDeLaBolsaEnBase\(tenantId, items\)\) \+ recargoDeOpciones\) : 0;/);
  assert.match(cuerpo, /cotizarEnvio\(configEnvios, \{ subtotal: subtotalDeLaBase, modo, zonaId \}\)/);
  // B2: con delivery local, el alta no descarta líneas en silencio.
  assert.match(cuerpo, /\.\.\.\(deliveryLocal \? \{ lineasCompletas: true \} : \{\}\)/);
  // El recargo de las opciones sale de la config (opcionesDelAlta), nunca de un precio del formulario.
  assert.match(cuerpo, /lineasAMano: opcionesLocal\.lineasAMano/);
  assert.doesNotMatch(cuerpo, /formData\.get(All)?\("recargo/);
  assert.match(cuerpo, /\.\.\.\(extrasLocal\?\.ok \? \{ entregaLocal: extrasLocal\.auditoria \} : \{\}\)/);
  assert.match(cuerpo, /seguimiento = rutaDeSeguimiento\(tokenDeSeguimiento\(authSecret\(\), tenantId, result\.id\)\);/);
  // Sin el secreto, el pedido ya grabado no termina en error: cae a «gracias».
  assert.match(cuerpo, /\} catch \(err\) \{[^}]*\}\s*\}\s*if \(seguimiento\) redirect\(seguimiento\);\s+redirect\(`\/tienda\/gracias\?pedido=\$\{result\.code\}`\);/);
});

test("el seguimiento público no lee dirección, teléfono ni ubicación, y no se indexa", () => {
  const src = readFileSync(new URL("./pedido/[token]/page.tsx", import.meta.url), "utf8");
  const codigo = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  for (const prohibido of ["address", "customerPhone", "customerName", "notes", "ubicacion", "basePrisma"]) {
    assert.ok(!codigo.includes(prohibido), `no debe aparecer ${prohibido}`);
  }
  assert.match(codigo, /secreto = authSecret\(\);\s*\} catch \{\s*return null;/, "sin secreto: 404, no 500");
  assert.match(codigo, /verificarToken\(secreto, tenantId, token\)/);
  assert.match(codigo, /where: \{ id: orderId, tenantId \}/);
  assert.match(codigo, /if \(!datos\) notFound\(\);/);
  assert.match(codigo, /robots: \{ index: false/);
  assert.match(codigo, /referrer: "no-referrer"/);
  assert.match(codigo, /generator: "Gestión Studio Grow"/);
});

// ── Certificación vuelta 1 (M2 y B2), ejecutando las guardas reales ──

const CLAVE = "web:6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const GRABADO: InsertedOrder = { id: "ord_1", code: 1, subtotal: 5800, total: 5800, lines: 2, dedup: true };

test("M2: el reintento de un pedido grabado a las 19:59 que llega cerrado devuelve ESE pedido", async () => {
  let altas = 0;
  const r = await tomarPedidoOnlineGuarded({
    idempotencyKey: CLAVE,
    buscarPorClave: async (k) => (k === CLAVE ? GRABADO : null),
    revisarBolsa: async () => ({}),
    insertar: async () => {
      altas += 1;
      throw new RechazoDeDominio("Estamos cerrados · abrimos mañana 8:00.");
    },
  });
  assert.deepEqual(r, { tipo: "tomado", pedido: GRABADO });
  assert.equal(altas, 0);
  // Sin pedido previo, el cerrado sí rechaza, con su texto.
  const nuevo = await tomarPedidoOnlineGuarded({
    idempotencyKey: CLAVE,
    buscarPorClave: async () => null,
    revisarBolsa: async () => ({}),
    insertar: async () => {
      throw new RechazoDeDominio("Estamos cerrados · abrimos mañana 8:00.");
    },
  });
  assert.deepEqual(nuevo, { tipo: "rechazo", error: "Estamos cerrados · abrimos mañana 8:00." });
});

test("B2: con lineasCompletas, la línea que se cae (inactivo/sin precio) rechaza; sin el dato, lo de siempre", () => {
  const LATTE = { id: "p_latte", name: "Latte", saleUnit: "UNIT" as const, price: 4200, pricePerKg: null, trackStock: false };
  const input: OrderInput = {
    channel: "ONLINE",
    fulfillment: "PICKUP",
    customerName: "Ana",
    customerPhone: "11 4000-7919",
    address: null,
    notes: null,
    scheduledFor: null,
    paid: false,
    paymentMethod: null,
    items: [{ productId: "p_latte", qty: 1 }, { productId: "p_medialuna", qty: 2 }],
    lineasAMano: [{ nombre: "Opciones ×2 · Medialuna: Rellena", importe: 1600, motivo: "Opciones elegidas en la vidriera (Pedí Local)" }],
  };
  // La Medialuna se desactivó entre la revisión de la bolsa y el alta: no está en `products`.
  assert.throws(() => decidirAlta({ tenantId: "t", input, products: [LATTE], opts: { lineasCompletas: true } }), (e: unknown) => e instanceof RechazoDeDominio && e.message === LINEA_QUE_SE_CAYO);
  // Sólo con el recargo (sin ningún producto): también rechaza.
  assert.throws(() => decidirAlta({ tenantId: "t", input, products: [], opts: { lineasCompletas: true } }), RechazoDeDominio);
  // Sin precio: igual que inactivo.
  assert.throws(() => decidirAlta({ tenantId: "t", input, products: [LATTE, { ...LATTE, id: "p_medialuna", price: 0 }], opts: { lineasCompletas: true } }), RechazoDeDominio);
  // Todo presente: pasa, con el recargo en el total.
  const ok = decidirAlta({ tenantId: "t", input, products: [LATTE, { ...LATTE, id: "p_medialuna", name: "Medialuna", price: 1000 }], opts: { lineasCompletas: true } });
  assert.equal(ok.total, 4200 + 2000 + 1600);
  // Las cantidades en 0 no cuentan como línea caída.
  assert.doesNotThrow(() => decidirAlta({ tenantId: "t", input: { ...input, items: [...input.items, { productId: "p_fantasma", qty: 0 }] }, products: [LATTE, { ...LATTE, id: "p_medialuna", price: 1000 }], opts: { lineasCompletas: true } }));
  // Sin el dato (otros negocios), se descarta como siempre.
  assert.equal(decidirAlta({ tenantId: "t", input, products: [LATTE] }).total, 4200 + 1600);
});
