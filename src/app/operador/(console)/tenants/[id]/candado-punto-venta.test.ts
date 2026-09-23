// ============================================================================
// CANDADO FISCAL — un CUIT no repite punto de venta entre negocios, ejecutado con datos.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  choqueDePuntoDeVenta,
  cuitNormalizado,
  motivoDeChoque,
  puntosDeVentaUsados,
  type NegocioFiscal,
} from "./candado-punto-venta";

const CUIT = "20304050607";

// Una marca con tres locales bajo el mismo CUIT y un negocio ajeno con otro CUIT.
const OTROS: NegocioFiscal[] = [
  { id: "t-canning", name: "MAGRA Canning", slug: "magra-canning", arcaCuit: CUIT, arcaPuntoVenta: 3 },
  { id: "t-lomas", name: "MAGRA Lomas", slug: "magra-lomas", arcaCuit: CUIT, arcaPuntoVenta: 1 },
  { id: "t-nuevo", name: "MAGRA Adrogué", slug: "magra-adrogue", arcaCuit: CUIT, arcaPuntoVenta: null },
  { id: "t-ajeno", name: "Velas Shine", slug: "shinevelas", arcaCuit: "27111111113", arcaPuntoVenta: 3 },
];

test("cargar el punto de venta 3 en un CUIT que otro negocio ya usa con el 3 → rechazo", () => {
  const choque = choqueDePuntoDeVenta({ tenantId: "t-casa", cuit: CUIT, puntoVenta: 3 }, OTROS);
  assert.equal(choque?.slug, "magra-canning");
});

test("el mismo CUIT con un punto de venta libre pasa", () => {
  assert.equal(choqueDePuntoDeVenta({ tenantId: "t-casa", cuit: CUIT, puntoVenta: 4 }, OTROS), null);
});

test("el mismo punto de venta con OTRO CUIT pasa: es otro talonario", () => {
  assert.equal(choqueDePuntoDeVenta({ tenantId: "t-casa", cuit: "23222222229", puntoVenta: 3 }, OTROS), null);
});

test("volver a guardar el propio punto de venta no es un choque", () => {
  assert.equal(choqueDePuntoDeVenta({ tenantId: "t-canning", cuit: CUIT, puntoVenta: 3 }, OTROS), null);
});

test("sin CUIT o sin punto de venta no hay talonario que compartir", () => {
  assert.equal(choqueDePuntoDeVenta({ tenantId: "t-casa", cuit: null, puntoVenta: 3 }, OTROS), null);
  assert.equal(choqueDePuntoDeVenta({ tenantId: "t-casa", cuit: CUIT, puntoVenta: null }, OTROS), null);
});

test("cambiar el CUIT de un negocio que ya tiene punto de venta también choca", () => {
  // setTenantArcaCuit corre el mismo chequeo con el CUIT NUEVO y el punto de venta que ya tenía.
  const choque = choqueDePuntoDeVenta({ tenantId: "t-casa", cuit: CUIT, puntoVenta: 1 }, OTROS);
  assert.equal(choque?.slug, "magra-lomas");
});

test("el CUIT se compara por sus dígitos: con guiones o sin guiones es el mismo", () => {
  assert.equal(cuitNormalizado("20-30405060-7"), CUIT);
  const conGuiones = OTROS.map((o) => ({ ...o, arcaCuit: o.arcaCuit === CUIT ? "20-30405060-7" : o.arcaCuit }));
  assert.equal(choqueDePuntoDeVenta({ tenantId: "t-casa", cuit: CUIT, puntoVenta: 3 }, conGuiones)?.slug, "magra-canning");
});

test("los puntos usados del CUIT salen ordenados y sin el propio ni los vacíos", () => {
  const usados = puntosDeVentaUsados("t-lomas", CUIT, OTROS);
  assert.deepEqual(
    usados.map((u) => [u.puntoVenta, u.negocio.slug]),
    [[3, "magra-canning"]],
  );
  assert.deepEqual(puntosDeVentaUsados("t-casa", null, OTROS), []);
});

test("el motivo dice quién lo usa, qué pasa y cómo seguir", () => {
  const otro = OTROS[0];
  const m = motivoDeChoque(CUIT, 3, otro, puntosDeVentaUsados("t-casa", CUIT, OTROS));
  assert.match(m, /punto de venta 3 del CUIT 20-30405060-7/);
  assert.match(m, /MAGRA Canning/);
  assert.match(m, /Pedí en ARCA un punto de venta nuevo/);
  assert.match(m, /1 \(MAGRA Lomas\), 3 \(MAGRA Canning\)/);
});
