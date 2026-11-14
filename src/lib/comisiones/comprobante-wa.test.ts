// El comprobante de la liquidación por WhatsApp: texto criollo, plata en centavos y, sin un celular
// usable, NO hay link (no se abre un chat al voleo). T1, docs/producto/comisiones/LIQUIDACION.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkDelComprobante, nombreDelMedio, pesosDeCentavos, textoDelComprobante, type DatosDelComprobante } from "./comprobante-wa";

const datos: DatosDelComprobante = {
  profesional: "Macarena López",
  negocio: "CH Estética",
  periodo: "01/10 al 31/10",
  turnos: 12,
  baseCents: 18_000_000,
  comisionCents: 7_200_050,
  medio: "Efectivo",
  fecha: "05/11/2026",
};

test("pesos argentinos desde centavos enteros", () => {
  assert.equal(pesosDeCentavos(0), "$ 0");
  assert.equal(pesosDeCentavos(123_456_700), "$ 1.234.567");
  assert.equal(pesosDeCentavos(185_185), "$ 1.851,85");
  assert.equal(pesosDeCentavos(-50), "-$ 0,50");
});

test("el texto dice período, turnos, cobrado, comisión, total, medio y fecha", () => {
  const t = textoDelComprobante(datos);
  assert.match(t, /^Hola Macarena,/);
  for (const parte of ["Período: 01/10 al 31/10", "Turnos: 12", "Cobrado sin voucher: $ 180.000", "Comisión: $ 72.000,50", "Total: $ 72.000,50", "Pagado por: Efectivo", "Fecha: 05/11/2026"]) {
    assert.ok(t.includes(parte), parte);
  }
  assert.doesNotMatch(t, /Ajustes/, "T1 no tiene ajustes: no se muestra un renglón en cero");
  assert.match(textoDelComprobante({ ...datos, ajustesCents: -200_000 }), /Ajustes: -\$ 2\.000\nTotal: \$ 70\.000,50/);
});

test("con celular argentino: link wa.me con el texto", () => {
  const link = linkDelComprobante("11 5555-1234", datos);
  assert.ok(link?.startsWith("https://wa.me/5491155551234?text="), String(link));
  assert.equal(decodeURIComponent(link!.split("?text=")[1]), textoDelComprobante(datos));
});

test("sin número, o con uno que no es un celular, no abre chat", () => {
  for (const tel of [null, undefined, "", "   ", "123", "no tengo"]) assert.equal(linkDelComprobante(tel, datos), null, String(tel));
});

test("medio del egreso en criollo", () => {
  assert.equal(nombreDelMedio("TRANSFERENCIA"), "Transferencia");
  assert.equal(nombreDelMedio("MP"), "Mercado Pago");
  assert.equal(nombreDelMedio(null), null);
  assert.equal(nombreDelMedio("CHEQUE"), null);
});
