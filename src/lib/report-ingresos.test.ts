// ============================================================================
// TEST-GATE — los dos relojes de Reportes (src/lib/report-ingresos.ts).
// ============================================================================
//
// `getReportData` filtraba los pagos por `Payment.createdAt` y los agrupaba por día con
// `Appointment.startsAt`. El total nunca divergió de la suma de las filas —las dos salían
// del mismo array—, así que ningún control cruzado lo veía. Lo que mentía era cada FILA.
//
// Y no había un solo test sobre `porDia`: el del CSV le pasaba `[]`. Por eso el defecto
// sobrevivió a una auditoría de once dimensiones. Este archivo cierra ese agujero.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { agruparIngresos, bordesDelPeriodo, type PagoParaReporte } from "./report-ingresos";
import { businessWallTimeToUtc, dateStrInBusinessTz } from "./datetime";

const pago = (over: Partial<PagoParaReporte> = {}): PagoParaReporte => ({
  amount: 10000,
  cobradoEn: new Date("2026-03-11T15:00:00.000Z"), // miércoles 11, mediodía local
  profesional: "Sofía",
  servicio: "Facial",
  ...over,
});

test("el día de una fila es el del COBRO, no el del turno", () => {
  // El caso que motivó todo: un turno del lunes cobrado el miércoles. Antes sumaba al lunes
  // aunque el filtro lo hubiera dejado entrar por el miércoles.
  const r = agruparIngresos([pago()], dateStrInBusinessTz);
  assert.deepEqual(r.porDia, [{ label: "2026-03-11", total: 10000 }]);
});

test("el total y las tres tablas cierran entre sí, siempre", () => {
  const pagos = [
    pago({ amount: 10000, profesional: "Sofía", servicio: "Facial" }),
    pago({ amount: 25000, profesional: "Caro", servicio: "Uñas", cobradoEn: new Date("2026-03-12T15:00:00.000Z") }),
    pago({ amount: 5000, profesional: "Sofía", servicio: "Uñas", cobradoEn: new Date("2026-03-12T18:00:00.000Z") }),
  ];
  const r = agruparIngresos(pagos, dateStrInBusinessTz);
  assert.equal(r.totalIngresos, 40000);
  assert.equal(r.cantidadPagos, 3);
  for (const tabla of [r.porDia, r.porProfesional, r.porServicio]) {
    assert.equal(
      tabla.reduce((s, f) => s + f.total, 0),
      r.totalIngresos,
      "las tres tablas salen del mismo conjunto y el mismo reloj: tienen que dar el total",
    );
  }
  assert.deepEqual(r.porDia, [
    { label: "2026-03-12", total: 30000 },
    { label: "2026-03-11", total: 10000 },
  ]);
  assert.deepEqual(r.porProfesional, [
    { label: "Caro", total: 25000 },
    { label: "Sofía", total: 15000 },
  ]);
});

test("un cobro de las 22:00 cuenta ese día, no el siguiente", () => {
  // Argentina es UTC−3: las 22:00 del 11 son las 01:00 UTC del 12. Con el día UTC, tres
  // horas de cada día se iban a la fila del día siguiente.
  const r = agruparIngresos([pago({ cobradoEn: new Date("2026-03-12T01:00:00.000Z") })], dateStrInBusinessTz);
  assert.deepEqual(r.porDia, [{ label: "2026-03-11", total: 10000 }]);
});

test("sin pagos, todo en cero y sin filas fantasma", () => {
  const r = agruparIngresos([], dateStrInBusinessTz);
  assert.deepEqual(r, { totalIngresos: 0, cantidadPagos: 0, porDia: [], porProfesional: [], porServicio: [] });
});

// ── Los bordes del período ──────────────────────────────────────────────────

test("el período arranca a las 00:00 del primer día y termina a las 23:59:59.999 del último", () => {
  const { desde, hasta } = bordesDelPeriodo("2026-03-11", 7, businessWallTimeToUtc);
  // 7 días CONTANDO hoy: del 5 al 11.
  assert.equal(dateStrInBusinessTz(desde), "2026-03-05");
  assert.equal(dateStrInBusinessTz(hasta), "2026-03-11");
  // Y son fronteras de día, no un instante a media tarde: con `new Date()` la primera fila
  // del reporte era siempre un día PARCIAL y nada lo decía.
  assert.equal(desde.toISOString(), "2026-03-05T03:00:00.000Z", "00:00 local del 5");
  assert.equal(hasta.toISOString(), "2026-03-12T02:59:59.999Z", "23:59:59.999 local del 11");
});

test("un cobro de las 00:05 del primer día del período entra", () => {
  const { desde, hasta } = bordesDelPeriodo("2026-03-11", 7, businessWallTimeToUtc);
  const temprano = new Date("2026-03-05T03:05:00.000Z"); // 00:05 local del 5
  assert.ok(temprano >= desde && temprano <= hasta, "el borde de abajo recortaba parte del primer día");
});

test("un cobro de las 23:50 del último día del período entra", () => {
  const { desde, hasta } = bordesDelPeriodo("2026-03-11", 7, businessWallTimeToUtc);
  const tarde = new Date("2026-03-12T02:50:00.000Z"); // 23:50 local del 11
  assert.ok(tarde >= desde && tarde <= hasta, "el borde de arriba se comía la última franja del día");
});

// ── Que no vuelva el segundo reloj ──────────────────────────────────────────

test("getReportData filtra y agrupa por el MISMO reloj", () => {
  const src = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
  const desde = src.indexOf("export async function getReportData");
  assert.ok(desde > 0, "actions.ts ya no exporta getReportData");
  const sig = src.indexOf("\nexport ", desde + 1);
  const cuerpo = src.slice(desde, sig === -1 ? undefined : sig);

  assert.match(cuerpo, /createdAt: \{ gte: desde, lte: hasta \}/, "el filtro es por fecha de cobro");
  assert.match(cuerpo, /cobradoEn: p\.createdAt/, "y la agrupación usa ESA misma fecha");
  assert.doesNotMatch(
    cuerpo,
    /appointment\.startsAt/,
    "volvió el segundo reloj: `getReportData` filtra por cuándo entró la plata y no puede " +
      "agrupar por cuándo se prestó el servicio. Son dos preguntas distintas y la pantalla " +
      "sólo puede contestar una a la vez.",
  );
  assert.match(cuerpo, /bordesDelPeriodo\(/, "los bordes se snapean al día de negocio");
});

// Los comentarios se sacan antes de mirar el texto: la propia pantalla EXPLICA en un
// comentario por qué NO dice "cierra contra el Libro de Caja", y esa cita dispararía la
// guarda. Mismo criterio que `waitlist-precio.test.ts`.
const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/.*$/gm, "");

test("la pantalla dice por qué fecha están los números, y no promete el libro de caja", () => {
  const page = sinComentarios(
    readFileSync(new URL("../app/admin/(dashboard)/reportes/page.tsx", import.meta.url), "utf8"),
  );
  assert.match(page, /por fecha de COBRO/, "el encabezado tiene que decir qué reloj usa");
  assert.match(page, /Fecha en que entró la plata, no la del turno/);
  assert.doesNotMatch(
    page,
    /cierra contra el [Ll]ibro/,
    "no cierra: el libro también tiene ventas del mostrador, gastos y cargas retroactivas. " +
      "Cambiar un rótulo vago por uno verificablemente falso es peor que dejarlo vago.",
  );
});
