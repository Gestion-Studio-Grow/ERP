// Pruebas del export del libro de caja. Lo que se protege acá es que el archivo que
// recibe la contadora sea USABLE: números que Excel es-AR pueda sumar, y filas que no
// se partan cuando el detalle trae el mismo caracter que separa las columnas.

import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@/generated/prisma/client";
import { isColumnMissing } from "@/lib/prisma-errors";
import { buildLibroCsv } from "./libro-csv";
import {
  buildLibro,
  CASH_METHOD_LABEL,
  clasificarOrigen,
  egresosPorOrigen,
  leerSinColumnasFaltantes,
  movimientoDelLedger,
  totalOf,
  zeroAmounts,
  type FilaLedger,
  type LibroMovement,
} from "./libro-caja";

const deps = {
  methodLabel: (m: "EFECTIVO" | "MP" | "TARJETA") => CASH_METHOD_LABEL[m],
  monthLabel: "septiembre 2026",
  totalOf,
};

function mov(over: Partial<LibroMovement> & { amount: number }): LibroMovement {
  return {
    id: over.id ?? "m1",
    occurredAt: over.occurredAt ?? new Date("2026-09-10T15:00:00.000Z"),
    type: over.type ?? "INGRESO",
    method: over.method ?? "EFECTIVO",
    amount: over.amount,
    detail: over.detail ?? "detalle",
  };
}

test("el CSV lleva el resumen arriba y después los movimientos", () => {
  const libro = buildLibro(zeroAmounts(), [mov({ amount: 1000 })]);
  const csv = buildLibroCsv(libro, deps);
  assert.ok(csv.startsWith("Libro de caja — septiembre 2026"));
  assert.ok(csv.includes("RESUMEN"));
  assert.ok(csv.includes("Saldo actual"));
  assert.ok(csv.includes("Fecha;Detalle;Medio;Ingreso;Egreso;Saldo"));
});

test("los importes usan COMA decimal para que Excel es-AR los sume", () => {
  const libro = buildLibro(zeroAmounts(), [mov({ amount: 1234.5 })]);
  const csv = buildLibroCsv(libro, deps);
  // Con punto decimal Excel es-AR lo lee como TEXTO y no se puede sumar.
  assert.ok(csv.includes("1234,50"), csv);
  assert.ok(!csv.includes("1234.50"));
});

test("un detalle con punto y coma no parte la fila", () => {
  const libro = buildLibro(zeroAmounts(), [mov({ amount: 100, detail: "Seña; saldo pendiente" })]);
  const csv = buildLibroCsv(libro, deps);
  assert.ok(csv.includes('"Seña; saldo pendiente"'));
  // La fila de movimiento sigue teniendo sus 8 columnas (6 de siempre + Origen y Referencia).
  const fila = csv.split("\r\n").find((l) => l.includes("Seña"))!;
  assert.equal(fila.split(";").length, 9); // 8 columnas, 1 separador extra dentro de las comillas
});

test("un detalle con comillas las duplica (RFC 4180)", () => {
  const libro = buildLibro(zeroAmounts(), [mov({ amount: 100, detail: 'Vale "el pibe"' })]);
  assert.ok(buildLibroCsv(libro, deps).includes('"Vale ""el pibe"""'));
});

test("ingreso y egreso van en columnas distintas y el saldo acompaña", () => {
  const libro = buildLibro(zeroAmounts(), [
    mov({ id: "a", amount: 1000, type: "INGRESO", occurredAt: new Date("2026-09-01T15:00:00Z") }),
    mov({ id: "b", amount: 400, type: "EGRESO", occurredAt: new Date("2026-09-02T15:00:00Z") }),
  ]);
  const lineas = buildLibroCsv(libro, deps).split("\r\n");
  const ing = lineas.find((l) => l.startsWith("2026-09-01"))!;
  const egr = lineas.find((l) => l.startsWith("2026-09-02"))!;
  assert.equal(ing.split(";")[3], "1000,00"); // columna Ingreso
  assert.equal(ing.split(";")[4], ""); // Egreso vacío
  assert.equal(egr.split(";")[3], ""); // Ingreso vacío
  assert.equal(egr.split(";")[4], "400,00");
  assert.equal(egr.split(";")[5], "600,00"); // saldo corrido
});

test("la fecha va en ISO, que ordena bien en cualquier planilla", () => {
  const libro = buildLibro(zeroAmounts(), [mov({ amount: 10, occurredAt: new Date("2026-09-06T15:00:00Z") })]);
  assert.ok(buildLibroCsv(libro, deps).includes("2026-09-06"));
});

test("un mes sin movimientos exporta el resumen y lo dice", () => {
  const csv = buildLibroCsv(buildLibro(zeroAmounts(), []), deps);
  assert.ok(csv.includes("(sin movimientos en el mes)"));
  assert.ok(csv.includes("RESUMEN"));
  assert.ok(csv.includes("(sin egresos)"));
});

// ── Origen y Referencia: una fila de CADA marca, pasada por el mismo camino que el loader ──
//
// Las filas se arman con `movimientoDelLedger` desde lo que guarda `CashMovement` (con su
// `createdBy` real, actor incluido), igual que `getLibroCajaData`. Así se ejecuta la
// clasificación de verdad, no un fixture que ya trae la respuesta puesta.

const ACTOR = "user:u_dueña_99";

function ledger(over: Partial<FilaLedger> & Pick<FilaLedger, "id" | "type" | "amount" | "createdBy">): FilaLedger {
  return {
    occurredAt: new Date("2026-09-10T15:00:00.000Z"),
    method: "EFECTIVO",
    reason: over.id, // el detalle es el id: así se encuentra la línea en el CSV
    orderId: null,
    collectionId: null,
    paymentId: null,
    ...over,
  };
}

// [fila del ledger, Origen esperado, Referencia esperada]
const UNA_DE_CADA: [FilaLedger, string, string][] = [
  [ledger({ id: "compra", type: "EGRESO", amount: 5000, createdBy: "compra:pur_1" }), "Compra a proveedor", "pur_1"],
  [ledger({ id: "comision", type: "EGRESO", amount: 3000, createdBy: "comision:pay_1" }), "Comisión", "pay_1"],
  [
    ledger({ id: "anula-turno", type: "EGRESO", method: "MP", amount: 2000, createdBy: `anulacion-turno:${ACTOR}`, collectionId: "col_7" }),
    "Anulación",
    "col_7",
  ],
  [
    // La anulación de una venta es un EGRESO que TRAE orderId: por tipo sería otra cosa.
    ledger({ id: "anula-venta", type: "EGRESO", method: "TARJETA", amount: 1500, createdBy: `anulacion-venta:${ACTOR}`, orderId: "ord_3" }),
    "Anulación",
    "ord_3",
  ],
  [ledger({ id: "cierre", type: "EGRESO", amount: 100, createdBy: "cierre-diario:2026-09-05" }), "Diferencia de caja", "2026-09-05"],
  [ledger({ id: "arqueo", type: "INGRESO", amount: 50, createdBy: "arqueo-turno:ses_4" }), "Diferencia de caja", "ses_4"],
  [ledger({ id: "corte", type: "INGRESO", amount: 10000, createdBy: "corte-inicial:2026-08-31" }), "Corte/Importación", "2026-08-31"],
  [ledger({ id: "import", type: "INGRESO", method: "MP", amount: 800, createdBy: "import:caja-historica:ab12cd34" }), "Corte/Importación", "ab12cd34"],
  // Cuenta corriente (con CUENTAS_CORRIENTES_ENABLED): el cobro de un fiado y el pago a un
  // proveedor llevan la MISMA marca; el sentido lo da el tipo. No son "a mano".
  [ledger({ id: "cobro-cc", type: "INGRESO", method: "MP", amount: 1200, createdBy: "cuenta-corriente:col_11" }), "Cobro de cuenta corriente", "col_11"],
  [ledger({ id: "pago-cc", type: "EGRESO", amount: 900, createdBy: "cuenta-corriente:col_12" }), "Pago a proveedor", "col_12"],
  [ledger({ id: "gasto-a-mano", type: "EGRESO", amount: 700, createdBy: ACTOR }), "Egreso manual", ""],
  [ledger({ id: "ingreso-a-mano", type: "INGRESO", amount: 300, createdBy: ACTOR }), "Ingreso manual", ""],
  [ledger({ id: "venta-pos", type: "VENTA", method: "MP", amount: 4000, createdBy: ACTOR, orderId: "ord_1" }), "Venta mostrador", "ord_1"],
  [ledger({ id: "cobro-turno", type: "VENTA", amount: 6000, createdBy: ACTOR, collectionId: "col_2" }), "Cobro turno", "col_2"],
  // Cobro de turno anterior a los cobros parciales: sólo tiene el `Payment` 1:1.
  [ledger({ id: "cobro-turno-viejo", type: "VENTA", amount: 2500, createdBy: ACTOR, paymentId: "pmt_9" }), "Cobro turno", "pmt_9"],
];

function csvDeUnaDeCada() {
  const libro = buildLibro(zeroAmounts(), UNA_DE_CADA.map(([f]) => movimientoDelLedger(f)));
  return { libro, csv: buildLibroCsv(libro, deps) };
}

test("una fila de cada marca: las columnas 0 a 5 no cambian y Origen/Referencia van al final", () => {
  const { libro, csv } = csvDeUnaDeCada();
  const lineas = csv.split("\r\n");
  assert.ok(lineas.includes("Fecha;Detalle;Medio;Ingreso;Egreso;Saldo;Origen;Referencia"));

  for (const r of libro.rows) {
    const cols = lineas.find((l) => l.split(";")[1] === r.detail)!.split(";");
    assert.equal(cols.length, 8, r.detail);
    // 0-5: lo de siempre, en el mismo lugar.
    assert.equal(cols[0], "2026-09-10");
    assert.equal(cols[1], r.detail);
    assert.equal(cols[2], CASH_METHOD_LABEL[r.method]);
    assert.equal(cols[3], r.signedAmount > 0 ? r.amount.toFixed(2).replace(".", ",") : "");
    assert.equal(cols[4], r.signedAmount < 0 ? r.amount.toFixed(2).replace(".", ",") : "");
    assert.equal(cols[5], r.runningTotal.toFixed(2).replace(".", ","));
  }

  for (const [fila, origen, referencia] of UNA_DE_CADA) {
    const cols = lineas.find((l) => l.split(";")[1] === fila.id)!.split(";");
    assert.equal(cols[6], origen, `Origen de ${fila.id}`);
    assert.equal(cols[7], referencia, `Referencia de ${fila.id}`);
  }
});

test("ningún campo del CSV lleva el actor 'user:<id>' (el archivo sale hacia el estudio)", () => {
  const { csv } = csvDeUnaDeCada();
  assert.ok(!csv.includes("user:"), csv);
  // Y la fila del libro ni siquiera lo transporta: el loader es un endpoint.
  for (const [f] of UNA_DE_CADA) assert.ok(!("createdBy" in movimientoDelLedger(f)));
});

test("una marca que terminaría en un actor no se usa como referencia", () => {
  // Defensa: si algún día una compra se firmara con el actor, la referencia queda vacía.
  assert.deepEqual(clasificarOrigen({ type: "EGRESO", createdBy: `compra:${ACTOR}` }), {
    origen: "compra",
    referencia: "",
  });
});

test("el RESUMEN abre los egresos por origen y por medio, y suman lo mismo que 'Egresos (-)'", () => {
  const { libro, csv } = csvDeUnaDeCada();
  const lineas = csv.split("\r\n");
  const inicio = lineas.findIndex((l) => l.startsWith("EGRESOS POR ORIGEN"));
  assert.ok(inicio > 0 && inicio < lineas.findIndex((l) => l.startsWith("Fecha;")), "va arriba, antes de los movimientos");
  const bloque = new Map<string, string[]>();
  for (let i = inicio + 1; lineas[i] !== ""; i++) {
    const [rotulo, ...resto] = lineas[i].split(";");
    bloque.set(rotulo, resto);
  }
  // Efectivo; MP; Tarjeta; Total
  assert.deepEqual(bloque.get("Compra a proveedor"), ["5000,00", "0,00", "0,00", "5000,00"]);
  assert.deepEqual(bloque.get("Comisión"), ["3000,00", "0,00", "0,00", "3000,00"]);
  assert.deepEqual(bloque.get("Anulación"), ["0,00", "2000,00", "1500,00", "3500,00"]);
  assert.deepEqual(bloque.get("Diferencia de caja"), ["100,00", "0,00", "0,00", "100,00"]);
  assert.deepEqual(bloque.get("Egreso manual"), ["700,00", "0,00", "0,00", "700,00"]);
  // Los orígenes que sólo ingresan no aparecen en un subtotal de EGRESOS.
  assert.equal(bloque.has("Venta mostrador"), false);
  assert.equal(bloque.has("Corte/Importación"), false);

  const sumado = egresosPorOrigen(libro.rows).reduce((s, x) => s + totalOf(x.egresos), 0);
  assert.equal(sumado, totalOf(libro.summary.egresos));
});

test("sin clasificación del loader (demo, fixtures) el origen sale del tipo, nunca vacío", () => {
  const libro = buildLibro(zeroAmounts(), [
    mov({ id: "a", amount: 100, type: "EGRESO", detail: "gasto" }),
    { ...mov({ id: "b", amount: 200, type: "VENTA", detail: "venta" }), origin: "pos" },
    mov({ id: "c", amount: 300, type: "VENTA", detail: "turno" }),
  ]);
  const lineas = buildLibroCsv(libro, deps).split("\r\n");
  const col = (detalle: string, i: number) => lineas.find((l) => l.split(";")[1] === detalle)!.split(";")[i];
  assert.equal(col("gasto", 6), "Egreso manual");
  assert.equal(col("venta", 6), "Venta mostrador");
  assert.equal(col("turno", 6), "Cobro turno");
  assert.equal(col("gasto", 7), "");
});

// ── Columnas de referencia que faltan en la base (P2022): el libro no se cae ──
//
// Se ejecuta la regla con errores de Prisma FABRICADOS con la forma real que produce el
// driver adapter (la columna viaja en el mensaje; ver prisma-errors.test.ts) y con el
// clasificador de producción, `isColumnMissing`.

function columnaInexistente(columna: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    `\nInvalid \`prisma.cashMovement.findMany()\` invocation:\n\n\nThe column \`CashMovement.${columna}\` does not exist in the current database.`,
    { code: "P2022", clientVersion: "7.8.0", meta: { modelName: "CashMovement" } },
  );
}

/** Una base falsa a la que le faltan `faltan`: falla como Postgres, por la primera que no encuentra. */
function baseSin(faltan: string[]) {
  const pedidos: string[][] = [];
  const leer = async (columnas: readonly string[]) => {
    pedidos.push([...columnas]);
    const ausente = columnas.find((c) => faltan.includes(c));
    if (ausente) throw columnaInexistente(ausente);
    return [{ id: "m1", ...Object.fromEntries(columnas.map((c) => [c, `${c}_1`])) }];
  };
  return { leer, pedidos };
}

test("con las dos columnas de referencia migradas se lee una sola vez, con las dos", async () => {
  const { leer, pedidos } = baseSin([]);
  const r = await leerSinColumnasFaltantes(leer, isColumnMissing);
  assert.deepEqual(pedidos, [["collectionId", "paymentId"]]);
  assert.deepEqual(r.faltantes, []);
  assert.deepEqual(r.filas, [{ id: "m1", collectionId: "collectionId_1", paymentId: "paymentId_1" }]);
});

test("el estado intermedio del runbook (sin collectionId): se relee sin ella y el libro sale", async () => {
  const { leer, pedidos } = baseSin(["collectionId"]);
  const r = await leerSinColumnasFaltantes(leer, isColumnMissing);
  assert.deepEqual(pedidos, [["collectionId", "paymentId"], ["paymentId"]]);
  assert.deepEqual(r.faltantes, ["collectionId"]);
  assert.deepEqual(r.filas, [{ id: "m1", paymentId: "paymentId_1" }]);
});

test("sin ninguna de las dos migraciones: se sacan de a una y el libro sale igual", async () => {
  const { leer, pedidos } = baseSin(["collectionId", "paymentId"]);
  const r = await leerSinColumnasFaltantes(leer, isColumnMissing);
  assert.deepEqual(pedidos, [["collectionId", "paymentId"], ["paymentId"], []]);
  assert.deepEqual(r.faltantes, ["collectionId", "paymentId"]);
  assert.deepEqual(r.filas, [{ id: "m1" }]);
});

test("un error que no es de una columna de referencia sube tal cual (no se tapa)", async () => {
  // Falta OTRA columna (p. ej. `method`, sin la cual el libro no tiene sentido): no se reintenta.
  const otra = baseSin(["method"]);
  await assert.rejects(
    leerSinColumnasFaltantes(async (cols) => otra.leer(["method", ...cols]), isColumnMissing),
    (e: unknown) => isColumnMissing(e, "method"),
  );
  // Y un error cualquiera tampoco.
  let vueltas = 0;
  await assert.rejects(
    leerSinColumnasFaltantes(async () => {
      vueltas++;
      throw new Error("conexión cortada");
    }, isColumnMissing),
    /conexión cortada/,
  );
  assert.equal(vueltas, 1);
});
