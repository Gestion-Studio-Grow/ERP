import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bytesDelComando,
  controlToledoValido,
  crudoHex,
  crudoLegible,
  leerTramas,
  parsearAPedido,
  parsearAscii,
  parsearCas,
  parsearToledo,
} from "./protocolos";
import { armarTramaSimulada } from "./simulador";

/** De «02 3D 30 …» a texto, un carácter por byte. */
const hex = (h: string) => h.split(/\s+/).map((b) => String.fromCharCode(parseInt(b, 16))).join("");

// ---------------------------------------------------------------------------- ASCII

test("ascii: «   1.250 kg» es 1,250 kg y, sin marca de quietud, la balanza no informa", () => {
  const l = parsearAscii("   1.250 kg");
  assert.equal(l?.peso, 1.25);
  assert.equal(l?.unidad, "kg");
  assert.equal(l?.bandera, false);
  assert.equal(l?.estable, true);
});

test("ascii: «W:+001.250kg» y «+0001.250kg» se leen igual, con o sin STX/ETX", () => {
  assert.equal(parsearAscii("W:+001.250kg")?.peso, 1.25);
  assert.equal(parsearAscii("+0001.250kg")?.peso, 1.25);
  assert.equal(parsearAscii("\u0002+0001.250kg\u0003")?.peso, 1.25);
});

test("ascii: gramos y libras se pasan a kilos", () => {
  assert.equal(parsearAscii("  1250 g")?.peso, 1.25);
  assert.equal(parsearAscii("  1250 g")?.unidad, "g");
  assert.equal(parsearAscii(" 2.000 lb")?.peso, 0.907);
});

test("ascii: negativo, cero y sobrecarga quedan marcados", () => {
  const neg = parsearAscii("-   0.120 kg");
  assert.equal(neg?.peso, -0.12);
  assert.equal(neg?.negativo, true);
  assert.equal(parsearAscii("   0.000 kg")?.cero, true);
  assert.equal(parsearAscii("  OL   kg")?.sobrecarga, true);
});

test("ascii: «US» o «M» es moviéndose; «ST», quieto, y en los dos casos la balanza informa", () => {
  assert.deepEqual([parsearAscii("US   1.250 kg")?.estable, parsearAscii("US   1.250 kg")?.bandera], [false, true]);
  assert.equal(parsearAscii("M   1.250 kg")?.estable, false);
  assert.deepEqual([parsearAscii("ST   1.250 kg")?.estable, parsearAscii("ST   1.250 kg")?.bandera], [true, true]);
});

test("ascii: la Prix en Prt2 (STX + 6 caracteres + CR, sin unidad) se lee", () => {
  assert.equal(parsearAscii("\u0002001250")?.peso, 1.25);
  assert.equal(parsearAscii("\u0002 1.250")?.peso, 1.25);
});

test("ascii: basura y líneas sin número ni unidad no dan lectura", () => {
  assert.equal(parsearAscii("ø\u0080æþ"), null);
  assert.equal(parsearAscii("hola"), null);
  assert.equal(parsearAscii("1250"), null);
});

// ---------------------------------------------------------------------------- CAS

test("cas: la trama del relevamiento «ST,GS,0 00001.25kg» es 1,250 kg quieto", () => {
  const l = parsearCas(hex("53 54 2C 47 53 2C 30 20 30 30 30 30 31 2E 32 35 6B 67"));
  assert.equal(l?.peso, 1.25);
  assert.equal(l?.estable, true);
  assert.equal(l?.bandera, true);
});

test("cas: el número de equipo delante del peso no se mezcla con el peso", () => {
  assert.equal(parsearCas("ST,GS,1 00001.25kg")?.peso, 1.25);
  assert.equal(parsearCas("ST,GS,+  1.250kg")?.peso, 1.25);
});

test("cas: US es moviéndose, OL es sobrecarga, NT (neto) se lee igual", () => {
  assert.equal(parsearCas("US,GS,0 00001.25kg")?.estable, false);
  assert.equal(parsearCas("OL,GS,0         kg")?.sobrecarga, true);
  assert.equal(parsearCas("ST,NT,0 00000.80kg")?.peso, 0.8);
});

test("cas: negativo y cero", () => {
  assert.equal(parsearCas("ST,GS,-  0.120kg")?.negativo, true);
  assert.equal(parsearCas("ST,GS,0 00000.00kg")?.cero, true);
});

test("cas: una trama cortada (sin el peso ni la unidad) no da lectura", () => {
  assert.equal(parsearCas("ST,GS,0 0000"), null);
  assert.equal(parsearCas("GS,0 00001.25kg"), null);
});

// ---------------------------------------------------------------------------- Toledo

const TOLEDO_ESTABLE = hex("02 3D 30 20 30 30 31 32 35 30 30 30 30 30 30 30 0D 1C");
const TOLEDO_MOVIENDOSE = hex("02 3D 38 20 30 30 31 32 35 30 30 30 30 30 30 30 0D 14");

test("toledo: el control de las tramas del relevamiento da bien", () => {
  assert.ok(controlToledoValido(TOLEDO_ESTABLE.slice(0, 17), TOLEDO_ESTABLE[17]));
  assert.ok(controlToledoValido(TOLEDO_MOVIENDOSE.slice(0, 17), TOLEDO_MOVIENDOSE[17]));
  assert.ok(!controlToledoValido(TOLEDO_ESTABLE.slice(0, 17), "\u001d"));
});

test("toledo: 1,250 kg quieto (coma en 3 decimales por la palabra A)", () => {
  const l = parsearToledo(TOLEDO_ESTABLE);
  assert.equal(l?.peso, 1.25);
  assert.equal(l?.estable, true);
  assert.equal(l?.bandera, true);
});

test("toledo: con el bit de movimiento de la palabra B, moviéndose", () => {
  assert.equal(parsearToledo(TOLEDO_MOVIENDOSE)?.estable, false);
});

test("toledo: la palabra A cambia la coma (2 decimales: 125 → 1,25 kg)", () => {
  // A = 0x3C: bits 0–2 = 4 → dos decimales.
  assert.equal(parsearToledo("\u0002<0 000125000000")?.peso, 1.25);
});

test("toledo: negativo, cero, sobrecarga y ceros como espacios", () => {
  assert.equal(parsearToledo("\u0002=2 000120000000")?.peso, -0.12); // B bit 1
  assert.equal(parsearToledo("\u0002=0 000000000000")?.cero, true);
  assert.equal(parsearToledo("\u0002=4 999999000000")?.sobrecarga, true); // B bit 2
  assert.equal(parsearToledo("\u0002=0   1250000000")?.peso, 1.25);
});

test("toledo: tramas seguidas y partidas en pedazos, con y sin byte de control", () => {
  const r = leerTramas("toledo", TOLEDO_ESTABLE + TOLEDO_MOVIENDOSE + TOLEDO_ESTABLE.slice(0, 9));
  assert.equal(r.lecturas.length, 2);
  assert.deepEqual(
    r.lecturas.map((l) => l.estable),
    [true, false],
  );
  assert.equal(r.resto, TOLEDO_ESTABLE.slice(0, 9));
  const sigue = leerTramas("toledo", r.resto + TOLEDO_ESTABLE.slice(9));
  assert.equal(sigue.lecturas.length, 1);
  const sinControl = leerTramas("toledo", TOLEDO_ESTABLE.slice(0, 17) + TOLEDO_ESTABLE.slice(0, 17) + "\u0002");
  assert.equal(sinControl.lecturas.length, 2);
});

test("toledo: un byte de control que no da descarta la trama", () => {
  const mala = TOLEDO_ESTABLE.slice(0, 17) + "\u001d" + TOLEDO_ESTABLE;
  const r = leerTramas("toledo", mala);
  assert.equal(r.lecturas.length, 1);
  assert.equal(r.descartadas, 1);
});

test("toledo: basura y una trama cortada en el medio no dan lectura", () => {
  assert.equal(parsearToledo("\u0002=0 0012"), null);
  assert.equal(parsearToledo("ø\u0080æþ"), null);
  const r = leerTramas("toledo", "ø\u0002=0 0012æ" + TOLEDO_ESTABLE);
  assert.equal(r.lecturas.length, 1);
});

// ---------------------------------------------------------------------------- A pedido

test("a pedido: Toledo Prix Prt1/Prt3 «STX 01250 ETX» es 1,250 kg", () => {
  const r = leerTramas("a-pedido", hex("02 30 31 32 35 30 03"));
  assert.equal(r.lecturas[0]?.peso, 1.25);
});

test("a pedido: Prix «IIIII» moviéndose, «NNNNN» negativo, «SSSSS» sobrecarga", () => {
  const ii = parsearAPedido(hex("02 49 49 49 49 49"));
  assert.deepEqual([ii?.estable, ii?.bandera], [false, true]);
  assert.equal(parsearAPedido(hex("02 4E 4E 4E 4E 4E"))?.negativo, true);
  assert.equal(parsearAPedido(hex("02 53 53 53 53 53"))?.sobrecarga, true);
});

test("a pedido: Toledo 8217 «STX 01.250 CR» (respuesta a «W»)", () => {
  const r = leerTramas("a-pedido", hex("02 30 31 2E 32 35 30 0D"));
  assert.equal(r.lecturas[0]?.peso, 1.25);
});

test("a pedido: Systel «STX  1.250 ETX XOR», con el XOR de STX a ETX o sólo del peso", () => {
  for (const xor of ["09", "08", "31"]) {
    const una = hex(`02 20 31 2E 32 35 30 03 ${xor}`);
    const r = leerTramas("a-pedido", una + una);
    assert.deepEqual(
      r.lecturas.map((l) => l.peso),
      [1.25, 1.25],
      `XOR ${xor}`,
    );
  }
});

test("a pedido: Systel negativo (7 caracteres) y la variante con «e»/«i»", () => {
  assert.equal(parsearAPedido("\u0002-0.120")?.peso, -0.12);
  const r = leerTramas("a-pedido", " 1.250e\u0001 1.250i\u0001");
  assert.deepEqual(
    r.lecturas.map((l) => [l.peso, l.estable, l.bandera]),
    [
      [1.25, true, true],
      [1.25, false, true],
    ],
  );
});

test("a pedido: un byte suelto (el «moviéndose» de Systel) no da lectura", () => {
  const r = leerTramas("a-pedido", "\u0015");
  assert.equal(r.lecturas.length, 0);
});

// ---------------------------------------------------------------------------- comandos y crudo

test("los comandos: ENQ es 0x05, «W» va sola (sin CR) y «P» con CR LF", () => {
  assert.deepEqual([...bytesDelComando("ENQ")], [0x05]);
  assert.deepEqual([...bytesDelComando("W")], [0x57]);
  assert.deepEqual([...bytesDelComando("P")], [0x50, 0x0d, 0x0a]);
});

test("el crudo se muestra legible y en hexadecimal", () => {
  assert.equal(crudoLegible("\u0002 1.250\u0003"), "‹STX› 1.250‹ETX›");
  assert.equal(crudoHex("\u0002 1"), "02 20 31");
});

test("las tramas de la balanza simulada se leen con su propio protocolo", () => {
  for (const p of ["ascii", "cas", "toledo", "a-pedido"] as const) {
    const r = leerTramas(p, armarTramaSimulada(p, 1.25, true) + armarTramaSimulada(p, 1.25, true));
    assert.ok(r.lecturas.length >= 1, p);
    assert.equal(r.lecturas[0].peso, 1.25, p);
  }
});
