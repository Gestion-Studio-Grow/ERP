// ============================================================================
// El tablero de merma separa lo que el AJUSTE mezcla, y no inventa un $0.
// ============================================================================
//
// Se ejecuta el clasificador y el resumen con movimientos armados como los escriben de verdad
// los flujos: `buildReason` (ajustes), los prefijos de `createdBy` de la anulación y de la
// edición de pedidos, y el "Stock inicial" del alta. Nada re-tipeado: si alguno de esos
// textos cambia en su archivo, este test lo sigue.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReason } from "./adjustment-core";
import { ANULACION_VENTA_ACTOR_PREFIX, EDICION_ACTOR_PREFIX } from "@/lib/order-anulacion";
import { MOTIVO_STOCK_INICIAL } from "./alta-producto";
import {
  clasificarAjuste,
  cortesEnNegativo,
  costoDeReferencia,
  esKilo,
  renglonSinCosto,
  resumirMerma,
  semanaHasta,
  type MovimientoDeAjuste,
  type ProductoDeMerma,
} from "./merma-core";

const mov = (p: Partial<MovimientoDeAjuste> & { qty: number; reason: string | null }): MovimientoDeAjuste => ({
  productId: "vacio",
  createdBy: "user:u1",
  ...p,
});

// ── Clasificar ───────────────────────────────────────────────────────────────

test("Merma, Vencimiento y Rotura (con o sin nota) son merma declarada, cada una con su motivo", () => {
  assert.deepEqual(clasificarAjuste(mov({ qty: -1.5, reason: buildReason("MERMA", null) })), { clase: "MERMA", motivo: "Merma" });
  assert.deepEqual(clasificarAjuste(mov({ qty: -2, reason: buildReason("VENCIMIENTO", "lote del lunes") })), {
    clase: "MERMA",
    motivo: "Vencimiento",
  });
  assert.deepEqual(clasificarAjuste(mov({ qty: -1, reason: buildReason("ROTURA", "se abrió el vacío") })), {
    clase: "MERMA",
    motivo: "Rotura",
  });
});

test("Recuento: con delta negativo es FALTANTE, positivo es SOBRANTE", () => {
  assert.deepEqual(clasificarAjuste(mov({ qty: -0.8, reason: buildReason("RECUENTO", null) })), { clase: "FALTANTE" });
  assert.deepEqual(clasificarAjuste(mov({ qty: 0.3, reason: buildReason("RECUENTO", "había una caja atrás") })), {
    clase: "SOBRANTE",
  });
});

test("Otro (y cualquier motivo que no se reconoce) es OTRO: aparte, no se mezcla con la merma", () => {
  assert.deepEqual(clasificarAjuste(mov({ qty: -3, reason: buildReason("OTRO", "error de carga") })), { clase: "OTRO" });
  assert.deepEqual(clasificarAjuste(mov({ qty: 2, reason: "Carga vieja sin motivo" })), { clase: "OTRO" });
  assert.deepEqual(clasificarAjuste(mov({ qty: 2, reason: null })), { clase: "OTRO" });
  // Una "merma" que suma stock no la resta de la merma de la semana.
  assert.deepEqual(clasificarAjuste(mov({ qty: 1, reason: "Merma" })), { clase: "OTRO" });
  // "Mermas varias" no es la etiqueta "Merma".
  assert.deepEqual(clasificarAjuste(mov({ qty: -1, reason: "Mermas varias" })), { clase: "OTRO" });
});

test("DEVOLUCIÓN por anulación de venta: EXCLUIDA por el prefijo de createdBy, aunque el reason diga Recuento", () => {
  const devolucion = mov({
    qty: 1.24,
    reason: buildReason("RECUENTO", null), // el texto no decide: decide quién lo escribió
    createdBy: `${ANULACION_VENTA_ACTOR_PREFIX}user:u1`,
  });
  assert.deepEqual(clasificarAjuste(devolucion), { clase: "EXCLUIDO", porQue: "devolucion-anulacion" });
});

test("devolución por reajuste de peso de un pedido: EXCLUIDA", () => {
  assert.deepEqual(clasificarAjuste(mov({ qty: 0.2, reason: "Pedido #12: Vacío", createdBy: `${EDICION_ACTOR_PREFIX}user:u1` })), {
    clase: "EXCLUIDO",
    porQue: "devolucion-edicion",
  });
});

test("el Stock inicial de un alta no es sobrante: EXCLUIDO", () => {
  assert.deepEqual(clasificarAjuste(mov({ qty: 10, reason: MOTIVO_STOCK_INICIAL })), { clase: "EXCLUIDO", porQue: "stock-inicial" });
});

// ── Costo y unidad ───────────────────────────────────────────────────────────

test("costo: último de compra primero, si no el del catálogo (despiece), si no null — nunca 0", () => {
  assert.equal(costoDeReferencia(8000, 7000), 8000);
  assert.equal(costoDeReferencia(null, 7000), 7000, "corte de despiece: sin compra, con costo de catálogo");
  assert.equal(costoDeReferencia(0, 0), null);
  assert.equal(costoDeReferencia(undefined, null), null);
});

test("kilos: por forma de venta o por la unidad escrita", () => {
  assert.equal(esKilo({ saleUnit: "WEIGHT", unit: "unidad" }), true);
  assert.equal(esKilo({ saleUnit: "UNIT", unit: "Kg" }), true);
  assert.equal(esKilo({ saleUnit: "UNIT", unit: "unidad" }), false);
});

// ── Resumen: el recorrido del criterio de aceptación ─────────────────────────

const PRODUCTOS = new Map<string, ProductoDeMerma>([
  ["vacio", { nombre: "Vacío", unidad: "kg", saleUnit: "WEIGHT", costo: 8000 }],
  ["bife", { nombre: "Bife de chorizo", unidad: "kg", saleUnit: "WEIGHT", costo: 10000 }],
  ["osobuco", { nombre: "Osobuco", unidad: "kg", saleUnit: "WEIGHT", costo: null }],
  ["chorizo", { nombre: "Chorizo", unidad: "unidad", saleUnit: "UNIT", costo: 500 }],
]);

test("merma de 1,5 kg y un recuento con faltante: renglones SEPARADOS, en kg y en $; la devolución no es sobrante", () => {
  const r = resumirMerma(
    [
      mov({ productId: "vacio", qty: -1.5, reason: buildReason("MERMA", null) }),
      mov({ productId: "bife", qty: -0.4, reason: buildReason("RECUENTO", null) }),
      mov({ productId: "vacio", qty: 1.24, reason: "Anulación pedido #7: Vacío", createdBy: `${ANULACION_VENTA_ACTOR_PREFIX}user:u1` }),
    ],
    PRODUCTOS,
  );
  assert.deepEqual(r.merma, { kg: 1.5, unidades: 0, pesos: 12000, movimientos: 1, sinCosto: 0 });
  assert.deepEqual(r.faltante, { kg: 0.4, unidades: 0, pesos: 4000, movimientos: 1, sinCosto: 0 });
  assert.equal(r.sobrante.movimientos, 0, "la devolución de la anulación NO aparece como sobrante");
  assert.equal(r.excluidos["devolucion-anulacion"], 1);
  assert.deepEqual(r.mermaPorMotivo.Merma, { kg: 1.5, unidades: 0 });
});

test("un corte sin costo queda 'sin costo' (no $0) y no entra al ranking en pesos: se nombra aparte", () => {
  const r = resumirMerma([mov({ productId: "osobuco", qty: -2, reason: "Merma" })], PRODUCTOS);
  assert.equal(r.merma.kg, 2);
  assert.equal(r.merma.pesos, 0);
  assert.equal(r.merma.sinCosto, 1);
  assert.equal(renglonSinCosto(r.merma), true, "la pantalla dice 'sin costo', no $0");
  assert.deepEqual(r.top, []);
  assert.deepEqual(r.perdidaSinCosto.map((c) => [c.nombre, c.merma, c.pesos]), [["Osobuco", 2, null]]);
});

test("renglón mixto: los pesos son de lo valuado y se cuenta cuánto quedó sin costo", () => {
  const r = resumirMerma(
    [mov({ productId: "vacio", qty: -1, reason: "Merma" }), mov({ productId: "osobuco", qty: -1, reason: "Rotura" })],
    PRODUCTOS,
  );
  assert.equal(r.merma.pesos, 8000);
  assert.equal(r.merma.sinCosto, 1);
  assert.equal(renglonSinCosto(r.merma), false);
});

test("unidades no se suman a kilos, y OTRO es neto con signo", () => {
  const r = resumirMerma(
    [
      mov({ productId: "chorizo", qty: -3, reason: "Vencimiento" }),
      mov({ productId: "vacio", qty: -2, reason: buildReason("OTRO", "x") }),
      mov({ productId: "vacio", qty: 0.5, reason: buildReason("OTRO", "y") }),
    ],
    PRODUCTOS,
  );
  assert.deepEqual([r.merma.kg, r.merma.unidades, r.merma.pesos], [0, 3, 1500]);
  assert.deepEqual([r.otro.kg, r.otro.pesos, r.otro.movimientos], [-1.5, -12000, 2]);
});

test("top 5: los que más pierden en pesos (merma + faltante), sin sobrante", () => {
  const movs: MovimientoDeAjuste[] = [
    mov({ productId: "vacio", qty: -1, reason: "Merma" }), // 8000
    mov({ productId: "vacio", qty: -0.5, reason: "Recuento" }), // 4000 → 12000
    mov({ productId: "bife", qty: -1, reason: "Merma" }), // 10000
    mov({ productId: "bife", qty: 5, reason: "Recuento" }), // sobrante: no descuenta pérdida
    mov({ productId: "chorizo", qty: -2, reason: "Rotura" }), // 1000
  ];
  const r = resumirMerma(movs, PRODUCTOS);
  assert.deepEqual(
    r.top.map((c) => [c.nombre, c.merma, c.faltante, c.pesos]),
    [
      ["Vacío", 1, 0.5, 12000],
      ["Bife de chorizo", 1, 0, 10000],
      ["Chorizo", 2, 0, 1000],
    ],
  );
  assert.equal(r.sobrante.kg, 5);
});

test("el top se corta en 5", () => {
  const prods = new Map<string, ProductoDeMerma>(
    Array.from({ length: 8 }, (_, i) => [`p${i}`, { nombre: `Corte ${i}`, unidad: "kg", saleUnit: "WEIGHT", costo: 100 * (i + 1) }]),
  );
  const r = resumirMerma(
    [...prods.keys()].map((id) => mov({ productId: id, qty: -1, reason: "Merma" })),
    prods,
  );
  assert.equal(r.top.length, 5);
  assert.equal(r.top[0].nombre, "Corte 7");
});

// ── Semana ───────────────────────────────────────────────────────────────────

test("semana: sin elegir son los últimos 7 días hasta hoy, sin 'siguiente'", () => {
  assert.deepEqual(semanaHasta(undefined, "2026-09-23"), {
    desde: "2026-09-17",
    hasta: "2026-09-23",
    anterior: "2026-09-16",
    siguiente: null,
    esLaActual: true,
  });
});

test("semana anterior elegida: tiene 'siguiente'; futura o basura cae en la de hoy", () => {
  const s = semanaHasta("2026-09-16", "2026-09-23");
  assert.deepEqual([s.desde, s.hasta, s.siguiente, s.esLaActual], ["2026-09-10", "2026-09-16", "2026-09-23", false]);
  assert.equal(semanaHasta("2026-09-20", "2026-09-23").siguiente, "2026-09-23", "no salta más allá de hoy");
  assert.equal(semanaHasta("2027-01-01", "2026-09-23").hasta, "2026-09-23");
  assert.equal(semanaHasta("'; drop", "2026-09-23").hasta, "2026-09-23");
  assert.equal(semanaHasta("2026-02-30", "2026-09-23").hasta, "2026-09-23", "un día que no existe no se corre al 2 de marzo");
  // Cruce de mes y de año.
  assert.equal(semanaHasta("2026-01-03", "2026-09-23").desde, "2025-12-28");
});

// ── Cortes en negativo ───────────────────────────────────────────────────────

test("cortes en negativo: sólo los < 0, del más negativo al menos", () => {
  const filas = [
    { name: "Vacío", stock: -0.14 },
    { name: "Bife", stock: 3 },
    { name: "Entraña", stock: -2 },
    { name: "Osobuco", stock: 0 },
  ];
  assert.deepEqual(cortesEnNegativo(filas).map((f) => f.name), ["Entraña", "Vacío"]);
});
