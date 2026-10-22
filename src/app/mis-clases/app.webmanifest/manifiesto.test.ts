// M-049: el manifiesto del alumno abre en /mis-clases con el nombre del profe, nunca en /admin.

import { test } from "node:test";
import assert from "node:assert/strict";
import { manifiestoAlumno } from "./manifiesto";
import { marcaProfe } from "@/lib/padel/marca";

test("«Clases con Matías», start_url /mis-clases y nada que apunte a /admin", () => {
  const m = manifiestoAlumno({ profe: "Matías", nombre: "Matías Consoli" }, marcaProfe("matiasconsoli"));
  assert.equal(m.start_url, "/mis-clases");
  assert.equal(m.name, "Clases con Matías");
  assert.ok(!JSON.stringify(m).includes("/admin"), "el manifiesto del alumno no puede mencionar /admin");
  assert.ok(m.short_name.length <= 12);
});

test("sin nombre de profe (el «profe» genérico), cae al nombre del negocio", () => {
  const m = manifiestoAlumno({ profe: "profe", nombre: "Clases de pádel" }, marcaProfe(null));
  assert.equal(m.name, "Clases de pádel");
  assert.equal(m.start_url, "/mis-clases");
});
