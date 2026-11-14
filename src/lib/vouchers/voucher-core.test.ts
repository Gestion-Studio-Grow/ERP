import { test } from "node:test";
import assert from "node:assert/strict";
import {
  celdaCsv,
  claveDelCobroConVoucher,
  conciliarLiquidacion,
  leerCsvLiquidacion,
  leerFecha,
  leerMonto,
  conciliar,
  csvDelReporte,
  estadoOpenKeyDesdeTexto,
  leerCsvOpenKey,
  validarAplicacion,
  MENSAJES_VOUCHER,
} from "./voucher-core";

const turno = { clientId: "c1", status: "CONFIRMED" };
const libre = { estado: "DISPONIBLE", clientId: "c1", estadoOpenKey: "DISPONIBLE" };

test("validarAplicacion · disponible del mismo cliente cubre todo el saldo", () => {
  assert.deepEqual(validarAplicacion({ voucher: libre, turno, saldo: 9000 }), { ok: true, valorCubierto: 9000, sinVerificar: false });
});

test("validarAplicacion · sin foto de OpenKey se permite «sin verificar»", () => {
  const r = validarAplicacion({ voucher: { ...libre, estadoOpenKey: null }, turno, saldo: 100 });
  assert.deepEqual(r, { ok: true, valorCubierto: 100, sinVerificar: true });
});

test("validarAplicacion · cada rechazo con su motivo", () => {
  const motivo = (r: ReturnType<typeof validarAplicacion>) => (r.ok ? "ok" : r.motivo);
  assert.equal(motivo(validarAplicacion({ voucher: { ...libre, clientId: "otro" }, turno, saldo: 1 })), "otro-cliente");
  assert.equal(motivo(validarAplicacion({ voucher: { ...libre, estado: "ANULADO" }, turno, saldo: 1 })), "anulado");
  assert.equal(motivo(validarAplicacion({ voucher: { ...libre, estado: "USADO" }, turno, saldo: 1 })), "ya-usado");
  assert.equal(motivo(validarAplicacion({ voucher: { ...libre, estadoOpenKey: "BAJA" }, turno, saldo: 1 })), "baja-openkey");
  assert.equal(motivo(validarAplicacion({ voucher: libre, turno: { ...turno, status: "CANCELLED" }, saldo: 1 })), "turno-cerrado");
  assert.equal(motivo(validarAplicacion({ voucher: libre, turno: { ...turno, status: "NO_SHOW" }, saldo: 1 })), "turno-cerrado");
  assert.equal(motivo(validarAplicacion({ voucher: libre, turno, saldo: 0 })), "sin-saldo");
  assert.equal(motivo(validarAplicacion({ voucher: libre, turno, saldo: -5 })), "sin-saldo");
  assert.equal(motivo(validarAplicacion({ voucher: libre, turno, saldo: Number.NaN })), "sin-saldo");
});

test("validarAplicacion · el mensaje de BAJA dice que OpenKey lo da por usado", () => {
  const r = validarAplicacion({ voucher: { ...libre, estadoOpenKey: "BAJA" }, turno, saldo: 1 });
  assert.ok(!r.ok && /la administración lo da por usado/.test(r.mensaje));
});

test("validarAplicacion · monto menor que el saldo; más o ≤ 0 se rechaza", () => {
  assert.deepEqual(validarAplicacion({ voucher: libre, turno, saldo: 9000, monto: 5000 }), { ok: true, valorCubierto: 5000, sinVerificar: false });
  const motivo = (r: ReturnType<typeof validarAplicacion>) => (r.ok ? "ok" : r.motivo);
  assert.equal(motivo(validarAplicacion({ voucher: libre, turno, saldo: 9000, monto: 9000.01 })), "excede-saldo");
  assert.equal(motivo(validarAplicacion({ voucher: libre, turno, saldo: 9000, monto: 0 })), "monto-invalido");
});

test("claveDelCobroConVoucher · primer uso y re-uso tras anular", () => {
  assert.equal(claveDelCobroConVoucher("v1", 0), "voucher:v1");
  assert.equal(claveDelCobroConVoucher("v1", 1), "voucher:v1:2");
});

test("leerCsvLiquidacion · montos y fechas argentinas, errores por línea", () => {
  const r = leerCsvLiquidacion("\uFEFFNro;Importe;Fecha;Referencia\nV1;$ 14.000,00;05/11/2026;LIQ-7\nV2;9000.5;2026-11-04;\nV3;abc;;\n");
  assert.deepEqual(r.filas, [
    { numero: "V1", monto: 14000, fecha: "2026-11-05", referencia: "LIQ-7" },
    { numero: "V2", monto: 9000.5, fecha: "2026-11-04", referencia: null },
  ]);
  assert.deepEqual(r.errores.map((e) => e.linea), [4]);
  assert.equal(leerMonto("12,345.50"), 12345.5);
  assert.equal(leerMonto("1.234.567"), 1234567);
  assert.equal(leerFecha("5-1-2026"), "2026-01-05");
});

test("leerCsvLiquidacion · fecha imposible: esa fila se rechaza con su renglón, el resto se importa", () => {
  assert.equal(leerFecha("2026-13-45"), null);
  assert.equal(leerFecha("30/02/2026"), null);
  assert.equal(leerFecha("29/02/2028"), "2028-02-29");
  const r = leerCsvLiquidacion("numero;monto;fecha\nV1;100;2026-13-45\nV2;200;05/11/2026\nV3;300;\nV4;400;30/02/2026\n");
  assert.deepEqual(r.filas, [
    { numero: "V2", monto: 200, fecha: "2026-11-05", referencia: null },
    { numero: "V3", monto: 300, fecha: null, referencia: null },
  ]);
  assert.deepEqual(r.errores.map((e) => e.linea), [2, 5]);
  assert.match(r.errores[0].motivo, /2026-13-45.*V1/);
});

test("conciliarLiquidacion · cobrado sin liquidar (con antigüedad), liquidado sin cobro, monto distinto", () => {
  const r = conciliarLiquidacion(
    [
      { numero: "V1", estado: "USADO", valorCubierto: 14000, usadoEn: "2026-10-01", liquidado: false },
      { numero: "V2", estado: "USADO", valorCubierto: 9000, usadoEn: "2026-11-01", liquidado: false },
      { numero: "V3", estado: "USADO", valorCubierto: 5000, usadoEn: "2026-10-20", liquidado: false },
      { numero: "V4", estado: "DISPONIBLE", valorCubierto: null, usadoEn: null, liquidado: false },
      { numero: "V5", estado: "USADO", valorCubierto: 1000, usadoEn: "2026-09-01", liquidado: true },
    ],
    [
      { numero: "V3", monto: 4500 },
      { numero: "V4", monto: 1000 },
      { numero: "X9", monto: 1000 },
    ],
    "2026-11-05",
  );
  assert.deepEqual(r.cobradoSinLiquidar, [
    { numero: "V1", monto: 14000, dias: 35 },
    { numero: "V2", monto: 9000, dias: 4 },
  ]);
  assert.deepEqual(r.liquidadoSinCobro, ["V4", "X9"]);
  assert.deepEqual(r.montoDistinto, [{ numero: "V3", cobrado: 5000, liquidado: 4500 }]);
});

test("conciliar · los cinco casos", () => {
  const r = conciliar(
    [
      { numero: "A1", estado: "USADO", estadoTurno: "COMPLETED" },
      { numero: "A2", estado: "DISPONIBLE" },
      { numero: "A3", estado: "USADO", estadoTurno: "CONFIRMED" },
      { numero: "A4", estado: "USADO", estadoTurno: "CANCELLED" },
      { numero: "A5", estado: "USADO", estadoTurno: "COMPLETED" },
    ],
    [
      { numero: "a1", estado: "DISPONIBLE" },
      { numero: "A2", estado: "USADO" },
      { numero: "A3", estado: "ANULADO" },
      { numero: "A5", estado: "USADO" },
      { numero: "Z9", estado: "DISPONIBLE" },
    ],
  );
  assert.deepEqual(r, {
    faltaBaja: ["A1"],
    usadoEnOpenKeySinCobro: ["A2"],
    anuladoEnOpenKeyUsadoEnErp: ["A3"],
    usadoEnTurnoCancelado: ["A4"],
    desconocidosEnOpenKey: ["Z9"],
  });
});

test("leerCsvOpenKey · BOM, `;`, comillas, alias y errores por línea", () => {
  const csv = '﻿Número;Lote;Estado;DNI\r\n"V-001";L1;Disponible;20.123.456\r\nV-002;L1;UTILIZADO;\r\n;L1;Usado;\r\nV-003;L1;raro;\r\nV-002;L1;usado;\r\n\r\n';
  const r = leerCsvOpenKey(csv);
  assert.deepEqual(r.filas, [
    { numero: "V-001", lote: "L1", estado: "DISPONIBLE", documento: "20123456" },
    { numero: "V-002", lote: "L1", estado: "USADO", documento: null },
  ]);
  assert.deepEqual(
    r.errores.map((e) => e.linea),
    [4, 5, 6],
  );
});

test("leerCsvOpenKey · separador `,` y sin columnas opcionales", () => {
  const r = leerCsvOpenKey("nro,estado\n123,anulado\n");
  assert.deepEqual(r.filas, [{ numero: "123", lote: null, estado: "ANULADO", documento: null }]);
});

test("leerCsvOpenKey · sin columnas obligatorias o vacío → error, ninguna fila", () => {
  assert.equal(leerCsvOpenKey("lote;documento\n1;2").filas.length, 0);
  assert.equal(leerCsvOpenKey("lote;documento\n1;2").errores.length, 1);
  assert.equal(leerCsvOpenKey("").errores.length, 1);
});

test("estadoOpenKeyDesdeTexto · tolerante a mayúsculas y acentos", () => {
  assert.equal(estadoOpenKeyDesdeTexto(" Dado de baja "), "USADO");
  assert.equal(estadoOpenKeyDesdeTexto("ANULADO"), "ANULADO");
  assert.equal(estadoOpenKeyDesdeTexto("?"), null);
});

test("celdaCsv · neutraliza fórmulas y escapa `;` y comillas", () => {
  assert.equal(celdaCsv("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(celdaCsv("+54911"), "'+54911");
  assert.equal(celdaCsv("-1"), "'-1");
  assert.equal(celdaCsv("@SUMA"), "'@SUMA");
  assert.equal(celdaCsv('Pérez; "Ana"'), '"Pérez; ""Ana"""');
  assert.equal(celdaCsv("normal"), "normal");
});

test("csvDelReporte · BOM, `;`, CRLF, fechas y montos argentinos", () => {
  const csv = csvDelReporte([
    {
      numero: "V-001",
      lote: "L1",
      cliente: "=Ana",
      turno: "2026-11-05",
      usadoEn: "2026-11-04",
      valorCubierto: 9000.5,
      estado: "USADO",
      estadoOpenKey: null,
      bajaOpenKeyEn: null,
      liquidadoEn: "2026-11-10",
      montoLiquidado: 9000.5,
      liquidacionRef: "LIQ-1",
    },
  ]);
  assert.ok(csv.startsWith("﻿Número;Lote;Cliente;"));
  const [, fila] = csv.slice(1).split("\r\n");
  assert.equal(fila, "V-001;L1;'=Ana;05/11/2026;04/11/2026;9000,50;USADO;Sin verificar;;10/11/2026;9000,50;LIQ-1");
});

test("csvDelReporte · montos con el módulo de plata: medio centavo arriba, lo que no es importe sale vacío", () => {
  const fila = (valorCubierto: number, montoLiquidado: number | null) =>
    csvDelReporte([
      {
        numero: "V-002", lote: "L1", cliente: "Ana", turno: null, usadoEn: null, valorCubierto, estado: "USADO",
        estadoOpenKey: null, bajaOpenKeyEn: null, liquidadoEn: null, montoLiquidado, liquidacionRef: null,
      },
    ]).slice(1).split("\r\n")[1];
  assert.equal(fila(1.005, 2.135), "V-002;L1;Ana;;;1,01;USADO;Sin verificar;;;2,14;");
  assert.equal(fila(Number.NaN, null), "V-002;L1;Ana;;;;USADO;Sin verificar;;;;");
});

test("VOUCHER no tiene columna en el libro y el cierre lo cuenta aparte (anulaciones restan)", async () => {
  const { cashMethodFromPaymentMethod, vouchersDelCierre } = await import("@/lib/caja/cierre-diario");
  const { cobroTurnoEligibility } = await import("@/lib/caja/cobro-turno");
  assert.equal(cashMethodFromPaymentMethod("VOUCHER"), null);
  assert.equal(cashMethodFromPaymentMethod("VOUCHER", true), null);
  assert.deepEqual(cobroTurnoEligibility({ status: "APPROVED", paymentMethod: "VOUCHER", amount: 9000 }), { eligible: false, reason: "unsupported-method" });
  assert.deepEqual(vouchersDelCierre([{ amount: 9000 }, { amount: 14000 }, { amount: -14000 }]), {
    cantidad: 2,
    monto: 23000,
    anulados: { cantidad: 1, monto: 14000 },
  });
  assert.deepEqual(vouchersDelCierre([]), { cantidad: 0, monto: 0, anulados: { cantidad: 0, monto: 0 } });
});

test("cierre · anular hoy un voucher de ayer no esconde los cobrados hoy", async () => {
  const { vouchersDelCierre } = await import("@/lib/caja/cierre-diario");
  assert.deepEqual(vouchersDelCierre([{ amount: -14000 }, { amount: 9000 }]), {
    cantidad: 1,
    monto: 9000,
    anulados: { cantidad: 1, monto: 14000 },
  });
  assert.deepEqual(vouchersDelCierre([{ amount: -14000 }, { amount: 9000 }, { amount: 5000 }]).cantidad, 2);
});

test("aplicarCobroTurnoInTx rechaza un VOUCHER suelto (sin la clave voucher:<id>) antes de tocar la base", async () => {
  const { aplicarCobroTurnoInTx } = await import("@/lib/turnos/cobro-turno-repo");
  const txQueExplota = new Proxy({}, { get: () => { throw new Error("no debía tocar la base"); } }) as never;
  await assert.rejects(
    aplicarCobroTurnoInTx(txQueExplota, "t1", {
      appointmentId: "a1", status: "CONFIRMED", precio: 100, monto: 100, method: "VOUCHER", actor: "user:x", detail: "d",
      idempotencyKey: "uuid-del-formulario", withSchema: true, cerradoHasta: null, camino: "cobro",
    }),
    /sólo lo escribe el cobro con voucher/,
  );
});

test("csvDelReporte · un impago dado de baja dice «Dado de baja: motivo», nunca «Liquidado 0,00»", () => {
  const fila = (montoLiquidado: number | null) =>
    csvDelReporte([
      {
        numero: "V-003", lote: "L1", cliente: "Ana", turno: null, usadoEn: "2026-11-04", valorCubierto: 14000, estado: "USADO",
        estadoOpenKey: null, bajaOpenKeyEn: null, liquidadoEn: "2026-11-12", montoLiquidado, liquidacionRef: "Baja: La administración lo desconoce",
      },
    ]).slice(1).split("\r\n")[1];
  assert.equal(fila(0), "V-003;L1;Ana;;04/11/2026;14000,00;USADO;Sin verificar;;Dado de baja: La administración lo desconoce;;Baja del 12/11/2026");
  // Si antes se le imputó parte de un pago a cuenta, se ve lo cobrado.
  assert.equal(fila(5000), "V-003;L1;Ana;;04/11/2026;14000,00;USADO;Sin verificar;;Dado de baja: La administración lo desconoce;5000,00;Baja del 12/11/2026");
});

// Valor del voucher del negocio (orden del dueño, 09/11/2026): cubre min(valor, saldo); un monto explícito no lo pasa.
test("validarAplicacion · con valor del negocio cubre min(valor, saldo)", () => {
  assert.deepEqual(validarAplicacion({ voucher: libre, turno, saldo: 14000, valorVoucher: 10000 }), { ok: true, valorCubierto: 10000, sinVerificar: false });
  assert.deepEqual(validarAplicacion({ voucher: libre, turno, saldo: 6000, valorVoucher: 10000 }), { ok: true, valorCubierto: 6000, sinVerificar: false });
  assert.deepEqual(validarAplicacion({ voucher: libre, turno, saldo: 9999.99, valorVoucher: 9999.995 }), { ok: true, valorCubierto: 9999.99, sinVerificar: false });
  // Sin valor (null, ausente o ≤ 0 leído de una base rara): sin tope, como antes.
  for (const valorVoucher of [null, undefined, 0, -5]) {
    assert.deepEqual(validarAplicacion({ voucher: libre, turno, saldo: 14000, valorVoucher }), { ok: true, valorCubierto: 14000, sinVerificar: false });
  }
});

test("validarAplicacion · un monto explícito no puede superar el valor del voucher", () => {
  const r = validarAplicacion({ voucher: libre, turno, saldo: 14000, monto: 12000, valorVoucher: 10000 });
  assert.deepEqual(r, { ok: false, motivo: "excede-valor", mensaje: MENSAJES_VOUCHER["excede-valor"] });
  assert.deepEqual(validarAplicacion({ voucher: libre, turno, saldo: 14000, monto: 10000, valorVoucher: 10000 }), { ok: true, valorCubierto: 10000, sinVerificar: false });
  assert.deepEqual(validarAplicacion({ voucher: libre, turno, saldo: 14000, monto: 4000, valorVoucher: 10000 }), { ok: true, valorCubierto: 4000, sinVerificar: false });
  // Superar el saldo sigue diciendo eso (aunque también supere el valor).
  assert.equal((validarAplicacion({ voucher: libre, turno, saldo: 5000, monto: 12000, valorVoucher: 10000 }) as { motivo: string }).motivo, "excede-saldo");
});
