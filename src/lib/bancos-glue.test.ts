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
  fechaFiscalDelDia,
  filtrosFacturacionMes,
  mapearClasificacion,
  rangoFiscalMes,
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

// Los relojes del mes se prueban con INSTANTES UTC absolutos, no con `new Date(año, mes,
// día)`: ese constructor usa la zona del proceso, que es justo lo que estaba mal. Estos
// tests dan lo mismo con TZ=UTC que con TZ=America/Argentina/Buenos_Aires.

test("rangoMesActual: [00:00 del 1° del mes, 00:00 del 1° del siguiente) en hora argentina", () => {
  const r = rangoMesActual(new Date("2026-07-11T15:00:00.000Z")); // 11/07/2026, 12:00 ART
  assert.equal(r.gte.toISOString(), "2026-07-01T03:00:00.000Z"); // 01/07 00:00 ART
  assert.equal(r.lt.toISOString(), "2026-08-01T03:00:00.000Z"); // 01/08 00:00 ART
});

test("el 31 a las 22:30 hora argentina queda en ESE mes (cupo, fecha y período fiscal)", () => {
  // 31/08/2026 22:30 ART = 01/09/2026 01:30 UTC. Con el proceso en UTC, el armado viejo
  // daba septiembre para las tres cosas.
  const ahora = new Date("2026-09-01T01:30:00.000Z");
  const cupo = rangoMesActual(ahora);
  assert.equal(cupo.gte.toISOString(), "2026-08-01T03:00:00.000Z");
  assert.equal(cupo.lt.toISOString(), "2026-09-01T03:00:00.000Z");
  assert.ok(ahora >= cupo.gte && ahora < cupo.lt, "la factura de las 22:30 cuenta para el cupo de agosto");
  assert.deepEqual(rangoFiscalMes(ahora), { gte: "20260801", lt: "20260901" });
  assert.equal(fechaFiscalDelDia(ahora), "20260831");
});

test("a las 00:30 del 1° hora argentina ya es el mes nuevo", () => {
  const ahora = new Date("2026-09-01T03:30:00.000Z"); // 01/09/2026 00:30 ART
  assert.equal(rangoMesActual(ahora).gte.toISOString(), "2026-09-01T03:00:00.000Z");
  assert.deepEqual(rangoFiscalMes(ahora), { gte: "20260901", lt: "20261001" });
  assert.equal(fechaFiscalDelDia(ahora), "20260901");
});

test("diciembre cruza de año en los dos relojes", () => {
  const ahora = new Date("2026-12-15T15:00:00.000Z");
  assert.equal(rangoMesActual(ahora).lt.toISOString(), "2027-01-01T03:00:00.000Z");
  assert.deepEqual(rangoFiscalMes(ahora), { gte: "20261201", lt: "20270101" });
});

test("rangoFiscalMes: {gte:'AAAAMM01', lt:'AAAAMM+1 01'} y deja afuera el 1° del siguiente", () => {
  const r = rangoFiscalMes(new Date("2026-02-10T15:00:00.000Z"));
  assert.deepEqual(r, { gte: "20260201", lt: "20260301" });
  // Invoice.fecha es texto AAAAMMDD: se compara como texto, que acá ordena como fecha.
  const dentro = (f: string) => f >= r.gte && f < r.lt;
  assert.equal(dentro("20260201"), true);
  assert.equal(dentro("20260228"), true);
  assert.equal(dentro("20260301"), false);
  assert.equal(dentro("20260131"), false);
});

test("filtrosFacturacionMes: facturado = sólo AUTHORIZED por fecha fiscal; el cupo sigue contando todo por createdAt", () => {
  const ahora = new Date("2026-09-01T01:30:00.000Z");
  const f = filtrosFacturacionMes(ahora);
  assert.deepEqual(f.facturado, { fecha: { gte: "20260801", lt: "20260901" }, status: "AUTHORIZED" });
  // El cupo no filtra por estado: un rechazado hoy consume cupo (regla comercial, sin cambios).
  assert.deepEqual(Object.keys(f.cupo), ["createdAt"]);
  assert.equal(f.cupo.createdAt.gte.toISOString(), "2026-08-01T03:00:00.000Z");
  assert.equal(f.cupo.createdAt.lt.toISOString(), "2026-09-01T03:00:00.000Z");
  // Los rechazados van con el reloj de EMISIÓN, el mismo del cupo.
  assert.deepEqual(f.rechazado, { createdAt: f.cupo.createdAt, status: "REJECTED" });
});

// Aplica un `where` de `filtrosFacturacionMes` a una factura con la semántica de Prisma
// para estos campos (igualdad en `status`, rango en `createdAt`, rango de texto en `fecha`).
type FacturaDePrueba = { status: string; createdAt: Date; fecha: string };
function cumple(
  where: { status: string; createdAt?: { gte: Date; lt: Date }; fecha?: { gte: string; lt: string } },
  inv: FacturaDePrueba,
): boolean {
  if (inv.status !== where.status) return false;
  if (where.createdAt && !(inv.createdAt >= where.createdAt.gte && inv.createdAt < where.createdAt.lt)) return false;
  if (where.fecha && !(inv.fecha >= where.fecha.gte && inv.fecha < where.fecha.lt)) return false;
  return true;
}

test("rechazados: un extracto de agosto emitido y rechazado en septiembre cuenta en septiembre", () => {
  // El comprobante del banco lleva la fecha del MOVIMIENTO (20260815) pero se emitió el
  // 03/09 a las 11:00 hora argentina y ARCA lo rechazó.
  const rechazado: FacturaDePrueba = {
    status: "REJECTED",
    createdAt: new Date("2026-09-03T14:00:00.000Z"),
    fecha: "20260815",
  };
  const septiembre = filtrosFacturacionMes(new Date("2026-09-20T15:00:00.000Z"));
  const agosto = filtrosFacturacionMes(new Date("2026-08-20T15:00:00.000Z"));
  assert.equal(cumple(septiembre.rechazado, rechazado), true, "el monitor de septiembre lo ve");
  assert.equal(cumple(agosto.rechazado, rechazado), false);
  // Con el filtro por fecha fiscal (el de antes) se perdía: caía en agosto.
  assert.equal(cumple({ status: "REJECTED", fecha: rangoFiscalMes(new Date("2026-09-20T15:00:00.000Z")) }, rechazado), false);

  // El facturado sigue por fecha fiscal: uno AUTORIZADO con esa misma historia es de agosto.
  const autorizado = { ...rechazado, status: "AUTHORIZED" };
  assert.equal(cumple(agosto.facturado, autorizado), true);
  assert.equal(cumple(septiembre.facturado, autorizado), false);
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
  assert.match((v as { error: string }).error, /revisá los 11 números/i);
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
