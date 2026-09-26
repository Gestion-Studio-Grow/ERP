// El detalle de un comprobante dice lo que es según su estado ante ARCA (QA vuelta 1: el
// rechazado decía «autorizado por ARCA», no mostraba el motivo y no tenía salida).
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOTIVO_IVA_SIN_ALICUOTA_POR_PRODUCTO } from "@/plugins/arca/domain/iva-por-producto";
import { estadoDelDetalle } from "./detalle-core";

const venta = { tipo: "venta", orderId: "ord_1" } as const;

test("un comprobante rechazado no dice «autorizado»: muestra el motivo de ARCA y ofrece volver a facturar la venta", () => {
  const d = estadoDelDetalle({ estado: "REJECTED", ambiente: "prueba", rechazoMotivo: "10013: el receptor RI requiere Factura A", origen: venta });
  assert.doesNotMatch(d.descripcion, /autoriz/i);
  assert.equal(d.prueba, null, "el aviso «ARCA autorizó… en su modo de prueba» es sólo de los autorizados");
  assert.ok(d.rechazo);
  assert.equal(d.rechazo.motivo, "10013: el receptor RI requiere Factura A");
  assert.equal(d.rechazo.reFacturarVenta, "ord_1");
  assert.deepEqual(d.rechazo.enlace, { href: "/admin/facturacion?estado=rechazada", etiqueta: "Ver los rechazados" });
});

test("sin motivo guardado lo dice; del banco lleva a Facturación automática; sin origen, dice desde dónde", () => {
  const banco = estadoDelDetalle({ estado: "REJECTED", ambiente: "real", rechazoMotivo: "  ", origen: { tipo: "banco" } });
  assert.equal(banco.rechazo?.motivo, "ARCA no mandó el motivo.");
  assert.equal(banco.rechazo?.enlace?.href, "/admin/facturacion/bancos");
  assert.equal(banco.rechazo?.reFacturarVenta, null);
  const otro = estadoDelDetalle({ estado: "REJECTED", ambiente: null, rechazoMotivo: null, origen: { tipo: "otro" } });
  assert.match(otro.rechazo?.comoSeguir ?? "", /volvé a facturar la venta desde donde la cobraste/);
});

test("autorizado: el texto de siempre; en modo de prueba, el aviso de que no tiene validez fiscal", () => {
  const prueba = estadoDelDetalle({ estado: "AUTHORIZED", ambiente: "prueba", rechazoMotivo: null, origen: venta });
  assert.equal(prueba.descripcion, "Lo que dice el comprobante autorizado por ARCA. El PDF es el que le das al cliente.");
  assert.match(prueba.prueba ?? "", /modo de prueba: no tiene validez fiscal/);
  assert.equal(prueba.rechazo, null);
  assert.equal(estadoDelDetalle({ estado: "AUTHORIZED", ambiente: "real", rechazoMotivo: null, origen: venta }).prueba, null);
});

test("rechazado por la regla del inscripto: no manda a volver a facturar (da el mismo rechazo) y dice por dónde se emite", () => {
  // Así lo guarda el despacho (arca-dispatch.ts): «campo: mensaje» de la validación local.
  const motivo = `iva: ${MOTIVO_IVA_SIN_ALICUOTA_POR_PRODUCTO}`;
  for (const origen of [venta, { tipo: "banco" } as const, { tipo: "turno" } as const, { tipo: "otro" } as const]) {
    const d = estadoDelDetalle({ estado: "REJECTED", ambiente: "prueba", rechazoMotivo: motivo, origen });
    assert.ok(d.rechazo, origen.tipo);
    assert.equal(d.rechazo.motivo, motivo);
    assert.equal(d.rechazo.reFacturarVenta, null, `${origen.tipo}: sin el botón que repite el rechazo`);
    assert.doesNotMatch(d.rechazo.comoSeguir, /volvé a (facturar|emitir)|avisale a soporte para volver a facturar/, origen.tipo);
    assert.match(d.rechazo.comoSeguir, /da el mismo rechazo/, origen.tipo);
    assert.match(d.rechazo.comoSeguir, /página de ARCA/, origen.tipo);
    assert.match(d.rechazo.comoSeguir, /contador/, origen.tipo);
    assert.deepEqual(d.rechazo.enlace, { href: "/admin/facturacion?estado=rechazada", etiqueta: "Ver los rechazados" });
  }
});

test("pendiente: todavía no lo autorizó y cómo mandarlo", () => {
  const d = estadoDelDetalle({ estado: "PENDING", ambiente: "prueba", rechazoMotivo: null, origen: venta });
  assert.match(d.descripcion, /^ARCA todavía no lo autorizó/);
  assert.equal(d.prueba, null);
  assert.equal(d.rechazo, null);
});
