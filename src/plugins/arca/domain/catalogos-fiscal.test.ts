// Tests de los helpers de catálogo fiscal nuevos (ADR-026): condición del
// receptor (RG 5616), notas de crédito por clase y "lleva IVA en el WS".

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CondicionIva,
  CondicionIvaReceptor,
  TipoComprobante,
  comprobanteLlevaIva,
  condicionReceptorId,
  discriminaIva,
  esClaseC,
  esNotaCredito,
  tipoNotaCreditoPara,
} from "./catalogos";

test("condicionReceptorId mapea las condiciones a los códigos RG 5616", () => {
  assert.equal(condicionReceptorId(CondicionIva.ResponsableInscripto), CondicionIvaReceptor.ResponsableInscripto);
  assert.equal(condicionReceptorId(CondicionIva.Exento), CondicionIvaReceptor.SujetoExento);
  assert.equal(condicionReceptorId(CondicionIva.ConsumidorFinal), CondicionIvaReceptor.ConsumidorFinal);
  assert.equal(condicionReceptorId(CondicionIva.Monotributo), CondicionIvaReceptor.ResponsableMonotributo);
});

test("tipoNotaCreditoPara sigue la clase de la factura", () => {
  assert.equal(tipoNotaCreditoPara(TipoComprobante.FacturaA), TipoComprobante.NotaCreditoA);
  assert.equal(tipoNotaCreditoPara(TipoComprobante.FacturaB), TipoComprobante.NotaCreditoB);
  assert.equal(tipoNotaCreditoPara(TipoComprobante.FacturaC), TipoComprobante.NotaCreditoC);
  assert.equal(tipoNotaCreditoPara(TipoComprobante.FacturaM), TipoComprobante.NotaCreditoM);
});

test("tipoNotaCreditoPara rechaza tipos que no son factura", () => {
  assert.throws(() => tipoNotaCreditoPara(TipoComprobante.NotaCreditoA));
});

test("esNotaCredito y esClaseC clasifican bien", () => {
  assert.equal(esNotaCredito(TipoComprobante.NotaCreditoB), true);
  assert.equal(esNotaCredito(TipoComprobante.FacturaB), false);
  assert.equal(esClaseC(TipoComprobante.FacturaC), true);
  assert.equal(esClaseC(TipoComprobante.NotaCreditoC), true);
  assert.equal(esClaseC(TipoComprobante.FacturaB), false);
});

test("comprobanteLlevaIva: A/B/M informan IVA al WS; C no", () => {
  assert.equal(comprobanteLlevaIva(TipoComprobante.FacturaA), true);
  assert.equal(comprobanteLlevaIva(TipoComprobante.FacturaB), true); // aunque no discrimine impreso
  assert.equal(comprobanteLlevaIva(TipoComprobante.FacturaM), true);
  assert.equal(comprobanteLlevaIva(TipoComprobante.FacturaC), false);
});

test("discriminaIva (impresión) ≠ comprobanteLlevaIva (WS) para la B", () => {
  // La B: NO discrimina en el impreso, pero SÍ informa IVA al web service.
  assert.equal(discriminaIva(TipoComprobante.FacturaB), false);
  assert.equal(comprobanteLlevaIva(TipoComprobante.FacturaB), true);
});
