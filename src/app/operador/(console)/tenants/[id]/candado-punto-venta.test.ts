// ============================================================================
// CANDADO FISCAL — un CUIT no repite punto de venta entre negocios, ejecutado con datos.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avisoDeChoqueAlContador,
  choqueDePuntoDeVenta,
  cuitNormalizado,
  elegirNegocioDelCuit,
  motivoCuitAmbiguo,
  motivoDeChoque,
  puntosDeVentaUsados,
  type NegocioDelCuit,
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

test("el aviso al contador dice qué no se hizo y cómo seguir, sin nombrar al otro negocio", () => {
  const m = avisoDeChoqueAlContador(3);
  assert.match(m, /No se cargó el punto de venta 3/);
  assert.match(m, /Pedí en ARCA un punto de venta nuevo/);
  assert.doesNotMatch(m, /MAGRA|Canning|\/magra/);
});

// ── El alta del contador con un CUIT que tienen varios negocios ──────────────

const n = (id: string, arcaPuntoVenta: number | null, enMiCartera: boolean): NegocioDelCuit => ({
  id,
  slug: id,
  arcaPuntoVenta,
  enMiCartera,
});

test("CUIT de un solo negocio: nuevo, propio, ajeno o re-alta, como antes", () => {
  assert.deepEqual(elegirNegocioDelCuit("estudio", [], 3), { tipo: "nuevo" });
  assert.deepEqual(elegirNegocioDelCuit("estudio", [n("estudio", null, false)], null), { tipo: "propio" });
  assert.deepEqual(elegirNegocioDelCuit("estudio", [n("otro", 1, false)], null), { tipo: "ajeno" });
  assert.deepEqual(elegirNegocioDelCuit("estudio", [n("mio", 1, true)], null), { tipo: "realta", negocio: n("mio", 1, true) });
});

test("CUIT de una marca con varios locales: nunca elige uno cualquiera", () => {
  // El que devolvía primero la base (findFirst) no era el de la cartera: antes decía "ajeno".
  const marca = [n("canning", 3, false), n("lomas", 1, true)];
  assert.deepEqual(elegirNegocioDelCuit("estudio", marca, null), { tipo: "realta", negocio: marca[1] });
  // Dos de la cartera: desempata el punto de venta que escribió el contador.
  const dos = [n("canning", 3, true), n("lomas", 1, true), n("adrogue", null, false)];
  assert.deepEqual(elegirNegocioDelCuit("estudio", dos, 1), { tipo: "realta", negocio: dos[1] });
  // Sin punto de venta (o con uno que no es de ninguno): se pregunta, con los de SU cartera.
  const sinPv = elegirNegocioDelCuit("estudio", dos, null);
  assert.deepEqual(sinPv, { tipo: "ambiguo", cantidad: 2, puntosDeVenta: [1, 3] });
  assert.deepEqual(elegirNegocioDelCuit("estudio", dos, 7), sinPv);
  assert.match(motivoCuitAmbiguo(2, [1, 3]), /2 negocios en tu cartera \(puntos de venta 1, 3\)/);
  // Si alguno de los del CUIT es el propio estudio, gana eso.
  assert.deepEqual(elegirNegocioDelCuit("estudio", [...dos, n("estudio", null, false)], 1), { tipo: "propio" });
});
