// Tests del lector del QR de ARCA: dominios, variantes de base64, validaciones, UTF-8, los dos
// entornos (Buffer y atob/btoa) y el mapeo de tipos de comprobante. node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  URL_QR_ARCA,
  claseDesdeTipoArca,
  codecNavegador,
  codecNode,
  codificarBase64Utf8,
  decodificarBase64Utf8,
  leerQrArca,
  tipoArcaDesdeClase,
  urlQrArca,
} from "./qr-arca";
import type { LecturaQr } from "./tipos";

/** Payload con la forma del QR impreso: CUIT, documento y CAE como números. */
const PAYLOAD = {
  ver: 1,
  fecha: "2020-10-13",
  cuit: 30000000007,
  ptoVta: 10,
  tipoCmp: 1,
  nroCmp: 94,
  importe: 12100,
  moneda: "DOL",
  ctz: 65,
  tipoDocRec: 80,
  nroDocRec: 20000000001,
  tipoCodAut: "E",
  codAut: 70417054367476,
};

const b64 = (obj: unknown) => Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
const url = (obj: unknown, base = "https://www.afip.gob.ar/fe/qr/?p=") => `${base}${b64(obj)}`;
const NO_ES = "Este QR no es de un comprobante de ARCA";

function lectura(texto: string): LecturaQr {
  const r = leerQrArca(texto);
  if (!r.ok) assert.fail(r.error);
  return r.lectura;
}

function error(texto: string): string {
  const r = leerQrArca(texto);
  assert.equal(r.ok, false);
  return r.ok ? "" : r.error;
}

test("lee el QR impreso: números a texto donde corresponde e importe en centavos", () => {
  assert.deepEqual(lectura(url(PAYLOAD)), {
    version: 1,
    fecha: "2020-10-13",
    cuitEmisor: "30000000007",
    puntoVenta: 10,
    tipoComprobanteArca: 1,
    numero: 94,
    importeTotal: 1210000,
    moneda: "DOL",
    cotizacion: 65,
    tipoDocReceptor: 80,
    nroDocReceptor: "20000000001",
    tipoCodAut: "E",
    codAut: "70417054367476",
  });
});

test("acepta afip.gob.ar y arca.gob.ar, con o sin www, http o https, con o sin barra final", () => {
  const p = b64(PAYLOAD);
  for (const base of [
    "https://www.afip.gob.ar/fe/qr/?p=",
    "http://afip.gob.ar/fe/qr/?p=",
    "https://www.arca.gob.ar/fe/qr/?p=",
    "https://arca.gob.ar/fe/qr?p=",
    "HTTPS://WWW.ARCA.GOB.AR/fe/qr/?p=",
    "www.afip.gob.ar/fe/qr/?p=",
    "arca.gob.ar/fe/qr/?p=",
  ]) {
    assert.equal(lectura(`${base}${p}`).numero, 94, base);
  }
  assert.equal(lectura(`  https://www.afip.gob.ar/fe/qr/?x=1&p=${p}  `).numero, 94);
});

test("acepta el base64 solo, url-safe, sin relleno, con %3D y con espacios donde había '+'", () => {
  // Busca un payload cuyo base64 tenga '+', '/' y relleno, para probar todas las variantes.
  const sirve = (x: string) => x.includes("+") && x.includes("/") && x.endsWith("=");
  let s = b64(PAYLOAD);
  // '+' y '/' salen de bytes como '?', '>', '~' o multibyte; se corre la alineación hasta que aparezcan.
  for (let i = 0; i < 500 && !sirve(s); i++) s = b64({ ...PAYLOAD, extra: `${"a".repeat(i % 3)}ñ¿?>~`, n: i });
  assert.ok(sirve(s), "no se encontró un base64 con '+', '/' y relleno");
  assert.equal(lectura(s).numero, 94);
  assert.equal(lectura(s.replace(/=+$/, "")).numero, 94);
  assert.equal(lectura(s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")).numero, 94);
  assert.equal(lectura(`https://www.arca.gob.ar/fe/qr/?p=${s.replace(/=/g, "%3D")}`).numero, 94);
  assert.equal(lectura(`https://www.arca.gob.ar/fe/qr/?p=${s.replace(/\+/g, " ")}`).numero, 94);
  assert.equal(lectura(s.replace(/(.{20})/g, "$1\n")).numero, 94); // base64 partido en renglones
});

test("rechaza lo que no es un QR de ARCA", () => {
  const p = b64(PAYLOAD);
  assert.equal(error(`https://afip.gob.ar.evil.example/fe/qr/?p=${p}`), NO_ES);
  assert.equal(error(`https://www.example.com/fe/qr/?p=${p}`), NO_ES);
  assert.equal(error(`https://www.afip.gob.ar/otra/cosa/?p=${p}`), NO_ES);
  assert.equal(error("https://www.afip.gob.ar/fe/qr/"), NO_ES);
  assert.equal(error(`ftp://www.afip.gob.ar/fe/qr/?p=${p}`), NO_ES);
  assert.equal(error(""), NO_ES);
  assert.equal(error("hola mundo"), NO_ES);
  assert.equal(error("%%%"), NO_ES);
  assert.equal(error(Buffer.from("no es json").toString("base64")), NO_ES);
  assert.equal(error(b64([1, 2, 3])), NO_ES);
  assert.equal(error(b64(null)), NO_ES);
});

test("valida cada campo con un error en criollo", () => {
  const con = (cambio: Record<string, unknown>) => error(url({ ...PAYLOAD, ...cambio }));
  assert.equal(con({ ver: 0 }), "El QR tiene una versión que no reconocemos");
  assert.equal(con({ ver: "uno" }), "El QR tiene una versión que no reconocemos");
  assert.equal(con({ fecha: "2020-02-30" }), "El QR tiene una fecha inválida");
  assert.equal(con({ fecha: "20201013" }), "El QR tiene una fecha inválida");
  assert.equal(con({ cuit: 30000000008 }), "El QR tiene un CUIT inválido");
  assert.equal(con({ cuit: undefined }), "El QR tiene un CUIT inválido");
  assert.equal(con({ ptoVta: 0 }), "El QR tiene un punto de venta inválido");
  assert.equal(con({ ptoVta: 1.5 }), "El QR tiene un punto de venta inválido");
  assert.equal(con({ tipoCmp: -1 }), "El QR tiene un tipo de comprobante inválido");
  assert.equal(con({ nroCmp: "abc" }), "El QR tiene un número de comprobante inválido");
  assert.equal(con({ importe: -1 }), "El QR tiene un importe inválido");
  assert.equal(con({ importe: "mucho" }), "El QR tiene un importe inválido");
  assert.equal(con({ tipoCodAut: "X" }), "El QR tiene un tipo de autorización inválido (tiene que ser CAE o CAEA)");
  assert.equal(con({ codAut: "" }), "El QR no trae el código de autorización (CAE)");
  assert.equal(con({ codAut: undefined }), "El QR no trae el código de autorización (CAE)");
});

test("tolera números como texto, CAEA e importe cero", () => {
  const l = lectura(url({ ...PAYLOAD, cuit: "30-00000000-7", ptoVta: "10", nroCmp: "94", importe: 0, tipoCodAut: "a" }));
  assert.equal(l.cuitEmisor, "30000000007");
  assert.equal(l.puntoVenta, 10);
  assert.equal(l.importeTotal, 0);
  assert.equal(l.tipoCodAut, "A");
});

test("el receptor es opcional: consumidor final sin identificar = 99 y '0'", () => {
  const sinReceptor: Record<string, unknown> = { ...PAYLOAD };
  delete sinReceptor.tipoDocRec;
  delete sinReceptor.nroDocRec;
  const l = lectura(url(sinReceptor));
  assert.equal(l.tipoDocReceptor, 99);
  assert.equal(l.nroDocReceptor, "0");
});

test("UTF-8: un campo con tildes no rompe ni en node ni en el navegador", () => {
  const conTildes = { ...PAYLOAD, razonSocial: "Estación Ñandú S.A." };
  const json = JSON.stringify(conTildes);
  const enNode = codificarBase64Utf8(json, codecNode);
  const enNavegador = codificarBase64Utf8(json, codecNavegador);
  assert.equal(enNode, enNavegador);
  assert.equal(decodificarBase64Utf8(enNode, codecNavegador), json);
  assert.equal(decodificarBase64Utf8(enNavegador, codecNode), json);
  assert.equal(lectura(enNavegador).numero, 94);
});

test("los dos codecs son intercambiables para cualquier byte", () => {
  const bytes = new Uint8Array(256).map((_, i) => i);
  const a = codecNode.codificar(bytes);
  const b = codecNavegador.codificar(bytes);
  assert.equal(a, b);
  assert.deepEqual([...codecNavegador.decodificar(a)], [...bytes]);
  assert.deepEqual([...codecNode.decodificar(b)], [...bytes]);
});

test("urlQrArca arma la URL de arca.gob.ar y leerQrArca la devuelve igual", () => {
  const l: LecturaQr = {
    version: 1,
    fecha: "2026-09-10",
    cuitEmisor: "30709123455",
    puntoVenta: 12,
    tipoComprobanteArca: 1,
    numero: 45871,
    importeTotal: 21200050,
    moneda: "PES",
    cotizacion: 1,
    tipoDocReceptor: 80,
    nroDocReceptor: "30715884301",
    tipoCodAut: "E",
    codAut: "76381245901234",
  };
  const u = urlQrArca(l);
  assert.ok(u.startsWith(`${URL_QR_ARCA}?p=`));
  const json = JSON.parse(Buffer.from(u.slice(u.indexOf("?p=") + 3), "base64").toString("utf8"));
  assert.equal(json.cuit, 30709123455); // como el QR impreso: número, no texto
  assert.equal(json.codAut, 76381245901234);
  assert.equal(json.importe, 212000.5);
  assert.deepEqual(lectura(u), l);
});

test("claseDesdeTipoArca y tipoArcaDesdeClase", () => {
  assert.equal(claseDesdeTipoArca(1), "factura_a");
  assert.equal(claseDesdeTipoArca(6), "factura_b");
  assert.equal(claseDesdeTipoArca(11), "factura_c");
  assert.equal(claseDesdeTipoArca(51), "factura_m");
  assert.equal(claseDesdeTipoArca(81), "tique_factura_a");
  assert.equal(claseDesdeTipoArca(82), "tique_consumidor_final");
  assert.equal(claseDesdeTipoArca(83), "tique_consumidor_final");
  assert.equal(claseDesdeTipoArca(999), undefined);

  for (const tipo of [1, 6, 11, 51, 81, 83]) {
    const clase = claseDesdeTipoArca(tipo);
    assert.ok(clase);
    assert.equal(tipoArcaDesdeClase(clase), tipo);
  }
  assert.equal(tipoArcaDesdeClase("tique_peaje"), undefined);
  assert.equal(tipoArcaDesdeClase("sin_comprobante"), undefined);
});
