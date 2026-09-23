// El costo vigente es UNO: se ejecuta la regla con los datos que la rompían (el corte que sale
// de un despiece, la compra de antes del registro de movimientos, el costo cargado a mano).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  costoVigente,
  costosVigentesDe,
  costosVigentesEnTx,
  ultimoIngresoConCosto,
  ultimoIngresoDe,
  type IngresosLeidos,
} from "./costo";

const d = (s: string) => new Date(`${s}T12:00:00.000Z`);

test("el costo del catálogo (Product.cost) manda; si no, el último ingreso; si no, sin costo (nunca 0)", () => {
  assert.equal(costoVigente(7000, 8000), 7000);
  assert.equal(costoVigente(null, 8000), 8000);
  assert.equal(costoVigente(0, 8000), 8000, "un 0 en el catálogo es un dato que falta, no un costo");
  assert.equal(costoVigente(undefined, null), null);
  assert.equal(costoVigente(-5, 0), null);
});

test("último ingreso con costo: gana la FECHA, venga del registro o de la compra; los sin costo no cuentan", () => {
  assert.equal(
    ultimoIngresoConCosto([
      { unitCost: 6000, fecha: d("2026-09-01") },
      { unitCost: 6543, fecha: d("2026-09-10") },
      { unitCost: null, fecha: d("2026-09-20") }, // reposición sin costo: no borra el costo
      { unitCost: 0, fecha: d("2026-09-21") },
    ]),
    6543,
  );
  assert.equal(ultimoIngresoConCosto([]), null);
});

test("el corte de un despiece (REPOSICION con costo, sin compra) tiene costo; antes Stock y Margen lo daban 'sin costo'", () => {
  const despiece: IngresosLeidos = { stockMovements: [{ unitCost: 9100, createdAt: d("2026-09-15") }], purchaseItems: [] };
  assert.equal(ultimoIngresoDe(despiece), 9100);
});

test("una compra de antes del registro de movimientos (sólo StockPurchaseItem) también cuenta", () => {
  const vieja: IngresosLeidos = { stockMovements: [], purchaseItems: [{ unitCost: 13500, purchase: { createdAt: d("2026-06-01") } }] };
  assert.equal(ultimoIngresoDe(vieja), 13500);
  // Y si después hubo un despiece más nuevo, manda el más nuevo.
  const ambas: IngresosLeidos = {
    stockMovements: [{ unitCost: 9100, createdAt: d("2026-09-15") }],
    purchaseItems: [{ unitCost: 13500, purchase: { createdAt: d("2026-06-01") } }],
  };
  assert.equal(ultimoIngresoDe(ambas), 9100);
});

test("el vacío cuesta lo mismo en Stock, Catálogo y Margen: los tres usan costosVigentesDe", () => {
  const productos = [
    { id: "vacio", stockMovements: [{ unitCost: 6543, createdAt: d("2026-09-10") }], purchaseItems: [{ unitCost: 6000, purchase: { createdAt: d("2026-09-01") } }] },
    { id: "lomo", stockMovements: [], purchaseItems: [] },
    { id: "entrana", stockMovements: [{ unitCost: 8000, createdAt: d("2026-09-10") }], purchaseItems: [] },
  ];
  assert.deepEqual(costosVigentesDe(productos, new Map([["entrana", 8500]])), {
    vacio: 6543,
    lomo: null,
    entrana: 8500,
  });
});

test("adentro de una transacción: UNA consulta con el negocio escrito, y el float8 que llega como texto se lee", async () => {
  const consultas: { sql: string; valores: unknown[] }[] = [];
  const tx = {
    $queryRaw: async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      consultas.push({ sql: partes.join("?"), valores });
      return [
        { id: "vacio", catalogo: null, ultimo: "6543" },
        { id: "lomo", catalogo: 9000, ultimo: 8000 },
      ];
    },
  };
  const m = await costosVigentesEnTx(tx as never, "t-qa", ["vacio", "lomo", "vacio", ""]);
  assert.equal(consultas.length, 1);
  assert.ok(consultas[0].valores.filter((v) => v === "t-qa").length >= 3, "el tenantId va en cada tabla");
  assert.deepEqual(consultas[0].valores.at(-1), ["vacio", "lomo"], "ids sin repetir ni vacíos");
  assert.match(consultas[0].sql, /to_jsonb\(p\) ->> 'cost'/, "Product.cost sin nombrar una columna que puede no existir");
  assert.equal(m.get("vacio"), 6543);
  assert.equal(m.get("lomo"), 9000);
  assert.deepEqual(await costosVigentesEnTx(tx as never, "t-qa", []), new Map());
  assert.equal(consultas.length, 1, "sin productos no consulta");
});

test("el despiece no pisa Product.cost: una compra posterior del mismo corte le gana a su costo", async () => {
  const { readFileSync } = await import("node:fs");
  // La escritura del despiece vive en despiece-registro.ts (registrarDespieceEnTx): cada corte
  // entra con SU costo (valor relativo, despiece.ts), no con un costo parejo por kilo.
  const src = readFileSync("src/lib/carniceria/despiece-registro.ts", "utf8");
  assert.ok(!/UPDATE\s+"Product"\s+SET\s+"cost"/i.test(src), "el despiece volvió a escribir Product.cost");
  assert.match(src, /type: "REPOSICION",[\s\S]{0,80}unitCost: e\.unitCost/, "su costo viaja en la REPOSICION");
  // Con Product.cost vacío (nadie lo fijó a mano), manda el último ingreso: la compra del 20
  // le gana al despiece del 15. Si el despiece hubiera escrito Product.cost, ganaría el 9100.
  const corte: IngresosLeidos = {
    stockMovements: [{ unitCost: 9100, createdAt: d("2026-09-15") }], // REPOSICION del despiece
    purchaseItems: [{ unitCost: 9800, purchase: { createdAt: d("2026-09-20") } }],
  };
  assert.equal(costoVigente(null, ultimoIngresoDe(corte)), 9800);
  assert.equal(costoVigente(9100, ultimoIngresoDe(corte)), 9100, "lo que pasaba cuando el despiece escribía Product.cost");
});
