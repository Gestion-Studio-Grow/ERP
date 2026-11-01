// La cara del sitio de CH con el diseño nuevo (UAT 3 personas, punto 6): categorías de relleno, contrastes y el pie.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { categoriaVisible } from "./_ch/copy-ch";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");

test("«Otros servicios» es relleno, no una categoría que se le muestre a la clienta", () => {
  assert.equal(categoriaVisible("Otros servicios"), false);
  assert.equal(categoriaVisible(" otros servicios "), false);
  assert.equal(categoriaVisible("Depilación"), true);
  assert.match(leer("src/app/(site)/_ch/InicioCH.tsx"), /categoriaVisible\(s\.grupo\)/);
  assert.match(leer("src/app/(site)/_ch/BookingModal.tsx"), /categoriaVisible\(svc\.categoria\)/);
  assert.match(leer("src/app/(site)/_ch/Carta.tsx"), /!categoriaVisible\(familias\[0\]\.name\)/);
});

test("contraste: las etiquetas del hueco y la marca del pie, con el color de texto y no mezclados", () => {
  assert.doesNotMatch(leer("src/app/(site)/_ch/estilos-ch.ts"), /--chf-claro:color-mix/);
  assert.match(leer("src/app/(site)/layout.tsx"), /color: chNuevo \? "var\(--text-on-accent\)" : "var\(--accent\)"/);
});

test("con el diseño nuevo, el pie público no ofrece la entrada al panel; los demás, como siempre", () => {
  assert.match(leer("src/app/(site)/layout.tsx"), /\{!chNuevo && \(\s*<Link href="\/admin"/);
});
