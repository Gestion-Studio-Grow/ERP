import { test } from "node:test";
import assert from "node:assert/strict";
import {
  configuracionDesdeAfuera,
  elegirConfiguracion,
  estableParaTomar,
  opcionesDeApertura,
  puntuarIntentos,
  type IntentoSerie,
} from "./detector";
import type { LecturaSerie } from "./protocolos";
import { armarTramaSimulada } from "./simulador";

const BASURA = "ø\u0080æþ\u0098Ãÿ\u0086".repeat(6);
const veces = (t: string, n: number) => t.repeat(n);

function continuo(velocidad: number, bits: "8N1" | "7E1", recibido: string): IntentoSerie {
  return { velocidad, bits, modo: "continuo", recibido };
}

test("detector: entre velocidades con basura, elige la única que manda CAS legible", () => {
  const cas = armarTramaSimulada("cas", 1.25, true);
  const intentos = [
    continuo(9600, "8N1", BASURA),
    continuo(9600, "7E1", BASURA),
    continuo(4800, "8N1", "kg\r\n" + veces(cas, 5)), // arranca con el final de una trama cortada
    continuo(4800, "7E1", BASURA),
  ];
  const e = elegirConfiguracion(intentos);
  assert.deepEqual(e?.configuracion, { velocidad: 4800, bits: "8N1", modo: "continuo", protocolo: "cas" });
  assert.equal(e?.muestra.peso, 1.25);
});

test("detector: una trama CAS también es «número con unidad», pero gana CAS (más específico)", () => {
  const e = elegirConfiguracion([continuo(9600, "8N1", veces(armarTramaSimulada("cas", 0.5, false), 4))]);
  assert.equal(e?.configuracion.protocolo, "cas");
});

test("detector: Toledo a 9600 7E1 (8N1 manda los bytes con el bit de paridad y no se entiende)", () => {
  const toledo = armarTramaSimulada("toledo", 1.25, true);
  const conParidad = Array.from(toledo, (c) => String.fromCharCode(c.charCodeAt(0) | 0x80)).join("");
  const e = elegirConfiguracion([continuo(9600, "8N1", veces(conParidad, 4)), continuo(9600, "7E1", veces(toledo, 4))]);
  assert.equal(e?.configuracion.protocolo, "toledo");
  assert.equal(e?.configuracion.bits, "7E1");
});

test("detector: ASCII genérico con basura alrededor se detecta igual", () => {
  const e = elegirConfiguracion([continuo(2400, "8N1", "ø\u0080" + veces("   1.250 kg\r\n", 4) + "æ")]);
  assert.equal(e?.configuracion.protocolo, "ascii");
  assert.equal(e?.configuracion.velocidad, 2400);
});

test("detector: si dos configuraciones se entienden igual, gana la primera probada (8N1)", () => {
  const ascii = veces("   1.250 kg\r\n", 4);
  const e = elegirConfiguracion([continuo(9600, "8N1", ascii), continuo(9600, "7E1", ascii)]);
  assert.equal(e?.configuracion.bits, "8N1");
});

test("detector: una sola lectura en modo continuo no alcanza (puede ser casualidad)", () => {
  assert.equal(elegirConfiguracion([continuo(9600, "8N1", "   1.250 kg\r\n")]), null);
});

test("detector: a pedido, elige el comando al que contestó (Systel con ENQ)", () => {
  const intentos: IntentoSerie[] = [
    continuo(9600, "8N1", ""),
    { velocidad: 9600, bits: "8N1", modo: "a-pedido", comando: "ENQ", recibido: "\u0002 1.250\u0003\u0009" },
  ];
  const e = elegirConfiguracion(intentos);
  assert.deepEqual(e?.configuracion, { velocidad: 9600, bits: "8N1", modo: "a-pedido", comando: "ENQ", protocolo: "a-pedido" });
});

test("detector: Toledo 8217 contesta a «W» a 9600 7E1", () => {
  const intentos: IntentoSerie[] = [
    { velocidad: 9600, bits: "8N1", modo: "a-pedido", comando: "W", recibido: "" },
    { velocidad: 9600, bits: "7E1", modo: "a-pedido", comando: "ENQ", recibido: "" },
    { velocidad: 9600, bits: "7E1", modo: "a-pedido", comando: "W", recibido: "\u000201.250\r" },
  ];
  const e = elegirConfiguracion(intentos);
  assert.equal(e?.configuracion.comando, "W");
  assert.equal(e?.configuracion.bits, "7E1");
});

test("detector: sin nada legible no elige nada; el diagnóstico lista todo con puntaje 0", () => {
  const intentos = [continuo(9600, "8N1", BASURA), continuo(4800, "8N1", "")];
  assert.equal(elegirConfiguracion(intentos), null);
  assert.ok(puntuarIntentos(intentos).every((p) => p.puntaje === 0));
});

test("las opciones de apertura: 8N1 sin paridad; 7E1 con 7 bits y paridad par", () => {
  assert.deepEqual(opcionesDeApertura(9600, "8N1"), { baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none" });
  assert.deepEqual(opcionesDeApertura(9600, "7E1"), { baudRate: 9600, dataBits: 7, stopBits: 1, parity: "even" });
});

test("la configuración recordada que viene editada a mano se valida", () => {
  assert.deepEqual(configuracionDesdeAfuera({ velocidad: 9600, bits: "8N1", modo: "continuo", protocolo: "cas" }), {
    velocidad: 9600,
    bits: "8N1",
    modo: "continuo",
    protocolo: "cas",
  });
  assert.equal(configuracionDesdeAfuera({ velocidad: 1234, bits: "8N1", modo: "continuo", protocolo: "cas" }), null);
  assert.equal(configuracionDesdeAfuera({ velocidad: 9600, bits: "8N1", modo: "a-pedido", protocolo: "a-pedido" }), null);
  assert.equal(configuracionDesdeAfuera("cualquier cosa"), null);
});

// ---------------------------------------------------------------------------- estableParaTomar

const lectura = (peso: number, extra: Partial<LecturaSerie> = {}): LecturaSerie => ({
  peso,
  estable: true,
  unidad: "kg",
  crudo: "",
  bandera: true,
  ...(peso === 0 ? { cero: true } : peso < 0 ? { negativo: true } : {}),
  ...extra,
});

test("tomar: con bandera, quieto se toma; moviéndose no", () => {
  assert.deepEqual(estableParaTomar([lectura(1.25)]), { ok: true, peso: 1.25 });
  assert.deepEqual(estableParaTomar([lectura(1.25, { estable: false })]), { ok: false, motivo: "inestable" });
});

test("tomar: nunca en cero, negativo, sobrecarga ni sin lecturas", () => {
  assert.deepEqual(estableParaTomar([]), { ok: false, motivo: "sin-lecturas" });
  assert.deepEqual(estableParaTomar([lectura(0)]), { ok: false, motivo: "cero" });
  assert.deepEqual(estableParaTomar([lectura(-0.12)]), { ok: false, motivo: "negativo" });
  assert.deepEqual(estableParaTomar([lectura(0, { sobrecarga: true, cero: undefined })]), { ok: false, motivo: "sobrecarga" });
});

test("tomar: sin bandera, hacen falta 3 lecturas seguidas iguales (±1 g)", () => {
  const sin = (p: number) => lectura(p, { bandera: false });
  assert.deepEqual(estableParaTomar([sin(1.25), sin(1.25)]), { ok: false, motivo: "inestable" });
  assert.deepEqual(estableParaTomar([sin(1.25), sin(1.251), sin(1.25)]), { ok: true, peso: 1.25 });
  assert.deepEqual(estableParaTomar([sin(1.25), sin(1.254), sin(1.25)]), { ok: false, motivo: "inestable" });
  assert.deepEqual(estableParaTomar([sin(0.9), sin(1.25), sin(1.25), sin(1.25)]), { ok: true, peso: 1.25 });
  assert.deepEqual(estableParaTomar([sin(1.25), sin(1.25)], { iguales: 2 }), { ok: true, peso: 1.25 });
});
