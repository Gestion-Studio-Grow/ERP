import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decidirTecla, type EstadoBuscador } from "./buscador-teclado";
import { filtrarOpciones } from "./buscador-filtro";

// Las opciones como las arma el PosForm (etiqueta = nombre, detalle = precio y stock).
const CATALOGO = [
  { id: "vacio", etiqueta: "Vacío al vacío", detalle: "$18.900,00/kg · quedan 1,1 kg" },
  { id: "chori", etiqueta: "Chorizo parrillero", detalle: "$1.500,00/u · quedan 0 u" },
  { id: "lomo", etiqueta: "Lomo", detalle: "$25.000,00/kg · quedan 10 kg" },
];

// El estado tal como lo tiene el combo: `visibles` sale del filtro REAL con lo tipeado.
function estado(texto: string, extra: Partial<EstadoBuscador> = {}): EstadoBuscador {
  return { abierto: true, texto, visibles: filtrarOpciones(CATALOGO, texto), activo: 0, recorrio: false, ...extra };
}
const enter = { key: "Enter" };

test("Enter con una búsqueda sin resultados: no elige y NO deja pasar el envío del formulario", () => {
  // El caso que cobraba el ticket: "vacip" no encuentra nada y el Enter seguía hasta el <form>.
  const e = estado("vacip");
  assert.equal(e.visibles.length, 0);
  assert.deepEqual(decidirTecla(enter, e), { tipo: "nada", prevenir: true });
});

test("Enter con el campo recién enfocado y vacío: no elige el primero del catálogo", () => {
  // El doble Enter desde la cantidad: la lista muestra las primeras opciones, pero nadie buscó.
  const e = estado("");
  assert.equal(e.visibles[0].id, "vacio");
  assert.deepEqual(decidirTecla(enter, e), { tipo: "nada", prevenir: true });
});

test("Enter con la lista cerrada: tampoco llega al formulario", () => {
  assert.deepEqual(decidirTecla(enter, estado("lomo", { abierto: false })), { tipo: "nada", prevenir: true });
  assert.deepEqual(decidirTecla(enter, estado("", { abierto: false })), { tipo: "nada", prevenir: true });
});

test("Enter con lo tipeado: elige la resaltada (el flujo de mostrador 'vac' + Enter)", () => {
  const d = decidirTecla(enter, estado("vac"));
  assert.equal(d.tipo, "elegir");
  assert.equal(d.prevenir, true);
  assert.equal(d.tipo === "elegir" && d.opcion.id, "vacio");
  const d2 = decidirTecla(enter, estado("lomo"));
  assert.equal(d2.tipo === "elegir" && d2.opcion.id, "lomo");
});

test("Enter sin texto pero recorriendo con las flechas: elige la que se resaltó", () => {
  const d = decidirTecla(enter, estado("", { activo: 2, recorrio: true }));
  assert.equal(d.tipo === "elegir" && d.opcion.id, "lomo");
});

test("Enter mientras el teclado compone una palabra: no elige, y tampoco envía", () => {
  assert.deepEqual(decidirTecla({ key: "Enter", componiendo: true }, estado("vac")), { tipo: "nada", prevenir: true });
});

test("todo Enter se previene, en cualquier estado", () => {
  for (const texto of ["", "   ", "vac", "vacip", "zzz"]) {
    for (const abierto of [true, false]) {
      for (const recorrio of [true, false]) {
        for (const activo of [0, 1, 5]) {
          for (const componiendo of [true, false]) {
            const d = decidirTecla({ key: "Enter", componiendo }, estado(texto, { abierto, recorrio, activo }));
            assert.equal(d.prevenir, true, JSON.stringify({ texto, abierto, recorrio, activo, componiendo }));
          }
        }
      }
    }
  }
});

test("flechas: abren en la primera, recorren sin salirse y no rompen sin resultados", () => {
  assert.deepEqual(decidirTecla({ key: "ArrowDown" }, estado("", { abierto: false, activo: 1 })), {
    tipo: "mover",
    prevenir: true,
    activo: 0,
  });
  assert.equal((decidirTecla({ key: "ArrowDown" }, estado("")) as { activo: number }).activo, 1);
  assert.equal((decidirTecla({ key: "ArrowDown" }, estado("", { activo: 2 })) as { activo: number }).activo, 2);
  assert.equal((decidirTecla({ key: "ArrowUp" }, estado("", { activo: 2 })) as { activo: number }).activo, 1);
  assert.equal((decidirTecla({ key: "ArrowUp" }, estado("")) as { activo: number }).activo, 0);
  // Sin resultados el índice queda en 0, no en -1 (antes `Math.min(i + 1, -1)`).
  assert.equal((decidirTecla({ key: "ArrowDown" }, estado("vacip")) as { activo: number }).activo, 0);
  assert.equal((decidirTecla({ key: "ArrowUp" }, estado("vacip")) as { activo: number }).activo, 0);
});

test("Escape cierra; cualquier otra tecla sigue su curso (tipear no se frena)", () => {
  assert.deepEqual(decidirTecla({ key: "Escape" }, estado("vac")), { tipo: "cerrar", prevenir: false });
  for (const key of ["a", "Backspace", "Tab", ",", " "]) {
    assert.deepEqual(decidirTecla({ key }, estado("vac")), { tipo: "nada", prevenir: false }, key);
  }
});

// Chequeo de FORMA, sólo para "el llamador usa la regla": el combo manda cada tecla por
// `decidirTecla`, aplica su `prevenir` y no tiene otra rama propia por tecla que la esquive.
test("BuscadorCombo aplica la decisión en cada tecla", () => {
  const src = readFileSync(fileURLToPath(new URL("./BuscadorCombo.tsx", import.meta.url)), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const handler = src.slice(src.indexOf("onKeyDown="), src.indexOf("/>", src.indexOf("onKeyDown=")));
  assert.match(handler, /const d = decidirTecla\(/);
  assert.match(handler, /if \(d\.prevenir\) e\.preventDefault\(\);/);
  assert.doesNotMatch(handler, /e\.key\s*===/, "el combo no decide teclas por su cuenta");
  assert.equal((src.match(/onKeyDown=/g) ?? []).length, 1);
});
