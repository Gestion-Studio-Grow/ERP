/**
 * La decisión del comprobante y el pedido a ARCA cuentan los mismos centavos (ENG-109;
 * criterio 6 de PF en D1-PLAN). El núcleo de decisión (src/lib/fiscal/decidir-comprobante.ts,
 * de otro frente) se prueba TAL COMO ESTÁ: la coherencia no depende de cómo redondee él,
 * sino de que a los dos lados llega el mismo número ya al centavo. El Core lo arma así
 * (calcularImpuestos de src/lib/fiscal.ts) y el plugin rechaza cualquier importe con más de
 * dos decimales antes de escribir el pedido (validarComprobante).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  decidirComprobante,
  type EmisorFiscal,
  type ReceptorFiscal,
} from "@/lib/fiscal/decidir-comprobante";
import { calcularImpuestos } from "@/lib/fiscal";
import { armarFECAESolicitarRequest, type TicketAcceso } from "@/plugins/arca/afip/soap";
import {
  AlicuotaIvaId,
  CondicionIvaReceptorId,
  Concepto,
  TipoComprobante,
  TipoDocumento,
} from "@/plugins/arca/domain/catalogos";
import type { ComprobanteArca } from "@/plugins/arca/domain/comprobante";
import { validarComprobante } from "@/plugins/arca/domain/validacion";

const MONOTRIBUTO: EmisorFiscal = { condicionIva: "MONOTRIBUTO", cuit: "27-33344455-6" };
const CONSUMIDOR_FINAL: ReceptorFiscal = {};
const TA: TicketAcceso = { token: "t", sign: "s", expiration: "2026-09-25T18:00:00.000-03:00" };

/** El comprobante C que el Core arma para un cobro de `bruto` (monotributo). */
function comprobanteDelCore(bruto: number): ComprobanteArca {
  const { neto, iva, total } = calcularImpuestos("MONOTRIBUTO", bruto);
  return {
    puntoVenta: 1,
    tipo: TipoComprobante.FacturaC,
    concepto: Concepto.Productos,
    docTipo: TipoDocumento.ConsumidorFinal,
    docNro: 0,
    condicionIvaReceptorId: CondicionIvaReceptorId.ConsumidorFinal,
    fecha: "20260925",
    neto,
    iva: iva.map((s) => ({ id: s.alicuotaId as AlicuotaIvaId, baseImponible: s.base, importe: s.importe })),
    total,
    invoiceId: "inv",
    tenantId: "t",
  };
}

/** El ImpTotal, tal como lo escribe el plugin. */
function impTotalQueViaja(comp: ComprobanteArca): string {
  const body = armarFECAESolicitarRequest(TA, 20111111112, comp, 1);
  return (body.match(/<ar:ImpTotal>([^<]*)<\/ar:ImpTotal>/) ?? [])[1] ?? "";
}

/** Los motivos de la decisión para un consumidor final, sin umbral del negocio. */
function codigos(importeTotal: number): string[] {
  return decidirComprobante(MONOTRIBUTO, CONSUMIDOR_FINAL, {
    fecha: "20260925",
    fechaDeEnvio: "20260925",
    importeTotal,
    naturaleza: "productos",
  }).motivos.map((m) => m.codigo);
}

/** ¿La decisión pide identificar al cliente con este umbral del negocio? */
function pideIdentificar(importeTotal: number, umbral: number): boolean {
  const decision = decidirComprobante(
    MONOTRIBUTO,
    CONSUMIDOR_FINAL,
    { fecha: "20260925", fechaDeEnvio: "20260925", importeTotal, naturaleza: "productos" },
    { umbralIdentificacionDelNegocio: umbral },
  );
  return decision.motivos.some((m) => m.codigo === "IDENTIFICACION_REGLA_DEL_NEGOCIO");
}

test("un total con medio centavo no llega a escribirse: el plugin lo rechaza antes de ARCA", () => {
  const crudo: ComprobanteArca = {
    ...comprobanteDelCore(1),
    neto: 1.005,
    iva: [{ id: AlicuotaIvaId.Cero, baseImponible: 1.005, importe: 0 }],
    total: 1.005,
  };
  const r = validarComprobante(crudo);
  assert.equal(r.ok, false);
  assert.ok(r.errores.some((e) => e.campo === "total"), JSON.stringify(r.errores));
});

test("el Core deja 1,005 en 1,01: viaja 1.01 y la decisión cuenta 1,01", () => {
  const comp = comprobanteDelCore(1.005);
  assert.equal(validarComprobante(comp).ok, true);
  assert.equal(impTotalQueViaja(comp), "1.01");
  assert.equal(pideIdentificar(comp.total, 1.01), true);
  assert.equal(pideIdentificar(comp.total, 1.02), false);
});

test("9.999.999,995 viaja como 10.000.000,00 y la decisión pide identificar por ley", () => {
  const comp = comprobanteDelCore(9_999_999.995);
  assert.equal(impTotalQueViaja(comp), "10000000.00");
  assert.ok(codigos(comp.total).includes("IDENTIFICACION_OBLIGATORIA"));
  assert.ok(!codigos(9_999_999.99).includes("IDENTIFICACION_OBLIGATORIA"));
});

test("599.999,995 viaja como 600.000,00 y alcanza un umbral del negocio de 600.000", () => {
  const comp = comprobanteDelCore(599_999.995);
  assert.equal(impTotalQueViaja(comp), "600000.00");
  assert.equal(pideIdentificar(comp.total, 600_000), true);
  assert.equal(pideIdentificar(comp.total, 600_000.01), false);
});

test("en 20.000 cobros con medio centavo, lo que pasa la validación se decide justo en el ImpTotal que viaja", () => {
  let distintos = 0;
  let ejemplo = "";
  for (let k = 1; k <= 20_000; k++) {
    const bruto = (k * 7919 * 10 + 5) / 1000; // x,xx5 repartidos hasta ~$1.600.000
    const comp = comprobanteDelCore(bruto);
    const valida = validarComprobante(comp).ok;
    const viaja = Number(impTotalQueViaja(comp));
    const alcanzaLoQueViaja = pideIdentificar(comp.total, viaja);
    const noAlcanzaUnCentavoMas = !pideIdentificar(comp.total, viaja + 0.01);
    if (!valida || !alcanzaLoQueViaja || !noAlcanzaUnCentavoMas) {
      distintos++;
      if (!ejemplo) ejemplo = `${bruto} viaja como ${viaja} (válido: ${valida})`;
    }
  }
  assert.equal(distintos, 0, ejemplo);
});

test("todo cobro que arma el Core pasa la validación exacta: de $0,01 a $5.000, inscripto y monotributo", () => {
  // Barrido completo hasta $200.000 (40 millones de cobros, 0 rechazados): .qa/ENG-109/v2-core-contra-validacion.txt.
  let rechazados = 0;
  let ejemplo = "";
  for (const condicion of ["RESPONSABLE_INSCRIPTO", "MONOTRIBUTO"] as const) {
    for (let c = 1; c <= 500_000; c++) {
      const { neto, iva, total } = calcularImpuestos(condicion, c / 100);
      const r = validarComprobante({
        ...comprobanteDelCore(1),
        tipo: condicion === "MONOTRIBUTO" ? TipoComprobante.FacturaC : TipoComprobante.FacturaB,
        neto,
        iva: iva.map((s) => ({ id: s.alicuotaId as AlicuotaIvaId, baseImponible: s.base, importe: s.importe })),
        total,
      });
      if (!r.ok) {
        rechazados++;
        if (!ejemplo) ejemplo = `${condicion} ${c / 100}: ${JSON.stringify(r.errores)}`;
      }
    }
  }
  assert.equal(rechazados, 0, ejemplo);
});
