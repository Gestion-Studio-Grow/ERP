// Tests del cableado de config de la vidriera para el tenant `shinevelas`.
// Módulos DB-free (copy por tenant + rubro): asegura que la resolución por slug quede armada de
// punta a punta. Al final, los ENVÍOS de la tienda (reingeniería Magra 1H), la parte pura. Corre
// con `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getStorefrontCopy } from "./storefront";
import { resolveRubroIdBySlug, getRetailRubro } from "@/blueprints/retail/rubros";
import { shippingCost, amountToFreeShipping, shippingVigente } from "@/lib/storefront-shipping";
import { groupBySection } from "@/lib/storefront-visual";
import { decidirAlta } from "@/lib/order-core";
import { cotizarEnvio, costoDeEnvio, configComoShipping, faltaParaGratis, motivoTiendaPausada } from "@/lib/envios/tarifa";
import { configPorDefecto } from "@/lib/envios/modelo";
import { aplicarCupon, esLineaDeEnvio, validarLineaAMano } from "@/lib/venta-reglas";
import {
  diasDeEntrega,
  franjasDeLaEntrega,
  horarioDeLaEntrega,
  horasDeLaFranja,
  mensajeWhatsAppDelPedido,
  notaDelPedido,
  sumarDias,
} from "@/app/tienda/reglas-tienda";
import { BARRIOS, CONFIG_MAGRA, EZEIZA } from "@/app/tienda/envio-de-la-tienda.fixture";

// --- Copy por tenant --------------------------------------------------------

test("shinevelas resuelve su copy propio (voz de marca)", () => {
  const copy = getStorefrontCopy("shinevelas");
  assert.ok(copy, "shinevelas debe tener copy propio");
  assert.ok(copy!.tagline.length > 0);
  // La firma de marca "que tu luz nunca se apague" vive en el about.
  assert.match(copy!.about.body, /luz nunca se apague/i);
  assert.ok(copy!.valueProps.length >= 3);
  assert.ok(copy!.reviews.every((r) => r.rating >= 1 && r.rating <= 5));
});

test("shinevelas trae config de envío real (fijo $3.500, gratis desde $25.000)", () => {
  const copy = getStorefrontCopy("shinevelas");
  assert.deepEqual(copy!.shipping, { flatRate: 3500, freeThreshold: 25000 });
  // El cableado copy → cálculo de envío funciona end-to-end.
  assert.equal(shippingCost(8500, "DELIVERY", copy!.shipping), 3500);
  assert.equal(shippingCost(25000, "DELIVERY", copy!.shipping), 0);
  assert.equal(amountToFreeShipping(20000, copy!.shipping), 5000);
});

test("shinevelas trae la VISIÓN experiencial: ritual + sets de regalo + deco", () => {
  const copy = getStorefrontCopy("shinevelas")!;
  // "Armá tu ritual" con pasos.
  assert.ok(copy.ritual, "debe tener sección de ritual");
  assert.ok(copy.ritual!.steps.length >= 3);
  // Sets/combos de regalo con precio.
  assert.ok(copy.giftSets, "debe tener sets de regalo");
  assert.ok(copy.giftSets!.sets.length >= 2);
  assert.ok(copy.giftSets!.sets.some((s) => typeof s.price === "number"));
  // La decoración es una de las líneas destacadas.
  assert.ok(copy.vacioLines.some((l) => /decoraci/i.test(l.title)));
});

test("magra sigue sin experiencia extendida (retrocompatible)", () => {
  const copy = getStorefrontCopy("magra")!;
  assert.equal(copy.shipping, undefined);
  assert.equal(copy.ritual, undefined);
  assert.equal(copy.giftSets, undefined);
});

test("slug desconocido → sin copy (cae al wording del rubro)", () => {
  assert.equal(getStorefrontCopy("no-existe"), null);
  assert.equal(getStorefrontCopy(null), null);
});

// --- A Dos Manos (adosmanos) — copy propio, provisional, SIN datos inventados ---

test("adosmanos resuelve su copy propio (2 líneas + marcas reales del modelo)", () => {
  const copy = getStorefrontCopy("adosmanos");
  assert.ok(copy, "adosmanos debe tener copy propio");
  assert.ok(copy!.tagline.length > 0);
  // Las dos líneas del negocio, ancladas a las secciones de pádel (storefront-visual).
  const secs = copy!.vacioLines.map((l) => l.section);
  assert.ok(secs.includes("palas") && secs.includes("calzado"), "líneas Palas + Calzado por sección");
  // Marcas líderes como proveedores (hecho del modelo, no inventado).
  assert.ok(copy!.providers.includes("Bullpadel") && copy!.providers.includes("Adidas"));
});

test("adosmanos NO inventa datos: sin reviews, sin experiencia de velas, sin envío falso", () => {
  const copy = getStorefrontCopy("adosmanos")!;
  assert.equal(copy.reviews.length, 0, "no se fabrican testimonios reales");
  assert.equal(copy.ritual, undefined, "el ritual es de velas, no de pádel");
  assert.equal(copy.giftSets, undefined);
  // No hay tarifa plana real confirmada → no se cablea el calculador de envío.
  assert.equal(copy.shipping, undefined);
});

test("shinevelas ya no trae reseñas fabricadas (compliance DX-5)", () => {
  // Las reviews con nombres inventados (preview "datos de ejemplo") se quitaron: se
  // presentaban como clientes reales. Se reponen sólo con testimonios reales del dueño.
  assert.equal(getStorefrontCopy("shinevelas")!.reviews.length, 0);
});

// --- Rubro por tenant -------------------------------------------------------

test("shinevelas mapea al rubro `velas` y su catálogo es visual, por unidad", () => {
  assert.equal(resolveRubroIdBySlug("shinevelas"), "velas");
  const rubro = getRetailRubro("velas");
  assert.ok(rubro, "el rubro velas debe existir");
  assert.ok(rubro!.catalog.length >= 6);
  // Rubro visual, todo por unidad (sin balanza).
  assert.ok(rubro!.catalog.every((c) => c.sale === "u"));
  assert.equal(rubro!.wording.weightNote, null);
  assert.ok(rubro!.modules.includes("venta-unidad"));
  assert.ok(!rubro!.modules.includes("venta-peso"));
});

test("el catálogo del rubro velas cubre las 4 secciones (velas/aromas/deco/accesorios)", () => {
  const rubro = getRetailRubro("velas")!;
  const groups = groupBySection(rubro.catalog);
  const ids = groups.map((g) => g.section.id);
  for (const s of ["velas", "aromas", "decoracion", "accesorios"]) {
    assert.ok(ids.includes(s as (typeof ids)[number]), `falta la sección ${s} en el catálogo`);
  }
});

// ============================================================================
// ENVÍOS EN LA TIENDA (reingeniería Magra 1H) — zona, costo, gratis, mínimo, franja, pausa.
// ============================================================================
//
// Lo puro: la misma cuenta en la vidriera y en el alta. La acción REAL (`placeOnlineOrder`) contra
// Postgres efímero vive en src/app/tienda/envio-de-la-tienda-postgres.test.ts: importa la app
// recién después de apuntarla a la base efímera, y acá `order-core` ya cargó el cliente de Prisma.

/** Una caja de $45.000: la bolsa de $45.000 de MG-032/033. */
const CAJA = { id: "p_caja", name: "Caja parrillera", saleUnit: "UNIT" as const, price: 45000, pricePerKg: null, trackStock: false };
const PEDIDO = {
  channel: "ONLINE" as const,
  fulfillment: "DELIVERY" as const,
  customerName: "Ana",
  customerPhone: "11 5555 1234",
  address: "Los Álamos 123",
  notes: null,
  scheduledFor: null,
  paid: false,
  paymentMethod: null,
  items: [{ productId: "p_caja", qty: 1 }],
};

test("MG-032 · bolsa de $45.000 a «Canning – barrios cerrados»: envío $4.000, total $49.000, «te faltan $15.000»; con $60.000, $0", () => {
  const cot = cotizarEnvio(CONFIG_MAGRA, { subtotal: 45000, modo: "envio", zonaId: "barrios" });
  assert.ok(cot.ok);
  assert.deepEqual([cot.costo, cot.faltaParaGratis, cot.renglon], [4000, 15000, "Envío · Canning – barrios cerrados"]);

  // El alta REAL calcula el mismo costo sobre los precios de la base y nombra el renglón con la zona.
  const alta = decidirAlta({ tenantId: "t_magra", input: PEDIDO, products: [CAJA], opts: { envioZona: BARRIOS } });
  assert.deepEqual([alta.subtotal, alta.total, alta.envio, alta.envioRenglon], [49000, 49000, 4000, "Envío · Canning – barrios cerrados"]);

  const sesenta = decidirAlta({ tenantId: "t_magra", input: { ...PEDIDO, items: [{ productId: "p_caja", qty: 1 }] }, products: [{ ...CAJA, price: 60000 }], opts: { envioZona: BARRIOS } });
  assert.deepEqual([sesenta.total, sesenta.envio], [60000, undefined], "desde $60.000 el envío a esa zona es gratis: no hay renglón");
  assert.equal(costoDeEnvio(60000, BARRIOS), 0);
  assert.equal(faltaParaGratis(60000, BARRIOS), 0);
});

test("MG-033 · cupón del 10 % sobre esa bolsa: descuenta $4.500 (sin el envío) y el total es $44.500", () => {
  const alta = decidirAlta({ tenantId: "t_magra", input: PEDIDO, products: [CAJA], opts: { envioZona: BARRIOS, cupon: "DIEZ" } });
  // La base del cupón es la de `aplicarCuponEnTx`: el subtotal sin el envío.
  const r = aplicarCupon({
    cupon: { code: "DIEZ", type: "PERCENT", value: 10, active: true, expiresAt: null, maxUses: null, usedCount: 0 },
    base: alta.subtotal - (alta.envio ?? 0),
    ahora: new Date(),
  });
  assert.ok(r.ok);
  assert.equal(r.descuento, 4500);
  assert.equal(alta.subtotal - r.descuento, 44500);
});

test("MG-034 · mínimo de envío $20.000 con una bolsa de $12.000: avisa el mínimo y ofrece «Retiro en el local»", () => {
  const cot = cotizarEnvio(CONFIG_MAGRA, { subtotal: 12000, modo: "envio", zonaId: "barrios" });
  assert.ok(!cot.ok);
  assert.equal(cot.faltaParaMinimo, 8000);
  assert.equal(cot.ofrecerRetiro, true);
  assert.match(cot.motivo, /desde \$20\.000/);
  assert.match(cot.motivo, /retirás en el local/);
  const retiro = cotizarEnvio(CONFIG_MAGRA, { subtotal: 12000, modo: "retiro" });
  assert.ok(retiro.ok && retiro.costo === 0 && retiro.renglon === null, "el retiro no tiene mínimo ni costo");
  const sinRetiro = cotizarEnvio({ ...CONFIG_MAGRA, retiroEnLocal: false }, { subtotal: 12000, modo: "envio", zonaId: "barrios" });
  assert.ok(!sinRetiro.ok && !sinRetiro.ofrecerRetiro, "sin retiro habilitado, no se ofrece");
});

test("MG-036 · tienda pausada: el mensaje del dueño frena la cotización (y el alta: ver la de Postgres)", () => {
  const pausada = { ...CONFIG_MAGRA, tiendaPausada: { mensaje: "Hoy no tomamos pedidos por la web" } };
  assert.equal(motivoTiendaPausada(pausada), "Hoy no tomamos pedidos por la web");
  const cot = cotizarEnvio(pausada, { subtotal: 45000, modo: "retiro" });
  assert.ok(!cot.ok && cot.motivo === "Hoy no tomamos pedidos por la web");
  assert.equal(motivoTiendaPausada(CONFIG_MAGRA), null);
});

test("MG-037 · Shine sigue con su tarifa de storefront.ts ($3.500, gratis desde $25.000) y sin zonas", () => {
  const shine = getStorefrontCopy("shinevelas")!.shipping;
  // Sin zonas propias, `placeOnlineOrder` usa la tarifa del copy (`shippingVigente`) y nada más.
  const cot = cotizarEnvio(configPorDefecto(), { subtotal: 20000, modo: "envio" });
  assert.ok(cot.ok && cot.zona === null && cot.renglon === null && cot.costo === 0, "sin zonas, la cotización no decide la tarifa");
  assert.deepEqual(shippingVigente(null, shine), { flatRate: 3500, freeThreshold: 25000 });
  const alta = decidirAlta({
    tenantId: "t_shine",
    input: { ...PEDIDO, items: [{ productId: "p_vela", qty: 1 }] },
    products: [{ id: "p_vela", name: "Vela", saleUnit: "UNIT", price: 20000, pricePerKg: null, trackStock: false }],
    opts: { envio: shippingVigente(null, shine), envioZona: cot.ok ? cot.zona : null },
  });
  assert.deepEqual([alta.envio, alta.envioRenglon, alta.total], [3500, undefined, 23500], "renglón «Envío a domicilio» de siempre");
});

test("seguridad: el costo sale de la zona de la base, no del navegador; un retiro con zona no suma envío", () => {
  // La zona por id es lo único que se toma del formulario. Un id que no existe no cotiza.
  const inventada = cotizarEnvio(CONFIG_MAGRA, { subtotal: 45000, modo: "envio", zonaId: "gratis-para-mi" });
  assert.ok(!inventada.ok && /Elegí a qué zona/.test(inventada.motivo));
  const retiro = decidirAlta({ tenantId: "t", input: { ...PEDIDO, fulfillment: "PICKUP", address: null }, products: [CAJA], opts: { envioZona: BARRIOS } });
  assert.equal(retiro.envio, undefined);
  // `costoDeEnvio` y el puente a la tarifa de siempre dicen lo mismo, centavos incluidos.
  for (const sub of [0, 0.01, 12000, 45000, 59999.99, 60000, 80000]) {
    for (const z of [BARRIOS, EZEIZA]) {
      assert.equal(costoDeEnvio(sub, z), shippingCost(sub, "DELIVERY", configComoShipping(CONFIG_MAGRA, z.id)), `${z.id} · ${sub}`);
    }
  }
});

test("el renglón «Envío · <zona>» se reconoce como envío (WhatsApp, ajuste, precio a mano)", () => {
  assert.equal(esLineaDeEnvio({ productId: null, name: "Envío · Canning – barrios cerrados" }), true);
  assert.equal(esLineaDeEnvio({ productId: null, name: "Envío a domicilio" }), true);
  assert.equal(esLineaDeEnvio({ productId: null, name: "Envío ·" }), false, "sin zona no es el renglón de una zona");
  assert.equal(esLineaDeEnvio({ productId: "p", name: "Envío · Canning" }), false, "con producto, es un producto");
  assert.equal(validarLineaAMano({ nombre: "Envío · Canning", importe: "3500", motivo: "lo pidió el cliente" }).ok, false, "el nombre queda reservado");
  assert.equal(validarLineaAMano({ nombre: "Envío Canning", importe: "3500", motivo: "lo pidió el cliente" }).ok, true);
  const texto = mensajeWhatsAppDelPedido({
    negocio: "MAGRA",
    code: 12,
    cliente: "Ana",
    lineas: [
      { productId: "p", name: "Vacío", saleUnit: "WEIGHT", quantity: 1.5, lineTotal: 45000 },
      { productId: null, name: "Envío · Canning – barrios cerrados", saleUnit: "UNIT", quantity: 1, lineTotal: 4000 },
    ],
    descuento: 0,
    total: 49000,
    fulfillment: "DELIVERY",
    address: "Los Álamos 123",
  });
  assert.doesNotMatch(texto, /• 1 u · Envío/);
  assert.match(texto, /Envío: \$ ?4\.000,00/);
});

test("franjas: días que se ofrecen, horas de la franja y la franja que manda el formulario", () => {
  assert.deepEqual(diasDeEntrega("2026-10-22", 3), [
    { valor: "2026-10-22", texto: "Hoy" },
    { valor: "2026-10-23", texto: "Mañana" },
    { valor: "2026-10-24", texto: "sáb 24/10" },
  ]);
  assert.deepEqual(diasDeEntrega("cualquiera"), []);
  assert.equal(sumarDias("2026-12-31", 1), "2027-01-01");
  assert.deepEqual(horasDeLaFranja("L-S 11-13"), { desde: "11:00", hasta: "13:00" });
  assert.deepEqual(horasDeLaFranja("Hoy tarde 17–20"), { desde: "17:00", hasta: "20:00" });
  assert.deepEqual(horasDeLaFranja("Ma, Vi 17:30 a 19"), { desde: "17:30", hasta: "19:00" });
  assert.equal(horasDeLaFranja("Sábados"), null);
  assert.equal(horasDeLaFranja("19-17"), null, "al revés no es una franja");

  assert.deepEqual(franjasDeLaEntrega(CONFIG_MAGRA, "envio", BARRIOS), BARRIOS.franjas);
  assert.deepEqual(franjasDeLaEntrega({ franjasRetiro: ["Hoy tarde 17-20"] }, "retiro", BARRIOS), ["Hoy tarde 17-20"]);

  const ahora = new Date("2026-10-22T15:00:00.000Z"); // 12:00 en Buenos Aires
  const hoy = "2026-10-22";
  assert.deepEqual(horarioDeLaEntrega({ franjas: [], franja: "lo que sea", dia: null, hoy, ahora }), { ok: true, scheduledFor: null, nota: null });
  const sinElegir = horarioDeLaEntrega({ franjas: BARRIOS.franjas, franja: null, dia: hoy, hoy, ahora });
  assert.ok(!sinElegir.ok && /franja/.test(sinElegir.error));
  assert.ok(!horarioDeLaEntrega({ franjas: BARRIOS.franjas, franja: "Domingo 3-4", dia: hoy, hoy, ahora }).ok, "una franja que el local no ofrece no entra");
  assert.ok(!horarioDeLaEntrega({ franjas: BARRIOS.franjas, franja: "L-S 11-13", dia: "2026-11-30", hoy, ahora }).ok, "fuera de los próximos días");
  const ok = horarioDeLaEntrega({ franjas: BARRIOS.franjas, franja: "L-S 17-19", dia: hoy, hoy, ahora });
  assert.ok(ok.ok);
  assert.equal(ok.scheduledFor?.toISOString(), "2026-10-22T20:00:00.000Z", "17:00 en Buenos Aires");
  assert.equal(ok.nota, "Franja: L-S 17-19 (hoy 22/10)");
  const tarde = horarioDeLaEntrega({ franjas: BARRIOS.franjas, franja: "L-S 11-13", dia: hoy, hoy, ahora: new Date("2026-10-22T16:30:00.000Z") });
  assert.ok(!tarde.ok && /ya pasó/.test(tarde.error), "13:30: la franja de 11 a 13 de hoy ya terminó");

  assert.equal(
    notaDelPedido({ zona: "Canning centro", franja: "Franja: L-S 11-13 (mañana 23/10)", deLaClienta: " jugoso " }),
    "Zona: Canning centro · Franja: L-S 11-13 (mañana 23/10) · jugoso",
  );
  assert.equal(notaDelPedido({ zona: null, franja: null, deLaClienta: "" }), null);
});
