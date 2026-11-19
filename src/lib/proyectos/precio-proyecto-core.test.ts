// MIA T07 (GSG-MIA-149) · el tablero por función, los rangos (O15), el reparto (O50) y la foto (O18). PURO.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularPrecio, type PorcentajesPrecio } from "./precio-core";
import {
  calcularTablero,
  decisionDelTotal,
  errorDePorcentajes,
  fueraDeRango,
  itemsParaElCliente,
  modoPropuesta,
  totalesDelNeto,
  funcionesSinPersona,
  participantesDeLaFoto,
  porcentajesVigentes,
  repartoInicial,
  validarReparto,
  type MiembroEquipo,
  type PorcentajesProyecto,
} from "./precio-proyecto-core";

const FUNCIONES = [
  { id: "COMERCIAL", nombre: "Comercial" },
  { id: "PRODUCTOR", nombre: "Productor" },
  { id: "PRODUCTOR_CAMPO", nombre: "Productor de campo" },
];
const TOPE = { pct: 5, medidoSobre: "bruto" as const };
const Z: PorcentajesProyecto = { rentabilidad: 30, margenError: 5, iibGa: 7, comision: { COMERCIAL: 10, PRODUCTOR: 10, PRODUCTOR_CAMPO: 0 } };
const enMotor = (p: PorcentajesProyecto): PorcentajesPrecio => ({ rentabilidad: p.rentabilidad, margenError: p.margenError, iibGa: p.iibGa, productor1: p.comision.PRODUCTOR ?? 0, productor2: p.comision.PRODUCTOR_CAMPO ?? 0, comercial: p.comision.COMERCIAL ?? 0 });

test("caso Z: el tablero por función da los renglones del plan § 2.1", () => {
  const t = calcularTablero({ costoOriginal: 100_000_000, adicionales: 0, porcentajes: Z, funciones: FUNCIONES, totalVenta: 149_000_000, tope: TOPE });
  assert.equal(t.rentabilidad, 30_000_000);
  assert.deepEqual(t.comisiones, { COMERCIAL: 3_000_000, PRODUCTOR: 3_000_000, PRODUCTOR_CAMPO: 0 });
  assert.equal(t.margenError, 6_500_000);
  assert.equal(t.subtotal, 142_500_000);
  assert.equal(t.iibGa, 10_725_806);
  assert.equal(t.redondeoBruto, 6_500_000);
  assert.equal(t.redondeoNeto, -4_225_806);
  assert.equal(t.redondeoPuntos, 436);
  assert.equal(t.pasaTope, false, "4,36 % no se pasa del tope de 5 %");
  assert.equal(t.totalMenorAlSubtotal, false);
});

test("Z-tope y Z-mín: sobre el tope espera a Dirección (o frena); debajo del subtotal, rechazo", () => {
  const tope = calcularTablero({ costoOriginal: 100_000_000, adicionales: 0, porcentajes: Z, funciones: FUNCIONES, totalVenta: 153_225_806, tope: TOPE });
  assert.equal(tope.pasaTope, true, "7 % se pasa del tope de 5 %");
  assert.deepEqual(decisionDelTotal(tope, "AVISA_APRUEBA_DIRECCION"), { esperaDireccion: true });
  assert.ok("rechazo" in decisionDelTotal(tope, "FRENA"));
  assert.deepEqual(decisionDelTotal(tope, "INFORMA"), { esperaDireccion: false });
  const min = calcularTablero({ costoOriginal: 100_000_000, adicionales: 0, porcentajes: Z, funciones: FUNCIONES, totalVenta: 140_000_000, tope: TOPE });
  assert.equal(min.totalMenorAlSubtotal, true);
  assert.match((decisionDelTotal(min, "INFORMA") as { rechazo: string }).rechazo, /menor que el subtotal/);
});

test("con tres funciones da exactamente lo mismo que el motor de T04 (500 casos sembrados)", () => {
  let semilla = 149;
  const azar = (n: number) => {
    semilla = (semilla * 1_103_515_245 + 12_345) % 2 ** 31;
    return semilla % n;
  };
  for (let i = 0; i < 500; i++) {
    const p: PorcentajesProyecto = { rentabilidad: azar(6000) / 100, margenError: azar(2000) / 100, iibGa: azar(1500) / 100, comision: { COMERCIAL: azar(3000) / 100, PRODUCTOR: azar(3000) / 100, PRODUCTOR_CAMPO: azar(3000) / 100 } };
    const co = azar(500_000_000);
    const ad = azar(50_000_000);
    const total = azar(3) === 0 ? null : azar(900_000_000);
    const tope = { pct: azar(10), medidoSobre: azar(2) === 0 ? ("bruto" as const) : ("neto" as const) };
    const t = calcularTablero({ costoOriginal: co, adicionales: ad, porcentajes: p, funciones: FUNCIONES, totalVenta: total, tope });
    const m = calcularPrecio({ costoOriginal: co, adicionales: ad, porcentajes: enMotor(p), totalVenta: total, tope });
    const caso = JSON.stringify({ p, co, ad, total, tope });
    assert.equal(t.subtotal, m.subtotal, caso);
    assert.equal(t.iibGa, m.iibGa, caso);
    assert.equal(t.rentabilidad, m.rentabilidad, caso);
    assert.equal(t.margenError, m.margenError, caso);
    assert.equal(t.comisiones.PRODUCTOR, m.comisiones.productor1, caso);
    assert.equal(t.comisiones.PRODUCTOR_CAMPO, m.comisiones.productor2, caso);
    assert.equal(t.comisiones.COMERCIAL, m.comisiones.comercial, caso);
    assert.deepEqual([t.redondeoBruto, t.redondeoNeto, t.redondeoPuntos, t.pasaTope, t.totalMenorAlSubtotal], [m.redondeoBruto, m.redondeoNeto, m.redondeoPuntos, m.pasaTope, m.totalMenorAlSubtotal], caso);
  }
});

test("una función nueva del negocio entra en el tablero con su comisión (no está fija en tres)", () => {
  const funciones = [...FUNCIONES, { id: "DISENIO", nombre: "Diseño" }];
  const t = calcularTablero({ costoOriginal: 100_000_000, adicionales: 0, porcentajes: { ...Z, comision: { ...Z.comision, DISENIO: 5 } }, funciones, totalVenta: null, tope: TOPE });
  assert.equal(t.comisiones.DISENIO, 1_500_000);
  assert.equal(t.subtotal, 144_000_000);
});

test("O15: fuera del rango del negocio, y los porcentajes guardados se completan con los del negocio", () => {
  const sinMargen = (v: number) => ({ valor: v, min: v, max: v });
  const rangos = { rentabilidad: sinMargen(30), margenError: sinMargen(5), iibGa: sinMargen(7), comision: { COMERCIAL: sinMargen(10), PRODUCTOR: sinMargen(10), PRODUCTOR_CAMPO: sinMargen(0) } };
  assert.deepEqual(fueraDeRango(Z, rangos, FUNCIONES), []);
  const f = fueraDeRango({ ...Z, rentabilidad: 35, comision: { ...Z.comision, COMERCIAL: 12 } }, rangos, FUNCIONES);
  assert.deepEqual(f.map((x) => x.clave), ["rentabilidad", "comision.COMERCIAL"]);
  const abierto = { ...rangos, rentabilidad: { valor: 30, min: 20, max: 40 } };
  assert.deepEqual(fueraDeRango({ ...Z, rentabilidad: 35 }, abierto, FUNCIONES), []);
  assert.equal(errorDePorcentajes({ ...Z, iibGa: 100 }), "IIB y GA tiene que ser menor que 100 %.");
  assert.match(errorDePorcentajes({ ...Z, rentabilidad: 10.555 }) ?? "", /decimales|0 y 100|porcentaje/i);
  const vig = porcentajesVigentes({ rentabilidad: 40, margenError: 6, iibGa: 8, comision: { COMERCIAL: 9 } }, Z);
  assert.deepEqual(vig.comision, { COMERCIAL: 9, PRODUCTOR: 10, PRODUCTOR_CAMPO: 0 });
  assert.equal(porcentajesVigentes({ rentabilidad: "x" }, Z), Z, "lo guardado que no tiene forma no se lee");
});

const EQUIPO: MiembroEquipo[] = [
  { id: "e1", personaId: "p1", nombre: "Ana", funcion: "COMERCIAL" },
  { id: "e2", personaId: "p2", nombre: "Beto", funcion: "PRODUCTOR" },
];
const CONCEPTOS = [{ id: "DEFENSA", nombre: "Defensa" }];

test("O50: reparto válido, redondeo no se reparte, personas ≤ 100 y con la empresa suma 100", () => {
  const ok = validarReparto({ DEFENSA: { e1: 10, e2: 15 } }, CONCEPTOS, EQUIPO);
  assert.deepEqual(ok, { ok: true, filas: [{ equipoId: "e1", concepto: "DEFENSA", puntos: 1000 }, { equipoId: "e2", concepto: "DEFENSA", puntos: 1500 }] });
  assert.deepEqual(validarReparto({ DEFENSA: { e1: 10, e2: 15, EMPRESA: 75 } }, CONCEPTOS, EQUIPO).ok, true);
  assert.match((validarReparto({ DEFENSA: { e1: 10, EMPRESA: 75 } }, CONCEPTOS, EQUIPO) as { error: string }).error, /suman 85 % y tienen que sumar 100/);
  assert.match((validarReparto({ DEFENSA: { e1: 60, e2: 50 } }, CONCEPTOS, EQUIPO) as { error: string }).error, /más de 100/);
  assert.match((validarReparto({ REDONDEO: { e1: 10 } }, CONCEPTOS, EQUIPO) as { error: string }).error, /redondeo no se reparte/);
  assert.match((validarReparto({ redondeo: { e1: 1 } }, CONCEPTOS, EQUIPO) as { error: string }).error, /redondeo no se reparte/);
  assert.match((validarReparto({ OTRO: { e1: 1 } }, CONCEPTOS, EQUIPO) as { error: string }).error, /no es un concepto/);
  assert.match((validarReparto({ DEFENSA: { intruso: 1 } }, CONCEPTOS, EQUIPO) as { error: string }).error, /no está en el equipo/);
  assert.match((validarReparto({ DEFENSA: { e1: -1 } }, CONCEPTOS, EQUIPO) as { error: string }).error, /de 0 a 100/);
});

test("O50: el reparto inicial sale de la matriz del negocio; una función que cobra sin persona frena", () => {
  const matriz = { DEFENSA: { EMPRESA: 75, PRODUCTOR: 25 } };
  assert.deepEqual(repartoInicial(matriz, CONCEPTOS, EQUIPO), { DEFENSA: { e2: 25 } });
  assert.deepEqual(funcionesSinPersona(Z, matriz, FUNCIONES, EQUIPO), []);
  assert.deepEqual(funcionesSinPersona(Z, matriz, FUNCIONES, [EQUIPO[0]]).map((f) => f.id), ["PRODUCTOR"]);
  assert.deepEqual(funcionesSinPersona({ ...Z, comision: { ...Z.comision, PRODUCTOR_CAMPO: 3 } }, matriz, FUNCIONES, EQUIPO).map((f) => f.id), ["PRODUCTOR_CAMPO"]);
});

test("O18: los participantes de la foto: comisión de la función, reparto y la empresa con el resto y el 100 % del redondeo", () => {
  const p = participantesDeLaFoto([...EQUIPO, { id: "e3", personaId: "p3", nombre: "Caro", funcion: "PRODUCTOR" }], { DEFENSA: { e1: 10, e2: 15 } }, CONCEPTOS, Z, "Empresa");
  assert.deepEqual(p.map((x) => [x.nombre, x.comisionPct, x.reparto.DEFENSA]), [["Ana", 10, 10], ["Beto", 10, 15], ["Caro", 0, 0], ["Empresa", 0, 75]]);
  assert.equal(p[3].reparto.REDONDEO, 100);
});

test("O17: el modo de la propuesta sale de los parámetros; sin precio por ítem no viaja ningún precio", () => {
  const v = { "precio.modo": "POR_TOTAL", "precio.propuesta.detalle": "TOTAL_SIN_PRECIO_POR_ITEM", "precio.propuesta.iva": "MAS_IVA" };
  assert.equal(modoPropuesta({ ...v, "precio.modo": "POR_ITEM" }, 100), null, "por ítem, la propuesta sale como siempre");
  const sin = modoPropuesta(v, 1_490_000)!;
  assert.deepEqual(sin, { neto: 1_490_000, sinPrecioPorItem: true, conIva: false });
  const items = [
    { id: "i1", rubro: "Montaje", descripcion: "Escenario", unidad: "u", cantidad: 2, precio: 1000, costo: 700, visibleCliente: true },
    { id: "i2", rubro: "Montaje", descripcion: "Traslado", unidad: "u", cantidad: 1, precio: 333.33, costo: 200, visibleCliente: false },
  ];
  assert.deepEqual(itemsParaElCliente(items, sin), [{ id: "i1", rubro: "Montaje", descripcion: "Escenario", unidad: "u", cantidad: 2, precio: null }]);
  const con = itemsParaElCliente(items, modoPropuesta({ ...v, "precio.propuesta.detalle": "PRECIO_POR_ITEM" }, null));
  assert.deepEqual(con.map((i) => [i.descripcion, i.precio]), [["Escenario", 1000], ["Otros conceptos", 333.33]]);
  assert.ok(con.every((i) => !("costo" in i)), "el costo nunca sale");
  assert.deepEqual(itemsParaElCliente(items, null).map((i) => i.precio), [1000, 333.33]);
  assert.equal(modoPropuesta({ ...v, "precio.propuesta.iva": "CON_IVA" }, null)!.conIva, true);
  assert.deepEqual(totalesDelNeto(1_490_000, 21), { neto: 1_490_000, iva: 312_900, total: 1_802_900 });
  assert.deepEqual(totalesDelNeto(314_159, 21), { neto: 314_159, iva: 65_973.39, total: 380_132.39 });
});
