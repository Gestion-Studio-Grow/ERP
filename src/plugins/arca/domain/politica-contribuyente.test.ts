// Tests del motor de POLÍTICA por tipo de contribuyente (ADR-022/024, ADR-026).
// La matriz de acciones-por-contribuyente es fiscal (zona ESTÁNDAR): cada celda
// emisor×receptor×operación se verifica contra la regla de ARCA. Dominio puro.

import { test } from "node:test";
import assert from "node:assert/strict";
import { CondicionIva, TipoComprobante } from "./catalogos";
import {
  comprobantePara,
  politicaDe,
  receptorRequiereCuit,
  esOperacionReversa,
  todasLasPoliticas,
} from "./politica-contribuyente";

const RI = CondicionIva.ResponsableInscripto;
const MONO = CondicionIva.Monotributo;
const EX = CondicionIva.Exento;
const CF = CondicionIva.ConsumidorFinal;

test("matriz FACTURA: Monotributo emite C a cualquier receptor", () => {
  for (const r of [RI, MONO, EX, CF]) {
    assert.equal(comprobantePara({ emisor: MONO, receptor: r }), TipoComprobante.FacturaC);
  }
});

test("matriz FACTURA: Exento emite C a cualquier receptor", () => {
  for (const r of [RI, MONO, EX, CF]) {
    assert.equal(comprobantePara({ emisor: EX, receptor: r }), TipoComprobante.FacturaC);
  }
});

test("matriz FACTURA: RI emite A solo a RI; B a Mono/Exento/Consumidor Final", () => {
  assert.equal(comprobantePara({ emisor: RI, receptor: RI }), TipoComprobante.FacturaA);
  assert.equal(comprobantePara({ emisor: RI, receptor: MONO }), TipoComprobante.FacturaB);
  assert.equal(comprobantePara({ emisor: RI, receptor: EX }), TipoComprobante.FacturaB);
  assert.equal(comprobantePara({ emisor: RI, receptor: CF }), TipoComprobante.FacturaB);
});

test("riesgo fiscal: el RI que emitiría A pasa a M; la B no cambia", () => {
  assert.equal(
    comprobantePara({ emisor: RI, receptor: RI, emisorRiesgoFiscal: true }),
    TipoComprobante.FacturaM,
  );
  assert.equal(
    comprobantePara({ emisor: RI, receptor: CF, emisorRiesgoFiscal: true }),
    TipoComprobante.FacturaB,
  );
});

test("NOTA_CREDITO sigue la clase de la factura (A→3, B→8, C→13, M→53)", () => {
  assert.equal(
    comprobantePara({ emisor: RI, receptor: RI, operacion: "NOTA_CREDITO" }),
    TipoComprobante.NotaCreditoA,
  );
  assert.equal(
    comprobantePara({ emisor: RI, receptor: CF, operacion: "NOTA_CREDITO" }),
    TipoComprobante.NotaCreditoB,
  );
  assert.equal(
    comprobantePara({ emisor: MONO, receptor: CF, operacion: "NOTA_CREDITO" }),
    TipoComprobante.NotaCreditoC,
  );
  assert.equal(
    comprobantePara({
      emisor: RI,
      receptor: RI,
      operacion: "NOTA_CREDITO",
      emisorRiesgoFiscal: true,
    }),
    TipoComprobante.NotaCreditoM,
  );
});

test("Consumidor Final no puede ser emisor", () => {
  assert.throws(() => politicaDe(CF));
  assert.throws(() => comprobantePara({ emisor: CF, receptor: CF }));
});

test("política: RI tiene más pasos y discrimina; Monotributo menos y no discrimina", () => {
  const ri = politicaDe(RI);
  const mono = politicaDe(MONO);
  assert.equal(ri.discriminaIva, true);
  assert.equal(ri.dependeDelReceptor, true);
  assert.equal(mono.discriminaIva, false);
  assert.equal(mono.dependeDelReceptor, false);
  assert.ok(ri.pasos.length >= mono.pasos.length);
  assert.ok(mono.pasos.length > 0);
});

test("receptorRequiereCuit: A y M sí, B y C no", () => {
  assert.equal(receptorRequiereCuit(TipoComprobante.FacturaA), true);
  assert.equal(receptorRequiereCuit(TipoComprobante.FacturaM), true);
  assert.equal(receptorRequiereCuit(TipoComprobante.FacturaB), false);
  assert.equal(receptorRequiereCuit(TipoComprobante.FacturaC), false);
});

test("esOperacionReversa reconoce las notas de crédito", () => {
  assert.equal(esOperacionReversa(TipoComprobante.NotaCreditoB), true);
  assert.equal(esOperacionReversa(TipoComprobante.FacturaB), false);
});

test("todasLasPoliticas devuelve las tres condiciones de emisor", () => {
  const ps = todasLasPoliticas();
  assert.equal(ps.length, 3);
  assert.deepEqual(
    ps.map((p) => p.emisor).sort(),
    [RI, MONO, EX].sort(),
  );
});
