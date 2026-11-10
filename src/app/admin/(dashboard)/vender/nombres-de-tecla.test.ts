import { test } from "node:test";
import assert from "node:assert/strict";
import { nombresSinRepetir } from "./nombres-de-tecla";

test("el proveedor al final, en todas: se saca y se dice una vez", () => {
  const r = nombresSinRepetir(["Lomo — Frigorífico El Novillo", "Vacío — Frigorífico El Novillo", "Asado de tira — Frigorífico El Novillo"]);
  assert.deepEqual(r.cortos, ["Lomo", "Vacío", "Asado de tira"]);
  assert.equal(r.comun, "Frigorífico El Novillo");
});

test("el proveedor adelante, con otro separador", () => {
  const r = nombresSinRepetir(["Novillo · Lomo", "Novillo · Vacío"]);
  assert.deepEqual(r.cortos, ["Lomo", "Vacío"]);
  assert.equal(r.comun, "Novillo");
});

test("proveedores mezclados: se sacan los repetidos, sin pedazo común", () => {
  const r = nombresSinRepetir(["Lomo - El Novillo", "Vacío - El Novillo", "Chorizo - Sur", "Morcilla - Sur", "Pollo entero"]);
  assert.deepEqual(r.cortos, ["Lomo", "Vacío", "Chorizo", "Morcilla", "Pollo entero"]);
  assert.equal(r.comun, null);
});

test("nunca corta palabras sueltas ni guiones sin espacios", () => {
  const nombres = ["Pollo entero", "Pollo trozado", "Bife ancho-angosto", "Milanesas de nalga"];
  assert.deepEqual(nombresSinRepetir(nombres).cortos, nombres);
  assert.equal(nombresSinRepetir(nombres).comun, null);
});

test("un pedazo que aparece una sola vez se queda", () => {
  assert.deepEqual(nombresSinRepetir(["Lomo — Novillo", "Vacío — Sur"]).cortos, ["Lomo — Novillo", "Vacío — Sur"]);
});

test("si al cortar dos teclas quedan iguales, conservan el nombre completo", () => {
  const r = nombresSinRepetir(["Lomo — Novillo", "Lomo — Sur", "Vacío — Novillo", "Vacío — Sur"]);
  // «Novillo» y «Sur» se repiten, pero cortarlos deja «Lomo» dos veces: quedan completos.
  assert.deepEqual(r.cortos, ["Lomo — Novillo", "Lomo — Sur", "Vacío — Novillo", "Vacío — Sur"]);
  assert.equal(r.comun, null);
});

test("mayúsculas distintas cuentan como el mismo proveedor", () => {
  const r = nombresSinRepetir(["LOMO | NOVILLO", "Vacío | Novillo"]);
  assert.deepEqual(r.cortos, ["LOMO", "Vacío"]);
  assert.equal(r.comun, "NOVILLO");
});

test("una sola tecla o ninguna: nada que sacar", () => {
  assert.deepEqual(nombresSinRepetir(["Lomo — Novillo"]), { cortos: ["Lomo — Novillo"], comun: null });
  assert.deepEqual(nombresSinRepetir([]), { cortos: [], comun: null });
});
