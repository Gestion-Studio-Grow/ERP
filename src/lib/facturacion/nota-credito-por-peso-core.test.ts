import { test } from "node:test";
import assert from "node:assert/strict";
import { claveNotaPorPeso, facturaParaLaNota, fraseDeLaNota, importeDeLaNota } from "./nota-credito-por-peso-core";
import { planAjusteCobrado, mensajeAjusteCobradoRechazado, mensajeDelAjuste, type ResultadoAjustePeso } from "@/lib/ajuste-peso-cobrado";

const STUB = { id: "f1", status: "AUTHORIZED", cae: "STUB00000001", comprobanteAsociadoId: null };

test("factura para la nota: sólo la simulada con el negocio en modo prueba admite NC automática", () => {
  assert.deepEqual(facturaParaLaNota([], true), { estado: "sin-factura-viva" });
  assert.deepEqual(facturaParaLaNota([{ ...STUB, status: "REJECTED" }], true), { estado: "sin-factura-viva" });
  assert.deepEqual(facturaParaLaNota([{ ...STUB, status: "PENDING", cae: null }], true), { estado: "en-camino" });
  assert.deepEqual(facturaParaLaNota([STUB], true), { estado: "simulada", facturaId: "f1" });
  // CAE real, o el negocio fuera de modo prueba: nunca NC automática (se rechaza como siempre).
  assert.deepEqual(facturaParaLaNota([{ ...STUB, cae: "74123456789012" }], true), { estado: "autorizada" });
  assert.deepEqual(facturaParaLaNota([STUB], false), { estado: "autorizada" });
  // Una nota (con comprobante asociado) no cuenta como factura del pedido.
  assert.deepEqual(facturaParaLaNota([{ ...STUB, comprobanteAsociadoId: "x" }], true), { estado: "sin-factura-viva" });
});

test("importe de la nota: lo devuelto, nunca más que lo que queda por anular (al centavo)", () => {
  assert.equal(importeDeLaNota(1400, 12400, 0), 1400);
  assert.equal(importeDeLaNota(1400, 12400, 12000), 400);
  assert.equal(importeDeLaNota(1400, 12400, 12400), 0);
  assert.equal(importeDeLaNota(0.1 + 0.2, 100, 0), 0.3);
});

test("clave por pedido + ajuste", () => {
  assert.equal(claveNotaPorPeso("o1", "e1"), "ajuste-peso:nc:o1:e1");
  assert.notEqual(claveNotaPorPeso("o1", "e1"), claveNotaPorPeso("o1", "e2"));
});

test("plan: la factura simulada se ajusta; la real y la en camino no", () => {
  const BASE = { existe: true, status: "PENDING", tieneVenta: true, yaAjustado: false, otrosCobros: false } as const;
  assert.deepEqual(planAjusteCobrado({ ...BASE, factura: "simulada" }), { ok: true });
  assert.deepEqual(planAjusteCobrado({ ...BASE, factura: "autorizada" }), { ok: false, motivo: "facturada" });
  assert.match(mensajeAjusteCobradoRechazado("facturada-peso-mas"), /no se agranda/);
});

test("aviso: sin factura lo dice; con nota dice que es de prueba", () => {
  assert.match(fraseDeLaNota({ estado: "sin-factura" }), /no tenía factura: no hace falta nota de crédito/);
  assert.match(fraseDeLaNota({ estado: "emitida", clave: "k", importe: 1400, invoiceId: "n", yaExistia: false }), /ARCA simulado, sin validez fiscal/);
  assert.match(fraseDeLaNota({ estado: "pendiente", clave: "k", importe: 1400 }), /quedó pendiente/);
  assert.equal(fraseDeLaNota(undefined), "");
  const r = {
    code: 7, antes: 12400, total: 11000, conPeso: true, cobrado: 12400, diferencia: { tipo: "devolver", monto: 1400 },
    porMercadoPago: false, cambios: [], repetido: false, notaDeCredito: { estado: "sin-factura" },
  } as unknown as ResultadoAjustePeso;
  assert.match(mensajeDelAjuste(r), /libro de hoy\. La venta no tenía factura/);
});
