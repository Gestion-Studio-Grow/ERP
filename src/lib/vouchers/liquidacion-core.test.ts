import { test } from "node:test";
import assert from "node:assert/strict";
import {
  csvDelReporteDelLunes,
  cuentaCorriente,
  diaDeLaSemana,
  planDeConciliacion,
  planDeImputacion,
  sumaCentavos,
  sumarDias,
  ultimaSemanaCerrada,
  validarSemana,
} from "./liquidacion-core";

test("la última semana cerrada: de lunes a domingo, con el domingo antes de hoy", () => {
  // 09/11/2026 es lunes: la semana que terminó ayer.
  assert.equal(diaDeLaSemana("2026-11-09"), 1);
  assert.deepEqual(ultimaSemanaCerrada("2026-11-09"), { desde: "2026-11-02", hasta: "2026-11-08" });
  // Un miércoles: la misma.
  assert.deepEqual(ultimaSemanaCerrada("2026-11-11"), { desde: "2026-11-02", hasta: "2026-11-08" });
  // Un domingo: la de hoy no cerró, va la anterior.
  assert.deepEqual(ultimaSemanaCerrada("2026-11-08"), { desde: "2026-10-26", hasta: "2026-11-01" });
  // Cruce de año.
  assert.deepEqual(ultimaSemanaCerrada("2027-01-01"), { desde: "2026-12-21", hasta: "2026-12-27" });
});

test("validar la semana: domingo real y ya terminado", () => {
  assert.deepEqual(validarSemana("2026-11-08", "2026-11-09"), { ok: true, semana: { desde: "2026-11-02", hasta: "2026-11-08" } });
  assert.deepEqual(validarSemana("2026-11-08", "2026-11-08"), { ok: false, motivo: "semana-sin-cerrar" });
  assert.deepEqual(validarSemana("2026-11-07", "2026-11-09"), { ok: false, motivo: "no-es-domingo" });
  assert.deepEqual(validarSemana("2026-02-30", "2026-11-09"), { ok: false, motivo: "fecha-invalida" });
  assert.deepEqual(validarSemana("x", "2026-11-09"), { ok: false, motivo: "fecha-invalida" });
  assert.equal(sumarDias("2026-02-28", 1), "2026-03-01");
});

const V = [
  { id: "a", numero: "V1", valorCubierto: 14000 },
  { id: "b", numero: "V2", valorCubierto: 4000.1 },
  { id: "c", numero: "V3", valorCubierto: 0.2 },
];

test("conciliación: paga la totalidad → cuadra, todo pagado; en centavos (sin error de float)", () => {
  const r = planDeConciliacion({ vouchers: V, pagado: 18000.3, rechazados: [] });
  assert.ok(r.ok);
  assert.equal(r.plan.totalCentavos, 1_800_030);
  assert.equal(r.plan.diferenciaCentavos, 0);
  assert.equal(r.plan.pagados.length, 3);
  assert.equal(r.plan.impagos.length, 0);
});

test("conciliación: un voucher rechazado queda impago; la diferencia es pagado − aceptado", () => {
  const r = planDeConciliacion({ vouchers: V, pagado: 14000.2, rechazados: [" v2 "] });
  assert.ok(r.ok);
  assert.deepEqual(r.plan.impagos.map((v) => v.numero), ["V2"]);
  assert.equal(r.plan.aceptadoCentavos, 1_400_020);
  assert.equal(r.plan.diferenciaCentavos, 0);
  // Pagó de menos sin decir cuál: todos pagados, diferencia negativa.
  const menos = planDeConciliacion({ vouchers: V, pagado: 10000, rechazados: [] });
  assert.ok(menos.ok);
  assert.equal(menos.plan.diferenciaCentavos, -800_030);
  // Pagó de más.
  const mas = planDeConciliacion({ vouchers: V, pagado: 20000, rechazados: [] });
  assert.ok(mas.ok);
  assert.equal(mas.plan.diferenciaCentavos, 199_970);
});

test("conciliación: un rechazado que no está en la liquidación, o un monto inválido → rechazo", () => {
  assert.deepEqual(planDeConciliacion({ vouchers: V, pagado: 1, rechazados: ["V9", "V1"] }), { ok: false, motivo: "voucher-ajeno", detalle: ["V9"] });
  assert.equal(planDeConciliacion({ vouchers: V, pagado: -1, rechazados: [] }).ok, false);
  assert.equal(planDeConciliacion({ vouchers: V, pagado: Number.NaN, rechazados: [] }).ok, false);
  assert.equal(planDeConciliacion({ vouchers: V, pagado: 1e15, rechazados: [] }).ok, false);
  // Pagó cero: válido (todo queda como diferencia en contra).
  const cero = planDeConciliacion({ vouchers: V, pagado: 0, rechazados: [] });
  assert.ok(cero.ok && cero.plan.diferenciaCentavos === -1_800_030);
});

test("cuenta corriente: débitos (vouchers) − créditos (pagos), con saldo arrastrado; pre-pago da saldo a favor", () => {
  const { movimientos, resumen } = cuentaCorriente([
    { fecha: "2026-11-03", tipo: "DEBITO", concepto: "V1", centavos: 1_400_000, ref: "v:1" },
    { fecha: "2026-11-01", tipo: "CREDITO", concepto: "prepago", centavos: 2_000_000, ref: "p:1" },
    { fecha: "2026-11-03", tipo: "CREDITO", concepto: "pago", centavos: 100, ref: "p:2" },
    { fecha: "2026-11-03", tipo: "DEBITO", concepto: "V2", centavos: 400_010, ref: "v:2" },
  ]);
  assert.deepEqual(movimientos.map((m) => m.ref), ["p:1", "v:1", "v:2", "p:2"]);
  assert.deepEqual(movimientos.map((m) => m.saldoCentavos), [-2_000_000, -600_000, -199_990, -200_090]);
  assert.deepEqual(resumen, { debitosCentavos: 1_800_010, creditosCentavos: 2_000_100, saldoCentavos: -200_090 });
  assert.equal(sumaCentavos([0.1, 0.2]), 30);
});

test("planilla del lunes: BOM, `;`, total al pie, fórmulas neutralizadas y el pago si se concilió", () => {
  const csv = csvDelReporteDelLunes({
    negocio: "CH Estética",
    semana: { desde: "2026-11-02", hasta: "2026-11-08" },
    renglones: [
      { numero: "V1", vecino: "=HYPERLINK(\"x\")", fecha: "2026-11-03", servicio: "Piernas", valor: 14000, resultado: "PAGADO" },
      { numero: "V2", vecino: "Ana; Lote 4", fecha: "2026-11-05", servicio: null, valor: 4000.1, resultado: "IMPAGO" },
    ],
    pago: { pagado: 14000, diferencia: 0, fecha: "2026-11-09", referencia: "TRF 123" },
  });
  assert.ok(csv.startsWith("﻿"));
  const lineas = csv.slice(1).split("\r\n");
  assert.equal(lineas[1], "Semana del 02/11/2026 al 08/11/2026");
  assert.equal(lineas[3], "Número de voucher;Vecino;Fecha;Servicio;Importe;Resultado");
  assert.equal(lineas[4], `V1;"'=HYPERLINK(""x"")";03/11/2026;Piernas;14000,00;Pagado`);
  assert.equal(lineas[5], `V2;"Ana; Lote 4";05/11/2026;;4000,10;No pagado`);
  assert.ok(lineas.includes("Total;18000,10"));
  assert.ok(lineas.includes("Cantidad de vouchers;2"));
  assert.ok(lineas.includes("Pagado por la administración;14000,00"));
  assert.ok(lineas.includes("Fecha del pago;09/11/2026"));
});

test("planDeImputacion · FIFO, por número, en parte, y lo que sobra queda sin imputar", () => {
  const pendientes = [
    { id: "a", numero: "V-1", valorCentavos: 1_400_000, imputadoCentavos: 0 },
    { id: "b", numero: "V-2", valorCentavos: 1_400_000, imputadoCentavos: 400_000 },
    { id: "c", numero: "V-3", valorCentavos: 900_000, imputadoCentavos: 0 },
  ];
  // FIFO: salda V-1 entero, V-2 por lo que falta (10.000) y deja V-3 en parte.
  const fifo = planDeImputacion({ pendientes, montoCentavos: 2_500_000 });
  assert.deepEqual(fifo, {
    ok: true,
    imputaciones: [
      { id: "a", numero: "V-1", centavos: 1_400_000, completo: true },
      { id: "b", numero: "V-2", centavos: 1_000_000, completo: true },
      { id: "c", numero: "V-3", centavos: 100_000, completo: false },
    ],
    restoCentavos: 0,
  });
  // Por número (con espacios y minúsculas), en el orden pedido; lo que sobra no se imputa a otros.
  const pedidos = planDeImputacion({ pendientes, montoCentavos: 1_000_000, numeros: [" v-3 ", "V-3"] });
  assert.deepEqual(pedidos, { ok: true, imputaciones: [{ id: "c", numero: "V-3", centavos: 900_000, completo: true }], restoCentavos: 100_000 });
  // Un número que no es un impago pendiente: no se imputa nada.
  assert.deepEqual(planDeImputacion({ pendientes, montoCentavos: 100, numeros: ["V-9", "V-1"] }), { ok: false, ajenos: ["V-9"] });
  // Sin impagos: todo queda a favor.
  assert.deepEqual(planDeImputacion({ pendientes: [], montoCentavos: 5000 }), { ok: true, imputaciones: [], restoCentavos: 5000 });
  // Nunca se imputa más que el valor de un voucher, aunque el pago sobre.
  const mucho = planDeImputacion({ pendientes, montoCentavos: 99_000_000 });
  assert.ok(mucho.ok);
  for (const i of mucho.imputaciones) {
    const p = pendientes.find((x) => x.id === i.id)!;
    assert.ok(i.centavos + p.imputadoCentavos <= p.valorCentavos);
  }
  assert.equal(mucho.restoCentavos, 99_000_000 - 1_400_000 - 1_000_000 - 900_000);
});
