// Tests de `validarComprobante` (ADR-026 · plugin ARCA, ADR-022).
// Dominio puro: valida el comprobante ANTES de ir al WS de ARCA. Cubre cada
// regla con un caso válido y su contraparte inválida. Sin DB ni red.
// (Archivo de test propio del squad Calidad; NO toca soap.ts ni el código de prod.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { validarComprobante } from "./validacion";
import type { ComprobanteArca } from "./comprobante";
import {
  AlicuotaIvaId,
  CondicionIvaReceptorId,
  Concepto,
  TipoComprobante,
  TipoDocumento,
} from "./catalogos";

// Comprobante Factura B válido de base: neto 100 @ 21% = 21 IVA, total 121.
// Consumidor final sin identificar (docTipo 99), concepto Productos.
function compValido(over: Partial<ComprobanteArca> = {}): ComprobanteArca {
  return {
    puntoVenta: 1,
    tipo: TipoComprobante.FacturaB,
    concepto: Concepto.Productos,
    docTipo: TipoDocumento.ConsumidorFinal,
    docNro: 0,
    // RG 5616: obligatoria; consumidor final es la que admite la B de este caso.
    condicionIvaReceptorId: CondicionIvaReceptorId.ConsumidorFinal,
    fecha: "20260705",
    neto: 100,
    iva: [{ id: AlicuotaIvaId.VeintiUno, baseImponible: 100, importe: 21 }],
    total: 121,
    invoiceId: "inv-1",
    tenantId: "t-1",
    ...over,
  };
}

// Helper: ¿hay un error para tal campo?
function tieneError(r: ReturnType<typeof validarComprobante>, campo: string): boolean {
  return r.errores.some((e) => e.campo === campo);
}

// --- caso feliz -------------------------------------------------------------

test("un comprobante B consistente pasa sin errores", () => {
  const r = validarComprobante(compValido());
  assert.equal(r.ok, true);
  assert.deepEqual(r.errores, []);
});

test("un comprobante A con receptor CUIT identificado pasa", () => {
  const r = validarComprobante(
    compValido({
      tipo: TipoComprobante.FacturaA,
      docTipo: TipoDocumento.CUIT,
      docNro: 20304050607,
      condicionIvaReceptorId: CondicionIvaReceptorId.ResponsableInscripto,
    }),
  );
  assert.equal(r.ok, true);
});

// --- puntoVenta -------------------------------------------------------------

test("puntoVenta debe ser entero positivo", () => {
  assert.ok(tieneError(validarComprobante(compValido({ puntoVenta: 0 })), "puntoVenta"));
  assert.ok(tieneError(validarComprobante(compValido({ puntoVenta: -1 })), "puntoVenta"));
  assert.ok(tieneError(validarComprobante(compValido({ puntoVenta: 1.5 })), "puntoVenta"));
});

// --- fecha ------------------------------------------------------------------

test("fecha exige formato AAAAMMDD (8 dígitos)", () => {
  assert.ok(tieneError(validarComprobante(compValido({ fecha: "2026-07-05" })), "fecha"));
  assert.ok(tieneError(validarComprobante(compValido({ fecha: "202675" })), "fecha"));
  assert.ok(tieneError(validarComprobante(compValido({ fecha: "" })), "fecha"));
  assert.ok(!tieneError(validarComprobante(compValido({ fecha: "20260705" })), "fecha"));
});

// --- iva: al menos un subtotal ---------------------------------------------

test("iva vacío es rechazado", () => {
  const r = validarComprobante(compValido({ iva: [], neto: 0, total: 0 }));
  assert.ok(tieneError(r, "iva"));
});

// --- total > 0 --------------------------------------------------------------

test("total debe ser mayor a 0", () => {
  // total 0 con iva/neto también 0 → dispara el error de total.
  const r = validarComprobante(
    compValido({ total: 0, neto: 0, iva: [{ id: AlicuotaIvaId.Cero, baseImponible: 0, importe: 0 }] }),
  );
  assert.ok(tieneError(r, "total"));
});

// --- fechas de servicio -----------------------------------------------------

test("concepto Servicios exige servicioDesde/Hasta y vencimientoPago", () => {
  const r = validarComprobante(compValido({ concepto: Concepto.Servicios }));
  assert.ok(tieneError(r, "servicioDesde"));
  assert.ok(tieneError(r, "servicioHasta"));
  assert.ok(tieneError(r, "vencimientoPago"));
});

test("concepto Servicios con las tres fechas presentes no marca esos errores", () => {
  const r = validarComprobante(
    compValido({
      concepto: Concepto.Servicios,
      servicioDesde: "20260701",
      servicioHasta: "20260705",
      vencimientoPago: "20260710",
    }),
  );
  assert.ok(!tieneError(r, "servicioDesde"));
  assert.ok(!tieneError(r, "servicioHasta"));
  assert.ok(!tieneError(r, "vencimientoPago"));
});

test("concepto ProductosYServicios también exige las fechas de servicio", () => {
  const r = validarComprobante(compValido({ concepto: Concepto.ProductosYServicios }));
  assert.ok(tieneError(r, "servicioDesde"));
});

test("concepto Productos NO exige fechas de servicio", () => {
  const r = validarComprobante(compValido({ concepto: Concepto.Productos }));
  assert.ok(!tieneError(r, "servicioDesde"));
  assert.ok(!tieneError(r, "servicioHasta"));
  assert.ok(!tieneError(r, "vencimientoPago"));
});

// --- Factura A: receptor identificado con CUIT ------------------------------

test("Factura A sin CUIT (docTipo != CUIT) es rechazada", () => {
  const r = validarComprobante(
    compValido({
      tipo: TipoComprobante.FacturaA,
      docTipo: TipoDocumento.DNI,
      docNro: 30111222,
    }),
  );
  assert.ok(tieneError(r, "docTipo"));
});

test("Factura A con CUIT pero docNro <= 0 es rechazada", () => {
  const r = validarComprobante(
    compValido({ tipo: TipoComprobante.FacturaA, docTipo: TipoDocumento.CUIT, docNro: 0 }),
  );
  assert.ok(tieneError(r, "docNro"));
});

test("Nota de crédito A también exige CUIT (discrimina IVA)", () => {
  const r = validarComprobante(
    compValido({
      tipo: TipoComprobante.NotaCreditoA,
      docTipo: TipoDocumento.ConsumidorFinal,
      docNro: 0,
    }),
  );
  assert.ok(tieneError(r, "docTipo"));
});

test("Factura B con consumidor final NO exige CUIT", () => {
  const r = validarComprobante(compValido({ tipo: TipoComprobante.FacturaB }));
  assert.ok(!tieneError(r, "docTipo"));
  assert.ok(!tieneError(r, "docNro"));
});

// --- numero opcional --------------------------------------------------------

test("numero, si se informa, debe ser entero positivo", () => {
  assert.ok(tieneError(validarComprobante(compValido({ numero: 0 })), "numero"));
  assert.ok(tieneError(validarComprobante(compValido({ numero: -3 })), "numero"));
  assert.ok(tieneError(validarComprobante(compValido({ numero: 2.5 })), "numero"));
  assert.ok(!tieneError(validarComprobante(compValido({ numero: 42 })), "numero"));
});

test("numero ausente (undefined) es válido: lo resuelve el cliente contra ARCA", () => {
  const r = validarComprobante(compValido({ numero: undefined }));
  assert.ok(!tieneError(r, "numero"));
});

// --- consistencia de montos (verificar, no recalcular) ----------------------

test("baseImponible negativa es rechazada", () => {
  const r = validarComprobante(
    compValido({
      iva: [{ id: AlicuotaIvaId.VeintiUno, baseImponible: -100, importe: -21 }],
      neto: -100,
      total: -121,
    }),
  );
  assert.ok(tieneError(r, "iva[0].baseImponible"));
});

test("alícuota de IVA desconocida es rechazada", () => {
  const r = validarComprobante(
    compValido({ iva: [{ id: 999 as AlicuotaIvaId, baseImponible: 100, importe: 21 }] }),
  );
  assert.ok(tieneError(r, "iva[0].id"));
});

test("IVA inconsistente con la alícuota es rechazado (más allá de la tolerancia)", () => {
  // base 100 @ 21% ⇒ 21 esperado, pero mandan 30.
  const r = validarComprobante(
    compValido({
      iva: [{ id: AlicuotaIvaId.VeintiUno, baseImponible: 100, importe: 30 }],
      neto: 100,
      total: 130,
    }),
  );
  assert.ok(tieneError(r, "iva[0].importe"));
});

test("IVA a un centavo de base × alícuota se acepta: el Core redondea cada renglón", () => {
  // 100,05 @ 21 % = 21,0105: el Core manda 21,01 y también se tolera 21,02.
  for (const importe of [21.01, 21.02]) {
    const r = validarComprobante(
      compValido({
        iva: [{ id: AlicuotaIvaId.VeintiUno, baseImponible: 100.05, importe }],
        neto: 100.05,
        total: 100.05 + importe,
      }),
    );
    assert.ok(!tieneError(r, "iva[0].importe"), JSON.stringify(r.errores));
  }
});

test("IVA a dos centavos de base × alícuota se rechaza: 100 @ 21 % no es 21,02", () => {
  const r = validarComprobante(
    compValido({
      iva: [{ id: AlicuotaIvaId.VeintiUno, baseImponible: 100, importe: 21.02 }],
      neto: 100,
      total: 121.02,
    }),
  );
  assert.ok(tieneError(r, "iva[0].importe"), JSON.stringify(r.errores));
});

test("un importe con más de dos decimales se rechaza: a ARCA viajan centavos y el Core los manda así", () => {
  const conMedioCentavo = validarComprobante(
    compValido({
      iva: [{ id: AlicuotaIvaId.VeintiUno, baseImponible: 100, importe: 21.009 }],
      neto: 100,
      total: 121.009,
    }),
  );
  assert.equal(conMedioCentavo.ok, false);
  assert.ok(tieneError(conMedioCentavo, "iva[0].importe"), JSON.stringify(conMedioCentavo.errores));
  assert.ok(tieneError(conMedioCentavo, "total"), JSON.stringify(conMedioCentavo.errores));
  assert.ok(
    conMedioCentavo.errores.some((e) => /dos decimales/.test(e.mensaje)),
    JSON.stringify(conMedioCentavo.errores),
  );
  const totalDe1005 = validarComprobante(
    compValido({
      iva: [{ id: AlicuotaIvaId.Cero, baseImponible: 1.005, importe: 0 }],
      neto: 1.005,
      total: 1.005,
    }),
  );
  assert.ok(tieneError(totalDe1005, "total"));
  assert.ok(tieneError(totalDe1005, "neto"));
  assert.ok(tieneError(totalDe1005, "iva[0].baseImponible"));
});

test("un total a un centavo de neto + IVA se rechaza: 6,63 + 1,39 no es 8,01", () => {
  const r = validarComprobante(
    compValido({
      iva: [{ id: AlicuotaIvaId.VeintiUno, baseImponible: 6.63, importe: 1.39 }],
      neto: 6.63,
      total: 8.01,
    }),
  );
  assert.ok(tieneError(r, "total"), JSON.stringify(r.errores));
});

test("en todos los pares a un centavo hasta $20.000, ningún total ni neto descuadrado pasa", () => {
  let aceptados = 0;
  let ejemplo = "";
  for (let c = 1; c <= 2_000_000; c++) {
    const neto = c / 100;
    for (const corrido of [c + 1, c - 1]) {
      if (corrido <= 0) continue;
      const otro = corrido / 100;
      const total = validarComprobante(
        compValido({ iva: [{ id: AlicuotaIvaId.Cero, baseImponible: neto, importe: 0 }], neto, total: otro }),
      );
      const netoMal = validarComprobante(
        compValido({ iva: [{ id: AlicuotaIvaId.Cero, baseImponible: neto, importe: 0 }], neto: otro, total: otro }),
      );
      if (!tieneError(total, "total") || !tieneError(netoMal, "neto")) {
        aceptados++;
        if (!ejemplo) ejemplo = `neto ${neto} contra ${otro}`;
      }
    }
  }
  assert.equal(aceptados, 0, ejemplo);
});

test("neto que no coincide con la suma de bases es rechazado", () => {
  const r = validarComprobante(
    compValido({
      iva: [{ id: AlicuotaIvaId.VeintiUno, baseImponible: 100, importe: 21 }],
      neto: 200, // no coincide con la base 100
      total: 121,
    }),
  );
  assert.ok(tieneError(r, "neto"));
});

test("total que no coincide con neto + IVA es rechazado", () => {
  const r = validarComprobante(
    compValido({
      iva: [{ id: AlicuotaIvaId.VeintiUno, baseImponible: 100, importe: 21 }],
      neto: 100,
      total: 999, // debería ser 121
    }),
  );
  assert.ok(tieneError(r, "total"));
});

test("comprobante con varias alícuotas consistentes pasa", () => {
  // 100 @ 21% = 21 y 200 @ 10,5% = 21 ⇒ neto 300, IVA 42, total 342.
  const r = validarComprobante(
    compValido({
      iva: [
        { id: AlicuotaIvaId.VeintiUno, baseImponible: 100, importe: 21 },
        { id: AlicuotaIvaId.DiezCinco, baseImponible: 200, importe: 21 },
      ],
      neto: 300,
      total: 342,
    }),
  );
  assert.equal(r.ok, true);
});

test("alícuota 0% (base > 0, importe 0) es consistente", () => {
  const r = validarComprobante(
    compValido({
      iva: [{ id: AlicuotaIvaId.Cero, baseImponible: 100, importe: 0 }],
      neto: 100,
      total: 100,
    }),
  );
  assert.equal(r.ok, true);
});

// --- acumulación de errores -------------------------------------------------

test("acumula todos los errores en una pasada (no corta en el primero)", () => {
  const r = validarComprobante(
    compValido({ puntoVenta: 0, fecha: "malo", total: 0, neto: 0, iva: [] }),
  );
  assert.equal(r.ok, false);
  assert.ok(r.errores.length >= 3);
});

// --- montos que no son importes (ENG-109) ------------------------------------
test("un total, un neto o un importe de IVA que no es un número se rechaza acá, con mensaje", () => {
  assert.ok(tieneError(validarComprobante(compValido({ total: Number.NaN })), "total"));
  assert.ok(tieneError(validarComprobante(compValido({ total: Infinity })), "total"));
  assert.ok(tieneError(validarComprobante(compValido({ neto: Number.NaN })), "neto"));
  const r = validarComprobante(
    compValido({ iva: [{ id: AlicuotaIvaId.VeintiUno, baseImponible: 100, importe: Number.NaN }] }),
  );
  assert.equal(r.ok, false);
  assert.ok(tieneError(r, "iva[0]"));
});

test("el mensaje de un descuadre muestra la suma de las bases tal como viajan", () => {
  const r = validarComprobante(
    compValido({
      neto: 50,
      iva: [
        { id: AlicuotaIvaId.Cero, baseImponible: 0.01, importe: 0 },
        { id: AlicuotaIvaId.Cero, baseImponible: 0.01, importe: 0 },
      ],
      total: 50,
    }),
  );
  const neto = r.errores.find((e) => e.campo === "neto");
  assert.ok(neto, JSON.stringify(r.errores));
  assert.match(neto.mensaje, /\(0\.02\)/);
});
