// Textos de éxito y de tope de las cuotas (avisos-cuota.ts). PUROS.

import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoTopeCobro, avisoTopeCuota, avisoTopeMarcar, listoFacturada, listoMarcada, pesosConEquivalente, textoCubierta, textoFacturaDeCuota } from "./avisos-cuota";

const nbsp = (s: string) => s.replace(/ /g, " ");
const enUsd = { enMoneda: { moneda: "USD", tc: 1000, total: 500, cobrado: 0, saldo: 500 } };

test("en pesos, sólo pesos; en dólares, con el equivalente al cambio de la cobranza", () => {
  assert.equal(nbsp(pesosConEquivalente(100000, null)), "$ 100.000");
  assert.equal(nbsp(pesosConEquivalente(100000, {})), "$ 100.000");
  assert.equal(nbsp(pesosConEquivalente(100000, enUsd)), "$ 100.000 (US$ 100)");
  assert.equal(nbsp(pesosConEquivalente(150050, enUsd)), "$ 150.050 (US$ 150,05)");
  // Sin cambio no se inventa el equivalente.
  assert.equal(nbsp(pesosConEquivalente(100000, { enMoneda: { ...enUsd.enMoneda, tc: 0 } })), "$ 100.000");
});

test("los avisos de tope de un proyecto en dólares hablan también en dólares", () => {
  assert.match(nbsp(avisoTopeMarcar(200000, enUsd)), /\$ 200\.000 \(US\$ 200\) es más de lo que se debe/);
  assert.equal(nbsp(avisoTopeCobro(50000, 80000, enUsd)), "Pasa lo que falta cobrar: quedan $ 50.000 (US$ 50) y el cobro es de $ 80.000 (US$ 80).");
  assert.match(nbsp(avisoTopeCuota({ porCobrar: 100000, esperado: 60000, lugar: 40000 }, enUsd)), /Como mucho podés cargar \$ 40\.000 \(US\$ 40\)\./);
  assert.doesNotMatch(avisoTopeMarcar(200000, null), /US\$/);
});

test("calendario completo: dice por qué no entra la cuota y qué hacer", () => {
  const t = nbsp(avisoTopeCuota({ porCobrar: 500000, esperado: 500000, lugar: 0 }, enUsd));
  assert.match(t, /^No entra otra cuota: las cuotas pendientes \(\$ 500\.000 \(US\$ 500\)\) ya cubren todo lo que falta cobrar/);
  assert.match(t, /editá o quitá una de las cuotas que ya están\.$/);
});

test("éxito de marcar y de facturar", () => {
  assert.equal(nbsp(listoMarcada(true, 1500.75)), "Listo: cuota marcada como cobrada ($ 1.500,75).");
  assert.equal(nbsp(listoMarcada(false, 2000)), "Listo: cuota marcada como pagada ($ 2.000).");
  assert.equal(listoFacturada({ status: "AUTHORIZED", tipoComprobante: 11, puntoVenta: 1, numero: 1 }), "Listo: emitida Factura C 0001-00000001.");
  assert.equal(listoFacturada({ status: "PENDING", tipoComprobante: 11, puntoVenta: 1, numero: null }), "Listo: la factura quedó pedida a ARCA. El número aparece apenas la autorice.");
  assert.equal(listoFacturada(undefined), "Listo: la factura quedó pedida a ARCA. El número aparece apenas la autorice.");
  assert.match(listoFacturada({ status: "REJECTED", tipoComprobante: 11, puntoVenta: 1, numero: null, rechazoMotivo: "CUIT inválido" }), /^ARCA rechazó la factura: CUIT inválido/);
});

test("columna Factura de Administración: el comprobante emitido o en camino; nada si no hay o la rechazaron", () => {
  assert.equal(textoFacturaDeCuota({ status: "AUTHORIZED", tipoComprobante: 6, puntoVenta: 2, numero: 37 }), "Factura B 0002-00000037");
  assert.equal(textoFacturaDeCuota({ status: "PENDING", tipoComprobante: 6, puntoVenta: 2, numero: null }), "Factura en camino a ARCA");
  assert.equal(textoFacturaDeCuota({ status: "REJECTED", tipoComprobante: 6, puntoVenta: 2, numero: null }), null);
  assert.equal(textoFacturaDeCuota(undefined), null);
});

test("cuota cubierta: la del plan explica que no hay nada que hacer; la manual sugiere quitarla", () => {
  assert.match(textoCubierta(true), /no hace falta marcarla/);
  assert.match(textoCubierta(false), /quitala/);
});
