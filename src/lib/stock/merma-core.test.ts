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
import { motivoDeDespiece } from "@/lib/carniceria/despiece";
import {
  clasificarAjuste,
  cortesEnNegativo,
  esKilo,
  renglonSinCosto,
  resumirMerma,
  semanaHasta,
  type MovimientoDeAjuste,
  whereAjustesRecientes,
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

test("costo: el guardado en la fila manda; si la fila no lo tiene (movimiento viejo), el vigente del producto", () => {
  const productos = new Map<string, ProductoDeMerma>([
    ["vacio", { nombre: "Vacío", unidad: "kg", saleUnit: "WEIGHT", costo: 9000 }],
  ]);
  // La merma del martes se valúa con el costo del martes (8000), no con el de hoy (9000).
  const conCosto = resumirMerma([mov({ qty: -2, reason: buildReason("VENCIMIENTO", null), unitCost: 8000 })], productos);
  assert.equal(conCosto.merma.pesos, 16000);
  // Una fila de antes de la ola 2 (sin costo) cae al vigente.
  const vieja = resumirMerma([mov({ qty: -2, reason: buildReason("VENCIMIENTO", null) })], productos);
  assert.equal(vieja.merma.pesos, 18000);
});

test("los motivos de perecederos son merma declarada, cada uno con su renglón", () => {
  for (const m of ["DECOMISO", "CONSUMO_INTERNO", "DEGUSTACION"] as const) {
    const c = clasificarAjuste(mov({ qty: -1, reason: buildReason(m, "nota") }));
    assert.equal(c.clase, "MERMA", m);
  }
  const r = resumirMerma(
    [mov({ qty: -0.5, reason: buildReason("DEGUSTACION", null) })],
    new Map([["vacio", { nombre: "Vacío", unidad: "kg", saleUnit: "WEIGHT", costo: 10000 }]]),
  );
  assert.deepEqual(r.mermaPorMotivo["Degustación"], { kg: 0.5, unidades: 0 });
  assert.equal(r.merma.pesos, 5000);
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

test("la pieza que entra a un despiece no es merma ni 'Otro': se convirtió en cortes", () => {
  const pieza = mov({ productId: "vacio", qty: -100, reason: motivoDeDespiece(3, "Media res") });
  assert.deepEqual(clasificarAjuste(pieza), { clase: "EXCLUIDO", porQue: "despiece" });
  const r = resumirMerma([pieza, mov({ productId: "vacio", qty: -1.5, reason: buildReason("MERMA", null) })], PRODUCTOS);
  assert.equal(r.excluidos.despiece, 1);
  assert.equal(r.otro.movimientos, 0, "antes figuraba como 'Otro' negativo en el tablero");
  assert.equal(r.merma.kg, 1.5, "la merma de verdad sigue contando");
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

// ── "Ajustes recientes" de Mermas: sin traslados y sin la pieza de un despiece ──────────────
//
// El `where` se evalúa acá con las reglas de SQL que importan (un NOT sobre NULL da NULL, y la
// fila se cae), sobre filas de verdad: las que escribe un despiece, un traslado, una merma y un
// ajuste sin motivo. Medido además contra el Postgres local como app_rls (entrega de la tanda).

type FilaAjuste = { tenantId: string; type: string; createdBy: string; reason: string | null };
type Cond = Record<string, unknown>;
/** true / false / null (desconocido), como SQL. */
function evaluar(w: Cond, f: FilaAjuste): boolean | null {
  let r: boolean | null = true;
  const y = (a: boolean | null, b: boolean | null) => (a === false || b === false ? false : a === null || b === null ? null : true);
  for (const [k, v] of Object.entries(w)) {
    let x: boolean | null;
    if (k === "AND") x = (v as Cond[]).reduce<boolean | null>((acc, c) => y(acc, evaluar(c, f)), true);
    else if (k === "OR") {
      const vs = (v as Cond[]).map((c) => evaluar(c, f));
      x = vs.includes(true) ? true : vs.includes(null) ? null : false;
    } else if (k === "NOT") {
      const n = evaluar(v as Cond, f);
      x = n === null ? null : !n;
    } else {
      const col = f[k as keyof FilaAjuste];
      if (v === null) x = col === null;
      else if (typeof v === "object" && v && "startsWith" in v) x = col === null ? null : String(col).startsWith(String((v as { startsWith: string }).startsWith));
      else x = col === v;
    }
    r = y(r, x);
  }
  return r;
}

test("Ajustes recientes: la pieza de un despiece y un traslado NO aparecen; una merma y un ajuste sin motivo, sí", () => {
  const filas: (FilaAjuste & { que: string })[] = [
    { que: "despiece", tenantId: "t", type: "AJUSTE", createdBy: "user:u1", reason: motivoDeDespiece(7, "Media res") },
    { que: "traslado", tenantId: "t", type: "AJUSTE", createdBy: "traslado:tr1", reason: "Traslado a Canning" },
    { que: "merma", tenantId: "t", type: "AJUSTE", createdBy: "user:u1", reason: buildReason("ROTURA", "se cayó") },
    { que: "sin-motivo", tenantId: "t", type: "AJUSTE", createdBy: "user:u1", reason: null },
    { que: "otro-negocio", tenantId: "t2", type: "AJUSTE", createdBy: "user:u1", reason: buildReason("ROTURA", "x") },
  ];
  const w = whereAjustesRecientes("t") as unknown as Cond;
  assert.deepEqual(
    filas.filter((f) => evaluar(w, f) === true).map((f) => f.que),
    ["merma", "sin-motivo"],
  );
  // El mismo criterio que el tablero: lo que el where saca, `clasificarAjuste` lo excluye.
  for (const f of filas.filter((x) => x.que === "despiece" || x.que === "traslado")) {
    assert.equal(clasificarAjuste({ ...f, productId: "media-res", qty: -100 }).clase, "EXCLUIDO");
  }
});
