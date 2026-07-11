// Test end-to-end del handler del plugin BANCOS: archivo → parseo → mapeo →
// clasificación → reglas → propuestas. Fixtures realistas (estilo homebanking
// argentino, con filas de basura arriba y números AR). Sin DB ni red: todo
// entra por inyección, como ingest.ts de MP.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { ClasificadorBancarioPorReglas } from "./domain/clasificador";
import { DeteccionCruzadaEnMemoria } from "./domain/reglas";
import { CONFIANZA_MINIMA, type Celda, type MapeadorAsistido, type MapeoColumnas } from "./domain/mapeador";
import { detectarFormato, procesarExtracto, type ArchivoExtracto } from "./handler";

const deps = () => ({
  tenantId: "t-1",
  clasificador: new ClasificadorBancarioPorReglas(),
});

function archivoCsv(nombre: string, contenido: string): ArchivoExtracto {
  return { nombre, contenido: new TextEncoder().encode(contenido) };
}

// Fixture estilo Banco Nación: basura arriba, headers del template, esquema
// débito/crédito, números formato AR, y un crédito grande que pide identificación.
const CSV_NACION = [
  "Banco de la Nación Argentina",
  "Cuenta Corriente en Pesos Nro. 12345678",
  "Titular: COMERCIO EJEMPLO S.R.L.",
  "Período: 01/07/2026 - 31/07/2026",
  "",
  "Fecha;Descripción;Débito;Crédito;Saldo",
  "01/07/2026;Transferencia recibida CBU 285;;150.000,00;1.150.000,00",
  "02/07/2026;Comisión mantenimiento cuenta;8.500,00;;1.141.500,00",
  "02/07/2026;IVA 21% s/comisión;1.785,00;;1.139.715,00",
  "03/07/2026;SIRCREB Ingresos Brutos;450,00;;1.139.265,00",
  "04/07/2026;Transferencia recibida CBU 007;;89.999,50;1.229.264,50",
  "05/07/2026;Acreditación ventas;;750.000,00;1.979.264,50",
  "06/07/2026;Transferencia entre cuentas propias;;200.000,00;2.179.264,50",
].join("\r\n");

test("extracto CSV estilo Nación de punta a punta", async () => {
  const resultado = await procesarExtracto(archivoCsv("extracto-nacion.csv", CSV_NACION), deps());

  assert.ok(resultado.mapeo, "el mapeo debe detectarse");
  assert.equal(resultado.mapeo.templateId, "banco-nacion");
  assert.equal(resultado.mapeo.confianza, 1);
  assert.equal(resultado.movimientos.length, 7);

  const porEstado = (estado: string) => resultado.propuestas.filter((p) => p.estado === estado);
  // 2 ventas chicas AUTO (150.000 y 89.999,50, ambas < 600.000).
  assert.equal(porEstado("auto").length, 2);
  // 1 venta grande (750.000 >= umbral) → revisión con identificación.
  const grandes = porEstado("revision");
  assert.equal(grandes.length, 1);
  assert.equal(grandes[0].montoTotal, 750000);
  assert.equal(grandes[0].requiereIdentificacion, true);
  // Comisión + IVA + SIRCREB + transferencia propia → no facturables.
  assert.equal(porEstado("no_facturable").length, 4);
  assert.deepEqual(resultado.alertas, []);
});

test("el mismo extracto en XLSX (fechas Date, números number) da lo mismo", async () => {
  const filas: Celda[][] = [
    ["Banco de la Nación Argentina", null, null, null, null],
    ["Fecha", "Descripción", "Débito", "Crédito", "Saldo"],
    [new Date(2026, 6, 1), "Transferencia recibida CBU 285", null, 150000, 1150000],
    [new Date(2026, 6, 2), "Comisión mantenimiento cuenta", 8500, null, 1141500],
    [new Date(2026, 6, 5), "Acreditación ventas", null, 750000, 1891500],
  ];
  const hoja = XLSX.utils.aoa_to_sheet(filas, { cellDates: true });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Movimientos");
  const bytes = new Uint8Array(XLSX.write(libro, { type: "array", bookType: "xlsx", cellDates: true }));

  const resultado = await procesarExtracto({ nombre: "extracto.xlsx", contenido: bytes }, deps());
  assert.ok(resultado.mapeo);
  assert.equal(resultado.mapeo.templateId, "banco-nacion");
  assert.equal(resultado.movimientos.length, 3);
  assert.equal(resultado.propuestas.filter((p) => p.estado === "auto").length, 1);
  assert.equal(resultado.propuestas.filter((p) => p.estado === "revision").length, 1);
  assert.equal(resultado.propuestas.filter((p) => p.estado === "no_facturable").length, 1);
});

test("detectarFormato decide por contenido primero y extensión después", () => {
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]);
  assert.equal(detectarFormato({ nombre: "extracto.csv", contenido: zip }), "xlsx"); // los bytes mandan
  assert.equal(detectarFormato(archivoCsv("extracto.csv", "a;b")), "csv");
  assert.equal(detectarFormato(archivoCsv("extracto.xls", "a;b")), "xlsx"); // sin magic, decide la extensión
});

test("detección cruzada banco↔MP baja la venta a revisión", async () => {
  const resultado = await procesarExtracto(archivoCsv("extracto.csv", CSV_NACION), {
    ...deps(),
    deteccionCruzada: new DeteccionCruzadaEnMemoria([{ fecha: "20260701", monto: 150000 }]),
  });
  const primera = resultado.propuestas.find((p) => p.montoTotal === 150000);
  assert.ok(primera);
  assert.equal(primera.estado, "revision");
  assert.match(primera.motivo ?? "", /posible duplicado/i);
});

test("reimportar el mismo archivo descarta todo (idempotencia entre corridas)", async () => {
  const primera = await procesarExtracto(archivoCsv("extracto.csv", CSV_NACION), deps());
  const procesados = new Set(primera.movimientos.map((m) => m.id));

  const segunda = await procesarExtracto(archivoCsv("extracto.csv", CSV_NACION), {
    ...deps(),
    yaProcesado: (id) => procesados.has(id),
  });
  assert.ok(segunda.propuestas.every((p) => p.estado === "descartado"));
});

test("archivo vacío devuelve alerta y nada más", async () => {
  const resultado = await procesarExtracto(archivoCsv("vacio.csv", ""), deps());
  assert.equal(resultado.mapeo, null);
  assert.deepEqual(resultado.movimientos, []);
  assert.deepEqual(
    resultado.alertas.map((a) => a.tipo),
    ["extracto-vacio"],
  );
});

test("archivo sin tabla reconocible devuelve alerta de mapeo", async () => {
  const resultado = await procesarExtracto(
    archivoCsv("carta.csv", "Estimado cliente;\nSu resumen ya está disponible;"),
    deps(),
  );
  assert.equal(resultado.mapeo, null);
  assert.deepEqual(
    resultado.alertas.map((a) => a.tipo),
    ["mapeo-baja-confianza"],
  );
});

test("mapeo con baja confianza alerta y consulta al mapeador asistido", async () => {
  // Headers crípticos: la heurística mapea por forma pero no llega a 0.8.
  const csv = [
    "C1;C2;C3",
    "01/07/2026;TRF REC;150.000,00",
    "02/07/2026;PAGO SERV;-8.500,00",
    "03/07/2026;ACRED VTAS;45.500,00",
    "04/07/2026;TRF ENV;-12.000,00",
  ].join("\n");

  let consultado = false;
  const asistido: MapeadorAsistido = {
    async proponerMapeo(_matriz: Celda[][], heuristico: MapeoColumnas | null) {
      consultado = true;
      return heuristico; // no mejora nada (stub): la alerta debe quedar
    },
  };

  const resultado = await procesarExtracto(archivoCsv("criptico.csv", csv), {
    ...deps(),
    mapeadorAsistido: asistido,
  });
  assert.equal(consultado, true, "el asistido se consulta SOLO en baja confianza");
  assert.ok(resultado.mapeo);
  assert.ok(resultado.mapeo.confianza < CONFIANZA_MINIMA);
  assert.ok(resultado.alertas.some((a) => a.tipo === "mapeo-baja-confianza"));
  assert.ok(resultado.movimientos.length > 0, "igual devuelve el mejor esfuerzo");
});

test("con template (confianza 1) el mapeador asistido NO se consulta", async () => {
  let consultado = false;
  const asistido: MapeadorAsistido = {
    async proponerMapeo(_matriz: Celda[][], heuristico: MapeoColumnas | null) {
      consultado = true;
      return heuristico;
    },
  };
  await procesarExtracto(archivoCsv("extracto.csv", CSV_NACION), { ...deps(), mapeadorAsistido: asistido });
  assert.equal(consultado, false, "unit-economics: la IA no se toca en el camino feliz");
});
