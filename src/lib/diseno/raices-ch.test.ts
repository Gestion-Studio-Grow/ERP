// CH (beauty-spa) está en producción: con el interruptor «Diseño nuevo» APAGADO su panel tiene que
// salir como siempre. Esto lo EJECUTA en las tres capas donde el diseño nuevo se engancha:
//   1. la decisión (diseno-core): sólo una fila válida de la consola lo prende; si la lectura
//      falla, o la fila es forjada, o es de otro interruptor: APAGADO;
//   2. ConDiseno apagado devuelve SU MISMO hijo (el mismo objeto: ni un nodo, ni una hoja, ni un
//      provider de más); prendido, pide la hoja versionada y monta `useDiseno()`;
//   3. las raíces de los layouts (panel, ingreso, contraseña, «no disponible», contador,
//      Facturita): el atributo es `undefined` apagado (React no lo escribe) y el contenido entra por
//      ConDiseno. Se lee el código de cada raíz (los layouts consultan la base: no se renderizan acá).
// La prueba de píxeles (piezas de src/components/ui iguales a HEAD sin los data-*) está en el
// arnés de la galería: diseno-v2/arnes/comparar-ui.tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { estadoDesdeFilas, filaDeInterruptor, todosApagados } from "@/cambios/interruptores-core";
import { DISENO_NUEVO, INICIO_POR_APPS } from "@/cambios/interruptores";
import { leerDisenoNuevoCon } from "./diseno-core";
import { ConDiseno } from "./ConDiseno";
import { HOJAS_DEL_DISENO, LETRA_DEL_DISENO, PIEL_RENGLON } from "./diseno";

let id = 0;
const fila = (interruptor: typeof DISENO_NUEVO, accion: "encender" | "apagar", actor?: string) => {
  const f = filaDeInterruptor({ tenantId: "t", interruptor, accion, operador: "tomas" });
  return { ...f, actor: actor ?? f.actor, id: `f${++id}`, createdAt: new Date(Date.UTC(2026, 8, 24, 12, id)) };
};

test("la decisión: sólo la última fila válida de la consola prende el diseño nuevo", async () => {
  assert.equal(await leerDisenoNuevoCon(async () => todosApagados()), false);
  assert.equal(await leerDisenoNuevoCon(async () => estadoDesdeFilas([fila(DISENO_NUEVO, "encender")])), true);
  assert.equal(
    await leerDisenoNuevoCon(async () => estadoDesdeFilas([fila(DISENO_NUEVO, "encender"), fila(DISENO_NUEVO, "apagar")])),
    false,
    "la última manda",
  );
  assert.equal(
    await leerDisenoNuevoCon(async () => estadoDesdeFilas([fila(DISENO_NUEVO, "encender", "user:cecilia")])),
    false,
    "una fila que no es de la consola no cuenta",
  );
  assert.equal(
    await leerDisenoNuevoCon(async () => estadoDesdeFilas([fila(INICIO_POR_APPS as typeof DISENO_NUEVO, "encender")])),
    false,
    "prender «Trabaja por apps» no prende el diseño",
  );
  let avisado: unknown = null;
  assert.equal(
    await leerDisenoNuevoCon(
      async () => {
        throw new Error("sin base");
      },
      (e) => (avisado = e),
    ),
    false,
    "si la lectura falla: el de siempre",
  );
  assert.ok(avisado instanceof Error);
});

test("ConDiseno apagado devuelve el mismo hijo (ni hoja, ni provider, ni un nodo de más)", () => {
  const hijo = createElement("div", { className: "p-4" }, "panel");
  assert.equal(ConDiseno({ nuevo: false, children: hijo }), hijo);
  const html = renderToStaticMarkup(ConDiseno({ nuevo: false, children: hijo }) as ReactElement);
  assert.equal(html, '<div class="p-4">panel</div>');
  assert.ok(!html.includes("renglon"));
});

test("ConDiseno prendido pide la hoja versionada una vez y deja el contenido igual", () => {
  const html = renderToStaticMarkup(ConDiseno({ nuevo: true, children: createElement("p", null, "x") }) as ReactElement);
  assert.equal(HOJAS_DEL_DISENO.length, 1);
  assert.ok(html.includes(`href="${HOJAS_DEL_DISENO[0].replace(/&/g, "&amp;")}"`), html);
  assert.ok(html.includes("<p>x</p>"));
});

const RAICES = [
  "src/app/admin/(dashboard)/layout.tsx",
  "src/app/admin/login/page.tsx",
  "src/app/admin/cambiar-password/page.tsx",
  "src/app/admin/no-disponible/page.tsx",
  "src/app/contador/layout.tsx",
  "src/app/facturita/app/layout.tsx",
];

test("cada raíz de un negocio: el atributo sólo con el interruptor, la piel de siempre intacta", () => {
  for (const r of RAICES) {
    const src = readFileSync(join(process.cwd(), r), "utf8");
    assert.equal((src.match(/data-diseno=\{nuevo \? PIEL_RENGLON : undefined\}/g) ?? []).length, 1, `${r}: el atributo, una vez y condicionado`);
    assert.equal((src.match(/<ConDiseno nuevo=\{nuevo\}>/g) ?? []).length, 1, `${r}: el contenido entra por ConDiseno`);
    assert.ok(src.includes('data-skin="fable"'), `${r}: data-skin="fable" sigue (ThemeToggle y theme-client lo buscan)`);
    assert.ok(/disenoNuevo\(\)/.test(src), `${r}: lee el interruptor del negocio del pedido`);
    assert.ok(!/data-diseno="renglon"/.test(src), `${r}: nunca prendido a mano`);
  }
  // La consola del operador (sólo GSG) lo lleva siempre.
  const consola = readFileSync(join(process.cwd(), "src/app/operador/(console)/layout.tsx"), "utf8");
  assert.ok(consola.includes("data-diseno={PIEL_RENGLON}"));
  assert.equal(PIEL_RENGLON, "renglon");
  // Y React no escribe un atributo `undefined`: la raíz apagada queda byte a byte como antes.
  assert.equal(
    renderToStaticMarkup(createElement("div", { "data-skin": "fable", "data-diseno": undefined, "data-theme": "light" })),
    '<div data-skin="fable" data-theme="light"></div>',
  );
});

// QA-1 (criterio 9): en la consola el navegador avisaba que `archivo-latin.woff2` se precargó y no se
// usó. La consola (sólo GSG) no la precarga: la hoja la pide con su @font-face cuando hace falta, y
// sin <link rel="preload"> ese aviso no puede salir. El resto de las raíces la sigue precargando.
test("la consola no precarga la letra; las demás raíces sí", () => {
  const hijo = createElement("p", null, "x");
  // ConDiseno corre DENTRO de un render (así `preload` de React escribe su <link> en el HTML).
  const renderizar = (precargarLetra?: boolean) =>
    renderToStaticMarkup(createElement(() => ConDiseno({ nuevo: true, precargarLetra, children: hijo }) as ReactElement));
  const conPrecarga = renderizar();
  assert.ok(conPrecarga.includes(`<link rel="preload" href="${LETRA_DEL_DISENO}" as="font"`), conPrecarga);
  const sinPrecarga = renderizar(false);
  assert.ok(!sinPrecarga.includes('rel="preload"'), sinPrecarga);
  assert.ok(sinPrecarga.includes(`href="${HOJAS_DEL_DISENO[0].replace(/&/g, "&amp;")}"`), "la hoja (con la letra) sigue");
  assert.ok(sinPrecarga.includes("<p>x</p>"));
  const consola = readFileSync(join(process.cwd(), "src/app/operador/(console)/layout.tsx"), "utf8");
  assert.equal((consola.match(/<ConDiseno nuevo precargarLetra=\{false\}>/g) ?? []).length, 1, "la consola monta ConDiseno sin precarga");
  const ingreso = readFileSync(join(process.cwd(), "src/app/operador/login/page.tsx"), "utf8");
  assert.ok(ingreso.includes("<ConDiseno nuevo>"), "el ingreso de la consola la sigue precargando (ahí se usa: fuente-login-3210.txt)");
});
