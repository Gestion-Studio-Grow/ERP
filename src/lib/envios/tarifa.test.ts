// Tarifa de envío — funciones puras (costoDeEnvio, faltaParaGratis, mínimo, cotización).
// Casos de MG-030…MG-036 (magra-DISENO.md §5), con los valores provisionales de §2.3.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  configComoShipping,
  costoDeEnvio,
  cotizarEnvio,
  cotizarEnvioDelMostrador,
  faltaParaElMinimo,
  faltaParaGratis,
  motivoTiendaPausada,
  renglonDeEnvio,
} from "./tarifa";
import { configPorDefecto, MENSAJE_PAUSA_POR_DEFECTO, type ConfigEnvios, type ZonaDeEnvio } from "./modelo";
import { amountToFreeShipping, shippingCost, shippingVigente } from "@/lib/storefront-shipping";

const barrios: ZonaDeEnvio = { id: "barrios", nombre: "Canning – barrios cerrados", costo: 4000, gratisDesde: 60000, franjas: ["L-S 11-13", "L-S 17-19"] };
const centro: ZonaDeEnvio = { id: "centro", nombre: "Canning centro", costo: 3000, gratisDesde: 50000, franjas: [] };
const lejos: ZonaDeEnvio = { id: "ezeiza", nombre: "Ezeiza / Monte Grande", costo: 6000, gratisDesde: null, franjas: ["Ma, Vi 17-19"] };

const magra: ConfigEnvios = {
  retiroEnLocal: true,
  horarioRetiro: "Lun a sáb 9–19",
  pedidoMinimoEnvio: 20000,
  zonas: [barrios, centro, lejos],
  franjasRetiro: ["Hoy mañana 10-13"],
  tiendaPausada: null,
};

test("costoDeEnvio: cada zona cobra su costo por debajo de «gratis desde» (MG-031)", () => {
  assert.equal(costoDeEnvio(45000, barrios), 4000);
  assert.equal(costoDeEnvio(45000, centro), 3000);
  assert.equal(costoDeEnvio(45000, lejos), 6000);
});

test("costoDeEnvio: gratis desde el umbral exacto, y al centavo (MG-032)", () => {
  assert.equal(costoDeEnvio(60000, barrios), 0);
  assert.equal(costoDeEnvio(75000, barrios), 0);
  assert.equal(costoDeEnvio(59999.99, barrios), 4000);
  // 0,1 + 0,2 en flotante no es 0,3: en centavos sí.
  assert.equal(costoDeEnvio(0.1 + 0.2, { ...barrios, gratisDesde: 0.3 }), 0);
});

test("costoDeEnvio: zona sin «gratis desde» nunca es gratis; sin zona o bolsa vacía es 0", () => {
  assert.equal(costoDeEnvio(1_000_000, lejos), 6000);
  assert.equal(costoDeEnvio(45000, null), 0);
  assert.equal(costoDeEnvio(0, barrios), 0);
  assert.equal(costoDeEnvio(-10, barrios), 0);
  assert.equal(costoDeEnvio(4500.5, { ...barrios, costo: 1234.56 }), 1234.56);
});

test("faltaParaGratis: «te faltan $15.000 para el envío gratis» (MG-032)", () => {
  assert.equal(faltaParaGratis(45000, barrios), 15000);
  assert.equal(faltaParaGratis(60000, barrios), 0);
  assert.equal(faltaParaGratis(59999.99, barrios), 0.01);
  assert.equal(faltaParaGratis(45000, lejos), 0);
  assert.equal(faltaParaGratis(45000, null), 0);
  assert.equal(faltaParaGratis(0, barrios), 0);
});

test("faltaParaElMinimo: con mínimo de $20.000 a una bolsa de $12.000 le faltan $8.000 (MG-034)", () => {
  assert.equal(faltaParaElMinimo(12000, magra), 8000);
  assert.equal(faltaParaElMinimo(20000, magra), 0);
  assert.equal(faltaParaElMinimo(12000, { pedidoMinimoEnvio: null }), 0);
  assert.equal(faltaParaElMinimo(0, magra), 20000);
});

test("cotizarEnvio: envío a zona con costo, aviso de gratis y renglón «Envío · zona» (MG-031/032)", () => {
  const c = cotizarEnvio(magra, { subtotal: 45000, modo: "envio", zonaId: "barrios" });
  assert.deepEqual(c, { ok: true, modo: "envio", costo: 4000, zona: barrios, faltaParaGratis: 15000, renglon: "Envío · Canning – barrios cerrados" });
  const gratis = cotizarEnvio(magra, { subtotal: 60000, modo: "envio", zonaId: "barrios" });
  assert.ok(gratis.ok && gratis.costo === 0 && gratis.faltaParaGratis === 0);
});

test("cotizarEnvio: por debajo del mínimo no deja pedir envío y ofrece el retiro (MG-034)", () => {
  const c = cotizarEnvio(magra, { subtotal: 12000, modo: "envio", zonaId: "centro" });
  assert.equal(c.ok, false);
  assert.ok(!c.ok && c.faltaParaMinimo === 8000 && c.ofrecerRetiro);
  assert.ok(!c.ok && /desde \$20\.000/.test(c.motivo) && /te faltan \$8\.000/.test(c.motivo) && /retirás en el local/.test(c.motivo), !c.ok ? c.motivo : "");
  // El retiro no tiene mínimo.
  const retiro = cotizarEnvio(magra, { subtotal: 12000, modo: "retiro" });
  assert.deepEqual(retiro, { ok: true, modo: "retiro", costo: 0, zona: null, faltaParaGratis: 0, renglon: null });
  // Sin retiro, no lo ofrece.
  const sinRetiro = cotizarEnvio({ ...magra, retiroEnLocal: false }, { subtotal: 12000, modo: "envio", zonaId: "centro" });
  assert.ok(!sinRetiro.ok && !sinRetiro.ofrecerRetiro && !/retirás/.test(sinRetiro.motivo));
});

test("cotizarEnvio: zona inexistente, retiro apagado y tienda pausada se rechazan con el motivo (MG-036)", () => {
  const sinZona = cotizarEnvio(magra, { subtotal: 45000, modo: "envio", zonaId: "no-existe" });
  assert.ok(!sinZona.ok && /Elegí a qué zona/.test(sinZona.motivo));
  const sinRetiro = cotizarEnvio({ ...magra, retiroEnLocal: false }, { subtotal: 45000, modo: "retiro" });
  assert.ok(!sinRetiro.ok && /No tenemos retiro/.test(sinRetiro.motivo));
  const pausada = { ...magra, tiendaPausada: { mensaje: "Hoy no tomamos pedidos por la web" } };
  const p = cotizarEnvio(pausada, { subtotal: 45000, modo: "envio", zonaId: "barrios" });
  assert.ok(!p.ok && p.motivo === "Hoy no tomamos pedidos por la web");
  assert.equal(motivoTiendaPausada({ tiendaPausada: { mensaje: "  " } }), MENSAJE_PAUSA_POR_DEFECTO);
  assert.equal(motivoTiendaPausada(magra), null);
});

test("sin configuración, todo como hoy: retiro gratis, envío sin zonas a $0 y sin renglón", () => {
  const def = configPorDefecto();
  assert.deepEqual(cotizarEnvio(def, { subtotal: 45000, modo: "retiro" }), { ok: true, modo: "retiro", costo: 0, zona: null, faltaParaGratis: 0, renglon: null });
  assert.deepEqual(cotizarEnvio(def, { subtotal: 45000, modo: "envio", zonaId: null }), { ok: true, modo: "envio", costo: 0, zona: null, faltaParaGratis: 0, renglon: null });
  assert.equal(configComoShipping(def, "barrios"), null);
  // El llamador cae a la tarifa del copy: Shine sigue con $3.500, gratis desde $25.000 (MG-037).
  const shine = { flatRate: 3500, freeThreshold: 25000 };
  const rige = shippingVigente(configComoShipping(def, null), shine);
  assert.equal(shippingCost(10000, "DELIVERY", rige), 3500);
  assert.equal(shippingCost(25000, "DELIVERY", rige), 0);
  assert.equal(shippingVigente(null, undefined), null);
});

test("configComoShipping: la zona elegida da el mismo costo con la tarifa de siempre", () => {
  const s = configComoShipping(magra, "barrios")!;
  assert.deepEqual(s, { flatRate: 4000, freeThreshold: 60000 });
  for (const sub of [1, 45000, 59999.99, 60000, 90000]) {
    assert.equal(shippingCost(sub, "DELIVERY", s), costoDeEnvio(sub, barrios), `subtotal ${sub}`);
  }
  assert.equal(amountToFreeShipping(45000, s), faltaParaGratis(45000, barrios));
  const nunca = configComoShipping(magra, "ezeiza")!;
  assert.equal(shippingCost(1_000_000, "DELIVERY", nunca), 6000);
  assert.equal(shippingVigente(s, { flatRate: 3500, freeThreshold: 25000 }), s);
});

test("renglonDeEnvio: «Envío · <zona>»", () => {
  assert.equal(renglonDeEnvio({ nombre: "Ezeiza" }), "Envío · Ezeiza");
});

test("mostrador (MG-031): misma zona y costo que la tienda; no frenan el mínimo ni la pausa; la zona sí se exige; sin zonas, lo de siempre", () => {
  const pausada: ConfigEnvios = { ...magra, tiendaPausada: { mensaje: "Hoy no tomamos pedidos por la web" } };
  const r = cotizarEnvioDelMostrador(pausada, { subtotal: 12000, zonaId: "barrios" });
  assert.ok(r.ok);
  assert.deepEqual([r.costo, r.zona?.id, r.renglon], [4000, "barrios", "Envío · Canning – barrios cerrados"]);
  const gratis = cotizarEnvioDelMostrador(magra, { subtotal: 60000, zonaId: "barrios" });
  assert.ok(gratis.ok && gratis.costo === 0);
  // La tienda, con la misma bolsa, sí frena: el mostrador sólo saca las reglas de la tienda.
  assert.equal(cotizarEnvio(magra, { subtotal: 12000, modo: "envio", zonaId: "barrios" }).ok, false);
  const sinZona = cotizarEnvioDelMostrador(magra, { subtotal: 45000, zonaId: null });
  assert.ok(!sinZona.ok && /zona/.test(sinZona.motivo));
  assert.equal(cotizarEnvioDelMostrador(magra, { subtotal: 45000, zonaId: "inventada" }).ok, false);
  const sinZonas = cotizarEnvioDelMostrador({ ...magra, zonas: [] }, { subtotal: 45000, zonaId: "barrios" });
  assert.deepEqual(sinZonas.ok && [sinZonas.costo, sinZonas.zona, sinZonas.renglon], [0, null, null]);
});
