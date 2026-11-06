// PR3 · MATRIZ FISCAL del motor (sin base ni red): la letra sale sola de la condición de IVA del
// emisor y del receptor, el CondicionIVAReceptorId viaja siempre, la NC parcial lleva la letra de
// lo que corrige, el umbral del motor deja PENDIENTE_DATOS al consumidor final sin documento, la
// ventana de fechas es un parámetro, y la A de un inscripto sin régimen A cargado se frena con
// un mensaje en criollo que dice qué hacer.

import { test } from "node:test";
import assert from "node:assert/strict";
import { construirComprobante, decidirDelEvento, ComprobanteSinDecisionError } from "./comprobante";
import { validarComprobante } from "./validacion";
import type { InvoiceCreatedEvent } from "../core-contract";
import { AlicuotaIvaId, CondicionIva, Concepto, TipoDocumento } from "./catalogos";
import { decidirComprobante } from "@/lib/fiscal/decidir-comprobante";
import { umbralDelMotor, UMBRAL_PROPUESTO_PR3, PARAMETROS_DEL_MOTOR } from "@/lib/fiscal/parametros-del-motor";
import { motivoLegible } from "@/lib/facturita-core";
import { movimientosPosterioresMP } from "@/plugins/mercadopago/http";

const HOY = "20261106";
const CUIT_RI = 20304050609;
const CUIT_MONO = 20111111112;
const CUIT_RECEPTOR = 30712345671;

const RI = { cuit: CUIT_RI, condicionIva: CondicionIva.ResponsableInscripto, puntoVenta: 3, regimenFacturaA: "A" };
const MONO = { cuit: CUIT_MONO, condicionIva: CondicionIva.Monotributo, puntoVenta: 1 };
const A_CF = { docTipo: 99, docNro: 0, condicionIva: CondicionIva.ConsumidorFinal };
const A_RI = { docTipo: TipoDocumento.CUIT, docNro: CUIT_RECEPTOR, condicionIva: CondicionIva.ResponsableInscripto };
const A_MONO = { docTipo: TipoDocumento.CUIT, docNro: CUIT_RECEPTOR, condicionIva: CondicionIva.Monotributo };
const A_EXENTO = { docTipo: TipoDocumento.CUIT, docNro: CUIT_RECEPTOR, condicionIva: CondicionIva.Exento };

function ev(emisor: InvoiceCreatedEvent["emisor"], receptor: InvoiceCreatedEvent["receptor"], over: Partial<InvoiceCreatedEvent> = {}): InvoiceCreatedEvent {
  const conIva = emisor.condicionIva === CondicionIva.ResponsableInscripto;
  return {
    invoiceId: "inv",
    tenantId: "t",
    concepto: Concepto.Productos,
    fecha: HOY,
    emisor,
    receptor,
    neto: 1000,
    iva: conIva ? [{ alicuotaId: AlicuotaIvaId.VeintiUno, base: 1000, importe: 210 }] : [{ alicuotaId: AlicuotaIvaId.Cero, base: 1000, importe: 0 }],
    total: conIva ? 1210 : 1000,
    ivaPorProducto: true,
    ...over,
  };
}

test("matriz de letras: RI→RI A · RI→CF B · RI→mono A (RG 5003) · mono→todos C, con su CondicionIVAReceptorId", () => {
  const casos: [string, InvoiceCreatedEvent, number, number][] = [
    ["RI→RI", ev(RI, A_RI), 1, 1],
    ["RI→CF", ev(RI, A_CF), 6, 5],
    ["RI→exento", ev(RI, A_EXENTO), 6, 4],
    ["RI→monotributista", ev(RI, A_MONO), 1, 6],
    ["mono→CF", ev(MONO, A_CF), 11, 5],
    ["mono→RI", ev(MONO, A_RI), 11, 1],
    ["mono→monotributista", ev(MONO, A_MONO), 11, 6],
    ["mono→exento", ev(MONO, A_EXENTO), 11, 4],
  ];
  for (const [nombre, e, tipo, condicion] of casos) {
    const comp = construirComprobante(e, HOY);
    assert.equal(comp.tipo, tipo, `${nombre}: tipo`);
    assert.equal(comp.condicionIvaReceptorId, condicion, `${nombre}: CondicionIVAReceptorId`);
    assert.deepEqual(validarComprobante(comp), { ok: true, errores: [] }, `${nombre}: valida`);
  }
});

test("CondicionIVAReceptorId obligatorio: sin él, rechazo local en criollo (no se le pide nada a ARCA)", () => {
  const comp = { ...construirComprobante(ev(MONO, A_CF), HOY), condicionIvaReceptorId: undefined };
  const v = validarComprobante(comp);
  assert.equal(v.ok, false);
  const error = v.errores.find((x) => x.campo === "condicionIvaReceptorId");
  assert.ok(error);
  assert.match(error.mensaje, /Cargala en su ficha/);
});

test("NC parcial: lleva la letra de la factura que corrige (A→NC A 3, B→NC B 8, C→NC C 13)", () => {
  for (const [emisor, receptor, cbteFactura, cbteNota] of [
    [RI, A_RI, 1, 3],
    [RI, A_CF, 6, 8],
    [MONO, A_CF, 11, 13],
  ] as const) {
    const e = ev(emisor, receptor, {
      clase: "nota_credito",
      neto: 100,
      iva: emisor === RI ? [{ alicuotaId: AlicuotaIvaId.VeintiUno, base: 100, importe: 21 }] : [{ alicuotaId: AlicuotaIvaId.Cero, base: 100, importe: 0 }],
      total: emisor === RI ? 121 : 100,
      asociado: { cbteTipo: cbteFactura, puntoVenta: emisor.puntoVenta, numero: 7, fecha: HOY },
    });
    assert.equal(construirComprobante(e, HOY).tipo, cbteNota);
  }
  // Una NC de otra letra que la factura no sale.
  const cruzada = decidirComprobante(
    { condicionIva: "RESPONSABLE_INSCRIPTO", cuit: CUIT_RI, regimenFacturaA: "A" },
    { condicionIva: "CONSUMIDOR_FINAL", docTipo: 99, docNro: 0 },
    { clase: "nota_credito", fecha: HOY, fechaDeEnvio: HOY, importeTotal: 121, naturaleza: "productos", asociado: { cbteTipo: 1, puntoVenta: 3, numero: 7, fecha: HOY } },
  );
  assert.notEqual(cruzada.estado, "lista");
});

test("umbral del motor: parametrizado por medio; con la propuesta activa, CF sin documento desde el umbral → pide dato (PENDIENTE_DATOS)", () => {
  assert.equal(PARAMETROS_DEL_MOTOR.umbralConsumidorFinal.otro, null, "arranca sólo con el umbral legal (decisión anotada)");
  assert.equal(umbralDelMotor("efectivo", UMBRAL_PROPUESTO_PR3), 417_288);
  assert.equal(umbralDelMotor("otro", UMBRAL_PROPUESTO_PR3), 208_644);
  assert.equal(umbralDelMotor(undefined, UMBRAL_PROPUESTO_PR3), 208_644, "sin medio, el más exigente");

  const emisor = { condicionIva: "MONOTRIBUTO" as const, cuit: CUIT_MONO };
  const decidir = (importe: number, docTipo: number, docNro: number, medio: "efectivo" | "otro") =>
    decidirComprobante(emisor, { condicionIva: "CONSUMIDOR_FINAL", docTipo, docNro }, { clase: "factura", fecha: HOY, fechaDeEnvio: HOY, importeTotal: importe, naturaleza: "productos" }, { umbralIdentificacionDelNegocio: umbralDelMotor(medio, UMBRAL_PROPUESTO_PR3) });

  assert.equal(decidir(208_643.99, 99, 0, "otro").estado, "lista");
  const sobre = decidir(208_644, 99, 0, "otro");
  assert.equal(sobre.estado, "revision");
  assert.ok(sobre.motivos.some((m) => m.pideDato && m.campo === "receptor.docNro"));
  assert.equal(decidir(300_000, 99, 0, "efectivo").estado, "lista", "en efectivo el umbral es $417.288");
  assert.equal(decidir(417_288, 99, 0, "efectivo").estado, "revision");
  assert.equal(decidir(500_000, 96, 30111222, "otro").estado, "lista", "con DNI sale");

  // Por defecto (sin la propuesta), una venta de MP de $500.000 a CF sin documento sale: el legal es $10.000.000.
  assert.doesNotThrow(() => construirComprobante(ev(MONO, A_CF, { neto: 500_000, iva: [{ alicuotaId: AlicuotaIvaId.Cero, base: 500_000, importe: 0 }], total: 500_000, umbralIdentificacionDelMotor: umbralDelMotor("otro") }), HOY));
  // El umbral llega resuelto por el Core en el evento (ADR-022, D4): con la propuesta activa, frena.
  const conPropuesta = ev(MONO, A_CF, { neto: 500_000, iva: [{ alicuotaId: AlicuotaIvaId.Cero, base: 500_000, importe: 0 }], total: 500_000, umbralIdentificacionDelMotor: umbralDelMotor("otro", UMBRAL_PROPUESTO_PR3) });
  assert.throws(() => construirComprobante(conPropuesta, HOY), ComprobanteSinDecisionError);
  assert.equal(decidirDelEvento(conPropuesta, HOY, { reglasDelMotor: false }).estado, "lista", "reconocer lo ya autorizado no aplica el umbral");
  // El umbral del motor no frena la NC de algo ya facturado.
  const nc = decidirDelEvento(
    ev(MONO, A_CF, { clase: "nota_credito", asociado: { cbteTipo: 11, puntoVenta: 1, numero: 3, fecha: HOY } }),
    HOY,
  );
  assert.equal(nc.estado, "lista");
});

test("ventana de fechas parametrizada: ±5 días en productos (default) y otra por opciones", () => {
  const emisor = { condicionIva: "MONOTRIBUTO" as const, cuit: CUIT_MONO };
  const cf = { condicionIva: "CONSUMIDOR_FINAL" as const, docTipo: 99, docNro: 0 };
  const op = (fecha: string) => ({ clase: "factura" as const, fecha, fechaDeEnvio: "20261110", importeTotal: 100, naturaleza: "productos" as const });
  assert.equal(PARAMETROS_DEL_MOTOR.ventanaDias[1], 5);
  assert.equal(decidirComprobante(emisor, cf, op("20261105")).estado, "lista");
  const fuera = decidirComprobante(emisor, cf, op("20261104"));
  assert.ok(fuera.motivos.some((m) => m.codigo === "FECHA_FUERA_DE_VENTANA"));
  assert.equal(decidirComprobante(emisor, cf, op("20261104"), { ventanaDias: { 1: 6, 2: 10, 3: 10 } }).estado, "lista");
});

test("Factura A de un inscripto sin régimen A cargado: se frena y el motivo, tal como lo ve el negocio, dice qué hacer", () => {
  const sinRegimen = ev({ ...RI, regimenFacturaA: null }, A_RI);
  let error: unknown;
  try {
    construirComprobante(sinRegimen, HOY);
  } catch (e) {
    error = e;
  }
  assert.ok(error instanceof ComprobanteSinDecisionError);
  const motivo = error.motivos.find((m) => m.codigo === "REGIMEN_A_A_CONFIRMAR");
  assert.ok(motivo);
  // Como lo guarda el despacho («campo: mensaje») y lo muestra la pantalla (motivoLegible).
  const visto = motivoLegible(`${motivo.campo}: ${motivo.mensaje}`);
  assert.match(visto, /^Falta cargar qué Factura A te asignó ARCA/);
  assert.match(visto, /Qué hacer: consultalo en ARCA/);
  assert.match(visto, /pedile a Soporte GSG que lo cargue/);
  assert.match(visto, /volvé a emitir la factura\.$/);
  assert.doesNotMatch(visto, /regimenFacturaA|·/);
});

test("MP: devoluciones aprobadas (parciales, cada una con su id) y contracargo sin devoluciones", () => {
  assert.deepEqual(
    movimientosPosterioresMP({
      id: 55,
      status: "approved",
      transaction_amount: 1000,
      refunds: [
        { id: 1, amount: 300, status: "approved" },
        { id: 2, amount: 100, status: "rejected" },
        { id: null, amount: 50 },
        { id: 3, amount: 0, status: "approved" },
        { id: 4, amount: 200 },
      ],
    }),
    [{ tipo: "devolucion", refundId: "1", paymentId: "55", importe: 300 }],
  );
  assert.deepEqual(movimientosPosterioresMP({ id: 56, status: "charged_back", transaction_amount: 800, refunds: [{ id: 9, amount: 800 }] }), [
    { tipo: "contracargo", paymentId: "56", importe: 800 },
  ]);
  assert.deepEqual(movimientosPosterioresMP({ status: "refunded" }), []);
});
