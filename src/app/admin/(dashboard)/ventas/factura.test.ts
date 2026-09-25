// ============================================================================
// FACTURAR UNA VENTA — cuándo se llama al facturador y qué dice la fila, EJECUTADO.
// ============================================================================
//
// Criterio: con la facturación apagada, «Facturar» deja «Sin factura» a la vista (con el
// porqué) y ofrece reintentar; nunca se emite con el perfil fiscal incompleto. Un Responsable
// Inscripto (R1-F5) factura sólo con el IVA de cada producto y con la letra que decide el
// sistema según la ficha fiscal del cliente; monotributo sigue exactamente igual (C).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estadoDeFactura,
  faltanteFiscalEnPalabras,
  MOTIVO_INSCRIPTO_SIN_ALICUOTA,
  puedeFacturarVenta,
  SIN_FACTURA,
} from "./factura";
import { resumenACuenta, notaDeCupon } from "./filtros";
import type { FichaFiscal } from "@/lib/fiscal/ficha-fiscal";
import { MOTIVO_EXENTO_O_NO_GRAVADO, MOTIVO_RENGLONES_NO_SUMAN } from "@/lib/fiscal/impuestos-por-alicuota";

const COBRADA = { paid: true, anulada: false, total: 15500 };
/** Lo cobrado por producto, con su alícuota: 12.100 al 21 % y 3.400 al 10,5 % (suman 15.500). */
const CON_ALICUOTA = [
  { total: 12100, alicuotaIva: 5 },
  { total: 3400, alicuotaIva: 4 },
];
const HOY = "20260925";
// CUIT con dígito verificador correcto.
const RI = { ok: true as const, condicionIva: "RESPONSABLE_INSCRIPTO", cuit: "30712345671", regimenFacturaA: "A" };
const CLIENTE_INSCRIPTO: FichaFiscal = {
  docTipo: 80,
  docNro: "30500000003",
  razonSocial: "Distribuidora del Sur SA",
  condicionIva: "RESPONSABLE_INSCRIPTO",
  domicilio: "Av. Mitre 1234, Avellaneda",
};
const CLIENTE_MONOTRIBUTISTA: FichaFiscal = {
  docTipo: 80,
  docNro: "27111111117",
  razonSocial: "Ana Gómez",
  condicionIva: "MONOTRIBUTO",
  domicilio: "Calle 12 Nº 345, La Plata",
};
/** Todo al 21 %: una sola alícuota, la A que el impreso sabe mostrar. */
const SOLO_21 = [{ total: 15500, alicuotaIva: 5 }];

test("inscripto con el IVA de cada producto: A a un cliente inscripto con domicilio y una alícuota; B a consumidor final con una o varias", () => {
  const base = { facturacionEncendida: true, perfil: RI, venta: COBRADA, hoy: HOY };
  assert.deepEqual(puedeFacturarVenta({ ...base, renglones: SOLO_21, receptor: CLIENTE_INSCRIPTO }), { ok: true, letra: "A" });
  assert.deepEqual(puedeFacturarVenta({ ...base, renglones: CON_ALICUOTA, receptor: null }), { ok: true, letra: "B" });
  assert.deepEqual(puedeFacturarVenta({ ...base, renglones: SOLO_21, receptor: null }), { ok: true, letra: "B" });
});

// Refutación r1f5 (4 y 5): ARCA autorizaba A que después el impreso no podía entregar.
test("la A sin el domicilio del comprador no se promete: el impreso de la A lo lleva (RG 1415, Anexo II)", () => {
  const base = { facturacionEncendida: true, perfil: RI, venta: COBRADA, hoy: HOY, renglones: SOLO_21 };
  for (const domicilio of [null, "   "]) {
    const r = puedeFacturarVenta({ ...base, receptor: { ...CLIENTE_INSCRIPTO, domicilio } });
    assert.equal(r.ok, false, `domicilio ${JSON.stringify(domicilio)}`);
    assert.match(r.ok ? "" : r.motivo, /domicilio/);
  }
});

test("la A con productos de distintas alícuotas no se promete: el impreso no puede mostrar el precio sin IVA de cada uno", () => {
  const r = puedeFacturarVenta({ facturacionEncendida: true, perfil: RI, venta: COBRADA, hoy: HOY, renglones: CON_ALICUOTA, receptor: CLIENTE_INSCRIPTO });
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.motivo, /alícuotas/);
  assert.match(r.ok ? "" : r.motivo, /sitio de ARCA/);
});

// Refutación r1f5 (3): la leyenda obligatoria estaba en la decisión y nunca llegaba al papel.
test("la A a un monotributista no se promete mientras el impreso no lleve la leyenda de la RG 5003/2021 (Ley 27.618)", () => {
  const r = puedeFacturarVenta({ facturacionEncendida: true, perfil: RI, venta: COBRADA, hoy: HOY, renglones: SOLO_21, receptor: CLIENTE_MONOTRIBUTISTA });
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.motivo, /RG 5003\/2021/);
  assert.match(r.ok ? "" : r.motivo, /sitio de ARCA/);
});

test("inscripto sin la alícuota de cada producto (o sin la fecha del día): no se emite, y se dice qué cargar", () => {
  const sinAlicuota = puedeFacturarVenta({ facturacionEncendida: true, perfil: RI, venta: COBRADA, receptor: CLIENTE_INSCRIPTO });
  assert.deepEqual(sinAlicuota, { ok: false, motivo: MOTIVO_INSCRIPTO_SIN_ALICUOTA });
  const unoSinAlicuota = [CON_ALICUOTA[0], { total: 3400, alicuotaIva: null }];
  assert.deepEqual(
    puedeFacturarVenta({ facturacionEncendida: true, perfil: RI, venta: COBRADA, receptor: CLIENTE_INSCRIPTO, renglones: unoSinAlicuota, hoy: HOY }),
    { ok: false, motivo: MOTIVO_INSCRIPTO_SIN_ALICUOTA },
  );
  const sinHoy = puedeFacturarVenta({ facturacionEncendida: true, perfil: RI, venta: COBRADA, renglones: CON_ALICUOTA });
  assert.match(sinHoy.ok ? "" : sinHoy.motivo, /falta la fecha del día/);
});

test("inscripto sin la clase A cargada: a un cliente inscripto no emite (lo dice la decisión); a consumidor final, B", () => {
  const sinClase = { ...RI, regimenFacturaA: null };
  const base = { facturacionEncendida: true, perfil: sinClase, venta: COBRADA, renglones: CON_ALICUOTA, hoy: HOY };
  const a = puedeFacturarVenta({ ...base, receptor: CLIENTE_INSCRIPTO });
  assert.equal(a.ok, false);
  assert.match(a.ok ? "" : a.motivo, /Falta cargar qué Factura A te asignó ARCA/);
  assert.deepEqual(puedeFacturarVenta({ ...base, receptor: null }), { ok: true, letra: "B" });
});

test("inscripto: Ventas no promete una factura que la emisión no puede calcular (exento, renglones que no suman)", () => {
  const base = { facturacionEncendida: true, perfil: RI, venta: COBRADA, receptor: CLIENTE_INSCRIPTO, hoy: HOY };
  const exento = puedeFacturarVenta({ ...base, renglones: [CON_ALICUOTA[0], { total: 3400, alicuotaIva: 2 }] });
  assert.deepEqual(exento, { ok: false, motivo: MOTIVO_EXENTO_O_NO_GRAVADO });
  const conDescuento = puedeFacturarVenta({ ...base, renglones: [...CON_ALICUOTA, { total: 100, alicuotaIva: 5 }] });
  assert.deepEqual(conDescuento, { ok: false, motivo: MOTIVO_RENGLONES_NO_SUMAN });
});

test("monotributo (CH) factura exactamente como antes: C sin mirar la ficha ni la alícuota", () => {
  const mono = { ok: true as const, condicionIva: "MONOTRIBUTO" };
  const exentoYSinAlicuota = [{ total: 15000, alicuotaIva: 2 }, { total: 500, alicuotaIva: null }];
  for (const extra of [{}, { receptor: CLIENTE_INSCRIPTO, renglones: exentoYSinAlicuota, hoy: HOY }]) {
    assert.deepEqual(puedeFacturarVenta({ facturacionEncendida: true, perfil: mono, venta: COBRADA, ...extra }), { ok: true });
  }
});

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
