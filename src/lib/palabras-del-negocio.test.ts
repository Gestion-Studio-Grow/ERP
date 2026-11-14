// U13: las palabras de estética sólo en CH; los demás rubros, sin ningún cambio.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lugarDeAtencion, palabrasDelNegocio } from "./palabras-del-negocio";

test("CH no lee góndolas ni mostrador; los demás, como siempre", () => {
  assert.equal(palabrasDelNegocio("beauty-spa").cobrarLaVenta, "Cobrar una venta");
  assert.doesNotMatch(palabrasDelNegocio("beauty-spa").contarTodo, /góndola/);
  for (const otro of ["magra", "adosmanos", null]) {
    assert.equal(palabrasDelNegocio(otro).cobrarLaVenta, "Cobrar en el mostrador");
    assert.equal(palabrasDelNegocio(otro).contarTodo, "Contar una góndola entera");
  }
});

test("las pantallas usan estas palabras, no el texto fijo", () => {
  const raiz = join(process.cwd(), "src/app/admin/(dashboard)");
  const ajustes = readFileSync(join(raiz, "ajustes/page.tsx"), "utf8");
  assert.match(ajustes, /\{palabras\.contarTodo\}/);
  assert.doesNotMatch(ajustes, /Contar una góndola entera/);
  assert.match(readFileSync(join(raiz, "pedidos/page.tsx"), "utf8"), /palabras\.cobrarLaVenta/);
});

test("R4 · al reabrir el día, CH no lee «cuaderno» ni «cadete»; los demás, como siempre", () => {
  const ch = palabrasDelNegocio("beauty-spa");
  for (const texto of [ch.reabrirAviso, ch.reabrirQueFalto, ch.reabrirMotivo]) assert.doesNotMatch(texto, /cuaderno|cadete/);
  for (const otro of ["magra", "adosmanos", null]) {
    const p = palabrasDelNegocio(otro);
    assert.equal(p.reabrirAviso, "una venta del cuaderno, una rendición");
    assert.equal(p.reabrirQueFalto, "la venta del cuaderno, la rendición del cadete");
    assert.equal(p.reabrirMotivo, "faltó cargar una venta del cuaderno");
  }
  // Las pantallas no los tienen escritos a mano.
  const raiz = join(process.cwd(), "src/app/admin/(dashboard)/caja/cierre");
  for (const archivo of ["ContarYCerrar.tsx", "CierreRenglon.tsx"]) {
    assert.doesNotMatch(readFileSync(join(raiz, archivo), "utf8"), /cuaderno|cadete/, archivo);
  }
});

test("T2 peluquerías · el lugar de atención: «sillón» en peluquería y barbería; «box» en el resto y en CH", () => {
  for (const rubro of ["peluqueria", "barberia"]) {
    assert.deepEqual(lugarDeAtencion(rubro), { singular: "sillón", Singular: "Sillón", plural: "sillones", Plural: "Sillones" });
  }
  // No-cambio: CH (sin blueprint), estética, servicios y cualquier otro rubro siguen diciendo «box».
  for (const otro of [null, undefined, "", "estetica", "servicios", "veterinaria", "consultorio", "carniceria"]) {
    assert.deepEqual(lugarDeAtencion(otro), { singular: "box", Singular: "Box", plural: "boxes", Plural: "Boxes" });
  }
});

test("T2 peluquerías · la agenda y el catálogo leen el lugar del rubro, no «box» fijo", () => {
  const raiz = join(process.cwd(), "src/app/admin/(dashboard)");
  const leer = (f: string) => readFileSync(join(raiz, f), "utf8");
  const agenda = leer("turnos/_agenda/PorProfesional.tsx");
  assert.match(agenda, /useLugarDeAtencion\(\)/);
  assert.doesNotMatch(agenda, /"Por box"|"Choca en el box"|"La agenda por box"/);
  const seccion = leer("catalogo/BoxesSection.tsx");
  assert.match(seccion, /\{lugar\.Plural\}/);
  assert.doesNotMatch(seccion, />Boxes</);
  const renglon = leer("catalogo/CatalogoServiciosRenglon.tsx");
  assert.doesNotMatch(renglon, /titulo="Boxes"|"Agregar box"|"Box agregado\."/);
  // Las páginas proveen el lugar desde el blueprint del tenant.
  for (const f of ["turnos/page.tsx", "catalogo/page.tsx"]) assert.match(leer(f), /lugarDeAtencion\(marca\.blueprintId\)/);
});
