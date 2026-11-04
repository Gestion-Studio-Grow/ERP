import { test } from "node:test";
import assert from "node:assert/strict";
import { armarHoy, cobradoPorMedio, pesosDelHoy, seniasPendientes, turnosDelHoy, type MovimientoDelHoy, type TurnoConSenia } from "./hoy-core";

const mov = (p: Partial<MovimientoDelHoy>): MovimientoDelHoy => ({
  type: "VENTA",
  method: "EFECTIVO",
  amount: 0,
  collectionId: null,
  orderId: null,
  medioDeOrigen: null,
  ...p,
});

test("lo cobrado por medio: efectivo, transferencia guardada en MP, Mercado Pago, débito y crédito", () => {
  const c = cobradoPorMedio([
    mov({ method: "EFECTIVO", amount: 10_000 }),
    mov({ method: "MP", amount: 5_000, medioDeOrigen: "TRANSFERENCIA", collectionId: "c1" }),
    mov({ method: "TRANSFERENCIA", amount: 2_000 }),
    mov({ method: "MP", amount: 3_000, medioDeOrigen: "MERCADOPAGO", orderId: "o1" }),
    mov({ method: "TARJETA", amount: 4_000, medioDeOrigen: "DEBITO", orderId: "o2" }),
    mov({ method: "TARJETA", amount: 6_000, medioDeOrigen: "CREDITO", collectionId: "c2" }),
  ]);
  assert.deepEqual(
    c.filas.map((f) => [f.etiqueta, f.monto]),
    [["Efectivo", 10_000], ["Transferencia", 7_000], ["Mercado Pago", 3_000], ["Débito", 4_000], ["Crédito", 6_000]],
  );
  assert.deepEqual(c.tarjeta, { monto: 10_000, sinDetalle: 0 });
  assert.equal(c.total, 30_000);
});

test("Tarjeta: sólo débito no repite el subtotal; tarjeta sin detalle sí suma en «Tarjeta»", () => {
  assert.equal(cobradoPorMedio([mov({ method: "TARJETA", amount: 4_000, medioDeOrigen: "DEBITO" })]).tarjeta, null);
  const c = cobradoPorMedio([mov({ method: "TARJETA", amount: 4_000, medioDeOrigen: "DEBITO" }), mov({ method: "TARJETA", amount: 1_500 })]);
  assert.deepEqual(c.tarjeta, { monto: 5_500, sinDetalle: 1_500 });
  assert.equal(c.total, 5_500);
});

test("no son cobros: apertura, retiro, ingreso suelto y egreso suelto; la anulación de un cobro resta", () => {
  const c = cobradoPorMedio([
    mov({ type: "APERTURA", amount: 50_000 }),
    mov({ type: "RETIRO", amount: 1_000 }),
    mov({ type: "INGRESO", amount: 2_000 }),
    mov({ type: "EGRESO", amount: 3_000 }),
    mov({ type: "VENTA", amount: 8_000, collectionId: "c1" }),
    mov({ type: "EGRESO", amount: 8_000, collectionId: "c1" }),
    mov({ type: "INGRESO", amount: 1_200, collectionId: "c2" }),
  ]);
  assert.deepEqual(c.filas, [{ medio: "EFECTIVO", etiqueta: "Efectivo", monto: 1_200 }]);
  assert.equal(c.total, 1_200);
});

test("turnos de hoy: atendidos, faltan, no vinieron; los cancelados no cuentan", () => {
  assert.deepEqual(
    turnosDelHoy([
      { status: "COMPLETED", cantidad: 3 },
      { status: "PENDING", cantidad: 1 },
      { status: "CONFIRMED", cantidad: 2 },
      { status: "NO_SHOW", cantidad: 1 },
      { status: "CANCELLED", cantidad: 4 },
    ]),
    { total: 7, atendidos: 3, faltan: 3, noVinieron: 1 },
  );
});

test("señas pendientes: pedidas y sin nada cobrado, con monto, por hora", () => {
  const base: TurnoConSenia = { id: "x", startsAt: new Date("2026-11-04T15:00:00Z"), clienta: "Ana", servicio: "Corte", precio: 20_000, depositAmount: 5_000, cobrado: 0, pedida: true };
  const s = seniasPendientes([
    { ...base, id: "tarde", startsAt: new Date("2026-11-05T18:00:00Z") },
    base,
    { ...base, id: "pagada", cobrado: 5_000 },
    { ...base, id: "no-pedida", pedida: false },
    { ...base, id: "sin-senia", depositAmount: null },
  ]);
  assert.deepEqual(s.map((x) => [x.id, x.monto]), [["x", 5_000], ["tarde", 5_000]]);
});

test("vacío: lo que no se pudo leer queda null y nombrado, nunca como un cero", () => {
  const nada = armarHoy({ turnos: null, movimientos: null, ventas: null, senias: null });
  assert.equal(nada.turnos, null);
  assert.equal(nada.cobrado, null);
  assert.equal(nada.ventas, null);
  assert.equal(nada.senias, null);
  assert.deepEqual(nada.sinLeer, ["los turnos", "lo cobrado", "las ventas", "las señas"]);

  const ceros = armarHoy({ turnos: [], movimientos: [], ventas: { cantidad: 0, total: 0 }, senias: [] });
  assert.deepEqual(ceros.turnos, { total: 0, atendidos: 0, faltan: 0, noVinieron: 0 });
  assert.deepEqual(ceros.cobrado, { total: 0, filas: [], tarjeta: null });
  assert.deepEqual(ceros.sinLeer, []);
});

test("pesos sin centavos salvo que los haya", () => {
  assert.equal(pesosDelHoy(12_500).replace(/\s/g, " "), "$ 12.500");
  assert.equal(pesosDelHoy(1_234.5).replace(/\s/g, " "), "$ 1.234,50");
});
