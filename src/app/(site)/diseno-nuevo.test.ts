// CH (beauty-spa) está en producción. Con el interruptor «Diseño nuevo» APAGADO su sitio tiene que ser
// el de siempre. Esto lo vigila en el código:
//   · la home: `page.tsx` sin las líneas y el bloque marcados «diseño nuevo» es EXACTAMENTE la de HEAD
//     (__fixtures__/page-head.tsx.txt, sacado con `git show HEAD:src/app/(site)/page.tsx`). El bloque
//     nuevo sólo corre si el interruptor dice prendido, y va antes de todo el JSX de siempre;
//   · la home nueva no trae CSS de módulo (se sumaría a la ruta de CH aunque no se dibuje), ni avatares
//     generados, ni contenido que aparece recién al bajar;
//   · /tienda y /tienda/gracias: CH no es de mostrador ni tiene marca de tienda, así que ni prendido
//     entra a la vidriera nueva.
// Si alguien cambia A PROPÓSITO la home de siempre de CH (con OK del dueño), se regenera el fixture
// con `git show HEAD:"src/app/(site)/page.tsx"` después de commitear ese cambio.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { usaVidrieraNueva } from "../tienda/vidriera/marcas";

const dir = join(process.cwd(), "src/app/(site)");
const leer = (f: string) => readFileSync(join(dir, f), "utf8");

function sinDisenoNuevo(fuente: string): string {
  const salida: string[] = [];
  let adentro = false;
  for (const linea of fuente.split("\n")) {
    if (linea.includes("// «diseño nuevo»: desde acá")) {
      adentro = true;
      continue;
    }
    if (linea.includes("// «diseño nuevo»: hasta acá")) {
      adentro = false;
      continue;
    }
    if (adentro || linea.includes("// «diseño nuevo»")) continue;
    salida.push(linea);
  }
  // La línea en blanco que separa el bloque nuevo del código de siempre.
  return salida.join("\n").replace(/\n\n\n/g, "\n\n");
}

test("la home de CH sin lo marcado «diseño nuevo» es la de HEAD, línea por línea", () => {
  assert.equal(sinDisenoNuevo(leer("page.tsx")), leer("__fixtures__/page-head.tsx.txt"));
});

test("el bloque nuevo de la home corre sólo con el interruptor prendido y antes del JSX de siempre", () => {
  const fuente = leer("page.tsx");
  const bloque = fuente.slice(fuente.indexOf("// «diseño nuevo»: desde acá"), fuente.indexOf("// «diseño nuevo»: hasta acá"));
  assert.match(bloque, /if \(await nuevoP\) \{/);
  assert.ok(fuente.indexOf("// «diseño nuevo»: desde acá") < fuente.indexOf("return (\n    <>"), "el bloque va antes del return de siempre");
});

test("la home nueva de CH: sin CSS de módulo, sin avatares generados, sin contenido que aparece al bajar", () => {
  const fuente = leer("_ch/InicioCH.tsx");
  assert.doesNotMatch(fuente, /import\s+[^;]*\.css["']/);
  assert.doesNotMatch(fuente, /api\.dicebear\.com/);
  assert.doesNotMatch(fuente, /from "\.\/Reveal"/);
});

test("CH no entra a la vidriera nueva ni prendido; MAGRA, Shine y A Dos Manos sí, y sólo prendidos", () => {
  const ch = { isRetail: false, brandId: null };
  assert.equal(usaVidrieraNueva(true, ch, null), false);
  assert.equal(usaVidrieraNueva(false, ch, null), false);
  assert.equal(usaVidrieraNueva(true, { isRetail: true, brandId: "magra" }, "magra"), true);
  assert.equal(usaVidrieraNueva(false, { isRetail: true, brandId: "magra" }, "magra"), false);
  assert.equal(usaVidrieraNueva(true, { isRetail: true, brandId: "adosmanos" }, null), true);
  assert.equal(usaVidrieraNueva(true, { isRetail: true, brandId: null }, null), true, "otro negocio de mostrador: la genérica");
});
