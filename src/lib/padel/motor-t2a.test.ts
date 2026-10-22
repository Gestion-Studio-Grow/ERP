// Tanda 2A — reglas puras del motor nuevo (matias-DISENO.md §4 2A · M-026…M-045).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLAVES_PLANTILLA,
  MOTIVO_AUSENTE_NO_SE_COBRA,
  MOTIVO_AUSENTE_SE_COBRA,
  PLANTILLAS_DEFAULT,
  PLANTILLA_LABEL,
  armarIcs,
  armarMensaje,
  detalleDeuda,
  diaHumano,
  diasEntre,
  esDeuda,
  esEnRevision,
  esMedioCobro,
  esMotivoCancel,
  esPagable,
  franjasLibres,
  horaHumana,
  huecosDelDia,
  linkTurneroEnHora,
  masCercanas,
  plantillaDeCancelacion,
  proponerMovidas,
  puedeCobrarProfe,
  puedeSubirComprobante,
  semanaDesdeLunes,
  sumarDias,
  textoAlternativas,
  textoMensajeValido,
  totalDeuda,
  type Franja,
} from "./core";

// 2026-10-20 es martes. Hora argentina = UTC-3 todo el año.
const MARTES = "2026-10-20";
const semana: Franja[] = [
  { diaSemana: 2, fecha: null, desde: "16:00", hasta: "21:00", tipo: "DA" },
  { diaSemana: 3, fecha: null, desde: "16:00", hasta: "21:00", tipo: "DA" },
];
const en = (fecha: string, h: string) => new Date(`${fecha}T${h}:00-03:00`);
const iso = (fecha: string, h: string) => en(fecha, h).toISOString();

/** Una barra invertida (para leer el escape de un .ics sin pelearse con los escapes del test). */
const BARRA = String.fromCharCode(92);

test("plantillas nuevas: movida, suspendida, recordatorioDeuda y linkPedido, con su rótulo", () => {
  for (const k of ["movida", "suspendida", "recordatorioDeuda", "linkPedido"] as const) {
    assert.ok(CLAVES_PLANTILLA.includes(k), k);
    assert.ok(PLANTILLAS_DEFAULT[k].length > 10, k);
    assert.ok(PLANTILLA_LABEL[k], k);
  }
  for (const k of CLAVES_PLANTILLA) assert.doesNotMatch(PLANTILLA_LABEL[k], /plantilla|tenant/i, "sin jerga en lo que ve el profe");
});

test("M-032: «Te pasé la clase del jueves 22/10 19:00 al viernes 23/10 20:00» — un solo mensaje, sin «no puedo»", () => {
  // (El diseño dice «jue 23» con el calendario de 2025; en 2026 el jueves es 22.)
  const antes = en("2026-10-22", "19:00");
  const despues = en("2026-10-23", "20:00");
  const texto = armarMensaje(PLANTILLAS_DEFAULT.movida, {
    nombre: "Juan", diaAnterior: diaHumano(antes), horaAnterior: horaHumana(antes), dia: diaHumano(despues), hora: horaHumana(despues), link: "https://x/alumno/t",
  });
  assert.match(texto, /Te pasé la clase del jueves 22\/10 19:00 al viernes 23\/10 20:00/);
  assert.doesNotMatch(texto, /no puedo/i);
  assert.match(texto, /https:\/\/x\/alumno\/t/);
});

test("M-036: lluvia y club cerrado → «Se suspende por lluvia…»; el resto → «No puedo»", () => {
  assert.deepEqual(plantillaDeCancelacion("LLUVIA"), { clave: "suspendida", motivo: "lluvia" });
  assert.equal(plantillaDeCancelacion("CLUB_CERRADO").clave, "suspendida");
  assert.equal(plantillaDeCancelacion("ENFERMEDAD").clave, "rechazada");
  assert.equal(plantillaDeCancelacion("ALUMNO_AVISO").clave, "rechazada");
  const t = armarMensaje(PLANTILLAS_DEFAULT.suspendida, { nombre: "Ana", motivo: "lluvia", dia: "sábado 25/10", hora: "10:00", turnero: "https://x/clases" });
  assert.match(t, /Se suspende por lluvia la clase del sábado 25\/10 a las 10:00/);
  assert.equal(esMotivoCancel("LLUVIA"), true);
  assert.equal(esMotivoCancel("lluvia"), false);
});

test("M-045: «No vino → se cobra igual» es deuda; «no se cobra» no; AUSENTE sin marca, tampoco", () => {
  const base = { estado: "AUSENTE", pagoEstado: "PENDIENTE", pagoMedio: null, precio: 25_000 };
  assert.equal(esDeuda({ ...base, motivoCancel: MOTIVO_AUSENTE_SE_COBRA }), true);
  assert.equal(esDeuda({ ...base, motivoCancel: MOTIVO_AUSENTE_NO_SE_COBRA }), false);
  assert.equal(esDeuda(base), false, "lo viejo (sin marca) no cambia");
  assert.equal(esDeuda({ ...base, motivoCancel: MOTIVO_AUSENTE_SE_COBRA, pagoEstado: "PAGADO" }), false, "cobrada ya no se debe");
  assert.equal(esDeuda({ ...base, motivoCancel: MOTIVO_AUSENTE_SE_COBRA, precio: 0 }), false);
  assert.equal(esDeuda({ ...base, motivoCancel: MOTIVO_AUSENTE_SE_COBRA, pagoEstado: "EN_REVISION" }), false, "O-5: en revisión va aparte");
  assert.equal(esEnRevision({ ...base, motivoCancel: MOTIVO_AUSENTE_SE_COBRA, pagoEstado: "EN_REVISION" }), true);
  assert.equal(esPagable({ ...base, motivoCancel: MOTIVO_AUSENTE_SE_COBRA }), true, "el alumno la puede pagar desde su link");
  assert.equal(totalDeuda([{ ...base, motivoCancel: MOTIVO_AUSENTE_SE_COBRA }, { estado: "DADA", pagoEstado: "PENDIENTE", precio: 25_000 }]), 50_000);
});

test("M-040/M-039: el profe cobra una viva sin pagar o una AUSENTE que se cobra; nunca dos veces", () => {
  assert.equal(puedeCobrarProfe({ estado: "CONFIRMADA", pagoEstado: "PENDIENTE", precio: 25_000 }), true);
  assert.equal(puedeCobrarProfe({ estado: "DADA", pagoEstado: "EN_REVISION", precio: 25_000 }), true, "le pagó en mano");
  assert.equal(puedeCobrarProfe({ estado: "DADA", pagoEstado: "PAGADO", precio: 25_000 }), false);
  assert.equal(puedeCobrarProfe({ estado: "CANCELADA", pagoEstado: "PENDIENTE", precio: 25_000 }), false);
  assert.equal(puedeCobrarProfe({ estado: "AUSENTE", pagoEstado: "PENDIENTE", precio: 25_000, motivoCancel: MOTIVO_AUSENTE_SE_COBRA }), true);
  assert.equal(puedeCobrarProfe({ estado: "AUSENTE", pagoEstado: "PENDIENTE", precio: 25_000, motivoCancel: MOTIVO_AUSENTE_NO_SE_COBRA }), false);
  assert.equal(puedeCobrarProfe({ estado: "AUSENTE", pagoEstado: "ACREDITADO", precio: 25_000, motivoCancel: MOTIVO_AUSENTE_SE_COBRA }), false);
  assert.equal(esMedioCobro("TRANSFERENCIA"), true);
  assert.equal(esMedioCobro("SALDO_A_FAVOR"), false, "el saldo a favor lo aplica la app sola");
});

test("comprobante para varias: sólo lo pagable o lo que ya está en revisión", () => {
  assert.equal(puedeSubirComprobante({ estado: "DADA", pagoEstado: "PENDIENTE", precio: 25_000 }), true);
  assert.equal(puedeSubirComprobante({ estado: "CONFIRMADA", pagoEstado: "PENDIENTE", precio: 25_000 }), true);
  assert.equal(puedeSubirComprobante({ estado: "CONFIRMADA", pagoEstado: "EN_REVISION", precio: 25_000 }), true, "manda otro");
  assert.equal(puedeSubirComprobante({ estado: "PEDIDA", pagoEstado: "PENDIENTE", precio: 25_000 }), false, "PEDIDA nunca");
  assert.equal(puedeSubirComprobante({ estado: "DADA", pagoEstado: "PAGADO", precio: 25_000 }), false);
  assert.equal(puedeSubirComprobante({ estado: "SIN_RESPUESTA", pagoEstado: "PENDIENTE", precio: 25_000 }), false);
});

test("huecos del día: sin anticipación (son del profe), y lo que ya pasó no es hueco", () => {
  const ocupadas = [{ startsAt: en(MARTES, "17:00"), endsAt: en(MARTES, "18:00") }, { startsAt: en(MARTES, "19:00"), endsAt: en(MARTES, "20:00") }];
  const aLas1530 = en(MARTES, "15:30");
  // M-056: con clases a las 17 y 19 y horario 16–21: libres 16, 18 y 20.
  assert.deepEqual(huecosDelDia({ fecha: MARTES, franjas: semana, ocupadas, duracionMin: 60, ahora: aLas1530 }), [iso(MARTES, "16:00"), iso(MARTES, "18:00"), iso(MARTES, "20:00")]);
  // El alumno, con 2 h de anticipación, a esa hora no ve las 16 ni las 17.
  const alumno = franjasLibres({ fecha: MARTES, franjas: semana, ocupadas, duracionMin: 60, anticipacionMin: 120, ahora: aLas1530 });
  assert.deepEqual(alumno, [iso(MARTES, "18:00"), iso(MARTES, "20:00")]);
  // A las 18:10 el hueco de las 18 ya empezó.
  assert.deepEqual(huecosDelDia({ fecha: MARTES, franjas: semana, ocupadas, duracionMin: 60, ahora: en(MARTES, "18:10") }), [iso(MARTES, "20:00")]);
});

test("M-057: la semana arranca SIEMPRE en el lunes", () => {
  assert.equal(semanaDesdeLunes("2026-10-22"), "2026-10-19", "un miércoles → el lunes");
  assert.equal(semanaDesdeLunes("2026-10-19"), "2026-10-19", "el lunes es el lunes");
  assert.equal(semanaDesdeLunes("2026-10-25"), "2026-10-19", "el domingo cierra la semana");
  assert.equal(semanaDesdeLunes("2026-11-01"), "2026-10-26", "cruza el mes");
  assert.equal(semanaDesdeLunes("2027-01-01"), "2026-12-28", "cruza el año");
  assert.equal(sumarDias("2026-10-31", 1), "2026-11-01");
});

test("M-038: los días de un viaje (del 10 al 17 son 8) y los bordes", () => {
  const d = diasEntre("2026-11-10", "2026-11-17");
  assert.equal(d.length, 8);
  assert.equal(d[0], "2026-11-10");
  assert.equal(d[7], "2026-11-17");
  assert.deepEqual(diasEntre("2026-11-17", "2026-11-10"), [], "al revés no bloquea nada");
  assert.deepEqual(diasEntre("x", "2026-11-10"), []);
  assert.equal(diasEntre("2026-01-01", "2026-12-31", 62).length, 62, "con tope");
});

test("M-037: proponerMovidas — a cada clase, el primer hueco libre que viene después, sin repetir", () => {
  const sab = "2026-10-24";
  const dom = "2026-10-25";
  const afectadas = [
    { id: "c2", empiezaEn: en(sab, "11:00") },
    { id: "c1", empiezaEn: en(sab, "10:00") },
    { id: "c3", empiezaEn: en(sab, "12:00") },
  ];
  const libres = [iso(dom, "10:00"), iso(dom, "09:00"), iso(sab, "08:00")];
  const p = proponerMovidas(afectadas, libres);
  assert.deepEqual(p.map((x) => x.claseId), ["c1", "c2", "c3"], "en orden de hora");
  assert.equal(p[0].propuesta, iso(dom, "09:00"), "el de las 8 del sábado es ANTES: no");
  assert.equal(p[1].propuesta, iso(dom, "10:00"));
  assert.equal(p[2].propuesta, null, "sin hueco: se cancela o se mueve a mano");
  assert.equal(new Set(p.map((x) => x.propuesta).filter(Boolean)).size, 2, "cada hueco una sola vez");
  assert.deepEqual(proponerMovidas([], libres), []);
});

test("M-043: hasta 3 horarios cercanos y el «¿Te sirve … o …?» con el link al turnero en esa hora", () => {
  const jue = "2026-10-22";
  const libres = [iso(jue, "16:00"), iso(jue, "20:00"), iso("2026-10-23", "19:00"), iso(jue, "18:00"), iso(jue, "19:00")];
  const cerca = masCercanas(libres, en(jue, "19:00"), 3);
  assert.deepEqual(cerca, [iso(jue, "18:00"), iso(jue, "20:00"), iso(jue, "16:00")].sort(), "no ofrece la misma hora que no puede");
  const t = textoAlternativas([iso(jue, "20:00"), iso("2026-10-23", "19:00")], "https://x/clases");
  assert.match(t, /^¿Te sirve jue 22\/10 20:00 o vie 23\/10 19:00\?/);
  assert.ok(t.includes(linkTurneroEnHora("https://x/clases", iso(jue, "20:00"))));
  assert.match(linkTurneroEnHora("https://x/clases", iso(jue, "20:00")), /\/clases\?hora=2026-10-22T23%3A00%3A00\.000Z$/);
  assert.equal(textoAlternativas([], "https://x/clases"), "");
  assert.equal(textoAlternativas(["basura"], "https://x/clases"), "");
});

test("M-074: el detalle de lo que debe, con el total", () => {
  const d = detalleDeuda([
    { estado: "DADA", pagoEstado: "PENDIENTE", precio: 25_000, empiezaEn: en("2026-10-16", "18:00") },
    { estado: "AUSENTE", pagoEstado: "PENDIENTE", precio: 25_000, motivoCancel: MOTIVO_AUSENTE_SE_COBRA, empiezaEn: en("2026-10-09", "18:00") },
    { estado: "DADA", pagoEstado: "PAGADO", precio: 25_000, empiezaEn: en("2026-10-02", "18:00") },
  ]);
  assert.equal(d.cantidad, 2);
  assert.equal(d.total, 50_000);
  assert.match(d.detalle, /^vie 0?9\/10 18:00 \(\$ 25\.000\), vie 16\/10 18:00/);
});

test("dejarle un mensaje: 2 a 500 letras, sin caracteres de control", () => {
  assert.equal(textoMensajeValido("  hola  profe "), "hola profe");
  assert.equal(textoMensajeValido("a"), null);
  assert.equal(textoMensajeValido("x".repeat(501)), null);
  assert.equal(textoMensajeValido("hola\u0000\u0007"), "hola");
  assert.equal(textoMensajeValido(undefined), null);
});

test(".ics: hora de pared de Buenos Aires con TZID, CRLF y texto escapado", () => {
  const ics = armarIcs({
    uid: "c1@clases-padel",
    empiezaEn: en("2026-10-23", "19:00"),
    terminaEn: en("2026-10-23", "20:00"),
    titulo: "Clase de pádel, Profe; Matías",
    lugar: "Club Norte",
    ahora: new Date("2026-10-22T12:00:00Z"),
  });
  assert.ok(ics.includes("\r\n"), "CRLF");
  assert.match(ics, /DTSTART;TZID=America\/Argentina\/Buenos_Aires:20261023T190000/);
  assert.match(ics, /DTEND;TZID=America\/Argentina\/Buenos_Aires:20261023T200000/);
  assert.match(ics, /TZOFFSETTO:-0300/);
  // O-1 (CERT T2+T3): el `;` va escapado (`\;`, RFC 5545 §3.3.11). Antes esta línea aceptaba el `;` pelado.
  assert.ok(ics.includes(`SUMMARY:Clase de pádel${BARRA}, Profe${BARRA}; Matías\r\n`), "coma y punto y coma escapados");
  assert.match(ics, /DTSTAMP:20261022T120000Z/);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n[\s\S]*END:VCALENDAR\r\n$/);
});
