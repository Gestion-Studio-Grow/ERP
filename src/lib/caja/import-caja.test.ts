// Pruebas de la lógica pura del importador del histórico de caja.
//
// Lo que importa acá: que el parseo no rompa con lo que trae una planilla real
// (comillas, comas, tildes, ñ), que la validación rechace sin "interpretar", y que el
// plan de inserción sea IDEMPOTENTE por multiconjunto (dos filas legítimas iguales
// entran las dos; correr de nuevo no inserta ninguna).

import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCsv,
  parseCajaCsv,
  parseCents,
  normalizeDetail,
  dedupKey,
  planImport,
  applyDudosoPolicy,
  aggregate,
  aggKey,
  reconcile,
  coveredByCsv,
  importMarker,
  importRowId,
  centsOf,
  fmtCents,
  CSV_COLUMNS,
  type ImportRow,
  type ExistingRow,
} from "./import-caja";

const HEADER = CSV_COLUMNS.join(",");

function csv(...lines: string[]): string {
  return [HEADER, ...lines].join("\n") + "\n";
}

function existing(over: Partial<ExistingRow> & { cents: number }): ExistingRow {
  return {
    id: over.id ?? "x1",
    createdBy: over.createdBy ?? "user:abc",
    fecha: over.fecha ?? "2026-05-10",
    type: over.type ?? "INGRESO",
    method: over.method ?? "MP",
    cents: over.cents,
    detail: over.detail ?? "Seña María",
  };
}

// ── parseCsv (RFC 4180) ─────────────────────────────────────────────────────

test("parseCsv: comillas, comas y comillas escapadas dentro del campo", () => {
  const rows = parseCsv('a,"b, c","d ""e"" f"\n1,2,3\n');
  assert.deepEqual(rows, [["a", "b, c", 'd "e" f'], ["1", "2", "3"]]);
});

test("parseCsv: CRLF, BOM y salto de línea dentro de comillas", () => {
  const rows = parseCsv('﻿a,b\r\n"línea\npartida",ñ\r\n');
  assert.deepEqual(rows, [["a", "b"], ["línea\npartida", "ñ"]]);
});

test("parseCsv: última línea sin salto final también cuenta", () => {
  assert.deepEqual(parseCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
});

test("parseCsv: comilla sin cerrar es error, no una fila inventada", () => {
  assert.throws(() => parseCsv('a,"b\n1,2\n'), /comilla sin cerrar/);
});

// ── parseCents / normalizeDetail ────────────────────────────────────────────

test("parseCents: acepta hasta 2 decimales con punto; rechaza coma, signo, cero y 3 decimales", () => {
  assert.equal(parseCents("1234"), 123400);
  assert.equal(parseCents("1234.5"), 123450);
  assert.equal(parseCents("0.07"), 7);
  assert.equal(parseCents(" 99.99 "), 9999);
  assert.equal(parseCents("1234,50"), null);
  assert.equal(parseCents("-10"), null);
  assert.equal(parseCents("0"), null);
  assert.equal(parseCents("1.005"), null);
  assert.equal(parseCents("1e3"), null);
  assert.equal(parseCents(""), null);
});

test("normalizeDetail: colapsa espacios y respeta tildes, ñ y mayúsculas", () => {
  assert.equal(normalizeDetail("  Seña   María\tÁlvarez "), "Seña María Álvarez");
});

// ── parseCajaCsv ────────────────────────────────────────────────────────────

test("parseCajaCsv: fila completa con detalle entre comillas, coma y ñ", () => {
  const { rows, rejected } = parseCajaCsv(
    csv('2026-05-10,"Seña, Núñez ""la de siempre""",INGRESO,MP,1234.5,caja.xlsx,Mayo,12,alta,'),
  );
  assert.equal(rejected.length, 0);
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.line, 2);
  assert.equal(r.fecha, "2026-05-10");
  assert.equal(r.detail, 'Seña, Núñez "la de siempre"');
  assert.equal(r.type, "INGRESO");
  assert.equal(r.method, "MP");
  assert.equal(r.cents, 123450);
  assert.equal(r.amount, 1234.5);
  assert.equal(r.confianza, "alta");
  assert.deepEqual(r.origen, { archivo: "caja.xlsx", hoja: "Mayo", fila: "12" });
});

test("parseCajaCsv: columnas en otro orden se aceptan; columna faltante frena todo", () => {
  const reordered = "monto,fecha,tipo,medio,detalle,confianza,nota,origen_fila,origen_hoja,origen_archivo";
  const { rows } = parseCajaCsv(`${reordered}\n500,2026-05-10,EGRESO,EFECTIVO,Taxi,corregido,,3,Mayo,c.xlsx\n`);
  assert.equal(rows[0].cents, 50000);
  assert.equal(rows[0].type, "EGRESO");
  assert.throws(() => parseCajaCsv("fecha,detalle,tipo\n2026-05-10,x,INGRESO\n"), /columna obligatoria "medio"/);
});

test("parseCajaCsv: cada fila inválida va a rechazadas con línea y motivos, el resto sigue", () => {
  const { rows, rejected } = parseCajaCsv(
    csv(
      "2026-05-10,Ok,INGRESO,MP,100,a,h,1,alta,",
      "2026-02-30,Fecha imposible,INGRESO,MP,100,a,h,2,alta,",
      "2026-05-10,,INGRESO,MP,100,a,h,3,alta,",
      "2026-05-10,Tipo raro,VENTA,MP,100,a,h,4,alta,",
      "2026-05-10,Medio raro,INGRESO,TRANSFERENCIA,100,a,h,5,alta,",
      "2026-05-10,Monto con coma,INGRESO,MP,\"1.234,50\",a,h,6,alta,",
      "2026-05-10,Confianza rara,INGRESO,MP,100,a,h,7,media,",
      "2026-05-10,Faltan columnas,INGRESO",
      "",
      "2026-05-11,Ok también,EGRESO,EFECTIVO,0.5,a,h,9,dudoso,revisar",
    ),
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.line), [2, 11]);
  assert.deepEqual(
    rejected.map((r) => [r.line, r.reason]),
    [
      [3, 'fecha inválida "2026-02-30"'],
      [4, "detalle vacío"],
      [5, 'tipo inválido "VENTA"'],
      [6, 'medio inválido "TRANSFERENCIA"'],
      [7, 'monto inválido "1.234,50"'],
      [8, 'confianza inválida "media"'],
      [9, "faltan columnas (3 de 10)"],
    ],
  );
});

// ── Dudoso ──────────────────────────────────────────────────────────────────

test("applyDudosoPolicy: excluir separa las dudosas; incluir las deja pasar", () => {
  const { rows } = parseCajaCsv(
    csv("2026-05-10,A,INGRESO,MP,100,a,h,1,alta,", "2026-05-10,B,INGRESO,MP,100,a,h,2,dudoso,"),
  );
  const ex = applyDudosoPolicy(rows, "excluir");
  assert.deepEqual(ex.kept.map((r) => r.detail), ["A"]);
  assert.deepEqual(ex.dudosoExcluded.map((r) => r.detail), ["B"]);
  const inc = applyDudosoPolicy(rows, "incluir");
  assert.equal(inc.kept.length, 2);
  assert.equal(inc.dudosoExcluded.length, 0);
});

// ── Clave + plan (idempotencia por multiconjunto) ───────────────────────────

function rowsOf(...lines: string[]): ImportRow[] {
  const { rows, rejected } = parseCajaCsv(csv(...lines));
  assert.equal(rejected.length, 0);
  return rows;
}

test("dedupKey: sólo contenido contable — origen, confianza y nota no cambian la clave", () => {
  const [a, b] = rowsOf(
    "2026-05-10,Seña María,INGRESO,MP,1000,x.xlsx,Mayo,1,alta,",
    "2026-05-10,Seña   María,INGRESO,MP,1000.00,y.xlsx,Otra,99,dudoso,nota",
  );
  assert.equal(dedupKey(a), dedupKey(b));
  assert.equal(dedupKey(a), "2026-05-10|INGRESO|MP|100000|Seña María");
});

test("planImport: base vacía → todo se inserta, en orden de CSV", () => {
  const rows = rowsOf("2026-05-10,A,INGRESO,MP,100,a,h,1,alta,", "2026-05-11,B,EGRESO,EFECTIVO,50,a,h,2,alta,");
  const plan = planImport(rows, [], importMarker("deadbeef"));
  assert.deepEqual(plan.toInsert.map((r) => r.detail), ["A", "B"]);
  assert.equal(plan.alreadyExisting.length, 0);
  assert.equal(plan.orphanMarked.length, 0);
});

test("planImport: dos filas legítimas iguales el mismo día entran las dos", () => {
  const rows = rowsOf(
    "2026-05-10,Seña María,INGRESO,MP,1000,a,h,1,alta,",
    "2026-05-10,Seña María,INGRESO,MP,1000,a,h,2,alta,",
  );
  const plan = planImport(rows, [], importMarker("m"));
  assert.equal(plan.toInsert.length, 2);
});

test("planImport: segunda corrida sobre lo ya insertado no inserta nada (idempotente)", () => {
  const rows = rowsOf(
    "2026-05-10,Seña María,INGRESO,MP,1000,a,h,1,alta,",
    "2026-05-10,Seña María,INGRESO,MP,1000,a,h,2,alta,",
    "2026-05-12,Taxi,EGRESO,EFECTIVO,15.5,a,h,3,alta,",
  );
  const marker = importMarker("m");
  const inDb: ExistingRow[] = rows.map((r) => ({
    id: importRowId("m", r.line),
    createdBy: marker,
    fecha: r.fecha,
    type: r.type,
    method: r.method,
    cents: r.cents,
    detail: r.detail,
  }));
  const plan = planImport(rows, inDb, marker);
  assert.equal(plan.toInsert.length, 0);
  assert.equal(plan.alreadyExisting.length, 3);
  assert.equal(plan.orphanMarked.length, 0);
});

test("planImport: multiconjunto — CSV trae 2, la base tiene 1 → inserta exactamente 1 (la última del CSV)", () => {
  const rows = rowsOf(
    "2026-05-10,Seña María,INGRESO,MP,1000,a,h,1,alta,",
    "2026-05-10,Seña María,INGRESO,MP,1000,a,h,2,alta,",
  );
  const plan = planImport(rows, [existing({ cents: 100000 })], importMarker("m"));
  assert.deepEqual(plan.alreadyExisting.map((r) => r.line), [2]);
  assert.deepEqual(plan.toInsert.map((r) => r.line), [3]);
});

test("planImport: una fila cargada A MANO con la misma clave cuenta como existente (no se duplica)", () => {
  const rows = rowsOf("2026-05-10,Seña María,INGRESO,MP,1000,a,h,1,alta,");
  const plan = planImport(rows, [existing({ cents: 100000, createdBy: "user:zzz" })], importMarker("m"));
  assert.equal(plan.toInsert.length, 0);
  assert.equal(plan.alreadyExisting.length, 1);
});

test("planImport: distinto monto/medio/tipo/fecha/detalle → clave distinta → se inserta", () => {
  const rows = rowsOf(
    "2026-05-10,Seña María,INGRESO,MP,1000.01,a,h,1,alta,",
    "2026-05-10,Seña María,INGRESO,EFECTIVO,1000,a,h,2,alta,",
    "2026-05-10,Seña María,EGRESO,MP,1000,a,h,3,alta,",
    "2026-05-11,Seña María,INGRESO,MP,1000,a,h,4,alta,",
    "2026-05-10,Seña Maria,INGRESO,MP,1000,a,h,5,alta,",
  );
  const plan = planImport(rows, [existing({ cents: 100000 })], importMarker("m"));
  assert.equal(plan.toInsert.length, 5);
});

test("planImport: filas marcadas de un CSV anterior que ya no están en el CSV se reportan como huérfanas", () => {
  const rows = rowsOf("2026-05-10,Seña María,INGRESO,MP,1000,a,h,1,alta,");
  const marker = importMarker("m");
  const stale = existing({ id: "old", cents: 99900, detail: "Seña María", createdBy: marker });
  const manual = existing({ id: "man", cents: 77700, detail: "Otra cosa", createdBy: "user:abc" });
  const plan = planImport(rows, [stale, manual], marker);
  assert.deepEqual(plan.orphanMarked.map((e) => e.id), ["old"]);
  assert.equal(plan.toInsert.length, 1);
});

// ── Marca e ids ─────────────────────────────────────────────────────────────

test("importMarker / importRowId: determinísticos, distintos por archivo y por línea", () => {
  assert.equal(importMarker("abcd1234"), "import:caja-historica:abcd1234");
  assert.equal(importRowId("abcd1234", 2), "imcabcd12340000002");
  assert.notEqual(importRowId("abcd1234", 2), importRowId("abcd1234", 3));
  assert.notEqual(importRowId("abcd1234", 2), importRowId("ffff0000", 2));
  // El orden lexicográfico de los ids sigue el orden de línea del CSV (saldo corrido).
  assert.ok(importRowId("a", 9) < importRowId("a", 10));
  assert.ok(importRowId("a", 999) < importRowId("a", 1000));
});

// ── Agregación y reconciliación ─────────────────────────────────────────────

test("aggregate: mes × medio × tipo en centavos, sin errores de coma flotante", () => {
  const rows = rowsOf(
    "2026-05-10,A,INGRESO,MP,0.1,a,h,1,alta,",
    "2026-05-20,B,INGRESO,MP,0.2,a,h,2,alta,",
    "2026-05-31,C,EGRESO,MP,0.3,a,h,3,alta,",
    "2026-06-01,D,INGRESO,EFECTIVO,1000,a,h,4,alta,",
  );
  const agg = aggregate(rows);
  assert.equal(agg.get(aggKey("2026-05", "MP", "INGRESO")), 30);
  assert.equal(agg.get(aggKey("2026-05", "MP", "EGRESO")), 30);
  assert.equal(agg.get(aggKey("2026-06", "EFECTIVO", "INGRESO")), 100000);
  assert.equal(agg.size, 3);
});

test("reconcile: vacío cuando cierran; lista cada clave que difiere, incluidas las que faltan de un lado", () => {
  const a = new Map([[aggKey("2026-05", "MP", "INGRESO"), 100]]);
  assert.deepEqual(reconcile(a, new Map(a)), []);
  const b = new Map([
    [aggKey("2026-05", "MP", "INGRESO"), 99],
    [aggKey("2026-06", "MP", "INGRESO"), 5],
  ]);
  assert.deepEqual(reconcile(a, b), [
    { key: "2026-05|MP|INGRESO", csvCents: 100, dbCents: 99 },
    { key: "2026-06|MP|INGRESO", csvCents: 0, dbCents: 5 },
  ]);
});

test("coveredByCsv: toma de la base como mucho tantas filas por clave como trae el CSV", () => {
  const rows = rowsOf(
    "2026-05-10,Seña María,INGRESO,MP,1000,a,h,1,alta,",
    "2026-05-10,Seña María,INGRESO,MP,1000,a,h,2,alta,",
  );
  const db = [
    existing({ id: "1", cents: 100000 }),
    existing({ id: "2", cents: 100000 }),
    existing({ id: "3", cents: 100000 }), // triplicado a mano: no entra en el cubierto
    existing({ id: "4", cents: 5, detail: "Otra" }), // no está en el CSV
  ];
  assert.deepEqual(coveredByCsv(rows, db).map((e) => e.id), ["1", "2"]);
  // Y el cubierto reconcilia al centavo con el CSV.
  assert.deepEqual(reconcile(aggregate(rows), aggregate(coveredByCsv(rows, db))), []);
});

test("centsOf / fmtCents: ida y vuelta de la plata", () => {
  assert.equal(centsOf(1234.5), 123450);
  assert.equal(centsOf(0.1 + 0.2), 30);
  assert.equal(fmtCents(123450), "$1.234,50");
  assert.equal(fmtCents(-7), "-$0,07");
  assert.equal(fmtCents(100000000), "$1.000.000,00");
});
