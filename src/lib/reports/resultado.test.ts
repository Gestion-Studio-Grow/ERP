// El resultado del mes, EJECUTADO con un mes armado a mano: qué es venta, qué es costo, qué
// es gasto y qué NO lo es (la compra de mercadería, el pago de una deuda, el retiro del dueño).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alicuotaDeLasVentas,
  calcularResultado,
  ivaSinAlicuotaConocida,
  mesSinMovimiento,
  netoDeIva,
  rubroDeCaja,
  type HechosDelMes,
  type MovimientoDeCaja,
} from "./resultado";
import { costearLineas, pedidosQueSonVenta, type LineaVendida } from "./costo-vendido";
import { compraMarker, REINTEGRO_ACTOR_PREFIX } from "@/lib/stock/purchase-egreso";
import { comisionMarker } from "@/lib/comision-liquidacion";
import { cuentaCorrienteMarker } from "@/lib/settlement/asiento-libro";
import { CIERRE_DIARIO_ACTOR_PREFIX } from "@/lib/caja/cierre-marca";
import { CORTE_INICIAL_ACTOR_PREFIX } from "@/lib/caja/corte-inicial";
import { IMPORT_ACTOR_PREFIX } from "@/lib/caja/import-caja";
import { ANULACION_VENTA_ACTOR_PREFIX } from "@/lib/order-anulacion";

const caja = (type: MovimientoDeCaja["type"], amount: number, createdBy: string | null = "user:u1", orderId: string | null = null): MovimientoDeCaja => ({
  type,
  amount,
  createdBy,
  orderId,
});

/** Agosto de una carnicería: todo lo que se mueve en un mes normal. */
function agosto(extra: Partial<HechosDelMes> = {}): HechosDelMes {
  return {
    condicion: "monotributo",
    pedidos: [
      // Cobrado: 2 kg de vacío a $10.000 = $20.000.
      { id: "p1", total: 20000, paid: true, items: [{ productId: "vacio", nombre: "Vacío", cantidad: 2, saleUnit: "WEIGHT", importe: 20000 }] },
      // A cuenta (fiado): $5.000.
      { id: "p2", total: 5000, paid: false, items: [{ productId: "chorizo", nombre: "Chorizo", cantidad: 1, saleUnit: "WEIGHT", importe: 5000 }] },
      // Pedido online sin cobrar y sin cuenta: NO es venta todavía.
      { id: "p3", total: 9999, paid: false, items: [{ productId: "vacio", nombre: "Vacío", cantidad: 1, saleUnit: "WEIGHT", importe: 9999 }] },
    ],
    pedidosACuenta: new Set(["p2"]),
    salidas: [
      // El costo GUARDADO al vender: 2 kg a $6.000.
      { type: "VENTA", orderId: "p1", productId: "vacio", qty: -2, unitCost: 6000 },
      // El chorizo se vendió sin costo guardado: va el de hoy ($3.000).
      { type: "VENTA", orderId: "p2", productId: "chorizo", qty: -1, unitCost: null },
      { type: "VENTA", orderId: "p3", productId: "vacio", qty: -1, unitCost: 6000 },
    ],
    costoVigente: { chorizo: 3000, vacio: 6500 },
    turnos: { total: 0, cantidad: 0 },
    caja: [
      caja("VENTA", 20000, "system", "p1"), // ya está en ventas
      caja("EGRESO", 50000, compraMarker("c1")), // compra de mercadería: NO es gasto
      caja("RETIRO", 30000), // retiro del dueño: NO es gasto
      caja("EGRESO", 8000, cuentaCorrienteMarker("col1")), // pago a proveedor por cuenta corriente: NO es gasto
      caja("EGRESO", 1500, comisionMarker("pay1")), // comisión: gasto
      caja("EGRESO", 700, `${CIERRE_DIARIO_ACTOR_PREFIX}2026-08-10`), // faltante de caja: gasto
      caja("INGRESO", 200, `${CIERRE_DIARIO_ACTOR_PREFIX}2026-08-11`), // sobrante: baja el gasto
      caja("EGRESO", 2000), // luz, cargada a mano: sin categoría
      caja("EGRESO", 1000), // limpieza, cargada a mano: sin categoría
      caja("INGRESO", 40000), // aporte del dueño, a mano: no se suma
      caja("INGRESO", 3000, `${REINTEGRO_ACTOR_PREFIX}c1`), // reintegro de proveedor: no es venta
      caja("EGRESO", 20000, `${ANULACION_VENTA_ACTOR_PREFIX}user:u1`, "p9"), // anulación: no es gasto
    ],
    ...extra,
  };
}

test("agosto: ventas − costo de lo vendido − gastos, sin contar compras, pagos de deuda ni retiros", () => {
  const r = calcularResultado(agosto());
  assert.equal(r.ventas.mostrador, 20000);
  assert.equal(r.ventas.aCuenta, 5000, "el fiado es venta del mes");
  assert.equal(r.ventas.bruto, 25000, "el pedido online sin cobrar no cuenta");
  assert.equal(r.ventas.neto, 25000, "un monotributista no descuenta IVA");
  assert.equal(r.costo.mercaderia, 12000 + 3000);
  assert.equal(r.costo.lineasAlCostoDeHoy, 1);
  assert.equal(r.gastos.comisiones, 1500);
  assert.equal(r.gastos.diferenciasDeCaja, 500, "faltante 700 menos sobrante 200");
  assert.equal(r.gastos.sinCategoria, 3000);
  assert.equal(r.gastos.sinCategoriaCantidad, 2);
  assert.equal(r.gastos.total, 5000);
  // 25.000 − 15.000 − 5.000
  assert.equal(r.resultado, 5000);
  assert.equal(r.margenSobreVentas, 0.2);
  // Lo que NO es gasto se ve aparte, con su monto.
  assert.equal(r.fuera.compras, 50000);
  assert.equal(r.fuera.retiros, 30000);
  assert.equal(r.fuera.pagosDeDeudas, 8000);
  assert.equal(r.fuera.anulaciones, 20000);
  assert.equal(r.fuera.reintegros, 3000);
  assert.equal(r.fuera.ingresosManuales, 40000);
  assert.equal(r.fuera.ingresosManualesCantidad, 1);
});

test("la compra de mercadería y el retiro del dueño no mueven el resultado", () => {
  const base = calcularResultado(agosto());
  const conMas = calcularResultado(
    agosto({ caja: [...agosto().caja, caja("EGRESO", 999999, compraMarker("c2")), caja("RETIRO", 777777)] }),
  );
  assert.equal(conMas.resultado, base.resultado);
  assert.equal(conMas.gastos.total, base.gastos.total);
});

test("un Responsable Inscripto ve las ventas sin IVA (21%, como factura el sistema)", () => {
  const r = calcularResultado(agosto({ condicion: "responsable-inscripto" }));
  assert.equal(r.sinIva, true);
  assert.equal(r.ventas.bruto, 25000);
  assert.equal(r.ventas.neto, netoDeIva(25000, "responsable-inscripto"));
  assert.equal(r.ventas.neto, 20661.16);
  assert.equal(netoDeIva(25000, "sin-comprobantes"), 25000, "sin comprobantes no se sabe: se deja como se cobró");
});

test("un MOSTRADOR inscripto: el IVA NO se saca con un 21% que no es de todo lo vendido, y se dice", () => {
  // Agosto de la carnicería, inscripta: la carne va al 10,5%. Antes: neto = 25.000 / 1,21 =
  // 20.661,16 bajo "Menos el IVA (21%)", un neto inventado para cada kilo de carne.
  const r = calcularResultado(agosto({ condicion: "responsable-inscripto", comercio: true }));
  assert.equal(r.sinIva, false);
  assert.equal(r.alicuota, null);
  assert.equal(r.ivaIncluidoSinAlicuota, true);
  assert.equal(r.ventas.neto, r.ventas.bruto, "con el IVA incluido, dicho en la pantalla");
  assert.equal(alicuotaDeLasVentas("responsable-inscripto", { comercio: true }), null);
});

test("servicios inscripto (CH) sigue igual: 21%, la alícuota general de los servicios", () => {
  const conDato = calcularResultado(agosto({ condicion: "responsable-inscripto", comercio: false }));
  const sinDato = calcularResultado(agosto({ condicion: "responsable-inscripto" }));
  for (const r of [conDato, sinDato]) {
    assert.equal(r.alicuota, 0.21);
    assert.equal(r.ventas.neto, 20661.16);
    assert.equal(r.ivaIncluidoSinAlicuota, false);
  }
  // Un monotributista no discrimina IVA, sea mostrador o servicios: no hay nada que decir.
  const mono = calcularResultado(agosto({ condicion: "monotributo", comercio: true }));
  assert.deepEqual([mono.alicuota, mono.ivaIncluidoSinAlicuota, mono.ventas.neto], [null, false, 25000]);
  assert.equal(ivaSinAlicuotaConocida("sin-comprobantes", { comercio: true }), false);
});

test("turnos cobrados e insumos consumidos: el resultado de un negocio de servicios", () => {
  const r = calcularResultado({
    condicion: "sin-comprobantes",
    pedidos: [],
    pedidosACuenta: new Set(),
    salidas: [
      { type: "CONSUMO", orderId: null, productId: "crema", qty: -0.5, unitCost: 4000 },
      { type: "CONSUMO", orderId: null, productId: "gel", qty: -1, unitCost: null },
      { type: "CONSUMO", orderId: null, productId: "raro", qty: -1, unitCost: null },
    ],
    costoVigente: { gel: 1000, raro: null },
    turnos: { total: 90000, cantidad: 6 },
    caja: [caja("VENTA", 90000, "system"), caja("EGRESO", 27000, comisionMarker("pay2"))],
  });
  assert.equal(r.ventas.turnos, 90000);
  assert.equal(r.costo.insumos, 3000, "2.000 guardado + 1.000 al costo de hoy; el que no tiene costo no se inventa");
  assert.equal(r.costo.insumosSinCosto, 1);
  assert.equal(r.gastos.comisiones, 27000);
  assert.equal(r.resultado, 60000);
});

test("un mes sin nada no tiene resultado que dar", () => {
  const r = calcularResultado({
    condicion: "sin-comprobantes",
    pedidos: [],
    pedidosACuenta: new Set(),
    salidas: [],
    costoVigente: {},
    turnos: { total: 0, cantidad: 0 },
    caja: [caja("RETIRO", 5000)],
  });
  assert.equal(mesSinMovimiento(r), true);
  assert.equal(r.margenSobreVentas, null);
});

test("qué es cada movimiento del libro: por su marca, no por el tipo", () => {
  assert.equal(rubroDeCaja(caja("EGRESO", 1, compraMarker("x"))), "compra");
  assert.equal(rubroDeCaja(caja("EGRESO", 1, cuentaCorrienteMarker("x"))), "pago-deuda");
  assert.equal(rubroDeCaja(caja("INGRESO", 1, cuentaCorrienteMarker("x"))), "cobro-fiado");
  assert.equal(rubroDeCaja(caja("RETIRO", 1)), "retiro");
  assert.equal(rubroDeCaja(caja("EGRESO", 1)), "sin-categoria");
  assert.equal(rubroDeCaja(caja("INGRESO", 1)), "ingreso-manual");
  assert.equal(rubroDeCaja(caja("VENTA", 1, "system", "p1")), "venta");
  assert.equal(rubroDeCaja(caja("VENTA", 1, "system")), "venta");
  // Lo importado de la planilla eran gastos y cobros tipeados a mano; el corte inicial es el
  // ajuste que ata el saldo al conteo, no resultado de ningún mes.
  assert.equal(rubroDeCaja(caja("EGRESO", 1, `${IMPORT_ACTOR_PREFIX}abcd1234`)), "sin-categoria");
  assert.equal(rubroDeCaja(caja("INGRESO", 1, `${IMPORT_ACTOR_PREFIX}abcd1234`)), "ingreso-manual");
  assert.equal(rubroDeCaja(caja("EGRESO", 1, `${CORTE_INICIAL_ACTOR_PREFIX}2026-08-01`)), "ajuste-inicial");
  assert.equal(rubroDeCaja(caja("INGRESO", 1, `${REINTEGRO_ACTOR_PREFIX}c1`)), "reintegro-proveedor");
});

test("costo de lo vendido: guardado primero, el de hoy si la venta no lo guardó, y nunca un $0 inventado", () => {
  const lineas: LineaVendida[] = [
    { orderId: "a", productId: "x", nombre: "X", cantidad: 2, saleUnit: "UNIT", importe: 200 },
    { orderId: "a", productId: "y", nombre: "Y", cantidad: 1, saleUnit: "UNIT", importe: 100 }, // sin movimiento (no controla stock)
    { orderId: "a", productId: "z", nombre: "Z", cantidad: 1, saleUnit: "UNIT", importe: 50 }, // sin costo en ningún lado
    { orderId: "a", productId: null, nombre: "Envío", cantidad: 1, saleUnit: "UNIT", importe: 30 },
    // El mismo producto dos veces en el pedido: comparten salidas, se reparten por cantidad.
    { orderId: "b", productId: "x", nombre: "X", cantidad: 1, saleUnit: "UNIT", importe: 100 },
    { orderId: "b", productId: "x", nombre: "X", cantidad: 3, saleUnit: "UNIT", importe: 300 },
  ];
  const out = costearLineas(
    lineas,
    [
      { type: "VENTA", orderId: "a", productId: "x", qty: -2, unitCost: 40 },
      { type: "VENTA", orderId: "a", productId: "z", qty: -1, unitCost: null },
      { type: "VENTA", orderId: "b", productId: "x", qty: -4, unitCost: 50 },
    ],
    { x: 999, y: 30, z: null },
  );
  assert.deepEqual(
    out.map((l) => [l.productId, l.fuente, l.costo]),
    [
      ["x", "guardado", 80],
      ["y", "costo-de-hoy", 30],
      ["z", "sin-costo", 0],
      [null, "sin-producto", 0],
      ["x", "guardado", 50],
      ["x", "guardado", 150],
    ],
  );
});

test("qué pedido es venta: cobrado, o a cuenta; uno saldado con cuenta es venta A CUENTA, una vez", () => {
  const pedidos = [
    { id: "a", total: 1, paid: true, items: [] },
    { id: "b", total: 2, paid: false, items: [] },
    { id: "c", total: 3, paid: false, items: [] },
    // Así graba Vender la venta "A cuenta": saldada (`paid: true`) y con su cuenta a cobrar.
    { id: "d", total: 4, paid: true, items: [] },
  ];
  const { cobrados, aCuenta } = pedidosQueSonVenta(pedidos, new Set(["b", "d"]));
  assert.deepEqual(cobrados.map((p) => p.id), ["a"]);
  assert.deepEqual(aCuenta.map((p) => p.id), ["b", "d"], "el fiado no aparece como venta cobrada");
});
