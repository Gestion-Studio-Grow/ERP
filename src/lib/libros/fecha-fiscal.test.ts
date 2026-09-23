// La fecha con la que se declara, ejecutada con RELOJ FIJO: los tres facturadores, el Libro
// IVA por mes calendario y la ventana de "ya facturada" del extracto usan estas funciones.

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import {
  bordesDelMes,
  diasDelMes,
  esMesKey,
  etiquetaDelMes,
  fechaFiscalDelDia,
  mesDelNegocio,
  mesVecino,
  restarDiasFiscal,
  ventanaYaFacturada,
} from "./fecha-fiscal";
import { whereYaFacturadaPorOtraVia } from "@/lib/bancos-glue";

test("una factura a las 23:30 hora argentina del 31/08 lleva fecha 20260831 (reloj fijo)", () => {
  // 31/08/2026 23:30 en Buenos Aires = 01/09/2026 02:30 UTC. Con la hora del servidor (UTC)
  // salía 20260901: la venta pasaba al período fiscal de septiembre.
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-01T02:30:00.000Z") });
  try {
    assert.equal(fechaFiscalDelDia(), "20260831", "sin argumento usa el reloj: el que llaman los facturadores");
    assert.equal(mesDelNegocio(), "2026-08");
  } finally {
    mock.timers.reset();
  }
});

test("los bordes del día argentino: 00:00 y 23:59 no se corren", () => {
  assert.equal(fechaFiscalDelDia(new Date("2026-09-01T03:00:00.000Z")), "20260901"); // 00:00 ART del 1/09
  assert.equal(fechaFiscalDelDia(new Date("2026-09-01T02:59:59.000Z")), "20260831"); // 23:59:59 ART del 31/08
  assert.equal(fechaFiscalDelDia(new Date("2026-08-31T15:00:00.000Z")), "20260831"); // mediodía
});

test("el Libro IVA de septiembre toma del 1 al 30, en hora argentina", () => {
  const b = bordesDelMes("2026-09");
  assert.equal(b.primerDia, "2026-09-01");
  assert.equal(b.ultimoDia, "2026-09-30");
  assert.deepEqual(b.fiscal, { gte: "20260901", lt: "20261001" });
  // 00:00 del 1/09 argentino = 03:00 UTC; el borde de arriba, 00:00 del 1/10.
  assert.equal(b.instantes.gte.toISOString(), "2026-09-01T03:00:00.000Z");
  assert.equal(b.instantes.lt.toISOString(), "2026-10-01T03:00:00.000Z");
  // Lo del 31/08 a las 23:30 argentinas NO entra aunque en UTC ya sea septiembre.
  const tarde31 = new Date("2026-09-01T02:30:00.000Z");
  assert.ok(tarde31 < b.instantes.gte);
  // Y el 30/09 a las 23:30 argentinas SÍ entra (en UTC ya es octubre).
  const tarde30 = new Date("2026-10-01T02:30:00.000Z");
  assert.ok(tarde30 >= b.instantes.gte && tarde30 < b.instantes.lt);
  // El texto fiscal compara como fecha: "20260930" entra, "20261001" no.
  assert.ok("20260930" >= b.fiscal.gte && "20260930" < b.fiscal.lt);
  assert.ok(!("20261001" < b.fiscal.lt));
});

test("meses: largo, vecinos que cruzan el año, validación de lo que llega por URL", () => {
  assert.equal(diasDelMes("2026-02"), 28);
  assert.equal(diasDelMes("2028-02"), 29);
  assert.equal(diasDelMes("2026-08"), 31);
  assert.equal(mesVecino("2026-01", -1), "2025-12");
  assert.equal(mesVecino("2026-12", 1), "2027-01");
  assert.equal(mesVecino("2026-08", -13), "2025-07");
  assert.equal(bordesDelMes("2026-12").fiscal.lt, "20270101");
  assert.equal(etiquetaDelMes("2026-08"), "agosto 2026");
  for (const malo of ["2026-13", "2026-8", "../x", "", null, "2026-00", "1999-01"]) {
    assert.equal(esMesKey(malo as string), false, String(malo));
  }
  assert.equal(esMesKey("2026-09"), true);
});

test("ya facturada: la factura puede ser de hasta 3 días antes de la acreditación, nunca después", () => {
  assert.equal(restarDiasFiscal("20260901", 3), "20260829");
  assert.equal(restarDiasFiscal("20260301", 1), "20260228");
  assert.deepEqual(ventanaYaFacturada("20260907"), { gte: "20260904", lte: "20260907" });
  // Venta del viernes 04/09 facturada ese día, acreditada el lunes 07/09: entra en la ventana.
  const v = ventanaYaFacturada("20260907");
  assert.ok("20260904" >= v.gte && "20260904" <= v.lte);
  // Una factura del 03/09 (4 días antes) ya no cuenta, ni una del 08/09 (después).
  assert.ok(!("20260903" >= v.gte));
  assert.ok(!("20260908" <= v.lte));
});

test("el where del extracto: mismo total, la ventana de 3 días y sin los rechazados por ARCA", () => {
  assert.deepEqual(whereYaFacturadaPorOtraVia("t-1", "20260907", 15000), {
    tenantId: "t-1",
    fecha: { gte: "20260904", lte: "20260907" },
    total: 15000,
    status: { not: "REJECTED" },
  });
});
