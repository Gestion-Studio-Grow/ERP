import { test } from "node:test";
import assert from "node:assert/strict";
import { destinoDelArrastre, diasParaMover, preguntaDeMover, sePuedeMover, textoDeMover, veredictoDelDestino } from "./mover-core";

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

test("textos: la pregunta y el WhatsApp de mover, sin undefined ni null", () => {
  assert.equal(preguntaDeMover(aLu), "¿Mover a jue 24 17:30 con Lu?");
  const t = textoDeMover({ clienta: "Laura Gómez", inicio: aLu.inicio, profesional: "Lu" });
  assert.equal(t, "¡Hola Laura! Te pasamos el turno al jue 24 17:30 con Lu. Cualquier cosa, avisanos por acá.");
  assert.match(t, /Te pasamos el turno al jue 24 17:30 con Lu/);
  const sinNombre = textoDeMover({ clienta: "  ", inicio: aLu.inicio, profesional: "Lu" });
  assert.doesNotMatch(sinNombre, /undefined|null|NaN/);
  assert.match(sinNombre, /^¡Hola! Te pasamos/);
});

test("diasParaMover: hoy + 6, y el día del turno si cae más adelante", () => {
  assert.deepEqual(diasParaMover("2030-10-24", "2030-10-24"), ["2030-10-24", "2030-10-25", "2030-10-26", "2030-10-27", "2030-10-28", "2030-10-29", "2030-10-30"]);
  assert.equal(diasParaMover("2030-10-24", "2030-11-15").at(-1), "2030-11-15");
  assert.equal(diasParaMover("2030-10-24", "2030-10-01").length, 7);
});
