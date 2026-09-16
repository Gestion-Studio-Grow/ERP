// ============================================================================
// TEST DE FORMA — el backoffice en el teléfono: que la plata entre en pantalla.
// ============================================================================
//
// Estas cuatro pantallas se miran desde el mostrador, con el teléfono en la mano, a
// 412px de ancho. Lo que había antes, medido:
//
//   · /admin/caja/libro  — las tablas llevaban `min-w-[52rem]` y `min-w-[40rem]` dentro
//     de un Card con `overflow-x-auto`. De 237 importes renderizados entraban 4 en el
//     viewport: Ingreso, Egreso, Saldo y Acciones arrancaban después del píxel 412, a
//     470px de scroll lateral sin ninguna señal de que el scroll existiera.
//   · /admin/caja/cierre — `<div>` pelado sin gutter: el <h1> y los campos donde se
//     escribe la plata contada arrancaban en x=0. Y sus dos tablas, lo mismo que el libro.
//   · /admin/compras     — el botón «Quitar línea» medía 17×18px, la mitad del piso de
//     24px que exige el gate visual del propio repo (visual-audit.mjs, AA_MIN = 24).
//   · /admin            — la fila de «Agenda de hoy» era un flex de 4 columnas sin
//     breakpoint: con una profesional de 23 caracteres la columna del cliente caía a 0px
//     y el nombre se pintaba encima del badge de estado.
//
// El test mira la FORMA de los archivos, no el comportamiento. Es a propósito: ninguno de
// los cuatro defectos fue una función mal escrita — los cuatro fueron una clase de CSS. Y
// los cuatro son fáciles de reintroducir sin darse cuenta, porque en la computadora del
// que programa se ven perfectos.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const leer = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

const LIBRO = "./caja/libro/page.tsx";
const CIERRE = "./caja/cierre/page.tsx";
const COMPRAS = "./compras/ComprasForm.tsx";
const INICIO = "./page.tsx";

/** Las aperturas `<table ...>` de un archivo, con su lista de clases. */
function tablas(src: string): { clases: string }[] {
  return [...src.matchAll(/<table\b[^>]*>/g)].map((m) => {
    const cls = /className=["'{`]*([^"'}`]*)/.exec(m[0].replace(/\s+/g, " "));
    return { clases: cls ? cls[1] : "" };
  });
}

for (const [nombre, ruta] of [
  ["libro de caja", LIBRO],
  ["cierre de caja", CIERRE],
] as const) {
  test(`${nombre}: ninguna tabla impone un ancho mínimo en móvil`, () => {
    const t = tablas(leer(ruta));
    assert.ok(t.length >= 2, `esperaba al menos 2 tablas en ${ruta}, encontré ${t.length}`);
    for (const { clases } of t) {
      const minW = [...clases.matchAll(/(^|\s)(\S*?)min-w-\[/g)].map((m) => m[2]);
      for (const prefijo of minW) {
        assert.ok(
          prefijo.startsWith("sm:") || prefijo.startsWith("md:") || prefijo.startsWith("lg:"),
          `una tabla de ${ruta} lleva un min-w sin breakpoint ("${clases}"). A 412px eso ` +
            `empuja las columnas de plata fuera de la pantalla: el ancho mínimo sólo puede ` +
            `pedirse desde sm: para arriba.`,
        );
      }
    }
  });

  test(`${nombre}: las tablas apilan como tarjeta en móvil`, () => {
    const t = tablas(leer(ruta));
    for (const { clases } of t) {
      assert.ok(
        /(^|\s)block(\s|$)/.test(clases) && /(^|\s)sm:table(\s|$)/.test(clases),
        `una tabla de ${ruta} no usa el patrón de la casa "block sm:table" ("${clases}"). ` +
          `Con overflow-x solo nadie scrollea de costado para leer plata.`,
      );
    }
  });

  test(`${nombre}: el encabezado de tabla se esconde en móvil`, () => {
    const src = leer(ruta);
    const heads = [...src.matchAll(/<thead\b[^>]*>/g)].map((m) => m[0].replace(/\s+/g, " "));
    assert.ok(heads.length >= 2, `esperaba al menos 2 <thead> en ${ruta}`);
    for (const h of heads) {
      assert.ok(
        /hidden/.test(h) && /sm:table-header-group/.test(h),
        `un <thead> de ${ruta} no es "hidden sm:table-header-group" (${h}). En modo tarjeta ` +
          `el encabezado se apila como una fila más de rótulos sueltos.`,
      );
    }
  });
}

test("cierre de caja: la pantalla tiene margen lateral propio", () => {
  const src = leer(CIERRE);
  // El elemento raíz del componente: lo que devuelve el return de la página.
  const raiz = /return \(\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)?(?:\/\/[^\n]*\n\s*)*<(\w+)([^>]*)>/.exec(src);
  assert.ok(raiz, "no pude ubicar el elemento raíz de cierre/page.tsx");
  const clases = raiz![2];
  assert.ok(
    /\bpx-\d/.test(clases),
    `cierre/page.tsx arranca con <${raiz![1]}${clases}>. Ni AdminShell ni PageHeader aportan ` +
      `padding: sin px-* propio el título y los inputs del conteo de efectivo llegan al ` +
      `píxel 0 y al 412. Copiá el contenedor de caja/page.tsx.`,
  );
  assert.ok(/\bmx-auto\b/.test(clases) && /\bmax-w-/.test(clases), "falta mx-auto max-w-* como en las pantallas hermanas");
});

test("compras: «Quitar línea» llega al piso táctil de 24px", () => {
  const src = leer(COMPRAS);
  const boton = /<button[\s\S]{0,600}?aria-label="Quitar línea"[\s\S]{0,600}?>/.exec(src);
  assert.ok(boton, "no encontré el botón de quitar línea en ComprasForm.tsx");
  const clases = boton![0].replace(/\s+/g, " ");
  // La escala de Tailwind: 1 unidad = 4px. min-h-6 = 24px, que es el AA_MIN del gate.
  //
  // OJO con el prefijo: la medida que importa es la SIN breakpoint. Este botón hoy lleva
  // `min-h-11 min-w-11` de base y `sm:min-h-9 sm:min-w-9` desde sm, y una regex ingenua
  // (`/min-h-(\d+)/`) matchea cualquiera de las dos: si alguien borrara la de base, el test
  // seguiría verde leyendo los 36px del escritorio mientras el teléfono —que es el viewport
  // por el que este archivo existe— se queda sin mínimo ninguno. Por eso se exige que el
  // token arranque en borde de clase y NO venga precedido de `algo:`.
  const medida = (prop: "min-h" | "min-w"): number | null => {
    const m = new RegExp(`(?:^|["'\\s])${prop}-(\\d+|\\[(\\d+)px\\])(?=["'\\s]|$)`).exec(clases);
    if (!m) return null;
    return m[2] !== undefined ? Number(m[2]) : Number(m[1]) * 4;
  };
  const alto = medida("min-h");
  const ancho = medida("min-w");
  assert.ok(
    alto !== null && ancho !== null,
    `el botón destructivo no declara min-h/min-w SIN breakpoint: ${clases}. Una medida con ` +
      `prefijo (sm:, md:) no aplica en el teléfono, que es donde se le acierta al de al lado.`,
  );
  assert.ok(
    alto! >= 24 && ancho! >= 24,
    `«Quitar línea» queda en ${alto}×${ancho}px en móvil. El gate visual del repo ` +
      `(scripts/qa/visual-audit.mjs, AA_MIN = 24) falla por debajo de 24px, y borrar ` +
      `una línea de una compra no tiene deshacer.`,
  );
});

test("inicio: la fila de la agenda apila en móvil y el cliente no se come a 0px", () => {
  const src = leer(INICIO);
  const fila = /<Link\b[^>]*href="\/admin\/turnos"[\s\S]{0,400}?className=\{`([^`]*)`\}/.exec(src);
  assert.ok(fila, "no encontré la fila de Agenda de hoy en el Inicio");
  const clases = fila![1];
  assert.ok(
    /flex-col/.test(clases) && /sm:flex-row/.test(clases),
    `la fila del turno sigue siendo un flex de una sola línea ("${clases}"). A 412px el único ` +
      `que puede encogerse es el nombre del cliente: con una profesional larga cae a 0px y el ` +
      `texto se pinta encima del badge de estado.`,
  );
  const prof = /className="[^"]*"\s*>\s*\{a\.professional\.name\}/.exec(src);
  assert.ok(prof, "no encontré el span de la profesional en la fila del turno");
  assert.ok(
    !/\bwhitespace-nowrap\b/.test(prof![0]) && /\bmin-w-0\b/.test(prof![0]) && /\btruncate\b/.test(prof![0]),
    `el nombre de la profesional es "${prof![0]}". Con whitespace-nowrap y sin min-w-0 se lleva ` +
      `todo el ancho que pida y deja al cliente sin ninguno: si algo se corta, tiene que ser el ` +
      `dato secundario.`,
  );
});
