// El aviso del cierre del día cuenta el SALDO de los pedidos con una parte cobrada (D1), y la
// devolución por peso no se lee como un pedido pagado de más. PURAS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { saldoDelPedido, sinCobrarDeLosPedidos } from "./saldo-del-pedido";
import { pagadosDeMasDelPeriodo } from "@/lib/caja/cierre-diario";
import { AJUSTE_PESO_ACTOR_PREFIX } from "@/lib/caja/devolucion-por-peso";

test("sin cobrar: la suma de los saldos, no de los totales", () => {
  const pedidos = [
    { id: "p1", total: 30_000 }, // cobrado $20.000 antes de pesar: falta $10.000
    { id: "p2", total: 8_000.1 }, // sin nada cobrado
    { id: "p3", total: 5_000 }, // cobrado de más (no resta)
  ];
  const cobrado = new Map([["p1", 20_000], ["p3", 6_000]]);
  assert.deepEqual(sinCobrarDeLosPedidos(pedidos, cobrado), { cantidad: 3, monto: 18_000.1 });
  assert.equal(saldoDelPedido(0.1 + 0.2, [0.1]), 0.2);
});

test("no-cambio (CH, beauty-spa: sin cobros parciales): la suma de los totales, como el aggregate de antes", () => {
  const pedidos = [{ id: "a", total: 7_000 }, { id: "b", total: 1_000.55 }];
  assert.deepEqual(sinCobrarDeLosPedidos(pedidos, new Map()), { cantidad: 2, monto: 8_000.55 });
  assert.deepEqual(sinCobrarDeLosPedidos([], new Map()), { cantidad: 0, monto: 0 });
});

test("pagados de más: la devolución por peso se descuenta; un egreso cualquiera no", () => {
  // Cobrado $30.000, pesó menos (total $10.000), devolvió $20.000 hoy.
  assert.deepEqual(
    pagadosDeMasDelPeriodo([
      { orderId: "q", total: 10_000, amount: 30_000, type: "VENTA" },
      { orderId: "q", total: 10_000, amount: 20_000, type: "EGRESO", createdBy: `${AJUSTE_PESO_ACTOR_PREFIX}user:x` },
    ]),
    { cantidad: 0, monto: 0 },
  );
  // Un egreso de otra cosa con `orderId` (la anulación) no cambia la cuenta de siempre.
  assert.deepEqual(
    pagadosDeMasDelPeriodo([
      { orderId: "r", total: 1_000, amount: 1_500, type: "VENTA" },
      { orderId: "r", total: 1_000, amount: 1_500, type: "EGRESO", createdBy: "anulacion-venta:user:x" },
    ]),
    { cantidad: 1, monto: 500 },
  );
});

test("pagados de más: el total del período es el de hoy más lo devuelto por peso DESPUÉS (pesó menos otro día)", () => {
  // Cobrado $30.000 ayer; hoy pesó menos (total $10.000) y devolvió $20.000 hoy, fuera de la hoja de ayer.
  const ayer = [{ orderId: "q", total: 10_000, amount: 30_000, type: "VENTA" }];
  assert.deepEqual(pagadosDeMasDelPeriodo(ayer), { cantidad: 1, monto: 20_000 }, "sin lo devuelto después: la alerta falsa de antes");
  assert.deepEqual(pagadosDeMasDelPeriodo(ayer, new Map([["q", 20_000]])), { cantidad: 0, monto: 0 });
  // Un excedente de verdad ese día sigue alertando: $35.000 por un pedido de $30.000 (total del período).
  assert.deepEqual(
    pagadosDeMasDelPeriodo([{ orderId: "q", total: 10_000, amount: 35_000, type: "VENTA" }], new Map([["q", 20_000]])),
    { cantidad: 1, monto: 5_000 },
  );
});
