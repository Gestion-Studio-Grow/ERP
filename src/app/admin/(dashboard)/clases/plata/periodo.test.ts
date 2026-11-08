import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCobros, desgloseCorto, medioDelCobro, nombreArchivo, periodoDe, rangoDelPeriodo, rotuloCobrado, rotuloDadas } from "./periodo";

test("periodoDe: los tres períodos; cualquier otra cosa es el mes", () => {
  assert.equal(periodoDe("hoy"), "hoy");
  assert.equal(periodoDe("semana"), "semana");
  assert.equal(periodoDe("mes"), "mes");
  assert.equal(periodoDe(undefined), "mes");
  assert.equal(periodoDe("año"), "mes");
  assert.equal(periodoDe(["hoy"]), "mes");
});

test("rangoDelPeriodo: hoy, desde el lunes, desde el 1; siempre hasta mañana (exclusivo)", () => {
  // Jueves 23/10/2026.
  assert.deepEqual(rangoDelPeriodo("hoy", "2026-10-23"), { desde: "2026-10-23", hasta: "2026-10-24" });
  assert.deepEqual(rangoDelPeriodo("semana", "2026-10-23"), { desde: "2026-10-19", hasta: "2026-10-24" });
  assert.deepEqual(rangoDelPeriodo("mes", "2026-10-23"), { desde: "2026-10-01", hasta: "2026-10-24" });
  // Un domingo es el último día de la semana que arrancó el lunes anterior.
  assert.deepEqual(rangoDelPeriodo("semana", "2026-10-25"), { desde: "2026-10-19", hasta: "2026-10-26" });
  // Fin de mes: mañana es del mes siguiente.
  assert.deepEqual(rangoDelPeriodo("mes", "2026-10-31"), { desde: "2026-10-01", hasta: "2026-11-01" });
});

test("rótulos en criollo", () => {
  assert.equal(rotuloCobrado("mes"), "Cobrado en el mes");
  assert.equal(rotuloCobrado("hoy"), "Cobrado hoy");
  assert.equal(rotuloDadas("mes", 60), "60 clases dadas en el mes");
  assert.equal(rotuloDadas("hoy", 1), "1 clase dada hoy");
});

test("medioDelCobro: el comprobante validado (sin medio) es Transferencia", () => {
  assert.equal(medioDelCobro(null), "TRANSFERENCIA");
  assert.equal(medioDelCobro("EFECTIVO"), "EFECTIVO");
  assert.equal(medioDelCobro("cualquiera"), "TRANSFERENCIA");
});

test("desgloseCorto: sólo los medios con plata, en orden fijo", () => {
  assert.deepEqual(
    desgloseCorto({ MERCADO_PAGO: 60000, EFECTIVO: 420000, TRANSFERENCIA: 0 }).map((d) => `${d.rotulo} ${d.monto}`),
    ["Efectivo 420000", "MP 60000"],
  );
});

test("csvCobros: una fila por cobro (fecha, hora, alumno, medio, monto), ordenada, con total (M-075)", () => {
  const csv = csvCobros([
    { fecha: new Date("2026-10-16T21:00:00Z"), alumno: "Lucía Gómez", medio: "TRANSFERENCIA", monto: 25000 },
    { fecha: new Date("2026-10-02T13:30:00Z"), alumno: "=HACK()", medio: "EFECTIVO", monto: 12500.5 },
  ]);
  const lineas = csv.trimEnd().split("\r\n");
  assert.equal(lineas[0], "Fecha;Hora;Alumno;Medio;Monto");
  assert.equal(lineas[1], "02/10/2026;10:30;'=HACK();Efectivo;12500,50");
  assert.equal(lineas[2], "16/10/2026;18:00;Lucía Gómez;Transferencia;25000,00");
  assert.equal(lineas[3], ";;;Total;37500,50");
  assert.equal(lineas.length, 4);
});

test("nombreArchivo por período", () => {
  assert.equal(nombreArchivo("mes", "2026-10-23"), "cobros-2026-10");
  assert.equal(nombreArchivo("semana", "2026-10-23"), "cobros-semana-2026-10-19");
  assert.equal(nombreArchivo("hoy", "2026-10-23"), "cobros-2026-10-23");
});

test("elegirDevoluciones: suma partes de integrante; la más nueva que entre en el saldo", async () => {
  const { elegirDevoluciones } = await import("./periodo");
  const d = (s: string) => new Date(`${s}T12:00:00Z`);
  const m = elegirDevoluciones(
    [{ alumnoId: "a", aFavor: 10000 }, { alumnoId: "b", aFavor: 5000 }, { alumnoId: "c", aFavor: 1000 }],
    [
      { id: "clase-a", alumnoId: "a", monto: 8000, empiezaEn: d("2026-11-01") },
      { id: "parte-a", alumnoId: "a", monto: 5000, empiezaEn: d("2026-11-05") },
      { id: "parte-b", alumnoId: "b", monto: 5000, empiezaEn: d("2026-11-02") },
      { id: "clase-c", alumnoId: "c", monto: 2000, empiezaEn: d("2026-11-02") },
    ],
  );
  assert.deepEqual(m.get("a"), { claseId: "parte-a", monto: 5000 });
  assert.deepEqual(m.get("b"), { claseId: "parte-b", monto: 5000 });
  assert.equal(m.has("c"), false); // nunca deja el saldo negativo
});
