// cotizar del servidor: es copia de la app (no puede divergir) y calcula lo esperado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cotizar } from "./precios";
import type { Album } from "./tipos";

test("src/lib/btf/precios.ts es idéntico al de la app (salvo la línea de cabecera)", () => {
  const leer = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
  const servidor = leer("src/lib/btf/precios.ts").split("\n").slice(1).join("\n");
  assert.equal(servidor, leer("celula-negocios-digitales/buscatufoto/src/lib/precios.ts"));
});

const album: Pick<Album, "precioFoto" | "precioVideo" | "paquetes" | "escalones" | "cupones"> = {
  precioFoto: 1000,
  precioVideo: 3000,
  paquetes: [{ id: "p", nombre: "5 fotos", cantidad: 5, precio: 3500 }],
  escalones: [{ desde: 3, porcentaje: 10 }],
  cupones: [
    { codigo: "HOLA", tipo: "porcentaje", valor: 50, tope: 500, usosMax: 0, usos: 0, activo: true },
    { codigo: "AGOTADO", tipo: "monto", valor: 100, tope: 0, usosMax: 1, usos: 1, activo: true },
  ],
};
const fotos = (n: number) => Array.from({ length: n }, () => ({ tipo: "foto" as const }));

test("escalón, paquete y unitario: gana lo más barato", () => {
  assert.equal(cotizar(album, fotos(2), null, 20).total, 2000);
  assert.equal(cotizar(album, fotos(3), null, 20).total, 2700);
  const cinco = cotizar(album, fotos(5), null, 20);
  assert.equal(cinco.total, 3500);
  assert.equal(cinco.regla.tipo, "paquete");
  assert.equal(cotizar(album, [{ tipo: "video" }], null, 20).total, 3000);
});

test("cupón con tope, inexistente y agotado", () => {
  const c = cotizar(album, fotos(2), "hola", 20);
  assert.deepEqual(c.cupon, { codigo: "HOLA", descuento: 500 });
  assert.equal(c.total, 1500);
  assert.equal(cotizar(album, fotos(2), "NOPE", 20).errorCupon, "Ese cupón no existe para este álbum.");
  assert.match(cotizar(album, fotos(2), "AGOTADO", 20).errorCupon ?? "", /ya se usó/);
});
