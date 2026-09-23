// ============================================================================
// FACTURAR UNA VENTA — cuándo se llama al facturador y qué dice la fila, EJECUTADO.
// ============================================================================
//
// Criterio: con la facturación apagada, «Facturar» deja «Sin factura» a la vista (con el
// porqué) y ofrece reintentar; nunca se emite con el perfil fiscal incompleto, ni para un
// Responsable Inscripto hasta que exista el IVA por producto (ola 9).

import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoDeFactura, faltanteFiscalEnPalabras, puedeFacturarVenta, SIN_FACTURA } from "./factura";
import { resumenACuenta, notaDeCupon } from "./filtros";

const COBRADA = { paid: true, anulada: false, total: 15500 };

test("con la facturación apagada no se emite: 'Sin factura' con el porqué", () => {
  const r = puedeFacturarVenta({ facturacionEncendida: false, perfil: null, venta: COBRADA });
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.motivo, /no está encendida.*Reintentá/);
  assert.deepEqual(SIN_FACTURA, { estado: "sin-factura", texto: "Sin factura" });
});

test("encendida: se emite sólo con el perfil completo y fuera de Responsable Inscripto", () => {
  assert.deepEqual(
    puedeFacturarVenta({ facturacionEncendida: true, perfil: { ok: true, condicionIva: "MONOTRIBUTO" }, venta: COBRADA }),
    { ok: true },
  );
  const sinCuit = puedeFacturarVenta({ facturacionEncendida: true, perfil: { ok: false, falta: faltanteFiscalEnPalabras("arcaCuit") }, venta: COBRADA });
  assert.match(sinCuit.ok ? "" : sinCuit.motivo, /Falta el CUIT/);
  const ri = puedeFacturarVenta({ facturacionEncendida: true, perfil: { ok: true, condicionIva: "RESPONSABLE_INSCRIPTO" }, venta: COBRADA });
  assert.match(ri.ok ? "" : ri.motivo, /Responsable Inscripto/);
});

test("anulada, sin cobrar o en cero: no se factura", () => {
  const perfil = { ok: true as const, condicionIva: "MONOTRIBUTO" };
  assert.equal(puedeFacturarVenta({ facturacionEncendida: true, perfil, venta: { ...COBRADA, anulada: true } }).ok, false);
  assert.equal(puedeFacturarVenta({ facturacionEncendida: true, perfil, venta: { ...COBRADA, paid: false } }).ok, false);
  assert.equal(puedeFacturarVenta({ facturacionEncendida: true, perfil, venta: { ...COBRADA, total: 0 } }).ok, false);
});

test("lo que dice la fila según el comprobante", () => {
  assert.deepEqual(estadoDeFactura(null), SIN_FACTURA);
  assert.deepEqual(
    estadoDeFactura({ status: "AUTHORIZED", numero: 123, puntoVenta: 3, tipoComprobante: 11, rechazoMotivo: null }),
    { estado: "facturada", texto: "Factura C 0003-00000123" },
  );
  assert.equal(estadoDeFactura({ status: "PENDING", numero: null, puntoVenta: 3, tipoComprobante: null, rechazoMotivo: null }).estado, "en-tramite");
  const rechazada = estadoDeFactura({ status: "REJECTED", numero: null, puntoVenta: 3, tipoComprobante: null, rechazoMotivo: "CUIT inválido" });
  assert.equal(rechazada.estado, "rechazada");
  assert.match(rechazada.texto, /CUIT inválido/);
});

test("Ventas del día: las ventas a cuenta se dicen aparte y el cupón queda en la nota", () => {
  assert.deepEqual(
    resumenACuenta([
      { total: 1000, paid: true, paymentMethod: "EFECTIVO" },
      { total: 2500, paid: true, paymentMethod: null },
    ]),
    { cantidad: 1, total: 2500 },
  );
  assert.match(notaDeCupon({ codigo: "VERANO10", monto: 1550 }) ?? "", /^Cupón VERANO10: −\$\s?1\.550,00\.$/);
  // Pesado y ajustado: el monto es el del PEDIDO (el cupón se recalculó), no el del alta.
  assert.match(notaDeCupon({ codigo: "VERANO10", monto: 1550 }, 3000) ?? "", /^Cupón VERANO10: −\$\s?3\.000,00\.$/);
  assert.equal(notaDeCupon(null), null);
  assert.equal(notaDeCupon({ monto: 3 }), null);
});
