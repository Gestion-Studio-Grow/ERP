// Por dónde entró la clase decide quién le habla al alumno (decisión del dueño, 13/11).

import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAVES_PLANTILLA, PLANTILLAS_DEFAULT, armarMensaje } from "./core";
import { DESDE_DIRECTORIO, PLANTILLAS_GSG, elegirCanal, origenDeReservaConLink, origenDelPedido, plantillaGsg } from "./canal";

test("origen: ?desde=directorio → DIRECTORIO; falso o ausente → TURNERO / ALUMNO_LINK, como hoy", () => {
  assert.equal(origenDelPedido(DESDE_DIRECTORIO), "DIRECTORIO");
  assert.equal(origenDelPedido(" Directorio "), "DIRECTORIO");
  for (const raro of [undefined, null, "", "turnero", "DIRECTORIO_X", "gsg", 1, {}, ["directorio"]]) {
    assert.equal(origenDelPedido(raro), "TURNERO", String(raro));
    assert.equal(origenDeReservaConLink(raro), "ALUMNO_LINK", String(raro));
  }
  assert.equal(origenDeReservaConLink("directorio"), "DIRECTORIO");
});

test("elegirCanal: DIRECTORIO → GSG en tercera persona, con el modo vigente", () => {
  assert.deepEqual(elegirCanal("DIRECTORIO", "cloud"), { quien: "GSG", envio: "cloud", voz: "tercera" });
  assert.deepEqual(elegirCanal("DIRECTORIO", "manual"), { quien: "GSG", envio: "manual", voz: "tercera" });
});

test("elegirCanal: cualquier otro origen → el profe, exactamente como hoy", () => {
  for (const o of ["TURNERO", "ALUMNO_LINK", "PROFE", "directorio", "", null, undefined, 3]) {
    assert.deepEqual(elegirCanal(o, "manual"), { quien: "PROFE", envio: "manual", voz: "profe" }, String(o));
    assert.deepEqual(elegirCanal(o, "cloud"), { quien: "PROFE", envio: "cloud", voz: "profe" }, String(o));
  }
});

test("textos de GSG: tercera persona con el nombre del profe, para todo aviso al alumno", () => {
  for (const k of CLAVES_PLANTILLA) {
    if (k === "pedidoAlProfe") continue;
    assert.match(PLANTILLAS_GSG[k], /\{profe\}/, k);
    assert.doesNotMatch(PLANTILLAS_GSG[k], /\bTe confirmo\b|\bno puedo\b|\bRecibí\b|\bTe pasé\b|\bmandame\b/i, k);
  }
  const t = armarMensaje(plantillaGsg("confirmada", { hayPrecio: true, hayAlias: true }), {
    nombre: "Juan", profe: "Matías", dia: "jueves 20/11", hora: "18:00", precio: "$ 25.000", alias: "mati.padel", link: "https://x/alumno/t",
  });
  assert.match(t, /^Hola Juan! Tu profe Matías confirmó tu clase del jueves 20\/11 a las 18:00\./);
  // Sin precio no dice «$ 0»; sin alias no promete uno.
  assert.doesNotMatch(plantillaGsg("confirmada", { hayPrecio: false, hayAlias: false }), /\{precio\}|\{alias\}/);
  assert.equal(plantillaGsg("pedidoAlProfe", { hayPrecio: true, hayAlias: true }), PLANTILLAS_DEFAULT.pedidoAlProfe);
});
