// Precio por capas (MIA T1): centavos exactos, redondeo mitad hacia arriba, tope del redondeo en el borde, repartos que
// cuadran y parámetros que se rechazan.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bpDeTexto,
  centavosDePesos,
  centavosDeTexto,
  comisionesDelProyecto,
  dentroDelTope,
  desglosePrecio,
  formulaVigente,
  PARAMETROS_MIA,
  porcionBp,
  precioFinal,
  problemaDeParametros,
  proporcion,
  rangoDelTope,
  repartoDelAhorro,
  textoDeBp,
} from "./precio-capas-core";

test("desglose MIA de $ 1.000.000: cada capa al centavo y el 7 % sale de la venta, no del costo", () => {
  const d = desglosePrecio(100_000_000, PARAMETROS_MIA);
  assert.deepEqual(d, {
    costo: 100_000_000,
    rentabilidad: 30_000_000,
    comisionProductor: 3_000_000,
    comisionComercial: 3_000_000,
    subtotal: 136_000_000,
    margenError: 6_800_000,
    antesDeImpuestos: 142_800_000,
    impuestos: 10_748_387,
    sugerido: 153_548_387,
  });
  // El 7 % del precio cubre los impuestos (al centavo): 153.548.387 · 0,07 = 10.748.387,09.
  assert.equal(porcionBp(d.sugerido, 700), d.impuestos);
  assert.equal(d.costo + d.rentabilidad + d.comisionProductor + d.comisionComercial + d.margenError + d.impuestos, d.sugerido, "las capas suman el sugerido");
});

test("redondeo mitad hacia arriba, simétrico para negativos, sin flotantes", () => {
  assert.equal(proporcion(5, 1, 10), 1); // 0,5 → 1
  assert.equal(proporcion(4, 1, 10), 0); // 0,4 → 0
  assert.equal(proporcion(-5, 1, 10), -1);
  assert.equal(proporcion(-4, 1, 10), 0);
  assert.ok(!Object.is(proporcion(-4, 1, 10), -0), "nunca −0");
  assert.equal(porcionBp(1, 5000), 1); // medio centavo sube
  assert.equal(porcionBp(1, 4999), 0);
  assert.equal(porcionBp(333, 3000), 100); // 99,9 → 100
  // 0,1 + 0,2 no existe acá: todo es entero.
  assert.equal(centavosDePesos(0.1) + centavosDePesos(0.2), 30);
  assert.equal(centavosDePesos(1.005), 101);
  assert.equal(centavosDePesos(-2.675), -268);
  assert.throws(() => proporcion(1.5, 1, 1), RangeError);
  assert.throws(() => proporcion(1, 1, 0), RangeError);
});

test("costos de un centavo y de cero: no se inventa plata", () => {
  const cero = desglosePrecio(0, PARAMETROS_MIA);
  assert.equal(cero.sugerido, 0);
  assert.equal(cero.impuestos, 0);
  const uno = desglosePrecio(1, PARAMETROS_MIA);
  assert.equal(uno.rentabilidad, 0); // 0,3 centavos
  assert.equal(uno.sugerido, 1);
  assert.throws(() => desglosePrecio(-1, PARAMETROS_MIA), RangeError);
  assert.throws(() => desglosePrecio(10.5, PARAMETROS_MIA), RangeError);
});

test("montos grandes (un evento de $ 70 M y uno de $ 10.000 M) sin desbordar", () => {
  const d = desglosePrecio(7_000_000_000, PARAMETROS_MIA);
  assert.equal(d.subtotal, 9_520_000_000);
  assert.equal(d.antesDeImpuestos, 9_996_000_000);
  assert.equal(d.sugerido, 10_748_387_097); // 9.996.000.000 / 0,93 = 10.748.387.096,77
  const enorme = desglosePrecio(1_000_000_000_000, PARAMETROS_MIA);
  assert.ok(Number.isSafeInteger(enorme.sugerido));
  assert.equal(enorme.costo + enorme.rentabilidad + enorme.comisionProductor + enorme.comisionComercial + enorme.margenError + enorme.impuestos, enorme.sugerido);
});

test("con todo en cero, el sugerido es el costo", () => {
  const p = { ...PARAMETROS_MIA, rentabilidadBp: 0, comisionProductorBp: 0, comisionComercialBp: 0, margenErrorBp: 0, impuestosBp: 0 };
  assert.equal(desglosePrecio(123_457, p).sugerido, 123_457);
});

test("tope del redondeo: el borde exacto entra, un centavo más no; para arriba y para abajo", () => {
  const sugerido = 153_548_387;
  const { minimo, maximo } = rangoDelTope(sugerido, 500);
  assert.equal(maximo, sugerido + 7_677_419); // 5 % = 7.677.419,35 → se puede mover hasta 7.677.419
  assert.equal(minimo, sugerido - 7_677_419);
  assert.equal(dentroDelTope(sugerido, maximo, 500), true);
  assert.equal(dentroDelTope(sugerido, maximo + 1, 500), false);
  assert.equal(dentroDelTope(sugerido, minimo, 500), true);
  assert.equal(dentroDelTope(sugerido, minimo - 1, 500), false);
  // Exacto: 10.000 de sugerido, 5 % son 500 justos.
  assert.equal(dentroDelTope(10_000, 10_500, 500), true);
  assert.equal(dentroDelTope(10_000, 10_501, 500), false);
  assert.equal(dentroDelTope(10_000, 9_500, 500), true);
  assert.equal(dentroDelTope(10_000, 9_499, 500), false);
  assert.equal(dentroDelTope(10_000, 10_001, 0), false, "tope 0: sólo el sugerido");
});

test("precio final: a mano dentro del tope, el redondeo con signo; sin precio a mano vale el sugerido", () => {
  const auto = precioFinal(153_548_387, null, 500);
  assert.deepEqual(auto, { final: 153_548_387, manual: false, redondeo: 0, redondeoBp: 0, dentroDelTope: true });
  const redondo = precioFinal(153_548_387, 155_000_000, 500);
  assert.equal(redondo.redondeo, 1_451_613);
  assert.equal(redondo.redondeoBp, 95); // 0,95 %
  assert.equal(redondo.dentroDelTope, true);
  const abajo = precioFinal(153_548_387, 150_000_000, 500);
  assert.equal(abajo.redondeo, -3_548_387);
  assert.equal(abajo.redondeoBp, -231);
  const fuera = precioFinal(153_548_387, 170_000_000, 500);
  assert.equal(fuera.dentroDelTope, false);
  assert.equal(precioFinal(0, 100, 500).dentroDelTope, false, "sin costo, un precio a mano no tiene contra qué medirse");
});

test("comisiones: un % de la rentabilidad por persona; el ahorro 75/25 cuadra al centavo", () => {
  const d = desglosePrecio(100_000_000, PARAMETROS_MIA);
  const reparto = repartoDelAhorro(100_000_000, 92_000_001, 7500); // ahorro 7.999.999 centavos
  assert.equal(reparto.ahorro, 7_999_999);
  assert.equal(reparto.empresa, 5_999_999); // 5.999.999,25 → baja
  assert.equal(reparto.empresa + reparto.productor, reparto.ahorro, "el reparto suma el ahorro");
  const c = comisionesDelProyecto(d, reparto, { productorId: "p1", comercialId: "c1" });
  assert.deepEqual(c[0], { rol: "productor", personaId: "p1", comision: 3_000_000, ahorro: reparto.productor, total: 3_000_000 + reparto.productor });
  assert.deepEqual(c[1], { rol: "comercial", personaId: "c1", comision: 3_000_000, ahorro: 0, total: 3_000_000 });
});

test("reparto del ahorro: impar, gasto de más, sin datos y 100 % para la empresa", () => {
  assert.deepEqual(repartoDelAhorro(3, 0, 7500), { ahorro: 3, empresa: 2, productor: 1 }); // 2,25 → 2
  assert.deepEqual(repartoDelAhorro(2, 0, 7500), { ahorro: 2, empresa: 2, productor: 0 }); // 1,5 → 2
  assert.deepEqual(repartoDelAhorro(100, 150, 7500), { ahorro: -50, empresa: 0, productor: 0 }, "gastar de más no le descuenta al productor");
  assert.deepEqual(repartoDelAhorro(100, 100, 7500), { ahorro: 0, empresa: 0, productor: 0 });
  assert.deepEqual(repartoDelAhorro(null, 10, 7500), { ahorro: null, empresa: 0, productor: 0 });
  assert.deepEqual(repartoDelAhorro(100, null, 7500), { ahorro: null, empresa: 0, productor: 0 });
  assert.deepEqual(repartoDelAhorro(1001, 0, 10_000), { ahorro: 1001, empresa: 1001, productor: 0 });
  for (let a = 1; a < 500; a++) {
    const r = repartoDelAhorro(a, 0, 7500);
    assert.equal(r.empresa + r.productor, a);
    assert.ok(r.productor >= 0 && r.empresa >= 0);
  }
});

test("el 75/25 se puede cambiar por negocio (60/40)", () => {
  assert.deepEqual(repartoDelAhorro(1_000_000, 0, 6000), { ahorro: 1_000_000, empresa: 600_000, productor: 400_000 });
});

test("parámetros: porcentajes enteros en puntos básicos dentro de sus topes", () => {
  assert.equal(problemaDeParametros(PARAMETROS_MIA), null);
  assert.match(problemaDeParametros({ ...PARAMETROS_MIA, impuestosBp: 10_000 }) ?? "", /Ingresos Brutos/);
  assert.match(problemaDeParametros({ ...PARAMETROS_MIA, comisionProductorBp: -1 }) ?? "", /productor/);
  assert.match(problemaDeParametros({ ...PARAMETROS_MIA, ahorroEmpresaBp: 10_001 }) ?? "", /Ahorro/);
  assert.match(problemaDeParametros({ ...PARAMETROS_MIA, rentabilidadBp: 30.5 }) ?? "", /Rentabilidad/);
  assert.throws(() => desglosePrecio(100, { ...PARAMETROS_MIA, impuestosBp: 9_999 }), RangeError);
});

test("leer porcentajes y montos como los escribe una persona", () => {
  assert.equal(bpDeTexto("30"), 3000);
  assert.equal(bpDeTexto("7,5"), 750);
  assert.equal(bpDeTexto("7.25"), 725);
  assert.equal(bpDeTexto("5 %"), 500);
  assert.equal(bpDeTexto("0"), 0);
  assert.equal(bpDeTexto("7,255"), null);
  assert.equal(bpDeTexto("-5"), null);
  assert.equal(bpDeTexto("abc"), null);
  assert.equal(textoDeBp(725), "7,25");
  assert.equal(textoDeBp(3000), "30");

  assert.equal(centavosDeTexto("1.250.000"), 125_000_000);
  assert.equal(centavosDeTexto("1.250.000,5"), 125_000_050);
  assert.equal(centavosDeTexto("$ 1.500"), 150_000);
  assert.equal(centavosDeTexto("1500.75"), 150_075);
  assert.equal(centavosDeTexto("1500"), 150_000);
  assert.equal(centavosDeTexto("1.5"), 150);
  assert.equal(centavosDeTexto("12,345"), null, "tres decimales no");
  assert.equal(centavosDeTexto("1,250,000"), null);
  assert.equal(centavosDeTexto("-100"), null);
  assert.equal(centavosDeTexto(""), null);
});

test("formula vigente: sin fila o apagada, nada cambia; con datos imposibles, tampoco", () => {
  assert.equal(formulaVigente(null), null);
  assert.equal(formulaVigente(undefined), null);
  assert.equal(formulaVigente({ activa: false, ...PARAMETROS_MIA }), null);
  assert.deepEqual(formulaVigente({ activa: true, ...PARAMETROS_MIA }), { ...PARAMETROS_MIA });
  assert.equal(formulaVigente({ activa: true, ...PARAMETROS_MIA, impuestosBp: 20_000 }), null);
});
