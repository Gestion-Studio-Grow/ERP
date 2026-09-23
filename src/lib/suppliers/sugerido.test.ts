// El sugerido de compra, ejecutado con datos: la fórmula, qué cuenta como venta, el agrupado
// por proveedor y el texto que se manda por WhatsApp.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CICLO_DIAS,
  DEMORA_DIAS,
  DIAS_DE_VENTA,
  agruparPorProveedor,
  cantidadParaPedir,
  cantidadSugerida,
  cuantosParaPedir,
  demandaDe,
  desdeVentaReciente,
  lineasSugeridas,
  selectDemanda,
  textoDelPedido,
  ventaDiaria,
  whereSugerido,
  type MovimientoDeDemanda,
  type ProductoParaSugerir,
} from "./sugerido";
import { ANULACION_VENTA_ACTOR_PREFIX, EDICION_ACTOR_PREFIX } from "@/lib/order-anulacion";
import { motivoDeDespiece } from "@/lib/carniceria/despiece";
import { TRASLADO_ACTOR_PREFIX } from "@/lib/multilocal/traslado-core";

const venta = (qty: number): MovimientoDeDemanda => ({ type: "VENTA", qty: -qty, reason: null, createdBy: "user:caja" });

test("criterio de aceptación: venta diaria 2 kg, stock 5, mínimo 4 → 17 kg", () => {
  // venta diaria × (demora 2 + ciclo 7) + seguridad − stock = 2 × 9 + máx(4, 2 × 2) − 5 = 17.
  assert.equal(DEMORA_DIAS + CICLO_DIAS, 9, "demora y ciclo provisionales");
  assert.equal(cantidadSugerida({ ventaDiaria: 2, stock: 5, minimo: 4, kilo: true }), 17);
  // Y la venta diaria sale del registro: 56 kg en 28 días son 2 kg por día.
  const movs = Array.from({ length: 28 }, () => venta(2));
  assert.equal(ventaDiaria(movs), 2);
  const [linea] = lineasSugeridas([
    { id: "vacio", name: "Vacío", unit: "kg", saleUnit: "WEIGHT", stock: 5, lowStockAt: 4, stockMovements: movs },
  ]);
  assert.equal(linea.sugerido, 17);
});

test("la seguridad es el mayor entre el mínimo cargado y dos días de venta", () => {
  // Mínimo alto: manda el mínimo. 1 × 9 + 10 − 3 = 16.
  assert.equal(cantidadSugerida({ ventaDiaria: 1, stock: 3, minimo: 10, kilo: false }), 16);
  // Mínimo bajo: mandan dos días de venta. 5 × 9 + 10 − 20 = 35.
  assert.equal(cantidadSugerida({ ventaDiaria: 5, stock: 20, minimo: 1, kilo: false }), 35);
});

test("con stock de sobra no se pide nada; sin ventas, se repone hasta el mínimo", () => {
  assert.equal(cantidadSugerida({ ventaDiaria: 2, stock: 100, minimo: 4, kilo: true }), 0);
  assert.equal(cantidadSugerida({ ventaDiaria: 0, stock: 1, minimo: 4, kilo: false }), 3);
  assert.equal(cantidadSugerida({ ventaDiaria: 0, stock: 10, minimo: 4, kilo: false }), 0);
  // Stock en negativo (vendió por peso sin stock): se pide también lo que falta.
  assert.equal(cantidadSugerida({ ventaDiaria: 0, stock: -2, minimo: 4, kilo: true }), 6);
});

test("redondeo: por unidad, a la unidad de arriba; por kilo, a la décima de arriba", () => {
  assert.equal(cantidadSugerida({ ventaDiaria: 0.3, stock: 0, minimo: 0, kilo: false }), 4, "0,3 × 11 = 3,3 → 4 velas");
  assert.equal(cantidadSugerida({ ventaDiaria: 0.3, stock: 0, minimo: 0, kilo: true }), 3.3);
  assert.equal(cantidadSugerida({ ventaDiaria: 0.31, stock: 0, minimo: 0, kilo: true }), 3.5, "3,41 kg → 3,5");
});

test("qué cuenta como venta: ventas y consumos; lo devuelto de una venta anulada se descuenta", () => {
  const movs: MovimientoDeDemanda[] = [
    venta(3),
    { type: "CONSUMO", qty: -1, reason: null, createdBy: "user:pro" },
    // Se anuló una venta de 2 kg: vuelven a la heladera.
    { type: "AJUSTE", qty: 2, reason: "Anulación de venta", createdBy: `${ANULACION_VENTA_ACTOR_PREFIX}user:duena` },
    // Un pedido se reajustó al peso real y salió medio kilo más.
    { type: "AJUSTE", qty: -0.5, reason: "Reajuste", createdBy: `${EDICION_ACTOR_PREFIX}user:caja` },
    // La pieza cortada en un despiece es demanda de esa pieza.
    { type: "AJUSTE", qty: -110, reason: motivoDeDespiece(4, "Media res"), createdBy: "user:duena" },
    // Merma, recuento y compras NO son demanda.
    { type: "AJUSTE", qty: -1, reason: "Merma — se cayó", createdBy: "user:enc" },
    { type: "AJUSTE", qty: -4, reason: "Recuento", createdBy: "user:enc" },
    { type: "COMPRA", qty: 50, reason: null, createdBy: "user:duena" },
  ];
  assert.equal(demandaDe(movs), 3 + 1 - 2 + 0.5 + 110);
  assert.equal(demandaDe([{ type: "AJUSTE", qty: 5, reason: null, createdBy: `${ANULACION_VENTA_ACTOR_PREFIX}user:x` }]), 0, "nunca negativa");
});

test("lo que el obrador manda a los locales por traslado es demanda; lo que recibe un local, no", () => {
  const actor = `${TRASLADO_ACTOR_PREFIX}user:duena`;
  // Un obrador que vende 10 kg en el mostrador y manda 80 kg a los locales de la red.
  const obrador: MovimientoDeDemanda[] = [
    venta(10),
    { type: "AJUSTE", qty: -50, reason: "Traslado a Lomas · remito T-1", createdBy: actor },
    { type: "AJUSTE", qty: -30, reason: "Traslado a Canning · remito T-2", createdBy: actor },
  ];
  assert.equal(demandaDe(obrador), 90, "antes daba 10: el sugerido del obrador quedaba casi en cero");
  // El local que recibe: la entrada es una REPOSICION y no es demanda.
  const local: MovimientoDeDemanda[] = [
    venta(4),
    { type: "REPOSICION", qty: 50, reason: "Traslado desde el obrador · remito T-1", createdBy: actor },
  ];
  assert.equal(demandaDe(local), 4);
});

test("sólo aparecen los productos a pedir, y el número del Inicio es la misma cuenta", () => {
  const productos: ProductoParaSugerir[] = [
    { id: "a", name: "Vacío", unit: "kg", saleUnit: "WEIGHT", stock: 5, lowStockAt: 4, stockMovements: Array.from({ length: 28 }, () => venta(2)) },
    { id: "b", name: "Entraña", unit: "kg", saleUnit: "WEIGHT", stock: 40, lowStockAt: 4, stockMovements: [venta(1)] },
    { id: "c", name: "Vela", unit: "u", saleUnit: "UNIT", stock: 0, lowStockAt: 3, stockMovements: [] },
  ];
  const l = lineasSugeridas(productos);
  assert.deepEqual(l.map((x) => [x.nombre, x.sugerido]), [["Vacío", 17], ["Vela", 3]]);
  assert.equal(cuantosParaPedir(productos), 2);
});

test("el where y el período: productos que controlan stock, movimientos de 28 días", () => {
  assert.deepEqual(whereSugerido("t-qa"), { tenantId: "t-qa", deletedAt: null, active: true, trackStock: true });
  const ahora = new Date("2026-09-23T15:00:00.000Z");
  const desde = desdeVentaReciente(ahora);
  assert.equal(DIAS_DE_VENTA, 28);
  assert.equal(desde.toISOString(), "2026-08-26T15:00:00.000Z");
  assert.deepEqual(selectDemanda(desde).where, { type: { in: ["VENTA", "CONSUMO", "AJUSTE"] }, createdAt: { gte: desde } });
});

test("por proveedor habitual, con los que no tienen proveedor al final", () => {
  const productos: ProductoParaSugerir[] = [
    { id: "vacio", name: "Vacío", unit: "kg", saleUnit: "WEIGHT", stock: 0, lowStockAt: 4, stockMovements: [] },
    { id: "lomo", name: "Lomo", unit: "kg", saleUnit: "WEIGHT", stock: 0, lowStockAt: 2, stockMovements: [] },
    { id: "salsa", name: "Salsa", unit: "u", saleUnit: "UNIT", stock: 0, lowStockAt: 6, stockMovements: [] },
    { id: "pollo", name: "Pollo", unit: "kg", saleUnit: "WEIGHT", stock: 0, lowStockAt: 5, stockMovements: [] },
  ];
  const habitual = new Map([
    ["vacio", { id: "p-don-ramon", nombre: "Estancia Don Ramón", telefono: "11 4000-7919" }],
    ["lomo", { id: "p-don-ramon", nombre: "Estancia Don Ramón", telefono: "11 4000-7919" }],
    ["pollo", { id: "p-avicola", nombre: "Avícola Sur", telefono: null }],
  ]);
  const g = agruparPorProveedor(lineasSugeridas(productos), habitual);
  assert.deepEqual(
    g.map((x) => [x.proveedor?.nombre ?? null, x.lineas.map((l) => l.nombre)]),
    [
      ["Avícola Sur", ["Pollo"]],
      ["Estancia Don Ramón", ["Lomo", "Vacío"]],
      [null, ["Salsa"]],
    ],
  );
});

test("el texto para WhatsApp: saludo, un renglón por producto con su cantidad, sin precios", () => {
  const lineas = lineasSugeridas([
    { id: "vacio", name: "Vacío", unit: "kg", saleUnit: "WEIGHT", stock: 5, lowStockAt: 4, stockMovements: Array.from({ length: 28 }, () => venta(2)) },
    { id: "salsa", name: "Salsa artesanal", unit: "u", saleUnit: "UNIT", stock: 0, lowStockAt: 6, stockMovements: [] },
  ]);
  const texto = textoDelPedido("MAGRA", "Estancia Don Ramón", lineas);
  assert.equal(
    texto,
    "Hola Estancia Don Ramón, te paso el pedido para MAGRA:\n- Vacío: 17 kg\n- Salsa artesanal: 6 u\n¿Me confirmás cuándo llega? Gracias.",
  );
  assert.doesNotMatch(texto, /\$/);
  assert.equal(cantidadParaPedir({ sugerido: 3.5, kilo: true, unidad: "kg" }), "3,5 kg");
  assert.equal(textoDelPedido("", null, []).split("\n")[0], "Hola, te paso el pedido:");
});
