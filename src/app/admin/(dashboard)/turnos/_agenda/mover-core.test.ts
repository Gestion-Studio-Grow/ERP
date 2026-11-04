import { test } from "node:test";
import assert from "node:assert/strict";
import {
  destinoDelArrastre,
  destinoPorTeclado,
  diasParaMover,
  finEstirado,
  huecosParaOfrecer,
  preguntaDeMover,
  rotuloDeDuracion,
  sePuedeMover,
  textoMovido,
  veredictoDeDuracion,
  veredictoDelDestino,
} from "./mover-core";

const iso = (dia: string, hhmm: string) => new Date(`${dia}T${hhmm}:00-03:00`).toISOString();
const DIA = "2030-10-24"; // jueves
const laura = { id: "t1", inicio: iso(DIA, "16:00"), estado: "PENDING", clienta: "Laura Gómez", servicio: "Piernas completas", profesionalId: "caro" };
const ahora = new Date(iso(DIA, "11:42"));
const aLu = { profesionalId: "lu", profesional: "Lu", inicio: iso(DIA, "17:30") };

test("CH-025 · soltar a las 17:30 de Lu: entra si está entre sus huecos libres", () => {
  const v = veredictoDelDestino({ turno: laura, destino: aLu, ahora, hacen: new Set(["caro", "lu"]), huecos: [iso(DIA, "17:00"), iso(DIA, "17:30")] });
  assert.deepEqual(v, { tipo: "ok" });
});

test("CH-025 · si choca, no se suelta y se lee por qué", () => {
  const ocupado = veredictoDelDestino({ turno: laura, destino: aLu, ahora, hacen: new Set(["caro", "lu"]), huecos: [iso(DIA, "17:00")] });
  assert.equal(ocupado.tipo, "no");
  assert.match(ocupado.tipo === "no" ? ocupado.motivo : "", /A las 17:30 Lu no tiene lugar para Piernas completas/);
  const noLoHace = veredictoDelDestino({ turno: laura, destino: aLu, ahora, hacen: new Set(["caro"]), huecos: undefined });
  assert.deepEqual(noLoHace, { tipo: "no", motivo: "Lu no hace Piernas completas." });
  const pasado = veredictoDelDestino({ turno: laura, destino: { ...aLu, inicio: iso(DIA, "11:00") }, ahora, hacen: null, huecos: undefined });
  assert.deepEqual(pasado, { tipo: "no", motivo: "Ese horario ya pasó. Soltalo más adelante." });
  const cerrado = veredictoDelDestino({ turno: { ...laura, estado: "COMPLETED" }, destino: aLu, ahora, hacen: new Set(["lu"]), huecos: [aLu.inicio] });
  assert.equal(cerrado.tipo, "no");
});

test("mientras busca no se suelta; en el mismo lugar no hace nada", () => {
  assert.equal(veredictoDelDestino({ turno: laura, destino: aLu, ahora, hacen: null, huecos: undefined }).tipo, "buscando");
  assert.equal(veredictoDelDestino({ turno: laura, destino: aLu, ahora, hacen: new Set(["lu"]), huecos: undefined }).tipo, "buscando");
  const mismo = { profesionalId: "caro", profesional: "Caro", inicio: laura.inicio };
  assert.deepEqual(veredictoDelDestino({ turno: laura, destino: mismo, ahora, hacen: null, huecos: undefined }), { tipo: "igual" });
});

test("destino por columna: por box con dos, sólo si la del turno atiende ahí", () => {
  const box = { clave: "Box 1", titulo: "Box 1", detalle: null, profesionalIds: ["caro", "ana"], profesionalId: null };
  assert.equal(destinoDelArrastre(box, laura), "caro");
  assert.equal(destinoDelArrastre(box, { profesionalId: "lu" }), null);
  assert.equal(destinoDelArrastre({ ...box, profesionalIds: ["lu"], profesionalId: "lu" }, laura), "lu");
  assert.equal(sePuedeMover({ estado: "CONFIRMED" }), true);
  assert.equal(sePuedeMover({ estado: "NO_SHOW" }), false);
});

test("textos: la pregunta de mover (el WhatsApp es `mensajeMover`, con su test en mensajes-whatsapp)", () => {
  assert.equal(preguntaDeMover(aLu), "¿Mover a jue 24 17:30 con Lu?");
});

test("diasParaMover: hoy + 6, y el día del turno si cae más adelante", () => {
  assert.deepEqual(diasParaMover("2030-10-24", "2030-10-24"), ["2030-10-24", "2030-10-25", "2030-10-26", "2030-10-27", "2030-10-28", "2030-10-29", "2030-10-30"]);
  assert.equal(diasParaMover("2030-10-24", "2030-11-15").at(-1), "2030-11-15");
  assert.equal(diasParaMover("2030-10-24", "2030-10-01").length, 7);
});

test("cert F-3 · el cajón no ofrece la hora que el turno ya tiene (con la misma profesional) ni las pasadas", () => {
  const huecos = [iso(DIA, "11:00"), iso(DIA, "13:00"), iso(DIA, "16:00"), iso(DIA, "17:30")];
  // Con Caro (la del turno): ni las 11:00 (ya pasó) ni las 16:00 (es donde está).
  assert.deepEqual(huecosParaOfrecer(huecos, laura, "caro", ahora), [iso(DIA, "13:00"), iso(DIA, "17:30")]);
  // Con Lu, las 16:00 sí es un cambio: se ofrece.
  assert.deepEqual(huecosParaOfrecer(huecos, laura, "lu", ahora), [iso(DIA, "13:00"), iso(DIA, "16:00"), iso(DIA, "17:30")]);
  assert.deepEqual(huecosParaOfrecer([], laura, "caro", ahora), []);
});

// ── T2 · estirar, teclado, aviso ──

const ana = { id: "a", inicio: iso(DIA, "16:00"), fin: iso(DIA, "17:00"), estado: "PENDING" };
const marta = { id: "m", inicio: iso(DIA, "17:30"), fin: iso(DIA, "18:30"), estado: "CONFIRMED", clienta: "Marta" };
const tope = iso(DIA, "21:00");

test("estirar 15' sobre un hueco libre: entra; al mismo fin, no hace nada", () => {
  assert.equal(finEstirado(ana.inicio, ana.fin, 1, tope), iso(DIA, "17:15"));
  assert.equal(finEstirado(ana.inicio, ana.fin, -2, tope), iso(DIA, "16:30"));
  assert.equal(finEstirado(ana.inicio, ana.fin, 0, tope), ana.fin);
  assert.deepEqual(veredictoDeDuracion({ turno: ana, finNuevo: iso(DIA, "17:15"), vecinos: [marta], tope }), { tipo: "ok" });
  assert.deepEqual(veredictoDeDuracion({ turno: ana, finNuevo: ana.fin, vecinos: [marta], tope }), { tipo: "igual" });
});

test("estirar sobre otro turno: «Se pisa con Marta a las 17:30» (con el margen del servidor también)", () => {
  assert.deepEqual(veredictoDeDuracion({ turno: ana, finNuevo: iso(DIA, "17:45"), vecinos: [marta], tope }), { tipo: "no", motivo: "Se pisa con Marta a las 17:30." });
  assert.deepEqual(veredictoDeDuracion({ turno: ana, finNuevo: iso(DIA, "17:30"), vecinos: [marta], tope, margenMin: 10 }), { tipo: "no", motivo: "Se pisa con Marta a las 17:30." });
  assert.deepEqual(veredictoDeDuracion({ turno: ana, finNuevo: iso(DIA, "17:15"), vecinos: [marta], tope, margenMin: 10 }), { tipo: "ok" });
  // Un cancelado no ocupa; el propio turno tampoco.
  assert.deepEqual(veredictoDeDuracion({ turno: ana, finNuevo: iso(DIA, "18:00"), vecinos: [{ ...marta, estado: "CANCELLED" }, { ...ana, clienta: "Ana" }], tope }), { tipo: "ok" });
});

test("B-1 · un turno que ya empezó no se estira (el mismo criterio del servidor)", () => {
  const motivo = "Ese turno ya empezó: no se le cambia la duración desde la agenda.";
  assert.deepEqual(veredictoDeDuracion({ turno: ana, finNuevo: iso(DIA, "17:15"), vecinos: [], tope, ahora: new Date(iso(DIA, "16:05")) }), { tipo: "no", motivo });
  assert.deepEqual(veredictoDeDuracion({ turno: ana, finNuevo: iso(DIA, "17:15"), vecinos: [], tope, ahora: new Date(iso(DIA, "15:55")) }), { tipo: "ok" });
});

test("la manija: nunca menos de 15', nunca después del tope, y redondea a pasos de 15' desde el inicio", () => {
  assert.equal(finEstirado(ana.inicio, ana.fin, -10, tope), iso(DIA, "16:15"));
  assert.equal(finEstirado(ana.inicio, ana.fin, 40, tope), iso(DIA, "21:00"));
  assert.equal(finEstirado(ana.inicio, iso(DIA, "16:50"), 1, tope), iso(DIA, "17:00"), "un servicio de 50' pasa a 1 h, no a 65'");
  assert.equal(finEstirado(ana.inicio, ana.fin, 3, null), iso(DIA, "17:45"));
});

test("mínimo 15', de a 15', tope del día y sólo turnos vivos", () => {
  assert.deepEqual(veredictoDeDuracion({ turno: ana, finNuevo: iso(DIA, "16:00"), vecinos: [], tope }), { tipo: "no", motivo: "Lo mínimo es 15 minutos." });
  assert.deepEqual(veredictoDeDuracion({ turno: ana, finNuevo: iso(DIA, "15:00"), vecinos: [], tope }), { tipo: "no", motivo: "Lo mínimo es 15 minutos." });
  assert.deepEqual(veredictoDeDuracion({ turno: ana, finNuevo: iso(DIA, "17:10"), vecinos: [], tope }), { tipo: "no", motivo: "La duración va de a 15 minutos." });
  assert.deepEqual(veredictoDeDuracion({ turno: ana, finNuevo: iso(DIA, "21:15"), vecinos: [], tope }), { tipo: "no", motivo: "No puede terminar después de las 21:00." });
  assert.equal(veredictoDeDuracion({ turno: { ...ana, estado: "COMPLETED" }, finNuevo: iso(DIA, "17:15"), vecinos: [], tope }).tipo, "no");
});

test("teclado: ↑↓ de a media hora sin salirse del día; ←→ de columna sin salirse de la grilla", () => {
  const base = { minuto: 16 * 60, columna: 1, columnas: 3, desde: 9 * 60, hasta: 21 * 60, duracionMin: 60, paso: 30 };
  assert.deepEqual(destinoPorTeclado({ ...base, tecla: "ArrowDown" }), { minuto: 16 * 60 + 30, columna: 1 });
  assert.deepEqual(destinoPorTeclado({ ...base, tecla: "ArrowUp" }), { minuto: 15 * 60 + 30, columna: 1 });
  assert.deepEqual(destinoPorTeclado({ ...base, tecla: "ArrowLeft" }), { minuto: 16 * 60, columna: 0 });
  assert.deepEqual(destinoPorTeclado({ ...base, tecla: "ArrowRight" }), { minuto: 16 * 60, columna: 2 });
  assert.deepEqual(destinoPorTeclado({ ...base, columna: 0, tecla: "ArrowLeft" }), { minuto: 16 * 60, columna: 0 });
  assert.deepEqual(destinoPorTeclado({ ...base, columna: 2, tecla: "ArrowRight" }), { minuto: 16 * 60, columna: 2 });
  assert.deepEqual(destinoPorTeclado({ ...base, minuto: 9 * 60, tecla: "ArrowUp" }), { minuto: 9 * 60, columna: 1 });
  assert.deepEqual(destinoPorTeclado({ ...base, minuto: 20 * 60, tecla: "ArrowDown" }), { minuto: 20 * 60, columna: 1 }, "un turno de 1 h no baja de las 20");
});

test("el aviso de 8 s: «Movido a 17:00 con Caro» (con la fecha si es otro día)", () => {
  assert.equal(textoMovido({ profesionalId: "caro", profesional: "Caro", inicio: iso(DIA, "17:00") }, DIA), "Movido a 17:00 con Caro");
  assert.match(textoMovido({ profesionalId: "caro", profesional: "Caro", inicio: iso("2030-10-25", "17:00") }, DIA), /^Movido a .+ 17:00 con Caro$/);
});

test("mientras se estira: «10:00–11:15 · 1 h 15'»", () => {
  assert.equal(rotuloDeDuracion(iso(DIA, "10:00"), iso(DIA, "11:15")), "10:00–11:15 · 1 h 15'");
  assert.equal(rotuloDeDuracion(iso(DIA, "10:00"), iso(DIA, "11:00")), "10:00–11:00 · 1 h");
  assert.equal(rotuloDeDuracion(iso(DIA, "10:00"), iso(DIA, "10:45")), "10:00–10:45 · 45'");
});
