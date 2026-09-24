import { test } from "node:test";
import assert from "node:assert/strict";
import { nombreDeArchivo, paraNombreDeArchivo, periodoParaArchivo } from "./nombre-de-archivo";
import { cabecerasCsv } from "@/lib/libros/csv-ar";

test("el archivo dice qué es, de qué negocio y de qué período", () => {
  assert.equal(
    nombreDeArchivo(["reportes", "CH Estética", ...periodoParaArchivo("2026-06-27", "2026-09-24")]),
    "reportes-ch-estetica-2026-06-27-al-2026-09-24.csv",
  );
  assert.equal(nombreDeArchivo(["libro IVA", "Doña Pepa Carnes", "2026-08"]), "libro-iva-dona-pepa-carnes-2026-08.csv");
  assert.equal(nombreDeArchivo(["ventas", "MAGRA", ...periodoParaArchivo("2026-09-24", "2026-09-24")]), "ventas-magra-2026-09-24.csv");
});

test("un negocio sin nombre legible no deja guiones de más ni un nombre vacío", () => {
  assert.equal(nombreDeArchivo(["ventas", "", null, "2026-09"]), "ventas-2026-09.csv");
  assert.equal(nombreDeArchivo(["¡¿?!"]), "archivo.csv");
  assert.equal(paraNombreDeArchivo("  Pádel & Co. "), "padel-co");
});

test("el nombre pasa entero por la cabecera de descarga (sin caracteres que la rompan)", () => {
  const nombre = nombreDeArchivo(["ventas por local", "Café \"La Esquina\"; Canning", "2026-09-01", "al", "2026-09-24"]);
  assert.match(nombre, /^[a-z0-9-]+\.csv$/);
  // cabecerasCsv no tiene que cambiarle nada: lo que se ve es lo que se baja.
  assert.equal(cabecerasCsv(nombre)["Content-Disposition"], `attachment; filename="${nombre}"`);
  assert.ok(nombreDeArchivo(["x".repeat(300)]).length <= 124);
});
