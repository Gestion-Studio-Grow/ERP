// Tests del lote contable: qué rendiciones entran, carril factura (posiciones, balance y
// cancelación), carril asiento (debe = haber), altas pendientes y derivaciones. node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  armarLoteContable,
  asignacionContable,
  destinoEnLote,
  referenciaOficial,
  totalesQueEntran,
  type DestinoEnLote,
} from "./lote-contable";
import { evaluarComprobante } from "./motor-fiscal";
import {
  CUIT_FUERA,
  CUIT_MAESTRO,
  PERSONA,
  comprobante,
  contexto,
  rendicion,
} from "./rendiciones.fixture";
import type { Comprobante, FacturaProveedorSap, MedioPago, ParametrosSap, Rendicion } from "./tipos";

const EF: MedioPago = { tipo: "efectivo_anticipo", anticipoId: "A-1" };
const TC: MedioPago = { tipo: "tarjeta_corporativa", tarjetaId: "T-2" };
const RC: MedioPago = { tipo: "recargable", tarjetaId: "T-1" };
const PR: MedioPago = { tipo: "propio_a_reintegrar" };

const PARAMETROS: ParametrosSap = {
  sociedad: "SOC1",
  claseDocFactura: "KR",
  claseDocAsiento: "SA",
  lugarComercial: "0001",
  cuentaPuenteAnticipos: "PUENTE",
  cuentaTarjetaAPagar: "TARJETA",
  cuentaReintegrosAPagar: "REINTEGROS",
  cuentaPercepcionIva: "PERC-IVA",
  cuentaPercepcionIibb: "PERC-IIBB",
  maestroProveedores: { [CUIT_MAESTRO]: "PROV-100" },
};

/** Factura A del maestro con todos los componentes: 10.000 + IVA 2.100 + percepciones + otros = 13.700. */
const COMPLETA = comprobante({
  id: "C-completa",
  imputacion: { medioPago: EF },
  datos: {
    percepciones: [
      { regimen: "iva", importe: 30000 },
      { regimen: "iibb", jurisdiccion: "BA", importe: 20000 },
      { regimen: "municipal", importe: 5000 },
    ],
    noGravado: 10000,
    exento: 15000,
    impuestosInternos: 80000,
    total: 1370000,
  },
});

const COMPROBANTES: Comprobante[] = [
  COMPLETA,
  comprobante({ id: "C-fuera", datos: { cuitEmisor: CUIT_FUERA, razonSocialEmisor: "Ferretería Fuera S.A.", numero: 7 } }),
  comprobante({ id: "C-hotel", imputacion: { tipoGastoId: "hotel", medioPago: EF }, datos: { razonSocialEmisor: "Hotel Llano S.A.", numero: 8 } }),
  comprobante({
    id: "C-estac",
    imputacion: { tipoGastoId: "estacionamiento", medioPago: TC },
    datos: { clase: "factura_b", razonSocialEmisor: "Playa Sur", puntoVenta: 3, numero: 9, lineasIva: [], total: 500000 },
  }),
  comprobante({ id: "C-leyenda", datos: { leyendaA: "operacion_sujeta_a_retencion", numero: 10 } }),
  comprobante({
    id: "C-grande",
    datos: { numero: 11, lineasIva: [{ alicuota: 21, neto: 40000000, iva: 8400000 }], total: 48400000 },
  }),
  comprobante({ id: "C-apocrifa", cuitApocrifa: true, datos: { numero: 12 } }),
  comprobante({ id: "C-leyenda-y-apocrifa", cuitApocrifa: true, datos: { leyendaA: "pago_en_cbu_informada", numero: 13 } }),
  comprobante({
    id: "C-propina",
    imputacion: { tipoGastoId: "propinas", jurisdiccionActividad: undefined, jurisdiccionComprobante: undefined },
    datos: { clase: "sin_comprobante", cuitEmisor: undefined, lineasIva: [], total: 100000 },
    constatacion: "sin_constatacion_posible",
  }),
  comprobante({ id: "C-propio", imputacion: { medioPago: PR }, datos: { numero: 14 } }),
  comprobante({ id: "C-tarjeta", imputacion: { medioPago: TC }, datos: { numero: 15 } }),
  comprobante({ id: "C-recargable", imputacion: { medioPago: RC }, datos: { numero: 16, puntoVenta: 12345 } }),
];

const EVALUACIONES = COMPROBANTES.map((c) =>
  evaluarComprobante(c, contexto({ otrosComprobantes: COMPROBANTES, maestroProveedores: new Set([CUIT_MAESTRO]) })),
);

const EN_CONTROL = rendicion({ id: "R-1", estado: "en_control", comprobanteIds: COMPROBANTES.map((c) => c.id) });

function lote(rendiciones: Rendicion[] = [EN_CONTROL], evaluaciones = EVALUACIONES) {
  return armarLoteContable({
    rendiciones,
    comprobantes: COMPROBANTES,
    evaluaciones,
    personas: [PERSONA],
    parametros: PARAMETROS,
    fechaContabilizacion: "2026-09-24",
  });
}

function factura(id: string): FacturaProveedorSap {
  const f = lote().facturas.find((x) => x.comprobanteId === id);
  assert.ok(f, `no hay factura para ${id}`);
  return f;
}

test("asignación y referencia oficial", () => {
  assert.equal(asignacionContable("1150", "2026-09", EF), "1150-2609-EF");
  assert.equal(asignacionContable("1150", "2026-09", TC), "1150-2609-TC");
  assert.equal(asignacionContable("1150", "2026-09", RC), "1150-2609-RC");
  assert.equal(asignacionContable("1150", "2026-09", PR), "1150-2609-PR");
  assert.equal(referenciaOficial(comprobante().datos), "0001A00000101");
  assert.equal(referenciaOficial(comprobante({ datos: { puntoVenta: 9999 } }).datos), "9999A00000101");
  assert.equal(referenciaOficial(comprobante({ datos: { puntoVenta: 12345 } }).datos), "12345A00000101");
  assert.equal(referenciaOficial(comprobante({ datos: { clase: "tique_peaje" } }).datos), "0001A00000101");
  assert.equal(referenciaOficial(comprobante({ datos: { clase: "factura_b" } }).datos), "0001B00000101");
  assert.equal(referenciaOficial(comprobante({ datos: { numero: undefined } }).datos), "");
});

test("sólo entran las rendiciones en control: una contabilizada ya se exportó (no se carga dos veces)", () => {
  for (const estado of ["borrador", "en_aprobacion", "devuelta", "rechazada", "aprobada", "contabilizada", "cerrada"] as const) {
    const l = lote([{ ...EN_CONTROL, estado }]);
    assert.equal(l.facturas.length + l.asientos.length + l.derivadosCxP.length + l.altasPendientes.length, 0, estado);
  }
  assert.ok(lote([EN_CONTROL]).facturas.length > 0);
});

test("destinoEnLote: factura, asiento, Cuentas a Pagar o afuera con el motivo del primer bloqueo", () => {
  const destino = (id: string) => {
    const e = EVALUACIONES.find((x) => x.comprobanteId === id);
    assert.ok(e, id);
    return destinoEnLote(e);
  };
  assert.deepEqual(destino("C-completa"), { tipo: "factura" });
  assert.deepEqual(destino("C-fuera"), { tipo: "factura" }); // factura; hasta el alta queda en altas pendientes
  assert.deepEqual(destino("C-hotel"), { tipo: "asiento" });
  assert.deepEqual(destino("C-estac"), { tipo: "asiento" });
  assert.deepEqual(destino("C-leyenda"), { tipo: "cuentas_a_pagar" }); // R3 sola: es la derivación
  assert.deepEqual(destino("C-grande"), { tipo: "cuentas_a_pagar" }); // R8
  assert.deepEqual(destino("C-apocrifa"), {
    tipo: "fuera",
    motivo: "ARCA tiene marcado este CUIT como emisor de facturas apócrifas",
  });
  // Con leyenda Y apócrifa: afuera, y el motivo es la apócrifa (no la leyenda).
  assert.deepEqual(destino("C-leyenda-y-apocrifa"), {
    tipo: "fuera",
    motivo: "ARCA tiene marcado este CUIT como emisor de facturas apócrifas",
  });
  assert.deepEqual(destino("C-propina"), { tipo: "fuera", motivo: "Este tipo de gasto no se contabiliza en SAP" });

  const sinClasificar = evaluarComprobante(comprobante({ imputacion: { tipoGastoId: "sin_clasificar" } }), contexto());
  assert.deepEqual(destinoEnLote(sinClasificar), {
    tipo: "fuera",
    motivo: "La herramienta no adivina el tratamiento del IVA: elegí el tipo de gasto",
  });
});

test("destinoEnLote es la regla del lote: cada comprobante aparece donde dice su destino", () => {
  const l = lote();
  const conDestino = (tipo: DestinoEnLote["tipo"]) =>
    EVALUACIONES.filter((e) => destinoEnLote(e).tipo === tipo).map((e) => e.comprobanteId);
  assert.deepEqual(
    [...l.facturas.map((f) => f.comprobanteId), ...l.altasPendientes.map((a) => a.comprobanteId)].sort(),
    conDestino("factura").sort(),
  );
  assert.deepEqual(l.derivadosCxP, conDestino("cuentas_a_pagar"));
  // En el asiento, una línea de gasto al debe por cada comprobante con destino asiento.
  const cuentasPercepcion = new Set([PARAMETROS.cuentaPercepcionIva, PARAMETROS.cuentaPercepcionIibb]);
  const lineasDeGasto = l.asientos.flatMap((a) => a.posiciones).filter((p) => p.debe > 0 && !cuentasPercepcion.has(p.cuentaMayor));
  assert.equal(lineasDeGasto.length, conDestino("asiento").length);
});

test("totalesQueEntran suma lo mismo que las posiciones del lote", () => {
  const l = lote();
  const cuentasPercepcion = new Set([PARAMETROS.cuentaPercepcionIva, PARAMETROS.cuentaPercepcionIibb]);
  const porId = new Map(COMPROBANTES.map((c) => [c.id, c]));
  // Las facturas de proveedores fuera del maestro también entran (quedan en altas hasta el alta):
  // se suman desde sus evaluaciones porque todavía no tienen posiciones.
  const evaluacionesDeAltas = EVALUACIONES.filter((e) => l.altasPendientes.some((a) => a.comprobanteId === e.comprobanteId));

  const posicionesFacturas = l.facturas.flatMap((f) => f.posiciones);
  const debeAsientos = l.asientos.flatMap((a) => a.posiciones.filter((p) => p.debe > 0));
  const desdeElLote = {
    creditoFiscal:
      l.facturas.reduce((s, f) => s + (porId.get(f.comprobanteId)?.datos.lineasIva.reduce((n, x) => n + x.iva, 0) ?? 0), 0) +
      evaluacionesDeAltas.reduce((s, e) => s + e.creditoFiscal, 0),
    gasto:
      posicionesFacturas.filter((p) => !cuentasPercepcion.has(p.cuentaMayor)).reduce((s, p) => s + p.importe, 0) +
      debeAsientos.filter((p) => !cuentasPercepcion.has(p.cuentaMayor)).reduce((s, p) => s + p.debe, 0) +
      evaluacionesDeAltas.reduce((s, e) => s + e.costo, 0),
    percepciones:
      posicionesFacturas.filter((p) => cuentasPercepcion.has(p.cuentaMayor)).reduce((s, p) => s + p.importe, 0) +
      debeAsientos.filter((p) => cuentasPercepcion.has(p.cuentaMayor)).reduce((s, p) => s + p.debe, 0) +
      evaluacionesDeAltas.reduce((s, e) => s + e.percepcionesComputables, 0),
  };
  assert.deepEqual(totalesQueEntran(EVALUACIONES), desdeElLote);
  // Afuera y a Cuentas a Pagar no suman.
  assert.deepEqual(totalesQueEntran(EVALUACIONES.filter((e) => ["C-apocrifa", "C-leyenda", "C-grande", "C-propina"].includes(e.comprobanteId))), {
    creditoFiscal: 0,
    gasto: 0,
    percepciones: 0,
  });
  assert.deepEqual(totalesQueEntran([]), { creditoFiscal: 0, gasto: 0, percepciones: 0 });
});

test("factura: una posición por línea de IVA, percepción computable y cada componente, y cierra contra el bruto", () => {
  const f = factura("C-completa");
  assert.equal(f.idFactura, "F-C-completa");
  assert.equal(f.sociedad, "SOC1");
  assert.equal(f.claseDocumento, "KR");
  assert.equal(f.fechaDocumento, "2026-09-10");
  assert.equal(f.fechaContabilizacion, "2026-09-24");
  assert.equal(f.emisor, "PROV-100");
  assert.equal(f.referencia, "0001A00000101");
  assert.equal(f.lugarComercial, "0001");
  assert.equal(f.importeBruto, 1370000);
  assert.equal(f.moneda, "ARS");
  assert.equal(f.asignacion, "1001-2609-EF");
  const comun = { centroCosto: "CC-1", numeroPersonal: "00001001", asignacion: "1001-2609-EF" };
  assert.deepEqual(f.posiciones, [
    { cuentaMayor: "CTA-insumos", importe: 1000000, indicadorIva: "V1", ...comun, texto: "Neto 21%" },
    { cuentaMayor: "PERC-IVA", importe: 30000, indicadorIva: "", ...comun, texto: "Percepción de IVA" },
    { cuentaMayor: "PERC-IIBB", importe: 20000, indicadorIva: "", ...comun, texto: "Percepción de IIBB BA" },
    { cuentaMayor: "CTA-insumos", importe: 10000, indicadorIva: "V0", ...comun, texto: "No gravado" },
    { cuentaMayor: "CTA-insumos", importe: 15000, indicadorIva: "V0", ...comun, texto: "Exento" },
    { cuentaMayor: "CTA-insumos", importe: 80000, indicadorIva: "V0", ...comun, texto: "Impuestos internos" },
    { cuentaMayor: "CTA-insumos", importe: 5000, indicadorIva: "V0", ...comun, texto: "Percepción municipal" },
  ]);
});

test("cada factura cierra: posiciones + IVA = importe bruto", () => {
  const porId = new Map(COMPROBANTES.map((c) => [c.id, c]));
  for (const f of lote().facturas) {
    const iva = porId.get(f.comprobanteId)?.datos.lineasIva.reduce((a, l) => a + l.iva, 0) ?? 0;
    assert.equal(f.posiciones.reduce((a, p) => a + p.importe, 0) + iva, f.importeBruto, f.idFactura);
  }
});

test("cancelación: una por factura, contra la cuenta que corresponde al medio de pago", () => {
  const l = lote();
  const contra = Object.fromEntries(l.cancelaciones.map((c) => [c.comprobanteId, c.cuentaContrapartida]));
  assert.deepEqual(contra, {
    "C-completa": "PUENTE",
    "C-propio": "REINTEGROS",
    "C-tarjeta": "TARJETA",
    "C-recargable": "PUENTE",
  });
  const c = l.cancelaciones.find((x) => x.comprobanteId === "C-completa");
  assert.deepEqual(c, {
    idFactura: "F-C-completa",
    comprobanteId: "C-completa",
    emisor: "PROV-100",
    referencia: "0001A00000101",
    importe: 1370000,
    cuentaContrapartida: "PUENTE",
    asignacion: "1001-2609-EF",
  });
  assert.equal(factura("C-recargable").referencia, "12345A00000016");
});

test("proveedor fuera del maestro: va a altas pendientes y no genera factura ni cancelación", () => {
  const l = lote();
  assert.deepEqual(l.altasPendientes, [{ cuit: CUIT_FUERA, razonSocial: "Ferretería Fuera S.A.", comprobanteId: "C-fuera" }]);
  assert.ok(!l.facturas.some((f) => f.comprobanteId === "C-fuera"));
  assert.ok(!l.cancelaciones.some((c) => c.comprobanteId === "C-fuera"));
});

test("asiento: uno por rendición, debe por comprobante y haber por medio de pago; debe = haber", () => {
  const [a] = lote().asientos;
  assert.equal(a.idAsiento, "A-R-1");
  assert.equal(a.rendicionId, "R-1");
  assert.equal(a.claseDocumento, "SA");
  assert.equal(a.moneda, "ARS");
  assert.equal(a.referencia, "R-1");
  assert.equal(a.texto, "R-1 Persona de Prueba");
  assert.deepEqual(a.posiciones, [
    {
      cuentaMayor: "CTA-hotel",
      debe: 1210000,
      haber: 0,
      indicadorIva: "V0",
      centroCosto: "CC-1",
      asignacion: "1001-2609-EF",
      texto: "Hotel Llano S.A. Factura A 0001-00000008",
    },
    {
      cuentaMayor: "CTA-estacionamiento",
      debe: 500000,
      haber: 0,
      indicadorIva: "V0",
      centroCosto: "CC-1",
      asignacion: "1001-2609-TC",
      texto: "Playa Sur Factura B 0003-00000009",
    },
    { cuentaMayor: "PUENTE", debe: 0, haber: 1210000, asignacion: "1001-2609-EF", texto: "R-1 efectivo del anticipo" },
    { cuentaMayor: "TARJETA", debe: 0, haber: 500000, asignacion: "1001-2609-TC", texto: "R-1 tarjeta corporativa" },
  ]);
  const debe = a.posiciones.reduce((s, p) => s + p.debe, 0);
  const haber = a.posiciones.reduce((s, p) => s + p.haber, 0);
  assert.equal(debe, haber);
});

test("derivaciones: la A con leyenda (R3) y el proveedor habitual sobre el tope (R8) van a Cuentas a Pagar", () => {
  assert.deepEqual(lote().derivadosCxP, ["C-leyenda", "C-grande"]);
});

test("lo bloqueado queda afuera, y también la A con leyenda que además tiene otro bloqueo", () => {
  const l = lote();
  const todos = [
    ...l.facturas.map((f) => f.comprobanteId),
    ...l.asientos.flatMap((a) => a.posiciones.map((p) => p.texto)),
    ...l.derivadosCxP,
    ...l.altasPendientes.map((x) => x.comprobanteId),
  ].join(" ");
  assert.ok(!todos.includes("C-apocrifa"));
  assert.ok(!todos.includes("C-leyenda-y-apocrifa"));
  assert.ok(!todos.includes("C-propina")); // no registrable: no se contabiliza
});

test("sin evaluación no se contabiliza", () => {
  const sinCompleta = EVALUACIONES.filter((e) => e.comprobanteId !== "C-completa");
  assert.ok(!lote([EN_CONTROL], sinCompleta).facturas.some((f) => f.comprobanteId === "C-completa"));
});

test("sólo cuentan las líneas que la rendición lista", () => {
  const l = lote([{ ...EN_CONTROL, comprobanteIds: ["C-hotel"] }]);
  assert.equal(l.facturas.length, 0);
  assert.equal(l.asientos.length, 1);
  assert.equal(l.asientos[0].posiciones.length, 2);
});

test("asiento: la percepción de un hotel a nombre de la empresa va a su cuenta, no al gasto, y el asiento balancea", () => {
  const hotelConPercepcion = comprobante({
    id: "C-hotel-perc",
    imputacion: { tipoGastoId: "hotel", medioPago: EF },
    datos: {
      razonSocialEmisor: "Hotel Llano S.A.",
      numero: 81,
      percepciones: [{ regimen: "iibb", jurisdiccion: "BA", importe: 20000 }],
      total: 1230000, // 10.000 + IVA 2.100 + percepción 200
    },
  });
  const r: Rendicion = { ...EN_CONTROL, comprobanteIds: ["C-hotel-perc"] };
  const e = evaluarComprobante(hotelConPercepcion, contexto({ otrosComprobantes: [hotelConPercepcion] }));
  const l = armarLoteContable({
    rendiciones: [r],
    comprobantes: [hotelConPercepcion],
    evaluaciones: [e],
    personas: [PERSONA],
    parametros: PARAMETROS,
    fechaContabilizacion: "2026-09-24",
  });
  const posiciones = l.asientos[0].posiciones;
  const perc = posiciones.find((x) => x.cuentaMayor === "PERC-IIBB");
  assert.equal(perc?.debe, 20000);
  const gasto = posiciones.find((x) => x.cuentaMayor === e.cuentaMayor);
  assert.equal(gasto?.debe, 1230000 - 20000);
  const debe = posiciones.reduce((n, x) => n + x.debe, 0);
  const haber = posiciones.reduce((n, x) => n + x.haber, 0);
  assert.equal(debe, haber);
  assert.equal(haber, 1230000);
});
