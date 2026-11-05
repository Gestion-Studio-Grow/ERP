import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SIN_FILTROS,
  etiquetaOpenKey,
  faltaLaBaja,
  fechaCorta,
  hayFiltros,
  leerFiltrosDeUrl,
  lineasDeLaFoto,
  lineasDeLaLiquidacion,
  nombreDelCsv,
  numerosDelTexto,
  queryDeFiltros,
  resumirListado,
} from "./vouchers-pantalla";

const CONC_VACIA = { faltaBaja: [], usadoEnOpenKeySinCobro: [], anuladoEnOpenKeyUsadoEnErp: [], usadoEnTurnoCancelado: [], desconocidosEnOpenKey: [] };

test("leerFiltrosDeUrl: toma los filtros válidos y recorta espacios", () => {
  const { filtros, avisos } = leerFiltrosDeUrl({ desde: "2026-11-01", hasta: " 2026-11-05 ", loteId: "L1", clientId: "c1", estado: "usado", numero: " 0012 " });
  assert.deepEqual(filtros, { desde: "2026-11-01", hasta: "2026-11-05", loteId: "L1", clientId: "c1", estado: "USADO", numero: "0012" });
  assert.deepEqual(avisos, []);
});

test("leerFiltrosDeUrl: una fecha o un estado que no se entienden se descartan con aviso", () => {
  const { filtros, avisos } = leerFiltrosDeUrl({ desde: "2026-02-30", hasta: "ayer", estado: "ROBADO" });
  assert.equal(filtros.desde, null);
  assert.equal(filtros.hasta, null);
  assert.equal(filtros.estado, null);
  assert.equal(avisos.length, 3);
});

test("leerFiltrosDeUrl: rango invertido se da vuelta; arreglos y vacíos", () => {
  const { filtros } = leerFiltrosDeUrl({ desde: "2026-11-05", hasta: "2026-11-01", loteId: ["A", "B"], clientId: "  " });
  assert.equal(filtros.desde, "2026-11-01");
  assert.equal(filtros.hasta, "2026-11-05");
  assert.equal(filtros.loteId, "A");
  assert.equal(filtros.clientId, null);
});

test("leerFiltrosDeUrl acepta URLSearchParams (route handler) y queryDeFiltros vuelve igual", () => {
  const sp = new URLSearchParams("desde=2026-11-01&estado=DISPONIBLE&numero=A%26B");
  const { filtros } = leerFiltrosDeUrl(sp);
  assert.equal(queryDeFiltros(filtros), "?desde=2026-11-01&estado=DISPONIBLE&numero=A%26B");
  assert.equal(queryDeFiltros(SIN_FILTROS), "");
  assert.equal(hayFiltros(SIN_FILTROS), false);
  assert.equal(hayFiltros(filtros), true);
});

test("etiquetas y fechas", () => {
  assert.equal(etiquetaOpenKey(null), "Sin verificar");
  assert.equal(etiquetaOpenKey("BAJA"), "Dado de baja");
  assert.equal(fechaCorta("2026-11-05"), "05/11/2026");
  assert.equal(fechaCorta(null), "—");
  assert.equal(nombreDelCsv("2026-11-05"), "vouchers-2026-11-05.csv");
  assert.equal(nombreDelCsv("x"), "vouchers-reporte.csv");
});

test("faltaLaBaja y resumirListado", () => {
  const base = { estadoOpenKey: null, bajaOpenKeyEn: null, liquidadoEn: null, valorCubierto: null };
  const filas = [
    { ...base, estado: "USADO", estadoOpenKey: "DISPONIBLE", valorCubierto: 1000 },
    { ...base, estado: "USADO", estadoOpenKey: "BAJA", bajaOpenKeyEn: "2026-11-04", liquidadoEn: "2026-11-05", valorCubierto: 500.5 },
    { ...base, estado: "DISPONIBLE" },
  ];
  assert.equal(faltaLaBaja(filas[0]), true);
  assert.equal(faltaLaBaja(filas[1]), false);
  assert.equal(faltaLaBaja(filas[2]), false);
  assert.deepEqual(resumirListado(filas), { total: 3, usados: 2, cubierto: 1500.5, faltanBaja: 1, sinLiquidar: 1 });
});

test("lineasDeLaFoto: todo en orden dice que coincide", () => {
  const l = lineasDeLaFoto({ filas: 2, actualizados: 2, creados: [], anuladosPorOpenKey: [], conciliacion: CONC_VACIA, erroresDeLectura: [] });
  assert.equal(l.length, 2);
  assert.match(l[1].texto, /Todo coincide/);
});

test("lineasDeLaFoto: falta baja es aviso; usado sin cobro y anulado usado son alertas", () => {
  const l = lineasDeLaFoto({
    filas: 5,
    actualizados: 4,
    creados: ["9"],
    anuladosPorOpenKey: [],
    conciliacion: { ...CONC_VACIA, faltaBaja: ["1", "2"], usadoEnOpenKeySinCobro: ["3"], anuladoEnOpenKeyUsadoEnErp: ["4"] },
    erroresDeLectura: [{ linea: 7, motivo: "sin número" }],
  });
  const falta = l.find((x) => x.texto.startsWith("Falta dar de baja"));
  assert.equal(falta?.tono, "aviso");
  assert.deepEqual(falta?.numeros, ["1", "2"]);
  assert.equal(l.filter((x) => x.tono === "alerta").length, 2);
  assert.ok(l.some((x) => x.texto.includes("renglón 7: sin número")));
  assert.ok(!l.some((x) => /Todo coincide/.test(x.texto)));
});

test("lineasDeLaLiquidacion: sin liquidar con antigüedad y monto distinto", () => {
  const l = lineasDeLaLiquidacion({
    filas: 2,
    marcados: 2,
    conciliacion: {
      cobradoSinLiquidar: [{ numero: "7", monto: 100, dias: 12 }],
      liquidadoSinCobro: [],
      montoDistinto: [{ numero: "8", cobrado: 1000, liquidado: 900 }],
    },
    erroresDeLectura: [],
  });
  assert.match(l[1].texto, /el más viejo, 7, hace 12 días/);
  assert.equal(l[2].tono, "alerta");
  assert.match(l[2].texto, /8: cobrado \$ 1\.000, liquidado \$ 900/);
});

test("numerosDelTexto: separa como crearLote y saca repetidos", () => {
  assert.deepEqual(numerosDelTexto("001\n002, 003;004  001\r\n"), ["001", "002", "003", "004"]);
  assert.deepEqual(numerosDelTexto("   "), []);
});

test("lineasDeLaLiquidacion: coincide", () => {
  const l = lineasDeLaLiquidacion({ filas: 1, marcados: 1, conciliacion: { cobradoSinLiquidar: [], liquidadoSinCobro: [], montoDistinto: [] }, erroresDeLectura: [] });
  assert.match(l[1].texto, /coincide/);
});
