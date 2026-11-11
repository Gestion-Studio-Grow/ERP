// Monitor de obligaciones (FC-11 · T7): reglas puras. «Vencido» se calcula, nadie lo marca.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  armarMonitor,
  avisosDelMonitor,
  enlaceWhatsApp,
  desdeDondeMarcaElEstudio,
  estudioPuedeMarcar,
  estudioPuedePasar,
  RENGLONES_DEL_AVISO,
  filaDelMonitor,
  periodosParaGenerar,
  responsablePorDefecto,
  responsablesDesdeEventos,
  textoDelAviso,
  type FilaVencimiento,
} from "./monitor";
import { calcularVencimientos, diaIso } from "./vencimientos";
import { FERIADOS_2026, TABLA_VENCIMIENTOS_2026 } from "./tabla-vencimientos-2026";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
// 15:00 en Buenos Aires del día indicado (18:00 UTC).
const enArgentina = (s: string) => new Date(`${s}T18:00:00Z`);

let n = 0;
function fila(p: Partial<FilaVencimiento> & { fechaVencimiento: Date }): FilaVencimiento {
  n++;
  return {
    id: `v${n}`,
    obligacionId: p.obligacionId ?? `o${n}`,
    codigo: "IVA_MENSUAL",
    nombre: p.nombre ?? `Obligación ${n}`,
    organismo: "ARCA",
    jurisdiccion: null,
    accion: "AMBAS",
    periodo: "2026-03",
    cuota: 0,
    fechaPresentacion: null,
    fechaPago: null,
    estado: "PENDIENTE",
    ...p,
  };
}

test("vencido sin que nadie lo marque; el día del vencimiento todavía no está vencido", () => {
  const f = fila({ fechaVencimiento: d("2026-04-20") });
  assert.equal(filaDelMonitor(f, "NEGOCIO", enArgentina("2026-04-20")).situacion, "VENCE_HOY");
  const otroDia = filaDelMonitor(f, "NEGOCIO", enArgentina("2026-04-21"));
  assert.equal(otroDia.estadoMostrado, "VENCIDO");
  assert.equal(otroDia.situacion, "VENCIDO");
  assert.equal(otroDia.diasRestantes, -1);
  // 23:30 del 20 en Argentina ya es 21 en UTC: sigue siendo «vence hoy».
  assert.equal(filaDelMonitor(f, "NEGOCIO", new Date("2026-04-21T02:30:00Z")).situacion, "VENCE_HOY");
});

test("presentado sin pago: sigue abierto y, pasada la fecha, se ve vencido", () => {
  const f = fila({ estado: "PRESENTADO", fechaPresentacion: d("2026-04-15"), fechaVencimiento: d("2026-04-20") });
  const antes = filaDelMonitor(f, "ESTUDIO", enArgentina("2026-04-16"));
  assert.ok(antes.faltaPago);
  assert.equal(antes.situacion, "POR_VENCER");
  assert.equal(filaDelMonitor(f, "ESTUDIO", enArgentina("2026-04-22")).situacion, "VENCIDO");
  // Si la obligación sólo se presenta, presentado es cumplido.
  const soloPresenta = filaDelMonitor({ ...f, accion: "PRESENTACION" }, "ESTUDIO", enArgentina("2026-04-22"));
  assert.equal(soloPresenta.faltaPago, false);
  assert.equal(soloPresenta.situacion, "CUMPLIDO");
});

test("situación y orden: lo urgente arriba; cumplido y no aplica abajo; la cuenta cierra", () => {
  const hoy = enArgentina("2026-04-20");
  const m = armarMonitor(
    [
      fila({ nombre: "Próximo", fechaVencimiento: d("2026-05-15") }),
      fila({ nombre: "Pagado", estado: "PAGADO", fechaPago: d("2026-04-10"), fechaVencimiento: d("2026-04-12") }),
      fila({ nombre: "Por vencer", fechaVencimiento: d("2026-04-23") }),
      fila({ nombre: "No corresponde", estado: "NO_CORRESPONDE", fechaVencimiento: d("2026-04-01") }),
      fila({ nombre: "Vencido", fechaVencimiento: d("2026-04-13") }),
      fila({ nombre: "Hoy", fechaVencimiento: d("2026-04-20") }),
      fila({ nombre: "Sin saldo", estado: "SIN_SALDO", fechaVencimiento: d("2026-04-18") }),
    ],
    { tieneEstudio: false, ahora: hoy },
  );
  assert.deepEqual(
    m.filas.map((f) => f.nombre),
    ["Vencido", "Hoy", "Por vencer", "Próximo", "Sin saldo", "Pagado", "No corresponde"],
  );
  assert.deepEqual(m.cuenta, { VENCIDO: 1, VENCE_HOY: 1, POR_VENCER: 1, PROXIMO: 1, CUMPLIDO: 2, NO_APLICA: 1 });
});

test("responsable: por defecto el estudio presenta y el negocio paga; lo elegido gana (el evento más nuevo)", () => {
  assert.equal(responsablePorDefecto("AMBAS", false), "NEGOCIO");
  assert.equal(responsablePorDefecto("AMBAS", true), "ESTUDIO");
  assert.equal(responsablePorDefecto("PRESENTACION", true), "ESTUDIO");
  assert.equal(responsablePorDefecto("PAGO", true), "NEGOCIO");

  const r = responsablesDesdeEventos([
    { entityId: "o1", changes: { responsable: "NEGOCIO" } }, // más nuevo
    { entityId: "o1", changes: { responsable: "ESTUDIO" } },
    { entityId: "o2", changes: { responsable: "CUALQUIERA" } }, // inválido: se ignora
    { entityId: "o2", changes: { responsable: "ESTUDIO" } },
    { entityId: null, changes: { responsable: "ESTUDIO" } },
  ]);
  assert.equal(r.get("o1"), "NEGOCIO");
  assert.equal(r.get("o2"), "ESTUDIO");
  assert.equal(r.size, 2);

  const m = armarMonitor([fila({ obligacionId: "o1", fechaVencimiento: d("2026-05-01") })], {
    tieneEstudio: true,
    responsables: r,
    ahora: enArgentina("2026-04-20"),
  });
  assert.equal(m.filas[0].responsable, "NEGOCIO");
});

test("avisos: vencido, hoy y lo de los próximos 3 días; el texto no lleva importes", () => {
  const m = armarMonitor(
    [
      fila({ nombre: "IVA", fechaVencimiento: d("2026-04-17") }),
      fila({ nombre: "IIBB", fechaVencimiento: d("2026-04-22") }),
      fila({ nombre: "Lejos", fechaVencimiento: d("2026-04-27") }),
      fila({ nombre: "Pagado", estado: "PAGADO", fechaVencimiento: d("2026-04-18") }),
    ],
    { tieneEstudio: true, ahora: enArgentina("2026-04-20") },
  );
  const avisos = avisosDelMonitor(m);
  assert.deepEqual(avisos.map((f) => f.nombre), ["IVA", "IIBB"]);
  const texto = textoDelAviso("Negocio Sintético", avisos);
  assert.match(texto, /^Vencimientos de Negocio Sintético \(Factoque\):/);
  assert.match(texto, /IVA \(03\/2026\): venció hace 3 días, vie 17\/04\/2026/);
  assert.match(texto, /IIBB \(03\/2026\): vence en 2 días/);
  assert.doesNotMatch(texto, /\$|\d+,\d{2}/);
  assert.equal(textoDelAviso("X", []), "");
  assert.ok(enlaceWhatsApp(texto, "+54 9 11 0000-0000").startsWith("https://wa.me/5491100000000?text="));
});

test("el estudio sólo marca presentado o pagado", () => {
  assert.ok(estudioPuedeMarcar("PRESENTADO"));
  assert.ok(estudioPuedeMarcar("PAGADO"));
  for (const e of ["PENDIENTE", "EN_CURSO", "SIN_SALDO", "NO_CORRESPONDE", "VENCIDO", "", null]) assert.equal(estudioPuedeMarcar(e), false);
});

test("transiciones del estudio: sólo desde lo abierto; presentado sólo si se presenta (H1)", () => {
  for (const desde of ["PENDIENTE", "EN_CURSO"] as const) {
    assert.ok(estudioPuedePasar(desde, "PRESENTADO", "AMBAS"));
    assert.ok(estudioPuedePasar(desde, "PRESENTADO", "PRESENTACION"));
    assert.ok(estudioPuedePasar(desde, "PAGADO", "AMBAS"));
    assert.ok(estudioPuedePasar(desde, "PAGADO", "PAGO"));
  }
  assert.ok(estudioPuedePasar("PRESENTADO", "PAGADO", "AMBAS"));
  // Antes pasaba: NO_CORRESPONDE → PAGADO y VERIFICADO → PRESENTADO. Ahora, rechazo.
  for (const desde of ["NO_CORRESPONDE", "VERIFICADO", "SIN_SALDO", "PAGADO"] as const) {
    assert.equal(estudioPuedePasar(desde, "PAGADO", "AMBAS"), false, desde);
    assert.equal(estudioPuedePasar(desde, "PRESENTADO", "AMBAS"), false, desde);
  }
  assert.equal(estudioPuedePasar("PRESENTADO", "PRESENTADO", "AMBAS"), false);
  // «Presentado» en una obligación que sólo se paga: nunca.
  assert.deepEqual(desdeDondeMarcaElEstudio("PRESENTADO", "PAGO"), []);
  // Sólo se presenta y ya se presentó: está cumplida, no hay pago que marcar.
  assert.equal(estudioPuedePasar("PRESENTADO", "PAGADO", "PRESENTACION"), false);
});

test("aviso: tope de renglones con «y N más» y criollo «a cargo del» (H4 · H5)", () => {
  const filas = Array.from({ length: 120 }, (_, i) =>
    fila({ nombre: `Obl ${i}`, periodo: `2025-${String((i % 12) + 1).padStart(2, "0")}`, fechaVencimiento: new Date(Date.UTC(2025, i % 12, 13)) }),
  );
  const m = armarMonitor(filas, { tieneEstudio: false, ahora: enArgentina("2026-04-20") });
  const avisos = avisosDelMonitor(m);
  assert.equal(avisos.length, 120);
  const texto = textoDelAviso("Negocio Sintético", avisos);
  assert.equal(texto.split("\n").filter((l) => l.startsWith("• ")).length, RENGLONES_DEL_AVISO);
  assert.match(texto, /\ny 110 más en Factoque\.$/);
  assert.ok(enlaceWhatsApp(texto).length < 3000, "el enlace wa.me queda acotado");
  assert.match(texto, /a cargo del negocio/);
  assert.doesNotMatch(texto, /de el /);
  const conEstudio = textoDelAviso("N", avisosDelMonitor(armarMonitor(filas.slice(0, 2), { tieneEstudio: true, ahora: enArgentina("2026-04-20") })));
  assert.match(conEstudio, /a cargo del estudio contable/);
  assert.doesNotMatch(conEstudio, /y \d+ más/);
});

test("períodos a generar: mes anterior, mes en curso y los dos años; cruza el año", () => {
  assert.deepEqual(periodosParaGenerar(enArgentina("2026-04-20")), ["2026-03", "2026-04", "2025", "2026"]);
  assert.deepEqual(periodosParaGenerar(enArgentina("2026-01-05")), ["2025-12", "2026-01", "2025", "2026"]);
});

test("obligaciones nuevas: terminación de CUIT, fin de semana y feriado", () => {
  // SICORE marzo → abril; terminación 6 → sábado 11/04 → lunes 13/04.
  const sicore = calcularVencimientos("20123456786", "2026-03", TABLA_VENCIMIENTOS_2026, FERIADOS_2026, ["SICORE"]);
  assert.ok(sicore.ok);
  assert.equal(diaIso(sicore.vencimientos[0].fechaVencimiento), "2026-04-13");
  assert.ok(sicore.vencimientos[0].corrido);

  // Ganancias DDJJ 2025: terminación 6 → 15/06 (feriado) → 16/06; terminación 0 → jueves 11/06, sin correr.
  const ddjj6 = calcularVencimientos("20123456786", "2025", TABLA_VENCIMIENTOS_2026, FERIADOS_2026, ["GANANCIAS_DDJJ"]);
  assert.ok(ddjj6.ok);
  assert.equal(diaIso(ddjj6.vencimientos[0].fechaVencimiento), "2026-06-16");
  const ddjj0 = calcularVencimientos("20100000130", "2025", TABLA_VENCIMIENTOS_2026, FERIADOS_2026, ["GANANCIAS_DDJJ"]);
  assert.ok(ddjj0.ok);
  assert.equal(diaIso(ddjj0.vencimientos[0].fechaVencimiento), "2026-06-11");
  assert.equal(ddjj0.vencimientos[0].corrido, false);

  // Las que dependen del perfil fiscal entran apagadas y todo lo nuevo está marcado provisional.
  const porCodigo = new Map(TABLA_VENCIMIENTOS_2026.obligaciones.map((o) => [o.codigo, o]));
  assert.equal(porCodigo.get("SICORE")?.activaPorDefecto, false);
  assert.equal(porCodigo.get("IIBB_AGENTE")?.activaPorDefecto, false);
  assert.equal(porCodigo.get("GANANCIAS_DDJJ")?.activaPorDefecto, false); // H6: monotributistas no la presentan
  assert.equal(TABLA_VENCIMIENTOS_2026.provisional, true);
});
