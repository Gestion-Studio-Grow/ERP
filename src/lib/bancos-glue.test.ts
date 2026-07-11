// Tests de la lógica PURA del glue de BANCOS (sin DB): mapeo de clasificación
// al vocabulario de producto, resumen del lote, config del tenant, validación
// de la revisión (CUIT con dígito verificador), filas a persistir e
// idempotencia de re-importación (los duplicados NO se persisten). node:test,
// mismo runner del repo.

import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  MovimientoBancario,
  PropuestaFactura,
  ResultadoClasificacionBanco,
} from "@/plugins/bancos";
import {
  armarFilasMovimientos,
  configBancosDesdeTenant,
  mapearClasificacion,
  rangoMesActual,
  resumirPropuestas,
  toNum,
  validarDatosRevision,
} from "./bancos-glue";

// ── helpers ──────────────────────────────────────────────────────────────────

const mov = (over: Partial<MovimientoBancario> = {}): MovimientoBancario => ({
  id: "hash-1",
  fecha: "20260701",
  monto: 1000,
  descripcion: "Transferencia recibida",
  origen: "banco",
  ...over,
});

const clasif = (
  reglaId: string | undefined,
  clasificacion: ResultadoClasificacionBanco["clasificacion"],
): ResultadoClasificacionBanco => ({ clasificacion, motivo: "test", reglaId });

// ── toNum / rango del mes ────────────────────────────────────────────────────

test("toNum: number, Decimal-like y basura", () => {
  assert.equal(toNum(12.5), 12.5);
  assert.equal(toNum({ toNumber: () => 99.9 }), 99.9);
  assert.equal(toNum("15.25"), 15.25);
  assert.equal(toNum(undefined), 0);
});

test("rangoMesActual: [1° del mes, 1° del siguiente)", () => {
  const r = rangoMesActual(new Date(2026, 6, 11)); // 11/07/2026
  assert.equal(r.gte.getTime(), new Date(2026, 6, 1).getTime());
  assert.equal(r.lt.getTime(), new Date(2026, 7, 1).getTime());
});

test("rangoMesActual: diciembre cruza de año", () => {
  const r = rangoMesActual(new Date(2026, 11, 15));
  assert.equal(r.lt.getFullYear(), 2027);
  assert.equal(r.lt.getMonth(), 0);
});

// ── mapeo de clasificación ───────────────────────────────────────────────────

test("mapearClasificacion: reglas del plugin → vocabulario de producto", () => {
  assert.equal(mapearClasificacion(clasif("credito-venta", "FACTURABLE"), mov()), "venta");
  assert.equal(
    mapearClasificacion(clasif("transferencia-propia", "NO_FACTURABLE"), mov()),
    "transferencia_propia",
  );
  assert.equal(
    mapearClasificacion(clasif("cuenta-propia", "NO_FACTURABLE"), mov()),
    "transferencia_propia",
  );
  assert.equal(mapearClasificacion(clasif("contraasiento-reverso", "NO_FACTURABLE"), mov()), "reverso");
  assert.equal(mapearClasificacion(clasif("prestamo-plazo-fijo", "NO_FACTURABLE"), mov()), "prestamo");
  assert.equal(mapearClasificacion(clasif("debito-egreso", "NO_FACTURABLE"), mov({ monto: -500 })), "egreso");
});

test("mapearClasificacion: comision-impuesto se separa por la leyenda", () => {
  assert.equal(
    mapearClasificacion(
      clasif("comision-impuesto", "NO_FACTURABLE"),
      mov({ monto: -8500, descripcion: "Comisión mantenimiento cuenta" }),
    ),
    "comision",
  );
  assert.equal(
    mapearClasificacion(
      clasif("comision-impuesto", "NO_FACTURABLE"),
      mov({ monto: -450, descripcion: "SIRCREB Ingresos Brutos" }),
    ),
    "impuesto",
  );
});

test("mapearClasificacion: aprendizaje/REVISAR caen por la clasificación", () => {
  assert.equal(mapearClasificacion(clasif("aprendizaje", "FACTURABLE"), mov()), "venta");
  assert.equal(
    mapearClasificacion(clasif("aprendizaje", "NO_FACTURABLE"), mov({ monto: -100 })),
    "egreso",
  );
  assert.equal(mapearClasificacion(clasif("aprendizaje", "NO_FACTURABLE"), mov()), "otro");
  assert.equal(mapearClasificacion(clasif(undefined, "REVISAR"), mov()), "otro");
});

// ── resumen del lote ─────────────────────────────────────────────────────────

test("resumirPropuestas: cuenta por estado y separa duplicados", () => {
  const p = (estado: PropuestaFactura["estado"]): PropuestaFactura => ({
    movimientoId: "x",
    montoTotal: 1,
    requiereIdentificacion: false,
    estado,
  });
  const r = resumirPropuestas([
    p("auto"),
    p("auto"),
    p("revision"),
    p("no_facturable"),
    p("descartado"),
    p("descartado"),
  ]);
  assert.deepEqual(r, {
    importados: 4,
    duplicados: 2,
    autos: 2,
    aRevisar: 1,
    noFacturables: 1,
  });
});

// ── config del tenant ────────────────────────────────────────────────────────

test("configBancosDesdeTenant: nulos = defaults del producto (no pisa con undefined)", () => {
  const cfg = configBancosDesdeTenant({
    bancosUmbralIdentificacion: null,
    bancosCapFacturasMes: null,
    bancosDomicilioEmisor: null,
    arcaPuntoVenta: null,
    arcaCuit: null,
  });
  assert.deepEqual(cfg.config, {}); // el plugin completa con sus defaults
  assert.deepEqual(cfg.cuitsPropios, []);
  assert.equal(cfg.capFacturasMes, 159);
});

test("configBancosDesdeTenant: valores del tenant (Decimal-like) + CUIT propio normalizado", () => {
  const cfg = configBancosDesdeTenant({
    bancosUmbralIdentificacion: { toNumber: () => 800000 },
    bancosCapFacturasMes: 100,
    bancosDomicilioEmisor: "Av. Siempreviva 742, Canning",
    arcaPuntoVenta: 3,
    arcaCuit: "20-11111111-2",
  });
  assert.deepEqual(cfg.config, {
    umbralIdentificacion: 800000,
    capFacturasMes: 100,
    domicilioEmisor: "Av. Siempreviva 742, Canning",
    puntoVenta: 3,
  });
  assert.deepEqual(cfg.cuitsPropios, ["20111111112"]);
  assert.equal(cfg.capFacturasMes, 100);
});

// ── validación de revisión ───────────────────────────────────────────────────

test("validarDatosRevision: CUIT válido con nombre y descripción → ok", () => {
  const v = validarDatosRevision({
    docTipo: 80,
    docNro: "20-11111111-2",
    nombreReceptor: "Cliente Grande SRL",
    descripcionServicio: "Servicio mensual de julio",
  });
  assert.deepEqual(v, { ok: true, docNro: "20111111112" });
});

test("validarDatosRevision: CUIT con dígito verificador incorrecto → error", () => {
  const v = validarDatosRevision({
    docTipo: 80,
    docNro: "20111111113",
    nombreReceptor: "X",
    descripcionServicio: "Y",
  });
  assert.equal(v.ok, false);
  assert.match((v as { error: string }).error, /verificador/i);
});

test("validarDatosRevision: identificación sin nombre o sin descripción → error", () => {
  const sinNombre = validarDatosRevision({ docTipo: 80, docNro: "20111111112", descripcionServicio: "Y" });
  assert.equal(sinNombre.ok, false);
  const sinDesc = validarDatosRevision({ docTipo: 86, docNro: "20111111112", nombreReceptor: "X" });
  assert.equal(sinDesc.ok, false);
});

test("validarDatosRevision: DNI de 7-8 dígitos; otro largo falla", () => {
  const ok = validarDatosRevision({
    docTipo: 96,
    docNro: "30123456",
    nombreReceptor: "Juana Pérez",
    descripcionServicio: "Venta",
  });
  assert.deepEqual(ok, { ok: true, docNro: "30123456" });
  const corto = validarDatosRevision({
    docTipo: 96,
    docNro: "123",
    nombreReceptor: "Juana",
    descripcionServicio: "Venta",
  });
  assert.equal(corto.ok, false);
});

test("validarDatosRevision: consumidor final (99) sin datos → ok con doc 0", () => {
  assert.deepEqual(validarDatosRevision({ docTipo: 99, docNro: "" }), { ok: true, docNro: "0" });
  assert.equal(validarDatosRevision({ docTipo: 99, docNro: "20111111112" }).ok, false);
});

test("validarDatosRevision: docTipo desconocido → error", () => {
  assert.equal(
    validarDatosRevision({ docTipo: 12, docNro: "1", nombreReceptor: "X", descripcionServicio: "Y" }).ok,
    false,
  );
});

// ── filas a persistir + idempotencia de re-importación ──────────────────────

test("armarFilasMovimientos: propuesta auto → fila completa; descartados NO se persisten", () => {
  const m1 = mov({ id: "h1", monto: 150000, descripcion: "Transferencia recibida CBU 285" });
  const m2 = mov({ id: "h2", monto: 89999.5, descripcion: "Acreditación ventas", contraparte: "30-11111111-9" });
  const propuestas: PropuestaFactura[] = [
    {
      movimientoId: "h1",
      montoTotal: 150000,
      requiereIdentificacion: false,
      docTipo: 99,
      docNro: 0,
      estado: "auto",
    },
    {
      movimientoId: "h2",
      montoTotal: 89999.5,
      requiereIdentificacion: false,
      estado: "descartado",
      motivo: "Movimiento ya procesado en una importación anterior.",
    },
  ];
  const clasificaciones = new Map<string, ResultadoClasificacionBanco>([
    ["h1", clasif("credito-venta", "FACTURABLE")],
    ["h2", clasif("credito-venta", "FACTURABLE")],
  ]);

  const filas = armarFilasMovimientos("t-1", "imp-1", {
    movimientos: [m1, m2],
    propuestas,
    clasificaciones,
  });

  // Idempotencia de la re-importación: el duplicado no genera fila nueva.
  assert.equal(filas.length, 1);
  const fila = filas[0];
  assert.equal(fila.tenantId, "t-1");
  assert.equal(fila.importacionId, "imp-1");
  assert.equal(fila.hash, "h1");
  assert.equal(fila.monto, 150000);
  assert.equal(fila.clasificacion, "venta");
  assert.equal(fila.estadoPropuesta, "auto");
  assert.equal(fila.docTipo, 99);
  assert.equal(fila.docNro, "0");
});

test("armarFilasMovimientos: revisión conserva motivo e identificación pendiente", () => {
  const grande = mov({ id: "h3", monto: 750000, descripcion: "Acreditación ventas" });
  const filas = armarFilasMovimientos("t-1", "imp-1", {
    movimientos: [grande],
    propuestas: [
      {
        movimientoId: "h3",
        montoTotal: 750000,
        requiereIdentificacion: true,
        estado: "revision",
        motivo: "Monto igual o mayor al umbral de identificación.",
      },
    ],
    clasificaciones: new Map([["h3", clasif("credito-venta", "FACTURABLE")]]),
  });
  assert.equal(filas.length, 1);
  assert.equal(filas[0].estadoPropuesta, "revision");
  assert.equal(filas[0].requiereIdentificacion, true);
  assert.match(filas[0].motivoRevision ?? "", /umbral/i);
  assert.equal(filas[0].docTipo, null); // se completa en la revisión
});
