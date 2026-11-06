import { test } from "node:test";
import assert from "node:assert/strict";
import { armarPropuestaMP, estadoEnBandeja, hashPropuestaMP, pagoDeLaPropuesta } from "./propuesta-mp";
import { hashPagoMP } from "@/lib/mercadopago-auto";
import { claveCobroMP } from "@/lib/facturacion/cobros-facturados";
import type { HechosDelComprobante } from "./estado-comprobante";
import type { PagoMP } from "@/plugins/mercadopago";

const AHORA = new Date("2026-11-06T15:00:00Z");
const pago = { id: "123", monto: 5000, descripcion: "Café", fechaAcreditacion: "20261105", contraparteNombre: "Ana" } as unknown as PagoMP;
const envio = (x: Partial<NonNullable<HechosDelComprobante["envio"]>> = {}) => ({
  processedAt: null, attempts: 0, lastError: null, proximoIntentoEn: null, bloqueadoHasta: null, muertoEn: null, ...x,
});
const h = (x: Partial<HechosDelComprobante>): HechosDelComprobante => ({ status: "PENDING", rechazoMotivo: null, cae: null, envio: envio(), ...x });

test("hash: la forma guardada de mp:payment:<id>, igual a la ingesta automática y al libro (una sola fila por pago)", () => {
  assert.equal(hashPropuestaMP("123"), "mp:123");
  assert.equal(hashPropuestaMP("123"), hashPagoMP("123"));
  assert.equal(hashPropuestaMP("123"), claveCobroMP("123"));
  assert.equal(pagoDeLaPropuesta("mp:payment:123"), "123");
  assert.equal(pagoDeLaPropuesta("mp:123"), "123");
  assert.equal(pagoDeLaPropuesta("a3f9".repeat(16)), null); // hash de un extracto del banco
  assert.equal(pagoDeLaPropuesta("mp:refund:9"), null);
});

test("armar: cada decisión de la clasificación", () => {
  assert.equal(armarPropuestaMP(pago, { tipo: "nada", motivo: "apagado" }, AHORA), null);
  assert.equal(armarPropuestaMP(pago, { tipo: "excluir", motivo: "transferencia_propia" } as never, AHORA)?.estadoPropuesta, "no_facturable");
  const enl = armarPropuestaMP(pago, { tipo: "enlazar", invoiceId: "inv1" }, AHORA);
  assert.deepEqual([enl?.estadoPropuesta, enl?.invoiceId], ["emitida", "inv1"]);
  const pd = armarPropuestaMP(pago, { tipo: "pendiente_datos", importe: 5000 }, AHORA);
  assert.deepEqual([pd?.estadoPropuesta, pd?.requiereIdentificacion], ["revision", true]);
  assert.equal(armarPropuestaMP(pago, { tipo: "proponer", importe: 5000 }, AHORA)?.estadoPropuesta, "auto");
  const em = armarPropuestaMP(pago, { tipo: "emitir", importe: 4999.99 }, AHORA);
  assert.deepEqual([em?.estadoPropuesta, em?.monto, em?.hash, em?.referencia], ["auto", 4999.99, "mp:123", "123"]);
  const sinFecha = armarPropuestaMP({ ...pago, fechaAcreditacion: undefined } as unknown as PagoMP, { tipo: "proponer", importe: 1 }, AHORA);
  assert.equal(sinFecha?.fecha, "20261106");
});

test("bandeja: antes de «emitida» manda la propuesta; después, el contrato v1.1 (cada estado)", () => {
  assert.deepEqual(estadoEnBandeja("auto", null, AHORA), { de: "propuesta", estado: "auto" });
  assert.deepEqual(estadoEnBandeja("revision", h({ status: "AUTHORIZED" }), AHORA), { de: "propuesta", estado: "revision" });
  const e = (x: HechosDelComprobante | null) => {
    const v = estadoEnBandeja("emitida", x, AHORA);
    return v.de === "comprobante" ? v.estado : null;
  };
  assert.equal(e(null), "EN_COLA"); // la factura no aparece: nunca un AUTORIZADO inventado
  assert.equal(e(h({ envio: null })), "EN_COLA");
  assert.equal(e(h({ envio: envio({ bloqueadoHasta: new Date(AHORA.getTime() + 60_000) }) })), "EMITIENDO");
  assert.equal(e(h({ envio: envio({ attempts: 1, lastError: "ARCA caída", proximoIntentoEn: new Date(AHORA.getTime() + 300_000) }) })), "FALLA_TRANSITORIA");
  assert.equal(e(h({ envio: envio({ attempts: 0, muertoEn: AHORA, lastError: "falta certificado" }) })), "PENDIENTE_DATOS");
  // Tope por defecto = POLITICA_DE_REINTENTOS.maxIntentos (4), sin pasarlo a mano.
  assert.equal(e(h({ envio: envio({ attempts: 4, muertoEn: AHORA }) })), "PENDIENTE_REVISION");
  assert.equal(e(h({ envio: envio({ attempts: 3, muertoEn: AHORA }) })), "PENDIENTE_DATOS");
  assert.equal(e(h({ status: "AUTHORIZED", cae: "123" })), "AUTORIZADO");
  assert.equal(e(h({ status: "REJECTED", rechazoMotivo: "10015: el receptor no es válido" })), "RECHAZADO");
  const f = estadoEnBandeja("emitida", h({ envio: envio({ attempts: 2, proximoIntentoEn: new Date("2026-11-06T15:05:00Z") }) }), AHORA);
  assert.equal(f.de === "comprobante" ? f.reintentaEn : null, "2026-11-06T15:05:00.000Z");
});
