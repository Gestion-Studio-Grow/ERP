// ============================================================================
// LA ENTREGA EN TODAS LAS VIDRIERAS (reingeniería Magra 1I: el hueco que dejó 1H)
// ============================================================================
//
// 1H puso zona, mínimo, franja y tienda pausada en MagraFront; las demás vidrieras que mandan a
// `placeOnlineOrder` no tenían selector y, con zonas cargadas, el servidor les rechazaba el envío a
// domicilio. Acá:
//   · `entregaDeLaBolsa` (pura): la vista previa ÚNICA, con las mismas reglas que el servidor; sin
//     configuración de Envíos da EXACTAMENTE lo de siempre (`shippingCost` con la tarifa del copy);
//   · la forma: cada vidriera que pasa por `placeOnlineOrder` usa la pieza y la página le pasa la config.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shippingCost, type ShippingConfig } from "@/lib/storefront-shipping";
import { CONFIG_ENVIOS_POR_DEFECTO, type ConfigEnvios } from "@/lib/envios/modelo";
import { cotizarEnvio } from "@/lib/envios/tarifa";
import { entregaDeLaBolsa, type EntregaElegida } from "./reglas-tienda";
import { CONFIG_MAGRA } from "./envio-de-la-tienda.fixture";

const SHINE: ShippingConfig = { flatRate: 3500, freeThreshold: 25000 };
const HOY = "2026-10-22";
const elegida = (o: Partial<EntregaElegida> = {}): EntregaElegida => ({ fulfillment: "DELIVERY", zonaId: "", franja: "", dia: "", ...o });
const con = (entrega: ConfigEnvios | null, subtotal: number, o: Partial<EntregaElegida> = {}, envio: ShippingConfig | null = null) =>
  entregaDeLaBolsa({ entrega, hoy: HOY, subtotal, hayProductos: subtotal > 0, envio, elegida: elegida(o) });

test("sin configuración de Envíos (null o la de siempre) es EXACTAMENTE lo de antes: la tarifa del copy, retiro y nada que frene", () => {
  for (const entrega of [null, { ...CONFIG_ENVIOS_POR_DEFECTO, zonas: [], franjasRetiro: [] }]) {
    for (const subtotal of [0, 12000, 24999.99, 25000, 60000]) {
      for (const fulfillment of ["DELIVERY", "PICKUP"] as const) {
        const e = con(entrega, subtotal, { fulfillment }, SHINE);
        assert.equal(e.costoEnvio, shippingCost(subtotal, fulfillment, SHINE), `${subtotal} ${fulfillment}`);
        assert.equal(e.fulfillment, fulfillment);
        assert.equal(e.freno, null);
        assert.equal(e.hayRetiro, true);
        assert.equal(e.conZonas, false);
        assert.deepEqual(e.franjas, []);
        assert.equal(e.faltaParaGratis, 0, "el «te faltan» del copy lo sigue diciendo cada vidriera, como siempre");
      }
    }
    // Sin tarifa en el copy (la vidriera genérica): 0, como siempre.
    assert.equal(con(entrega, 45000, {}, null).costoEnvio, 0);
  }
});

test("MG-032 · con zonas: sin elegirla frena y no suma; con la zona suma su costo y dice cuánto falta para el gratis; con $60.000, $0", () => {
  const sinZona = con(CONFIG_MAGRA, 45000);
  assert.equal(sinZona.conZonas, true);
  assert.equal(sinZona.zona, null);
  assert.equal(sinZona.costoEnvio, 0);
  assert.equal(sinZona.freno, "Elegí a qué zona va el envío.");

  const barrios = con(CONFIG_MAGRA, 45000, { zonaId: "barrios" });
  assert.equal(barrios.zona?.nombre, "Canning – barrios cerrados");
  assert.equal(barrios.costoEnvio, 4000);
  assert.equal(barrios.faltaParaGratis, 15000);
  assert.deepEqual(barrios.franjas, ["L-S 11-13", "L-S 17-19"]);
  assert.equal(barrios.freno, "Elegí en qué franja te queda mejor.", "con franjas, hay que elegir una");
  assert.equal(barrios.diaElegido, HOY, "el día arranca en hoy");

  const lista = con(CONFIG_MAGRA, 45000, { zonaId: "barrios", franja: "L-S 17-19", dia: "2026-10-23" });
  assert.equal(lista.freno, null);
  assert.equal(lista.franjaElegida, "L-S 17-19");
  assert.equal(lista.diaElegido, "2026-10-23");
  // La misma cuenta que hace el servidor en el alta.
  const servidor = cotizarEnvio(CONFIG_MAGRA, { subtotal: 45000, modo: "envio", zonaId: "barrios" });
  assert.ok(servidor.ok);
  assert.equal(lista.costoEnvio, servidor.costo);

  assert.equal(con(CONFIG_MAGRA, 60000, { zonaId: "barrios", franja: "L-S 11-13" }).costoEnvio, 0);
  // Una franja que no es de la zona, o un día fuera de los que se ofrecen, no cuentan.
  const otra = con(CONFIG_MAGRA, 45000, { zonaId: "barrios", franja: "Ma, Vi 17-19", dia: "2027-01-01" });
  assert.equal(otra.franjaElegida, "");
  assert.equal(otra.diaElegido, HOY);
});

test("MG-034 · bajo el mínimo de envío avisa cuánto falta y ofrece «Retiro en el local»; en retiro, sin cargo y sin mínimo", () => {
  const e = con(CONFIG_MAGRA, 12000, { zonaId: "barrios" });
  assert.match(e.freno ?? "", /El envío es para pedidos desde \$20\.000: te faltan \$8\.000\./);
  assert.equal(e.ofrecerRetiro, true);
  const retiro = con(CONFIG_MAGRA, 12000, { fulfillment: "PICKUP", zonaId: "barrios" });
  assert.equal(retiro.modo, "retiro");
  assert.equal(retiro.freno, null);
  assert.equal(retiro.costoEnvio, 0);
  assert.equal(retiro.horarioRetiro, "Lun a sáb 9–19");
});

test("MG-036 · tienda pausada: frena siempre con el mensaje del dueño, también con la bolsa vacía", () => {
  const pausada = { ...CONFIG_MAGRA, tiendaPausada: { mensaje: "Hoy no tomamos pedidos por la web" } };
  assert.equal(con(pausada, 0).freno, "Hoy no tomamos pedidos por la web");
  assert.equal(con(pausada, 45000, { fulfillment: "PICKUP" }).freno, "Hoy no tomamos pedidos por la web");
});

test("sin retiro habilitado, la entrega es envío aunque la pantalla tuviera «retiro» elegido; franjas de retiro sin zonas, se piden", () => {
  const sinRetiro = { ...CONFIG_MAGRA, retiroEnLocal: false };
  const e = con(sinRetiro, 45000, { fulfillment: "PICKUP" });
  assert.equal(e.hayRetiro, false);
  assert.equal(e.modo, "envio");
  assert.equal(e.fulfillment, "DELIVERY");
  assert.equal(e.freno, "Elegí a qué zona va el envío.");

  const soloRetiro: ConfigEnvios = { ...CONFIG_ENVIOS_POR_DEFECTO, zonas: [], franjasRetiro: ["Sáb 10-13"] };
  const r = con(soloRetiro, 9000, { fulfillment: "PICKUP" }, SHINE);
  assert.deepEqual(r.franjas, ["Sáb 10-13"]);
  assert.equal(r.freno, "Elegí en qué franja te queda mejor.");
  assert.equal(con(soloRetiro, 9000, { fulfillment: "PICKUP", franja: "Sáb 10-13" }, SHINE).freno, null);
  // Sin zonas, el envío sigue con la tarifa del copy (Shine) aunque haya franjas de retiro.
  assert.equal(con(soloRetiro, 9000, { fulfillment: "DELIVERY" }, SHINE).costoEnvio, 3500);
});

// ── La forma: todas las vidrieras que mandan a `placeOnlineOrder` usan la misma pieza ─────────

const leer = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("cada vidriera que pasa por placeOnlineOrder ofrece la entrega del negocio y frena el botón con lo que falta", () => {
  // Las que llevan su bolsa propia: la entrega con el hook compartido (MagraFront incluida: una sola regla).
  for (const f of ["./MagraFront.tsx", "./ShineFront.tsx", "./Storefront.tsx", "./SiteReplica.tsx"]) {
    const src = leer(f);
    assert.match(src, /usePedidoOnline\(/, `${f} manda a placeOnlineOrder`);
    assert.match(src, /useEntregaDeLaTienda\(/, `${f} usa la entrega compartida`);
    assert.doesNotMatch(src, /shippingCost\(/, `${f} no vuelve a calcular el envío por su cuenta`);
  }
  // Las de la vidriera nueva (TiendaNueva) y Qué Bien Olés: la entrega viene de useVidriera.
  assert.match(leer("./vidriera/useVidriera.ts"), /useEntregaDeLaTienda\(/);
  for (const f of ["./vidriera/BolsaPanel.tsx", "./quebienoles/Bolsa.tsx", "./ShineFront.tsx", "./Storefront.tsx", "./SiteReplica.tsx"]) {
    const src = leer(f);
    assert.match(src, /<CamposDeEntrega /, `${f} dibuja zona, día y franja`);
    assert.match(src, /<FrenoDeEntrega /, `${f} dice lo que frena`);
    assert.match(src, /entrega\.freno/, `${f} frena el botón`);
  }
  // La página le pasa la configuración (y hoy) a TODAS: magra, la nueva, Shine, Qué Bien Olés, réplica y genérica.
  const pagina = leer("./page.tsx");
  assert.equal((pagina.match(/entrega=\{entrega\}/g) ?? []).length, 6);
  assert.equal((pagina.match(/hoy=\{hoy\}/g) ?? []).length, 6);
  assert.match(pagina, /return version === null \? null : config;/, "un negocio que nunca guardó Envíos queda como siempre");
});
