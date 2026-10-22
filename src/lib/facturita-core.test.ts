/** Tests de la lógica pura de Facturita: tope mensual y validación del receptor. */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  esDePrueba,
  estadoLimite,
  fechaFiscalLegible,
  fechaInputAFiscal,
  mensajeDeEmision,
  motivoLegible,
  origenDelRechazo,
  validarEmision,
  ventanaDeFechaArca,
  LIMITE_FACTURAS_FACTURITA,
} from "@/lib/facturita-core";
import { PLAN_SALTO } from "@/lib/facturita-planes";

test("tope: con 0 usadas puede emitir y no hay mensaje", () => {
  const e = estadoLimite(0);
  assert.equal(e.puedeEmitir, true);
  assert.equal(e.restantes, LIMITE_FACTURAS_FACTURITA);
  assert.equal(e.mensaje, null);
});

test("tope: con 4 usadas avisa que queda 1", () => {
  const e = estadoLimite(4);
  assert.equal(e.puedeEmitir, true);
  assert.match(e.mensaje ?? "", /queda 1 factura/i);
});

test("tope: con 5 usadas bloquea y ofrece el upgrade", () => {
  const e = estadoLimite(5);
  assert.equal(e.puedeEmitir, false);
  assert.match(e.mensaje ?? "", /tope/i);
  assert.match(e.mensaje ?? "", /Comerciante/);
});

test("emisión: sin descripción no pasa", () => {
  const r = validarEmision({ descripcion: "  ", total: 1000 });
  assert.equal(r.ok, false);
});

test("emisión: total cero o negativo no pasa", () => {
  assert.equal(validarEmision({ descripcion: "algo", total: 0 }).ok, false);
  assert.equal(validarEmision({ descripcion: "algo", total: -5 }).ok, false);
});

test("emisión: sin documento es consumidor final (99/0)", () => {
  const r = validarEmision({ descripcion: "venta", total: 1000 });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.receptor, { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" });
});

test("emisión: CUIT válido pasa con guiones o sin (con la condición del comprador)", () => {
  const r = validarEmision({ descripcion: "venta", total: 1000, nombreReceptor: "Comprador SA", docTipo: 80, docNro: "20-11111111-2", condicionReceptor: "MONOTRIBUTO" });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.receptor.docNro, 20111111112);
});

test("emisión: CUIT con dígito verificador roto no pasa", () => {
  const r = validarEmision({ descripcion: "venta", total: 1000, nombreReceptor: "Comprador SA", docTipo: 80, docNro: "20-11111111-3", condicionReceptor: "MONOTRIBUTO" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /CUIT/);
});

test("emisión: DNI de 7 u 8 dígitos pasa; otro largo no", () => {
  assert.ok(validarEmision({ descripcion: "v", total: 1, nombreReceptor: "Comprador SA", docTipo: 96, docNro: "12345678" }).ok);
  assert.ok(validarEmision({ descripcion: "v", total: 1, nombreReceptor: "Comprador SA", docTipo: 96, docNro: "1234567" }).ok);
  assert.equal(validarEmision({ descripcion: "v", total: 1, nombreReceptor: "Comprador SA", docTipo: 96, docNro: "123456" }).ok, false);
});

// ---------------------------------------------------------------------------
// Vuelta 2 (revisión del contador): receptor con condición real, concepto, fechas y mensajes
// ---------------------------------------------------------------------------

const EMPRESA = "30-11111111-8"; // verificador válido, inventado
const HOY = "20261022";

test("receptor con CUIT: sin condición frente al IVA no se emite (RG 5616: nada de un 5 de relleno)", () => {
  const r = validarEmision({ descripcion: "v", total: 1000, nombreReceptor: "Comprador SA", docTipo: 80, docNro: EMPRESA });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /inscripto el comprador/);
});

test("receptor con CUIT: viaja la condición elegida (empresa inscripta, monotributista, exenta)", () => {
  // Una empresa (30) inscripta o exenta; una persona (20) monotributista.
  for (const [c, cuit, nro] of [
    ["RESPONSABLE_INSCRIPTO", EMPRESA, 30111111118],
    ["EXENTO", EMPRESA, 30111111118],
    ["MONOTRIBUTO", "20-11111111-2", 20111111112],
  ] as const) {
    const r = validarEmision({ descripcion: "v", total: 1000, nombreReceptor: "Comprador", docTipo: 80, docNro: cuit, condicionReceptor: c });
    assert.ok(r.ok, c);
    if (r.ok) assert.deepEqual(r.receptor, { docTipo: 80, docNro: nro, condicionIva: c });
  }
});

test("receptor con CUIL o DNI: consumidor final", () => {
  const cuil = validarEmision({ descripcion: "v", total: 1, nombreReceptor: "Comprador SA", docTipo: 86, docNro: "20111111112" });
  assert.ok(cuil.ok);
  if (cuil.ok) assert.equal(cuil.receptor.condicionIva, "CONSUMIDOR_FINAL");
  const dni = validarEmision({ descripcion: "v", total: 1, nombreReceptor: "Comprador SA", docTipo: 96, docNro: "12345678" });
  assert.ok(dni.ok);
  if (dni.ok) assert.equal(dni.receptor.condicionIva, "CONSUMIDOR_FINAL");
});

test("concepto: productos por defecto (1), sin fechas de servicio", () => {
  const r = validarEmision({ descripcion: "macetas", total: 1000 }, HOY);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.concepto, 1);
    assert.equal(r.servicio, null);
    assert.equal(r.descripcion, "macetas");
  }
});

test("concepto servicios/ambos: las tres fechas que pide ARCA son obligatorias, sin precarga", () => {
  const sinFechas = validarEmision({ descripcion: "clase", total: 1000, concepto: "servicios" }, HOY);
  assert.equal(sinFechas.ok, false, "un período que nadie cargó no se inventa");
  if (!sinFechas.ok) assert.match(sinFechas.error, /tres fechas/);
  const r = validarEmision(
    { descripcion: "clase", total: 1000, concepto: "servicios", servicioDesde: "2026-10-01", servicioHasta: "2026-10-01", vencimientoPago: "2026-10-22" },
    HOY,
  );
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.concepto, 2);
    assert.deepEqual(r.servicio, { desde: "20261001", hasta: "20261001", vencimientoPago: HOY });
  }
  const ambos = validarEmision(
    { descripcion: "x", total: 1, concepto: "ambos", servicioDesde: "2026-10-01", servicioHasta: "2026-10-31", vencimientoPago: "2026-11-10" },
    HOY,
  );
  assert.ok(ambos.ok);
  if (ambos.ok) {
    assert.equal(ambos.concepto, 3);
    assert.deepEqual(ambos.servicio, { desde: "20261001", hasta: "20261031", vencimientoPago: "20261110" });
  }
});

test("servicios: período al revés o vencimiento anterior a hoy no pasan", () => {
  const alReves = validarEmision(
    { descripcion: "x", total: 1, concepto: "servicios", servicioDesde: "2026-10-20", servicioHasta: "2026-10-01" },
    HOY,
  );
  assert.equal(alReves.ok, false);
  const vencido = validarEmision(
    { descripcion: "x", total: 1, concepto: "servicios", servicioDesde: "2026-10-01", servicioHasta: "2026-10-02", vencimientoPago: "2026-10-01" },
    HOY,
  );
  assert.equal(vencido.ok, false);
});

test("alícuota: 21 % por defecto; 10,5 y 27 con su código de ARCA", () => {
  const def = validarEmision({ descripcion: "x", total: 1 });
  assert.ok(def.ok);
  if (def.ok) assert.equal(def.alicuotaId, 5);
  const r105 = validarEmision({ descripcion: "x", total: 1, alicuota: "10.5" });
  assert.ok(r105.ok);
  if (r105.ok) assert.equal(r105.alicuotaId, 4);
  const r27 = validarEmision({ descripcion: "x", total: 1, alicuota: "27" });
  assert.ok(r27.ok);
  if (r27.ok) assert.equal(r27.alicuotaId, 6);
});

test("fechas: AAAA-MM-DD ↔ AAAAMMDD, y la legible sin pasar por Date (no se corre un día)", () => {
  assert.equal(fechaInputAFiscal("2026-10-22"), "20261022");
  assert.equal(fechaInputAFiscal("22/10/2026"), null);
  assert.equal(fechaFiscalLegible("20261001"), "01/10/2026");
  assert.equal(fechaFiscalLegible("20261231"), "31/12/2026");
});

test("rechazo: el de ARCA (código numérico) se distingue del que frenó el sistema", () => {
  assert.equal(origenDelRechazo("10015: El receptor no es válido"), "arca");
  assert.equal(origenDelRechazo("iva: Para un Responsable Inscripto…"), "sistema");
  assert.equal(origenDelRechazo(null), "sistema");
  assert.equal(
    motivoLegible("receptor.condicionIva: Falta la condición; total: Debe ser mayor a 0."),
    "Falta la condición · Debe ser mayor a 0.",
  );
  assert.match(mensajeDeEmision({ estado: "rechazada", origen: "arca", motivo: "10015: x" }), /^ARCA rechazó/);
  assert.match(mensajeDeEmision({ estado: "rechazada", origen: "sistema", motivo: "iva: y" }), /^No la mandamos a ARCA/);
});

test("mensaje: dice el estado real (de prueba, autorizada con CAE, pendiente o apagada)", () => {
  assert.equal(esDePrueba("stub", false), true);
  assert.equal(esDePrueba("real", true), true);
  assert.equal(esDePrueba("real", false), false);
  assert.match(
    mensajeDeEmision({ estado: "autorizada", dePrueba: true, numero: "0002-00000001", cae: "1" }),
    /prueba.*no tiene validez/,
  );
  assert.match(
    mensajeDeEmision({ estado: "autorizada", dePrueba: false, numero: "0002-00000001", cae: "75123" }),
    /autorizada por ARCA \(CAE 75123\)/,
  );
  assert.match(mensajeDeEmision({ estado: "pendiente", motivo: "esperando", ventanaDias: 5 }), /sale apenas ARCA responda/);
  assert.match(mensajeDeEmision({ estado: "pendiente", motivo: "apagada", ventanaDias: 10 }), /todavía no está activa/);
});

test("el aviso del tope no promete «sin límite»: nombra el tope del plan Solo", () => {
  const m = estadoLimite(LIMITE_FACTURAS_FACTURITA).mensaje ?? "";
  assert.doesNotMatch(m, /sin límite/i);
  assert.match(m, new RegExp(String(PLAN_SALTO.facturasPorMes)));
});

// ---------------------------------------------------------------------------
// Vuelta 3: comprador con nombre, persona jurídica no monotributista, ventana de ARCA
// ---------------------------------------------------------------------------

test("con documento, el nombre del comprador es obligatorio y viaja en la ficha (para el PDF)", () => {
  const sin = validarEmision({ descripcion: "v", total: 1, docTipo: 96, docNro: "12345678" });
  assert.equal(sin.ok, false);
  if (!sin.ok) assert.match(sin.error, /nombre o la razón social del comprador/);
  const con = validarEmision({
    descripcion: "v", total: 1, docTipo: 80, docNro: EMPRESA, condicionReceptor: "EXENTO",
    nombreReceptor: " Cooperativa La Unión ", domicilioReceptor: "Belgrano 1, Rosario",
  });
  assert.ok(con.ok);
  if (con.ok) assert.deepEqual(con.ficha, { nombre: "Cooperativa La Unión", domicilio: "Belgrano 1, Rosario" });
  const cf = validarEmision({ descripcion: "v", total: 1 });
  assert.ok(cf.ok);
  if (cf.ok) assert.equal(cf.ficha, null, "consumidor final sin documento: sin ficha");
});

test("una persona jurídica (CUIT 30/33/34) no puede ser monotributista", () => {
  const r = validarEmision({ descripcion: "v", total: 1, nombreReceptor: "X SA", docTipo: 80, docNro: EMPRESA, condicionReceptor: "MONOTRIBUTO" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /empresa no puede ser monotributista/);
  // Una persona humana (20) sí.
  assert.ok(validarEmision({ descripcion: "v", total: 1, nombreReceptor: "Ana", docTipo: 80, docNro: "20111111112", condicionReceptor: "MONOTRIBUTO" }).ok);
});

test("pendiente: avisa la ventana de fecha de ARCA (5 días productos, 10 servicios)", () => {
  assert.equal(ventanaDeFechaArca(1), 5);
  assert.equal(ventanaDeFechaArca(2), 10);
  assert.equal(ventanaDeFechaArca(3), 10);
  const m = mensajeDeEmision({ estado: "pendiente", motivo: "apagada", ventanaDias: 5 });
  assert.match(m, /hasta 5 días/);
  assert.match(m, /volver a emitir/);
});
