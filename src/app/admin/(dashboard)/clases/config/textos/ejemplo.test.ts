import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANTILLAS_DEFAULT } from "@/lib/padel/core";
import { datosDeEjemplo, insertarVariable, vistaPrevia } from "./ejemplo";

test("vista previa con datos de ejemplo: no queda ninguna {llave} a la vista (M-084)", () => {
  const datos = datosDeEjemplo({ alias: "matias.padel", profe: "Matías", origen: "https://agendaprofe.gsgapp.com.ar" });
  for (const texto of Object.values(PLANTILLAS_DEFAULT)) assert.doesNotMatch(vistaPrevia(texto, datos), /\{\w+\}/);
  assert.equal(
    vistaPrevia("Hola {nombre}! Pasalo a {alias}.", datos),
    "Hola Juan! Pasalo a matias.padel.",
  );
  assert.match(vistaPrevia("{alias}", datosDeEjemplo({ alias: "", profe: "M", origen: "" })), /tu\.alias/);
});

test("insertarVariable: en el cursor, con un espacio si hace falta", () => {
  assert.deepEqual(insertarVariable("Hola", "nombre", null, null), { texto: "Hola {nombre}", cursor: 13 });
  assert.deepEqual(insertarVariable("Hola !", "nombre", 5, 5), { texto: "Hola {nombre}!", cursor: 13 });
  assert.deepEqual(insertarVariable("", "dia", 0, 0), { texto: "{dia}", cursor: 5 });
  // Reemplaza lo seleccionado.
  assert.deepEqual(insertarVariable("Hola XX", "nombre", 5, 7), { texto: "Hola {nombre}", cursor: 13 });
});
