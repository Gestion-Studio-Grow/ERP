// GSG-MIA-004 · T2 — núcleo del taller de stands.
import { test } from "node:test";
import assert from "node:assert/strict";
import { costoDespiece, costoLinea, esOrigenDespiece, faltaLaTabla, itemsDelDespiece, origenDespiece, papelParaMia, planDePase, RUBRO_DESPIECE, tallerVisible, validarPieza, type LineaDespiece } from "./core";

const lineas: LineaDespiece[] = [
  { id: "d1", nombre: "Panel MDF 18mm", unidad: "u", cantidad: 4, costoUnitSnap: 25000 },
  { id: "d2", nombre: "Perfil aluminio", unidad: "m", cantidad: 2.5, costoUnitSnap: 3000.5 },
];

test("costo del despiece: cantidad por costo congelado, sumado y redondeado", () => {
  assert.equal(costoLinea(lineas[0]), 100000);
  assert.equal(costoLinea(lineas[1]), 7501.25);
  assert.equal(costoDespiece(lineas), 107501.25);
  assert.equal(costoDespiece([]), 0);
});

test("el despiece se agrupa en ítems de «Materiales» con origen despiece:<id> y el margen del negocio", () => {
  const items = itemsDelDespiece([...lineas, { id: "d3", nombre: "Nada", unidad: "u", cantidad: 0, costoUnitSnap: 1 }], 30);
  assert.equal(items.length, 2);
  assert.ok(items.every((i) => i.rubro === RUBRO_DESPIECE && i.rubro === "Materiales"));
  assert.deepEqual(items.map((i) => i.origen), ["despiece:d1", "despiece:d2"]);
  assert.equal(items[0].costo, 25000);
  assert.equal(items[0].precio, 32500);
  assert.equal(origenDespiece("x"), "despiece:x");
  assert.ok(esOrigenDespiece("despiece:x"));
  assert.ok(!esOrigenDespiece("stand:x"));
  assert.ok(!esOrigenDespiece(null));
});

test("pasar dos veces el despiece actualiza y no duplica; lo cargado a mano no se toca", () => {
  const items = itemsDelDespiece(lineas, 30);
  const primera = planDePase([{ id: "manual", origen: null }, { id: "st", origen: "stand:s1" }], items);
  assert.equal(primera.crear.length, 2);
  assert.deepEqual(primera.actualizar, []);
  assert.deepEqual(primera.borrar, []);

  // Segunda pasada: los ítems ya existen con su origen.
  const existentes = [{ id: "manual", origen: null }, { id: "st", origen: "stand:s1" }, { id: "i1", origen: "despiece:d1" }, { id: "i2", origen: "despiece:d2" }];
  const segunda = planDePase(existentes, items);
  assert.deepEqual(segunda.crear, []);
  assert.deepEqual(segunda.actualizar.map((u) => u.id), ["i1", "i2"]);
  assert.deepEqual(segunda.borrar, []);

  // Se sacó una pieza del despiece y quedó un duplicado viejo: se limpian los dos.
  const tercera = planDePase([...existentes, { id: "i1b", origen: "despiece:d1" }], items.slice(0, 1));
  assert.deepEqual(tercera.actualizar.map((u) => u.id), ["i1"]);
  assert.deepEqual(tercera.borrar.sort(), ["i1b", "i2"]);
  assert.ok(!tercera.borrar.includes("manual") && !tercera.borrar.includes("st"));
});

test("validar pieza: nombre obligatorio, sin negativos, unidad por defecto", () => {
  assert.equal(validarPieza({ nombre: " ", unidad: "", costoUnit: 1, horasStd: 0 }).ok, false);
  assert.equal(validarPieza({ nombre: "a", unidad: "", costoUnit: -1, horasStd: 0 }).ok, false);
  assert.equal(validarPieza({ nombre: "a", unidad: "", costoUnit: 1, horasStd: Number.NaN }).ok, false);
  const r = validarPieza({ nombre: " Bastidor ", unidad: "", costoUnit: 10.555, horasStd: 1.5 });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.pieza, { nombre: "Bastidor", unidad: "u", costoUnit: 10.56, horasStd: 1.5 });
});

test("lo del taller sólo se ve con flag, módulo y rubro del taller: la productora (MIA) nunca", () => {
  const taller = { flag: true, modules: ["proyectos", "taller-stands"], blueprintId: "taller-stands" };
  assert.equal(tallerVisible(taller), true);
  assert.equal(tallerVisible({ ...taller, flag: false }), false);
  assert.equal(tallerVisible({ ...taller, modules: ["proyectos"] }), false);
  assert.equal(tallerVisible({ ...taller, modules: null }), false);
  assert.equal(tallerVisible({ ...taller, blueprintId: "productora" }), false);
  assert.equal(tallerVisible({ flag: true, modules: ["proyectos", "clients", "reports", "arca"], blueprintId: "productora" }), false);
});

test("papel para MIA: sólo descripción, cantidad, precio y total; nunca costo, costoReal, recargo ni margen", () => {
  const items = [
    { descripcion: "Panel", unidad: "u", cantidad: 4, costo: 25000, moneda: "ARS", recargoPct: null, precio: 32500, visibleCliente: true, costoReal: 24000, margen: 7500, origen: "despiece:d1" },
    { descripcion: "Ploteo", unidad: "u", cantidad: 1, costo: 10000, moneda: "ARS", recargoPct: 50, precio: 0, visibleCliente: true },
    { descripcion: "Flete interno", cantidad: 1, costo: 5000, moneda: "ARS", recargoPct: null, precio: 6000, visibleCliente: false },
  ];
  const p = papelParaMia(items, {}, 30, 21);
  assert.deepEqual(p.lineas.map((l) => l.total), [130000, 15000, 6000]);
  assert.equal(p.lineas[1].precio, 15000);
  assert.equal(p.lineas[2].descripcion, "Otros conceptos");
  assert.equal(p.neto, 151000);
  assert.equal(p.iva, 31710);
  assert.equal(p.total, 182710);
  for (const l of p.lineas) assert.deepEqual(Object.keys(l).sort(), ["cantidad", "descripcion", "precio", "total", "unidad"]);
  assert.deepEqual(Object.keys(p).sort(), ["iva", "ivaPct", "lineas", "neto", "total"]);
  const json = JSON.stringify(p).toLowerCase();
  for (const prohibido of ["costo", "costoreal", "recargo", "margen", "origen", "despiece"]) assert.ok(!json.includes(prohibido), prohibido);
});

test("la tabla sin migrar se reconoce (P2021/P2022) y lo demás no", () => {
  assert.ok(faltaLaTabla({ code: "P2021" }));
  assert.ok(faltaLaTabla({ code: "P2022" }));
  assert.ok(!faltaLaTabla({ code: "P2002" }));
  assert.ok(!faltaLaTabla(null));
});
