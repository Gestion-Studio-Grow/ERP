// Las cuentas del PieDeCobro (Magra, tanda 1 · 1A), con los casos del catálogo MG de cobro.
// La pantalla y el servidor usan las mismas: lo que el pie escribe lo lee `leerPagos` (ida y
// vuelta probada abajo), y el reparto es `repartirPagos` (supermercado/pago-mixto.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  billetesSugeridos,
  camposDelPie,
  estadoDelEfectivo,
  importeCanonico,
  leerDivision,
  mediosLibres,
  motivoParaNoCobrar,
  MOTIVO_SIN_TOTAL,
  resultadoDeLaDivision,
  textoPlata,
  vueltoDelResultado,
  type ResultadoDelPie,
} from "./pie-de-cobro-core";
import { leerPagos, vueltoDelCobro } from "./leer-pagos";
import { textoDelPago } from "@/lib/supermercado/pago-mixto";

const TOTAL = 36608;

/** Lo que el pie escribe, como lo leería `formData.getAll` en el servidor. */
function comoFormulario(campos: [string, string][]) {
  return (nombre: string) => campos.filter(([n]) => n === nombre).map(([, v]) => v);
}

// ── Billetes ─────────────────────────────────────────────────────────────────

test("MG-008: para $36.608 los chips son $40.000 · $50.000 · $100.000 (ninguno igual o menor al total)", () => {
  assert.deepEqual(billetesSugeridos(TOTAL), [40000, 50000, 100000]);
});

test("billetes: totales chicos y con centavos, siempre por encima del total y ordenados", () => {
  assert.deepEqual(billetesSugeridos(4135.58), [5000, 6000, 10000]);
  // MG-012: el pedido de $25.700 se cobra con el chip de $30.000.
  assert.deepEqual(billetesSugeridos(25700), [30000, 40000, 50000]);
  for (const total of [1, 999.99, 1000, 12345.67, 99999, 100000, 250000.5]) {
    const b = billetesSugeridos(total);
    assert.ok(b.length > 0 && b.length <= 3, `total ${total}: ${b}`);
    assert.ok(b.every((x) => x > total), `total ${total}: ${b}`);
    assert.deepEqual([...b].sort((x, y) => x - y), b);
    assert.equal(new Set(b).size, b.length);
  }
});

test("billetes: sin total, nada que sugerir", () => {
  assert.deepEqual(billetesSugeridos(0), []);
  assert.deepEqual(billetesSugeridos(-5), []);
  assert.deepEqual(billetesSugeridos(Number.NaN), []);
});

// ── Efectivo: justo, vuelto, falta ───────────────────────────────────────────

test("MG-009: con $50.000 el vuelto es $13.392 y la venta sigue siendo por $36.608", () => {
  assert.deepEqual(estadoDelEfectivo(TOTAL, 50000), { estado: "vuelto", vuelto: 13392 });
  const r: ResultadoDelPie = { modo: "simple", medio: "EFECTIVO", recibido: 50000 };
  assert.equal(vueltoDelResultado(TOTAL, r), 13392);
  const leidos = leerPagos(comoFormulario(camposDelPie(TOTAL, r)));
  assert.ok(leidos.ok);
  assert.equal(leidos.medio, "EFECTIVO");
  assert.equal(leidos.asientos, null); // un medio: el cobro de siempre, por el total
  assert.equal(leidos.recibido, 50000);
  assert.equal(vueltoDelCobro({ total: TOTAL, medio: leidos.medio, asientos: leidos.asientos, recibido: leidos.recibido }), 13392);
});

test("MG-010: «Otro» con 30000 dice que faltan $6.608; «Cobrar igual» cobra el total sin vuelto", () => {
  assert.deepEqual(estadoDelEfectivo(TOTAL, "30000"), { estado: "falta", falta: 6608 });
  assert.equal(textoPlata(6608), "$6.608");
  // «Cobrar igual» manda el efectivo SIN recibido: no viaja un «pagó con» menor que el total.
  const campos = camposDelPie(TOTAL, { modo: "simple", medio: "EFECTIVO" });
  assert.deepEqual(campos, [
    ["paymentMethod", "EFECTIVO"],
    ["pagado", "1"],
    ["paid", "on"],
  ]);
  // Y aunque la pantalla mandara un recibido corto, no viaja.
  assert.ok(!camposDelPie(TOTAL, { modo: "simple", medio: "EFECTIVO", recibido: 30000 }).some(([n]) => n === "recibido"));
});

test("efectivo escrito a mano: justo, miles con punto, basura y vacío", () => {
  assert.deepEqual(estadoDelEfectivo(TOTAL, "36.608"), { estado: "justo" });
  assert.deepEqual(estadoDelEfectivo(TOTAL, "$ 40.000"), { estado: "vuelto", vuelto: 3392 });
  assert.deepEqual(estadoDelEfectivo(4135.58, "4135,6"), { estado: "vuelto", vuelto: 0.02 });
  assert.deepEqual(estadoDelEfectivo(TOTAL, "abc"), { estado: "invalido" });
  assert.deepEqual(estadoDelEfectivo(TOTAL, ""), { estado: "sin-dato" });
  assert.deepEqual(estadoDelEfectivo(TOTAL, -1), { estado: "invalido" });
});

test("al centavo: 0,1 + 0,2 no deja un vuelto fantasma", () => {
  assert.deepEqual(estadoDelEfectivo(0.3, 0.1 + 0.2), { estado: "justo" });
  assert.equal(vueltoDelResultado(0.3, { modo: "simple", medio: "EFECTIVO", recibido: 0.1 + 0.2 }), 0);
});

// ── Por qué no se puede cobrar ───────────────────────────────────────────────

test("MG-011: total $0 deshabilita con «Cargá algo para cobrar»; el motivo del llamador manda", () => {
  assert.equal(motivoParaNoCobrar(0), MOTIVO_SIN_TOTAL);
  assert.equal(MOTIVO_SIN_TOTAL, "Cargá algo para cobrar.");
  assert.equal(motivoParaNoCobrar(0.004), MOTIVO_SIN_TOTAL); // menos de un centavo no es plata
  assert.equal(motivoParaNoCobrar(TOTAL), null);
  assert.equal(motivoParaNoCobrar(TOTAL, { motivo: "El día está cerrado." }), "El día está cerrado.");
  assert.equal(motivoParaNoCobrar(TOTAL, { motivo: "" }), null);
});

// ── Dividir ──────────────────────────────────────────────────────────────────

test("MG-001: Efectivo $20.000 y Mercado Pago vacío → MP se completa con $16.608 y es un pago mixto", () => {
  const renglones = [
    { medio: "EFECTIVO" as const, montoTexto: "20.000" },
    { medio: "MERCADOPAGO" as const, montoTexto: "" },
  ];
  assert.deepEqual(leerDivision(TOTAL, renglones).completado, { indice: 1, monto: 16608 });
  const d = resultadoDeLaDivision(TOTAL, renglones);
  assert.ok(d.ok);
  assert.equal(d.vuelto, 0);
  assert.deepEqual(d.resultado, {
    modo: "dividido",
    pagos: [
      { medio: "EFECTIVO", monto: 20000 },
      { medio: "MERCADOPAGO", monto: 16608 },
    ],
  });
  // MG-002: el ticket lo dice así.
  assert.ok(d.resultado.modo === "dividido");
  assert.match(textoDelPago(d.resultado.pagos), /^Efectivo \$20\.000(,00)? \+ Mercado Pago \$16\.608(,00)?$/);
  // Lo que viaja al servidor y cómo lo lee: dos asientos que suman exacto, medio principal EFECTIVO.
  const campos = camposDelPie(TOTAL, d.resultado);
  assert.deepEqual(campos, [
    ["paymentMethod", "EFECTIVO"],
    ["pagado", "1"],
    ["paid", "on"],
    ["pago.medio", "EFECTIVO"],
    ["pago.monto", "20000.00"],
    ["pago.medio", "MERCADOPAGO"],
    ["pago.monto", "16608.00"],
  ]);
  const leidos = leerPagos(comoFormulario(campos));
  assert.ok(leidos.ok);
  assert.equal(leidos.pagado, true);
  assert.equal(leidos.medio, "EFECTIVO");
  assert.deepEqual(leidos.asientos, [
    { medio: "EFECTIVO", monto: 20000 },
    { medio: "MERCADOPAGO", monto: 16608 },
  ]);
});

test("MG-003: Mercado Pago $20.000 + Transferencia $20.000 sobre $36.608 no cobra: no hay vuelto fuera del efectivo", () => {
  const d = resultadoDeLaDivision(TOTAL, [
    { medio: "MERCADOPAGO", montoTexto: "20000" },
    { medio: "TRANSFERENCIA", montoTexto: "20000" },
  ]);
  assert.equal(d.ok, false);
  assert.ok(!d.ok && /no hay vuelto/.test(d.error), JSON.stringify(d));
});

test("MG-004: Efectivo $25.000 + MP $16.608 → al libro efectivo $20.000, vuelto $5.000, venta por $36.608", () => {
  const d = resultadoDeLaDivision(TOTAL, [
    { medio: "EFECTIVO", montoTexto: "25000" },
    { medio: "MERCADOPAGO", montoTexto: "16608" },
  ]);
  assert.ok(d.ok);
  assert.equal(d.vuelto, 5000);
  assert.deepEqual(d.resultado, {
    modo: "dividido",
    pagos: [
      { medio: "EFECTIVO", monto: 20000 },
      { medio: "MERCADOPAGO", monto: 16608 },
    ],
    recibido: 25000,
  });
  const leidos = leerPagos(comoFormulario(camposDelPie(TOTAL, d.resultado)));
  assert.ok(leidos.ok);
  assert.equal(leidos.recibido, 25000);
  assert.equal(vueltoDelCobro({ total: TOTAL, medio: leidos.medio, asientos: leidos.asientos, recibido: leidos.recibido }), 5000);
  assert.equal(vueltoDelResultado(TOTAL, d.resultado), 5000);
});

test("MG-006: pedido de $25.700, Efectivo $10.000 y Transferencia toma el resto → principal Transferencia ($15.700)", () => {
  const d = resultadoDeLaDivision(25700, [
    { medio: "EFECTIVO", montoTexto: "10000" },
    { medio: "TRANSFERENCIA", montoTexto: "" },
  ]);
  assert.ok(d.ok && d.resultado.modo === "dividido");
  assert.deepEqual(d.resultado.pagos, [
    { medio: "EFECTIVO", monto: 10000 },
    { medio: "TRANSFERENCIA", monto: 15700 },
  ]);
  const campos = camposDelPie(25700, d.resultado);
  assert.deepEqual(campos[0], ["paymentMethod", "TRANSFERENCIA"]);
  const leidos = leerPagos(comoFormulario(campos));
  assert.ok(leidos.ok && leidos.medio === "TRANSFERENCIA");
});

test("MG-007: Efectivo $30.000 + MP $6.608 → el medio principal es EFECTIVO (el de más plata)", () => {
  const d = resultadoDeLaDivision(TOTAL, [
    { medio: "EFECTIVO", montoTexto: "30000" },
    { medio: "MERCADOPAGO", montoTexto: "6608" },
  ]);
  assert.ok(d.ok);
  assert.deepEqual(camposDelPie(TOTAL, d.resultado)[0], ["paymentMethod", "EFECTIVO"]);
});

test("dividir: faltante, importe ilegible, renglón sin medio y dos vacíos", () => {
  const falta = resultadoDeLaDivision(TOTAL, [
    { medio: "EFECTIVO", montoTexto: "10000" },
    { medio: "MERCADOPAGO", montoTexto: "10000" },
  ]);
  assert.ok(!falta.ok && falta.falta === 16608, JSON.stringify(falta));

  const ilegible = resultadoDeLaDivision(TOTAL, [
    { medio: "EFECTIVO", montoTexto: "1,2,3" },
    { medio: "MERCADOPAGO", montoTexto: "" },
  ]);
  assert.ok(!ilegible.ok && /no se entiende/.test(ilegible.error));

  // Un renglón sin medio no cuenta ni se completa.
  const sinMedio = leerDivision(TOTAL, [
    { medio: "EFECTIVO", montoTexto: "20000" },
    { medio: null, montoTexto: "" },
  ]);
  assert.equal(sinMedio.completado, null);
  assert.deepEqual(sinMedio.ingresados, [{ medio: "EFECTIVO", monto: 20000 }]);

  // Dos vacíos: ninguno se completa hasta que se escriba.
  const dos = leerDivision(TOTAL, [
    { medio: "EFECTIVO", montoTexto: "" },
    { medio: "MERCADOPAGO", montoTexto: "" },
  ]);
  assert.equal(dos.completado, null);
  assert.deepEqual(dos.ingresados, []);
});

test("dividir con un solo medio que cubre todo es un cobro simple, no un mixto de un medio", () => {
  const d = resultadoDeLaDivision(TOTAL, [
    { medio: "MERCADOPAGO", montoTexto: "36608" },
    { medio: null, montoTexto: "" },
  ]);
  assert.ok(d.ok);
  assert.deepEqual(d.resultado, { modo: "simple", medio: "MERCADOPAGO" });
});

test("dividir con centavos: la suma cierra exacta al centavo", () => {
  const total = 55384.37;
  const d = resultadoDeLaDivision(total, [
    { medio: "EFECTIVO", montoTexto: "20.000,10" },
    { medio: "MERCADOPAGO", montoTexto: "" },
  ]);
  assert.ok(d.ok && d.resultado.modo === "dividido");
  assert.deepEqual(d.resultado.pagos, [
    { medio: "EFECTIVO", monto: 20000.1 },
    { medio: "MERCADOPAGO", monto: 35384.27 },
  ]);
  const campos = camposDelPie(total, d.resultado);
  assert.ok(campos.some(([n, v]) => n === "pago.monto" && v === "35384.27"));
});

test("mediosLibres: un medio va una sola vez, el propio del renglón sigue disponible", () => {
  const r = [
    { medio: "EFECTIVO" as const, montoTexto: "" },
    { medio: "MERCADOPAGO" as const, montoTexto: "" },
  ];
  assert.deepEqual(mediosLibres(r), ["TRANSFERENCIA"]);
  assert.deepEqual(mediosLibres(r, "MERCADOPAGO"), ["MERCADOPAGO", "TRANSFERENCIA"]);
});

test("importeCanonico: punto decimal y dos cifras, sin flotantes raros", () => {
  assert.equal(importeCanonico(16608), "16608.00");
  assert.equal(importeCanonico(0.1 + 0.2), "0.30");
  assert.equal(importeCanonico(4135.575), "4135.58");
});

test("medios de un toque: Mercado Pago y Transferencia viajan por el total exacto, sin recibido", () => {
  for (const medio of ["MERCADOPAGO", "TRANSFERENCIA"] as const) {
    const campos = camposDelPie(TOTAL, { modo: "simple", medio });
    assert.deepEqual(campos, [
      ["paymentMethod", medio],
      ["pagado", "1"],
      ["paid", "on"],
    ]);
    const leidos = leerPagos(comoFormulario(campos));
    assert.ok(leidos.ok && leidos.medio === medio && leidos.asientos === null && leidos.recibido === null);
  }
});
