// Mañana con respuestas (reingeniería CH, Tanda 2, CH-027): el contador y qué se ofrece por clienta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { contarManana, respuestaDe, teclasDeRespuesta, textoDelContador, unirTurnos, type Respuesta, type TurnoDeManana } from "./manana-core";

const t = (id: string, status: TurnoDeManana["status"] = "PENDING", avisadaEl: string | null = null): TurnoDeManana => ({ id, status, avisadaEl });

test("CH-027 · 7 avisadas · 5 confirmadas · 1 cambia · 1 cancela", () => {
  const turnos = ["a", "b", "c", "d", "e", "f", "g"].map((id) => t(id));
  const avisadas = Object.fromEntries(turnos.map((x) => [x.id, "2026-10-22T21:00:00.000Z"]));
  const respuestas: Record<string, Respuesta> = { a: "confirmo", b: "confirmo", c: "confirmo", d: "confirmo", e: "confirmo", f: "cambia", g: "cancela" };
  const c = contarManana(turnos, avisadas, respuestas);
  assert.deepEqual(c, { total: 7, avisadas: 7, confirmadas: 5, cambian: 1, cancelan: 1 });
  assert.equal(textoDelContador(c), "7 avisadas · 5 confirmadas · 1 cambia · 1 cancela");
});

test("el contador habla bien: singular, plural, y lo que está en cero no se dice (salvo avisadas y confirmadas)", () => {
  assert.equal(textoDelContador({ total: 3, avisadas: 1, confirmadas: 0, cambian: 2, cancelan: 0 }), "1 avisada · 0 confirmadas · 2 cambian");
  assert.equal(textoDelContador({ total: 0, avisadas: 0, confirmadas: 0, cambian: 0, cancelan: 0 }), "0 avisadas · 0 confirmadas");
});

test("lo guardado cuenta: avisada por el sistema y Confirmado de antes; lo anotado en la vuelta manda", () => {
  const turnos = [t("a", "CONFIRMED", "2026-10-22T12:00:00.000Z"), t("b"), t("c", "CONFIRMED")];
  assert.deepEqual(contarManana(turnos, {}, {}), { total: 3, avisadas: 1, confirmadas: 2, cambian: 0, cancelan: 0 });
  // Una Confirmada que al recibir el recordatorio quiere cambiar: cuenta como «cambia».
  assert.equal(respuestaDe(turnos[0], { a: "cambia" }), "cambia");
  assert.deepEqual(contarManana(turnos, {}, { a: "cambia" }), { total: 3, avisadas: 1, confirmadas: 1, cambian: 1, cancelan: 0 });
});

test("qué se ofrece: las tres a una Reservada; a una Confirmada, cambiar o cancelar; ya respondió, nada", () => {
  assert.deepEqual(teclasDeRespuesta(t("a"), {}), ["confirmo", "cambia", "cancela"]);
  assert.deepEqual(teclasDeRespuesta(t("a", "CONFIRMED"), {}), ["cambia", "cancela"]);
  assert.deepEqual(teclasDeRespuesta(t("a"), { a: "confirmo" }), []);
  assert.deepEqual(teclasDeRespuesta(t("a", "CONFIRMED"), { a: "cancela" }), []);
});

test("la que canceló o se movió sigue en la lista: se unen los de al abrir con los de ahora", () => {
  const antes = [t("a"), t("b"), t("c")];
  const ahora = [t("a", "CONFIRMED"), t("c"), t("d")];
  const u = unirTurnos(antes, ahora);
  assert.deepEqual(u.map((x) => x.id), ["a", "b", "c", "d"]);
  assert.equal(u[0].status, "CONFIRMED", "el de ahora pisa al de antes");
});
