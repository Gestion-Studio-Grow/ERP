// MIA-50 · T08: las reglas puras de moneda, bancos y retenciones. Esperados escritos a mano antes de correr (R7).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aCentavos, cambioAplicable, diaArgentino, diferenciaDeCambio, estadoDelMovimiento, fotoEnPesos, huellasDelExtracto,
  leerRetenciones, repartoDelCobro, saldoDeMovimientos, signoDelOrigen,
} from "./moneda-bancos-core";

test("diaArgentino: las 01:00 UTC del 20/11 todavía son el 19/11 en Argentina", () => {
  assert.equal(diaArgentino(new Date("2026-11-20T01:00:00Z")), "2026-11-19");
  assert.equal(diaArgentino(new Date("2026-11-20T03:00:00Z")), "2026-11-20");
});

test("aCentavos no arrastra la coma flotante", () => {
  assert.equal(aCentavos(0.1 + 0.2), 30);
  assert.equal(aCentavos(1000.5), 100050);
  assert.equal(aCentavos(-12.345), -1235);
});

test("O39 · cambioAplicable: el del día o el último anterior; nunca uno posterior", () => {
  const h = [
    { dia: "2026-11-10", centavosPorUnidad: 95000 },
    { dia: "2026-11-15", centavosPorUnidad: 98000 },
    { dia: "2026-11-19", centavosPorUnidad: 100050 },
  ];
  assert.deepEqual(cambioAplicable(h, "2026-11-15"), h[1]);
  assert.deepEqual(cambioAplicable(h, "2026-11-17"), h[1]);
  assert.deepEqual(cambioAplicable(h, "2026-11-30"), h[2]);
  assert.equal(cambioAplicable(h, "2026-11-01"), null);
  assert.equal(cambioAplicable([], "2026-11-19"), null);
});

test("O31 · fotoEnPesos: US$ 33,33 a $ 1.000,50 → $ 33.346,67 (un solo redondeo); en pesos el cambio es 100", () => {
  assert.deepEqual(fotoEnPesos("USD", 33.33, 100050), { moneda: "USD", originalCentavos: 3333, cambioCentavos: 100050, pesosCentavos: 3334667 });
  assert.deepEqual(fotoEnPesos("ARS", 1500, 999999), { moneda: "ARS", originalCentavos: 150000, cambioCentavos: 100, pesosCentavos: 150000 });
});

test("O31 · diferencia de cambio: US$ 100 registrado a 1.000 y pagado a 1.050 → pérdida de $ 5.000", () => {
  const alRegistrar = fotoEnPesos("USD", 100, 100000).pesosCentavos;
  const alPagar = fotoEnPesos("USD", 100, 105000).pesosCentavos;
  assert.equal(diferenciaDeCambio(alPagar, alRegistrar), 500000);
});

test("O38 · huellas: dos líneas iguales en el archivo son dos (#1, #2); el mismo archivo da las mismas huellas", () => {
  const f = new Date(2026, 10, 3);
  const lineas = [
    { fecha: f, descripcion: "Transferencia  Cliente", importe: 1000 },
    { fecha: f, descripcion: "transferencia cliente", importe: 1000 },
    { fecha: f, descripcion: "Comisión", importe: -15.5 },
  ];
  const h1 = huellasDelExtracto(lineas).map((l) => l.huella);
  const h2 = huellasDelExtracto(lineas).map((l) => l.huella);
  assert.deepEqual(h1, h2);
  assert.equal(new Set(h1).size, 3);
  assert.equal(h1[0], "2026-11-03|transferencia cliente|100000|#1");
  assert.equal(h1[1], "2026-11-03|transferencia cliente|100000|#2");
});

test("O38 · saldo = inicial + Σ movimientos vigentes; un anulado no cuenta", () => {
  assert.equal(saldoDeMovimientos(10000, [{ importeCentavos: 5000 }, { importeCentavos: BigInt(-2000) }, { importeCentavos: 9999, anuladoEl: new Date() }]), 13000);
  assert.equal(signoDelOrigen("COBRO"), 1);
  assert.equal(signoDelOrigen("ORDEN_PAGO"), -1);
  assert.equal(estadoDelMovimiento({ cuotaId: null, origenTipo: "PAGO" }), "CONCILIADO_MOVIMIENTO");
  assert.equal(estadoDelMovimiento({ cuotaId: "c", origenTipo: null }), "CONCILIADO_CUOTA");
  assert.equal(estadoDelMovimiento({ cuotaId: null }), "SIN_CONCILIAR");
});

test("O36 · leerRetenciones: filas vacías se ignoran; tipo fuera del catálogo o sin importe, error", () => {
  const tipos = ["IIBB", "Ganancias", "IVA", "SUSS"];
  assert.deepEqual(leerRetenciones(["IIBB", ""], ["1.500,50", ""], ["CERT-1", ""], tipos), { ok: true, retenciones: [{ tipo: "IIBB", importe: 1500.5, certificado: "CERT-1" }] });
  assert.equal(leerRetenciones(["Otra"], ["10"], [], tipos).ok, false);
  assert.equal(leerRetenciones(["IIBB"], [""], [], tipos).ok, false);
  assert.equal(leerRetenciones([""], ["10"], [], tipos).ok, false);
});

test("O36 · repartoDelCobro: falta 100.000 y retienen 3.000 → entran 97.000; nunca pasa lo que falta", () => {
  assert.deepEqual(repartoDelCobro(100000, null, 3000), { ok: true, entra: 97000, retenido: 3000 });
  assert.deepEqual(repartoDelCobro(100000, 40000, 2000), { ok: true, entra: 40000, retenido: 2000 });
  assert.equal(repartoDelCobro(100000, 99000, 2000).ok, false);
  assert.equal(repartoDelCobro(100000, null, 100001).ok, false);
  assert.deepEqual(repartoDelCobro(5000, null, 5000), { ok: true, entra: 0, retenido: 5000 });
  assert.equal(repartoDelCobro(0, null, 0).ok, false);
});
