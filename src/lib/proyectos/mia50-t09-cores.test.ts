// MIA-50 T09: las cuentas puras de etapas II, obligaciones, antigüedad, resultado y cancelado. Los esperados están hechos a
// mano (en el comentario de cada caso), no con la misma función.

import { test } from "node:test";
import assert from "node:assert/strict";
import { etapaQueSeEntra, fechasPorEtapa, type EtapaParam } from "./etapas-core";
import { diaDeAviso, fechaDelCampo, leerObligacion, textoDeAviso, tocaAvisar } from "./obligaciones-core";
import { antiguedadDe, tramosDe } from "./antiguedad-core";
import { fijoTocaEnElMes, mesDe, resultadoDelMes, type ProyectoConResultado } from "./resultado-core";
import { esCancelado, motivoDeCancelacion, pendientesDeCancelar, rechazoDeCancelar } from "./cancelacion-core";

const ETAPAS: EtapaParam[] = [
  { id: "BRIEF", nombre: "Brief o idea", estados: ["PEDIDO"], compuerta: "AVISA" },
  { id: "COMERCIAL", nombre: "Comercial", estados: ["DISENO", "RENDER", "PRESUPUESTO", "PROPUESTA"], compuerta: "AVISA" },
  { id: "PRODUCCION", nombre: "Producción", estados: ["APROBADO", "PRODUCCION", "ARMADO", "DESARME"], compuerta: "AVISA" },
  { id: "CIERRE", nombre: "Cierre y postventa", estados: ["CIERRE"], compuerta: "AVISA" },
];

test("O05: fechas por etapa en el orden del parámetro; una fila de una etapa que ya no existe no sale", () => {
  const prev = new Date("2026-12-01T15:00:00Z");
  const real = new Date("2026-11-19T15:00:00Z");
  const f = fechasPorEtapa(ETAPAS, [
    { etapaId: "PRODUCCION", prevista: prev, real: null },
    { etapaId: "COMERCIAL", prevista: null, real },
    { etapaId: "VIEJA", prevista: prev, real },
  ]);
  assert.deepEqual(f.map((x) => [x.etapa.id, x.prevista, x.real]), [["BRIEF", null, null], ["COMERCIAL", null, real], ["PRODUCCION", prev, null], ["CIERRE", null, null]]);
});

test("O05: la etapa en la que se entra; dentro de la misma etapa no hay pase", () => {
  assert.equal(etapaQueSeEntra(ETAPAS, "PRESUPUESTO", "APROBADO")?.id, "PRODUCCION");
  assert.equal(etapaQueSeEntra(ETAPAS, "DISENO", "RENDER"), null);
  assert.equal(etapaQueSeEntra(ETAPAS, "PEDIDO", "CIERRE")?.id, "CIERRE");
  assert.equal(etapaQueSeEntra(ETAPAS, "APROBADO", "PROPUESTA")?.id, "COMERCIAL", "volver atrás también es entrar");
  assert.equal(etapaQueSeEntra(ETAPAS, "PEDIDO", "NO_EXISTE"), null);
});

const campos = (o: Record<string, string>) => (n: string) => o[n] ?? "";

test("O07: leer una obligación — tipo de la lista, fecha que existe, días por defecto del parámetro y tope 60", () => {
  const base = { tipo: "Seguro", titulo: "Renovar póliza", responsableId: "per1", venceEl: "2026-11-25" };
  const ok = leerObligacion(campos(base), ["Seguro", "Otra"], 3);
  assert.ok(typeof ok !== "string");
  assert.equal(ok.diasAviso, 3);
  assert.equal(ok.venceEl.toISOString(), "2026-11-25T15:00:00.000Z"); // mediodía de Argentina
  assert.equal(ok.proyectoId, null);
  assert.equal(leerObligacion(campos({ ...base, tipo: "Inventada" }), ["Seguro"], 3), "Elegí un tipo de la lista.");
  assert.equal(leerObligacion(campos({ ...base, venceEl: "2026-02-30" }), ["Seguro"], 3), "Esa fecha no existe.");
  assert.equal(leerObligacion(campos({ ...base, diasAviso: "61" }), ["Seguro"], 3), "Los días de aviso van de 0 a 60.");
  assert.equal(leerObligacion(campos({ ...base, diasAviso: "1.5" }), ["Seguro"], 3), "Los días de aviso van de 0 a 60.");
  const cero = leerObligacion(campos({ ...base, diasAviso: "0" }), ["Seguro"], 3);
  assert.ok(typeof cero !== "string" && cero.diasAviso === 0);
  assert.equal(fechaDelCampo("2026-04-31"), null);
  assert.equal(fechaDelCampo("2026-04-30")?.toISOString(), "2026-04-30T15:00:00.000Z");
});

test("O07: el aviso sale el día vence − días (hora de Argentina), una sola vez y no si está hecha", () => {
  const o = { venceEl: new Date("2026-11-25T15:00:00Z"), diasAviso: 3, avisadaEl: null, hechaEl: null };
  assert.equal(diaDeAviso(o.venceEl, 3), "2026-11-22");
  // 21/11 23:00 en Argentina = 22/11 02:00 UTC: todavía no.
  assert.equal(tocaAvisar(o, new Date("2026-11-22T02:00:00Z")), false);
  // 22/11 00:30 en Argentina: ya.
  assert.equal(tocaAvisar(o, new Date("2026-11-22T03:30:00Z")), true);
  assert.equal(tocaAvisar(o, new Date("2026-12-10T15:00:00Z")), true, "si el barrido no corrió ese día, avisa después");
  assert.equal(tocaAvisar({ ...o, avisadaEl: new Date() }, new Date("2026-11-23T15:00:00Z")), false);
  assert.equal(tocaAvisar({ ...o, hechaEl: new Date() }, new Date("2026-11-23T15:00:00Z")), false);
  assert.equal(textoDeAviso({ tipo: "Seguro", titulo: "Renovar póliza", venceEl: o.venceEl }, new Date("2026-11-22T15:00:00Z")), "Seguro: Renovar póliza vence en 3 días");
  assert.equal(textoDeAviso({ tipo: "Seguro", titulo: "X", venceEl: o.venceEl }, new Date("2026-11-24T15:00:00Z")), "Seguro: X vence mañana");
  assert.equal(textoDeAviso({ tipo: "Seguro", titulo: "X", venceEl: o.venceEl }, new Date("2026-11-26T15:00:00Z")), "Seguro: X venció hace 1 día");
});

test("O34: tramos del parámetro y antigüedad sumada en centavos exactos", () => {
  assert.deepEqual(tramosDe([30, 60, 90]).map((t) => t.etiqueta), ["A vencer", "Hasta 30 días", "31 a 60 días", "61 a 90 días", "Más de 90 días"]);
  const hoy = new Date("2026-11-19T15:00:00Z");
  const r = antiguedadDe(
    [
      { tipo: "COBRO", importe: 1000.1, venceEl: new Date("2026-11-25T15:00:00Z") }, // a vencer
      { tipo: "COBRO", importe: 500.05, venceEl: new Date("2026-11-09T15:00:00Z") }, // 10 días
      { tipo: "COBRO", importe: 0.1, venceEl: new Date("2026-11-09T15:00:00Z") }, // 10 días
      { tipo: "COBRO", importe: 0.2, venceEl: new Date("2026-11-08T15:00:00Z") }, // 11 días
      { tipo: "COBRO", importe: 200, venceEl: new Date("2026-09-20T15:00:00Z") }, // 60 días justos: «31 a 60»
      { tipo: "COBRO", importe: 300, venceEl: new Date("2026-07-01T15:00:00Z") }, // 141 días
      { tipo: "PAGO", importe: 0, venceEl: new Date("2026-07-01T15:00:00Z") }, // cubierta: no cuenta
      { tipo: "PAGO", importe: 750, venceEl: new Date("2026-10-10T15:00:00Z") }, // 40 días
    ],
    [30, 60, 90],
    hoy,
  );
  assert.deepEqual(r.COBRO.tramos.map((t) => [t.id, t.cantidad, t.total]), [["A_VENCER", 1, 1000.1], ["HASTA_30", 3, 500.35], ["HASTA_60", 1, 200], ["HASTA_90", 0, 0], ["MAS_DE_90", 1, 300]]);
  // 1000,10 + 500,05 + 0,10 + 0,20 + 200 + 300 = 2000,45 (en flotante 0,1 + 0,2 daría 0,30000000000000004)
  assert.equal(r.COBRO.total, 2000.45);
  assert.equal(r.COBRO.cantidad, 6);
  assert.deepEqual([r.PAGO.total, r.PAGO.cantidad, r.PAGO.tramos.find((t) => t.id === "HASTA_60")!.total], [750, 1, 750]);
  // Otros límites reagrupan sin tocar código: con [15] los 60 y los 141 días van juntos.
  assert.equal(antiguedadDe([{ tipo: "COBRO", importe: 200, venceEl: new Date("2026-09-20T15:00:00Z") }, { tipo: "COBRO", importe: 300, venceEl: new Date("2026-07-01T15:00:00Z") }], [15], hoy).COBRO.tramos.find((t) => t.id === "MAS_DE_15")!.total, 500);
});

test("O49: resultado del mes — proyectos del mes vivos, administración real por categoría, previsto de fijos", () => {
  const P = (id: string, venta: number, costoReal: number, fecha: string, vivo = true): ProyectoConResultado => ({ id, codigo: id, nombre: id, venta, costoReal, conGastos: true, fecha: new Date(fecha), vivo });
  const r = resultadoDelMes(
    "2026-11",
    [P("A", 1000.1, 600.05, "2026-11-05T15:00:00Z"), P("B", 500, 700, "2026-11-20T15:00:00Z"), P("C", 9999, 0, "2026-11-10T15:00:00Z", false), P("D", 9999, 0, "2026-10-10T15:00:00Z")],
    [
      { categoria: "Alquiler", costoCentavos: 150000, fecha: new Date("2026-11-03T15:00:00Z") },
      { categoria: "Alquiler", costoCentavos: 50000, fecha: new Date("2026-11-28T15:00:00Z") },
      { categoria: "Sueldos", costoCentavos: BigInt(100000), fecha: new Date("2026-11-15T15:00:00Z") },
      { categoria: "Luz", costoCentavos: 1000, fecha: new Date("2026-12-01T01:00:00Z") }, // 30/11 22:00 en Argentina: noviembre
      { categoria: "Luz", costoCentavos: 12345, fecha: new Date("2026-10-30T15:00:00Z") }, // octubre: no
    ],
    [
      { nombre: "Alquiler", tipo: "FIJO", frecuencia: "MENSUAL", fecha: null, activo: true, montoPesos: 1800 },
      { nombre: "Seguro", tipo: "FIJO", frecuencia: "ANUAL", fecha: new Date("2025-11-10T15:00:00Z"), activo: true, montoPesos: 1200 },
      { nombre: "Patente", tipo: "IMPUESTO", frecuencia: "UNICO", fecha: new Date("2026-12-01T15:00:00Z"), activo: true, montoPesos: 400 },
      { nombre: "Viejo", tipo: "FIJO", frecuencia: "MENSUAL", fecha: null, activo: false, montoPesos: 999 },
    ],
  );
  // A: 1000,10 − 600,05 = 400,05 · B: 500 − 700 = −200 · C perdido y D de octubre no cuentan.
  assert.deepEqual(r.proyectos.map((p) => [p.id, p.resultado]), [["A", 400.05], ["B", -200]]);
  assert.equal(r.sumaProyectos, 200.05);
  // Alquiler 1.500 + 500 = 2.000 · Luz 10 · Sueldos 1.000 → 3.010
  assert.deepEqual(r.administracion, [{ categoria: "Alquiler", real: 2000 }, { categoria: "Luz", real: 10 }, { categoria: "Sueldos", real: 1000 }]);
  assert.equal(r.administracionReal, 3010);
  // Previsto: Alquiler 1.800 (mensual) + Seguro 1.200 (anual de noviembre) = 3.000; la patente es de diciembre.
  assert.equal(r.fijosPrevisto, 3000);
  assert.equal(r.desvioFijos, 10);
  // 200,05 − 3.010 = −2.809,95
  assert.equal(r.resultadoEmpresa, -2809.95);
  assert.equal(mesDe(new Date("2026-12-01T02:59:00Z")), "2026-11");
  assert.equal(fijoTocaEnElMes({ frecuencia: "UNICO", fecha: null, activo: true }, "2026-11"), false);
});

test("O04: cancelar — sólo Dirección, con motivo, con versión aprobada; perdido y cancelado no se cancelan", () => {
  const ok = { rol: "DIRECCION", motivo: "El cliente suspendió el evento", aprobada: true, perdido: false, cancelado: false };
  assert.equal(rechazoDeCancelar(ok), null);
  assert.equal(rechazoDeCancelar({ ...ok, rol: "PRODUCCION" }), "Sólo Dirección puede cancelar un proyecto aprobado.");
  assert.equal(rechazoDeCancelar({ ...ok, motivo: "  " }), "Escribí por qué se cancela.");
  assert.match(rechazoDeCancelar({ ...ok, aprobada: false })!, /marcalo como perdido/);
  assert.equal(rechazoDeCancelar({ ...ok, cancelado: true }), "Este proyecto ya está cancelado.");
  assert.equal(rechazoDeCancelar({ ...ok, perdido: true }), "Este proyecto está perdido: no se cancela.");
  assert.equal(esCancelado("Cancelado: x"), true);
  assert.equal(esCancelado("Precio"), false);
  assert.equal(esCancelado(null), false);
  assert.equal(motivoDeCancelacion("Cancelado: El cliente suspendió"), "El cliente suspendió");
});

test("O04: lo que queda por resolver lista sólo lo que hay, y siempre las comisiones", () => {
  const nada = { cobros: { cantidad: 0, total: 0 }, pagos: { cantidad: 0, total: 0 }, cuotasPagoMarcadas: 0, rendicionesAbiertas: 0, anticiposAbiertos: 0 };
  const fmt = (n: number) => `$${n}`;
  assert.deepEqual(pendientesDeCancelar(nada, fmt), ["Comisiones del equipo: no se liquidan solas; las define Dirección."]);
  const algo = pendientesDeCancelar({ ...nada, cobros: { cantidad: 2, total: 1500.5 }, rendicionesAbiertas: 1 }, fmt);
  assert.deepEqual(algo, [
    "Cobros del cliente: 2 por $1500.5. Definir si se devuelven o quedan a cuenta.",
    "Rendiciones de gastos sin cerrar: 1.",
    "Comisiones del equipo: no se liquidan solas; las define Dirección.",
  ]);
});
