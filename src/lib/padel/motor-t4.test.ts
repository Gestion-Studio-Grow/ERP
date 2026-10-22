// ============================================================================
// TANDA 4 — el motor puro del modelo nuevo (matias-DISENO.md §4 T4 · M-115 a M-125).
// ============================================================================
// Series (turno fijo), paquetes, grupales con participantes, traslados entre clubes, pago parcial,
// «tardía se cobra» y la plata con el club (margen de la clase y cuenta con cada club). Sin base:
// lo mismo con Postgres y las acciones reales está en `motor-t4-postgres.test.ts`.
//
//   node --import tsx --test src/lib/padel/motor-t4.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLAVES_PLANTILLA,
  MOTIVO_TARDIA_SE_COBRA,
  PLANTILLAS_DEFAULT,
  PLANTILLA_LABEL,
  aplicarPagoParcial,
  choqueDeTraslado,
  claveOcurrencia,
  clubValido,
  costoDeLaClase,
  cuentaConElClub,
  descontarPaquete,
  esDeuda,
  esPagable,
  etiquetaTardia,
  expandirSerie,
  franjasLibres,
  franjasLibresConSeries,
  llegaATiempo,
  lugaresLibres,
  margenDeLaClase,
  naceConfirmada,
  ocurrenciasAGenerar,
  pagoAlCancelar,
  paqueteValido,
  precioConPaquete,
  puedeCobrarProfe,
  repartirGrupal,
  resumenCobroGrupal,
  restoDeLaClase,
  saldoAFavor,
  textoPaquete,
  textoResto,
  textoSemana,
  totalDeuda,
  transicionPago,
  type ClubBase,
  type Franja,
  type SerieBase,
} from "./core";

const aLas = (fecha: string, h: string) => new Date(`${fecha}T${h}:00-03:00`);
const serie = (p: Partial<SerieBase> = {}): SerieBase => ({
  id: "s1",
  diaSemana: 2, // martes
  hora: "19:00",
  duracionMin: 60,
  desde: "2025-10-28",
  hasta: "2025-12-31",
  pausadaDesde: null,
  pausadaHasta: null,
  activa: true,
  ...p,
});

// ── Series ──────────────────────────────────────────────────────────────────

test("M-115: martes 19:00 del 28/10 al 31/12 con pausa 11–24/11 → 10 martes menos los 2 pausados, ninguno después del 31/12", () => {
  const todas = expandirSerie(serie(), "2025-10-01", "2026-03-01");
  assert.equal(todas.length, 10, "10 martes entre el 28/10 y el 31/12/2025");
  const pausada = expandirSerie(serie({ pausadaDesde: "2025-11-11", pausadaHasta: "2025-11-24" }), "2025-10-01", "2026-03-01");
  assert.equal(pausada.length, 8);
  assert.deepEqual(pausada.map((o) => o.fecha).filter((f) => f >= "2025-11-11" && f <= "2025-11-24"), []);
  assert.ok(pausada.every((o) => o.fecha <= "2025-12-31"), "no pasa `hasta`");
  assert.ok(pausada.every((o) => new Date(`${o.fecha}T12:00:00Z`).getUTCDay() === 2), "todos martes");
  assert.equal(pausada[0].empiezaEn.toISOString(), aLas("2025-10-28", "19:00").toISOString(), "19:00 de Buenos Aires");
  assert.equal(pausada[0].terminaEn.getTime() - pausada[0].empiezaEn.getTime(), 3_600_000);
  // Las pausas extra (por parámetro) también saltean; una serie inactiva no da nada.
  assert.equal(expandirSerie(serie(), "2025-10-01", "2026-03-01", [{ desde: "2025-12-01", hasta: "2025-12-31" }]).length, 5);
  assert.deepEqual(expandirSerie(serie({ activa: false }), "2025-10-01", "2026-03-01"), []);
  // Pausa sin fecha de inicio = desde ya hasta `pausadaHasta`.
  assert.equal(expandirSerie(serie({ pausadaHasta: "2025-11-05" }), "2025-10-01", "2026-03-01").length, 8);
});

test("M-116: la serie activa reserva su franja aunque la clase de esa semana todavía no exista; generada o cancelada, manda la clase", () => {
  const fecha = "2025-11-04"; // martes
  const franjas: Franja[] = [{ diaSemana: 2, fecha: null, desde: "18:00", hasta: "21:00", tipo: "DA" }];
  const base = { fecha, franjas, ocupadas: [], duracionMin: 60, anticipacionMin: 0, ahora: new Date("2025-11-01T12:00:00Z") };
  const sin = franjasLibres(base);
  assert.ok(sin.includes(aLas(fecha, "19:00").toISOString()));
  const con = franjasLibresConSeries({ ...base, series: [serie()] });
  assert.equal(con.includes(aLas(fecha, "19:00").toISOString()), false, "19:00 NO se ofrece");
  assert.ok(con.includes(aLas(fecha, "18:00").toISOString()) && con.includes(aLas(fecha, "20:00").toISOString()));
  // Ya generada (la clase misma ocupa, o se canceló esa semana y quedó libre): la serie no reserva de nuevo.
  const generadas = new Set([claveOcurrencia("s1", fecha)]);
  assert.ok(franjasLibresConSeries({ ...base, series: [serie()], generadas }).includes(aLas(fecha, "19:00").toISOString()));
});

test("M-117: generarSemana — las ocurrencias de la semana que faltan, sin duplicar; «mar 19 y jue 19» en un solo WhatsApp", () => {
  const martes = serie();
  const jueves = serie({ id: "s2", diaSemana: 4 });
  const desde = "2025-11-03"; // lunes
  const hasta = "2025-11-09";
  const primera = ocurrenciasAGenerar([martes, jueves], desde, hasta, new Set());
  assert.deepEqual(primera.map((o) => o.fecha), ["2025-11-04", "2025-11-06"]);
  const generadas = new Set(primera.map((o) => claveOcurrencia(o.serieId, o.fecha)));
  assert.deepEqual(ocurrenciasAGenerar([martes, jueves], desde, hasta, generadas), [], "la segunda corrida no crea nada");
  assert.equal(textoSemana(primera), "mar 19 y jue 19");
  assert.equal(textoSemana([{ empiezaEn: aLas("2025-11-04", "19:30") }]), "mar 19:30");
  assert.ok(CLAVES_PLANTILLA.includes("semana") && PLANTILLAS_DEFAULT.semana.includes("{detalle}") && PLANTILLA_LABEL.semana);
});

// ── Paquetes ────────────────────────────────────────────────────────────────

const AHORA = new Date("2026-10-23T15:00:00Z");
const pack = (usadas: number, venceEn = 10) => ({ clasesTotal: 4, clasesUsadas: usadas, precio: 90_000, venceEl: new Date(AHORA.getTime() + venceEn * 86_400_000), extendidoHasta: null });

test("M-118: Pack 4 · $ 90.000 → «Dada» descuenta (4→3) y la clase vale $ 22.500 con paquete; la última → «Ofrecele renovar»", () => {
  const d = descontarPaquete(pack(0), AHORA);
  assert.deepEqual(d, { ok: true, clasesUsadas: 1, quedan: 3, ofrecerRenovar: false });
  assert.deepEqual(precioConPaquete(25_000, pack(0), AHORA), { precio: 22_500, conPaquete: true });
  const ultima = descontarPaquete(pack(3), AHORA);
  assert.deepEqual(ultima, { ok: true, clasesUsadas: 4, quedan: 0, ofrecerRenovar: true });
  assert.deepEqual(descontarPaquete(pack(4), AHORA), { ok: false, motivo: "sin-clases" });
  assert.equal(textoPaquete(pack(0), AHORA), `4 de 4 · vence ${new Date(AHORA.getTime() + 10 * 86_400_000).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: "America/Argentina/Buenos_Aires" })}`);
  assert.ok(CLAVES_PLANTILLA.includes("renovarPaquete"));
});

test("M-119: paquete vencido con 1 clase → NO descuenta, «1 clase vencida»; extendido, vuelve a servir", () => {
  const vencido = pack(3, -1);
  assert.deepEqual(descontarPaquete(vencido, AHORA), { ok: false, motivo: "vencido" });
  assert.deepEqual(precioConPaquete(25_000, vencido, AHORA), { precio: 25_000, conPaquete: false }, "la clase se cobra como siempre");
  assert.equal(textoPaquete(vencido, AHORA), "1 clase vencida");
  const extendido = { ...vencido, extendidoHasta: new Date(AHORA.getTime() + 7 * 86_400_000) };
  assert.equal(descontarPaquete(extendido, AHORA).ok, true);
});

test("paqueteValido: lista blanca de lo que carga el profe", () => {
  assert.deepEqual(paqueteValido({ nombre: " Pack  8 ", clases: 8, precio: "160000", venceDias: 45 }), { nombre: "Pack 8", clases: 8, precio: 160_000, venceDias: 45 });
  assert.equal(typeof paqueteValido({ nombre: "P", clases: 4, precio: 1, venceDias: 30 }), "string");
  assert.equal(typeof paqueteValido({ nombre: "Pack", clases: 0, precio: 1, venceDias: 30 }), "string");
  assert.equal(typeof paqueteValido({ nombre: "Pack", clases: 4, precio: 0, venceDias: 30 }), "string");
  assert.equal(typeof paqueteValido({ nombre: "Pack", clases: 4, precio: 1, venceDias: 0 }), "string");
});

// ── Grupales ────────────────────────────────────────────────────────────────

test("M-120: grupal de 3 a $ 12.000 → cada uno con su precio y su estado de pago", () => {
  const r = repartirGrupal(12_000, [{ nombre: "Ana" }, { nombre: "Beto" }, { nombre: "Caro" }]);
  assert.equal(r.total, 36_000);
  assert.deepEqual(r.participantes.map((p) => p.precio), [12_000, 12_000, 12_000]);
  assert.ok(CLAVES_PLANTILLA.includes("parteGrupal") && PLANTILLAS_DEFAULT.parteGrupal.includes("{precio}"));
});

test("M-121: Beto pagó y Ana no → «1 de 3 pagaron» y Ana debe $ 12.000 (no $ 36.000 a uno solo)", () => {
  const ps = [
    { alumnoId: "ana", nombre: "Ana", precio: 12_000, pagoEstado: "PENDIENTE" },
    { alumnoId: "beto", nombre: "Beto", precio: 12_000, pagoEstado: "PAGADO" },
    { alumnoId: "caro", nombre: "Caro", precio: 12_000, pagoEstado: "EN_REVISION" },
  ];
  const r = resumenCobroGrupal(ps);
  assert.equal(r.texto, "1 de 3 pagaron");
  assert.deepEqual(r.deben.map((p) => p.nombre), ["Ana"], "Caro mandó el comprobante: espera validación, no es deuda");
  assert.equal(r.totalDeuda, 12_000);
  // La clase en sí (POR_PARTICIPANTE) nunca es deuda ni se cobra entera.
  const clase = { estado: "DADA", pagoEstado: "POR_PARTICIPANTE", precio: 36_000 };
  assert.equal(esDeuda(clase), false);
  assert.equal(esPagable(clase), false);
  assert.equal(puedeCobrarProfe(clase), false);
  assert.equal(transicionPago("POR_PARTICIPANTE", "DADA", "efectivo", "profe"), null);
  assert.equal(transicionPago("POR_PARTICIPANTE", "CONFIRMADA", "subir", "alumno"), null);
  assert.equal(totalDeuda([clase]), 0);
});

test("M-122: grupo abierto con cupo 4 y 2 inscriptos → se suma uno y queda 1 lugar; completo, 0", () => {
  const dos = [{ alumnoId: "a" }, { alumnoId: "b" }];
  assert.equal(lugaresLibres(4, dos), 2);
  assert.equal(lugaresLibres(4, [...dos, { alumnoId: "c" }]), 1);
  assert.equal(lugaresLibres(4, [...dos, { alumnoId: "c" }, { nombre: "Amigo de Beto" }]), 0);
  assert.equal(lugaresLibres(4, [...dos, { alumnoId: null, nombre: null }]), 2, "un «lugar libre» sin nadie no ocupa");
  assert.equal(lugaresLibres(null, dos), 0, "sin cupo no es abierta");
});

// ── Traslados ───────────────────────────────────────────────────────────────

const norte: ClubBase = { id: "n", nombre: "Club Norte", trasladoMin: 20, costoCancha: 8_000, modoCobroClub: "por-hora" };
const sur: ClubBase = { id: "s", nombre: "Club Sur", trasladoMin: 30, costoCancha: 10_000, modoCobroClub: "por-clase" };

test("M-123: 18:00 en Norte (60 min) → 19:00 en Sur a 30 min: «No llegás: Club Sur queda a 30 min»", () => {
  const f = "2026-10-27";
  const anterior = { id: "c18", empiezaEn: aLas(f, "18:00"), terminaEn: aLas(f, "19:00"), club: norte };
  const nueva = { empiezaEn: aLas(f, "19:00"), terminaEn: aLas(f, "20:00"), club: sur };
  const r = choqueDeTraslado(nueva, [anterior]);
  assert.deepEqual(r, { claseId: "c18", mensaje: "No llegás: Club Sur queda a 30 min", faltanMin: 30 });
  // El diseño dice «llega con 45»: 18:00 + 45 min de clase + 30 de viaje = 19:15, NO llega a las 19:00
  // (anotado como incoherencia). Con 30 min de clase llega justo; con la nueva a las 19:30, también.
  assert.equal(llegaATiempo({ terminaEn: aLas(f, "18:45"), club: norte }, { empiezaEn: aLas(f, "19:00"), club: sur }).llega, false);
  assert.equal(llegaATiempo({ terminaEn: aLas(f, "18:30"), club: norte }, { empiezaEn: aLas(f, "19:00"), club: sur }).llega, true);
  assert.equal(choqueDeTraslado({ ...nueva, empiezaEn: aLas(f, "19:30"), terminaEn: aLas(f, "20:30") }, [anterior]), null);
  // Mismo club: no hay viaje.
  assert.equal(choqueDeTraslado({ ...nueva, club: norte }, [anterior]), null);
  // Al revés: la nueva antes de una que ya estaba en otro club.
  const despues = { id: "c20", empiezaEn: aLas(f, "20:00"), terminaEn: aLas(f, "21:00"), club: norte };
  assert.match(choqueDeTraslado({ empiezaEn: aLas(f, "19:00"), terminaEn: aLas(f, "20:00"), club: sur }, [despues])?.mensaje ?? "", /^No llegás a la de las 20:00: Club Norte queda a 20 min$/);
  // Sin traslado en el club, el de fábrica del profe.
  const sinDato = { ...sur, trasladoMin: 0 };
  assert.equal(llegaATiempo({ terminaEn: aLas(f, "19:00"), club: norte }, { empiezaEn: aLas(f, "19:00"), club: sinDato }, 15).faltanMin, 15);
});

// ── Pago parcial ────────────────────────────────────────────────────────────

test("M-124: pago parcial de $ 20.000 sobre $ 25.000 → pagado 20.000, «debe $ 5.000» y la deuda suma $ 5.000", () => {
  const c = { estado: "DADA", pagoEstado: "PENDIENTE", precio: 25_000, pagado: 0 };
  const r = aplicarPagoParcial(c, 20_000);
  assert.deepEqual(r, { pagado: 20_000, resto: 5_000, completa: false });
  const despues = { ...c, pagado: 20_000 };
  assert.equal(restoDeLaClase(despues), 5_000);
  assert.equal(textoResto(despues), "debe $ 5.000");
  assert.equal(esDeuda(despues), true);
  assert.equal(totalDeuda([despues, { estado: "DADA", pagoEstado: "PENDIENTE", precio: 25_000 }]), 30_000, "una sin la columna (sin migración) cuenta entera");
  assert.deepEqual(aplicarPagoParcial(despues, 5_000), { pagado: 25_000, resto: 0, completa: true });
  assert.ok("error" in aplicarPagoParcial(despues, 6_000), "no se cobra de más");
  assert.ok("error" in aplicarPagoParcial(despues, 0));
  // Cancelada con algo pagado: lo que entró queda a favor (ni un peso se pierde).
  const cancel = pagoAlCancelar({ pagoEstado: "PENDIENTE", pagado: 20_000 });
  assert.deepEqual(cancel, { pagoEstado: "ACREDITADO", precio: 20_000 });
  assert.equal(saldoAFavor([{ estado: "CANCELADA", pagoEstado: "ACREDITADO", precio: 20_000 }]), 20_000);
  assert.equal(pagoAlCancelar({ pagoEstado: "PENDIENTE" }), null, "sin pago parcial, como antes");
});

// ── Tardía se cobra ─────────────────────────────────────────────────────────

test("M-125: con «tardía se cobra», la cancelada tarde dice «Cancelada tarde · debe $ 25.000» y es deuda (los dos lados usan esDeuda)", () => {
  const c = { estado: "CANCELADA", pagoEstado: "PENDIENTE", precio: 25_000, motivoCancel: MOTIVO_TARDIA_SE_COBRA };
  assert.equal(esDeuda(c), true);
  assert.equal(totalDeuda([c]), 25_000);
  assert.equal(etiquetaTardia(c), "Cancelada tarde · debe $ 25.000");
  assert.equal(puedeCobrarProfe(c), true, "el profe la puede cobrar");
  assert.equal(etiquetaTardia({ ...c, pagoEstado: "PAGADO" }), "Cancelada tarde");
  assert.equal(esDeuda({ ...c, motivoCancel: "La canceló el alumno" }), false, "una cancelada a tiempo no es deuda");
  assert.equal(etiquetaTardia({ ...c, estado: "DADA" }), null);
});

test("naceConfirmada: un conocido nace confirmado salvo que el profe pida confirmar a todos (M-142)", () => {
  assert.equal(naceConfirmada(3), true);
  assert.equal(naceConfirmada(3, false), false);
  assert.equal(naceConfirmada(0, true), false);
});

// ── Plata con el club ───────────────────────────────────────────────────────

test("costoDeLaClase: por hora × duración, por clase fijo, abono mensual 0, sin dato null", () => {
  assert.equal(costoDeLaClase(norte, 90), 12_000);
  assert.equal(costoDeLaClase(sur, 90), 10_000);
  assert.equal(costoDeLaClase({ costoCancha: 200_000, modoCobroClub: "mensual" }, 60), 0);
  assert.equal(costoDeLaClase({ costoCancha: null, modoCobroClub: "por-hora" }, 60), null);
  assert.equal(costoDeLaClase({ costoCancha: 5_000, modoCobroClub: "por-dia" }, 60), null, "modo fuera de la lista blanca");
  assert.equal(costoDeLaClase(null, 60), null);
});

test("margenDeLaClase: precio (o la suma de las partes) menos la cancha; sin costo cargado lo dice", () => {
  assert.deepEqual(margenDeLaClase({ precio: 25_000, costoCancha: 8_000 }), { ingreso: 25_000, costo: 8_000, margen: 17_000, costoConocido: true });
  assert.deepEqual(margenDeLaClase({ precio: 36_000, costoCancha: 10_000, participantes: [{ precio: 12_000 }, { precio: 12_000 }, { precio: 12_000 }] }), { ingreso: 36_000, costo: 10_000, margen: 26_000, costoConocido: true });
  assert.deepEqual(margenDeLaClase({ precio: 25_000, costoCancha: null }), { ingreso: 25_000, costo: 0, margen: 25_000, costoConocido: false });
});

test("cuentaConElClub: lo que se le debe a cada club en el período (dadas y faltas; canceladas no; abono por mes)", () => {
  const f = "2026-10-20";
  const periodo = { desde: aLas("2026-10-01", "00:00"), hasta: aLas("2026-11-01", "00:00") };
  const clases = [
    { clubId: "n", estado: "DADA", empiezaEn: aLas(f, "18:00"), terminaEn: aLas(f, "19:30"), costoCancha: 12_000 },
    { clubId: "n", estado: "AUSENTE", empiezaEn: aLas(f, "20:00"), terminaEn: aLas(f, "21:00"), costoCancha: null }, // sin congelar: costo de hoy
    { clubId: "n", estado: "CANCELADA", empiezaEn: aLas(f, "21:00"), terminaEn: aLas(f, "22:00"), costoCancha: 8_000 },
    { clubId: "s", estado: "DADA", empiezaEn: aLas(f, "10:00"), terminaEn: aLas(f, "11:00"), costoCancha: 10_000 },
    { clubId: "n", estado: "DADA", empiezaEn: aLas("2026-11-02", "18:00"), terminaEn: aLas("2026-11-02", "19:00"), costoCancha: 8_000 }, // fuera del período
  ];
  assert.deepEqual(cuentaConElClub(norte, clases, periodo), { clubId: "n", nombre: "Club Norte", modo: "por-hora", clases: 2, horas: 2.5, total: 20_000, sinCosto: false });
  assert.equal(cuentaConElClub(sur, clases, periodo).total, 10_000);
  const abono: ClubBase = { id: "n", nombre: "Club Norte", trasladoMin: 0, costoCancha: 150_000, modoCobroClub: "mensual" };
  assert.equal(cuentaConElClub(abono, clases, periodo).total, 150_000, "un mes = un abono, dé las clases que dé");
  assert.equal(cuentaConElClub(abono, clases, { desde: aLas("2026-10-15", "00:00"), hasta: aLas("2026-11-15", "00:00") }).total, 300_000, "toca dos meses");
  const sinCosto = cuentaConElClub({ ...norte, costoCancha: null }, clases, periodo);
  assert.equal(sinCosto.sinCosto, true);
  assert.equal(sinCosto.total, 0);
});

test("clubValido: lista blanca del modo de cobro, costo con modo, link https", () => {
  const ok = clubValido({ nombre: "  Club   Norte ", trasladoMin: "20", costoCancha: "8000", modoCobroClub: "por-hora", techada: true });
  assert.deepEqual(ok, { nombre: "Club Norte", direccion: null, mapsUrl: null, trasladoMin: 20, costoCancha: 8_000, modoCobroClub: "por-hora", techada: true });
  assert.equal(typeof clubValido({ nombre: "Club", modoCobroClub: "por-dia" }), "string");
  assert.equal(typeof clubValido({ nombre: "Club", costoCancha: 5000 }), "string", "costo sin modo no");
  assert.equal(typeof clubValido({ nombre: "Club", mapsUrl: "javascript:alert(1)" }), "string");
  assert.equal(typeof clubValido({ nombre: "C" }), "string");
  assert.equal(typeof clubValido({ nombre: "Club", trasladoMin: -5 }), "string");
});
