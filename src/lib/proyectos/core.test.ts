import assert from "node:assert/strict";
import { test } from "node:test";
import { clientePuedeResponder, etapaAlAprobar, etapaLabel, etapaSiguiente, etapasDe, porRubro, precioConMargen, sePuedeEditar, totales } from "./core";
import { computar, costosVigentes, dentroDelLote, disenoInicial, normalizarDiseno, paredesDe, superficieParedes } from "./stand";

test("un contenido no pasa por 3D, armado ni desarme; un stand pasa por todo", () => {
  assert.deepEqual(etapasDe("CONTENIDOS"), ["PEDIDO", "DISENO", "PRESUPUESTO", "PROPUESTA", "APROBADO", "PRODUCCION", "CIERRE"]);
  assert.equal(etapasDe("ARQUITECTURA").length, 10);
  assert.equal(etapaLabel("DISENO", "CONTENIDOS"), "Guion");
  assert.equal(etapaSiguiente("CONTENIDOS", "PRODUCCION"), "CIERRE");
  assert.equal(etapaSiguiente("ARQUITECTURA", "CIERRE"), null);
});

test("totales: IVA sobre el neto y margen sobre el precio, no sobre el costo", () => {
  const t = totales([{ cantidad: 2, costo: 100, precio: 200 }], 21);
  assert.deepEqual(t, { costo: 200, neto: 400, iva: 84, total: 484, ganancia: 200, margenPct: 50 });
  assert.equal(totales([], 21).margenPct, 0);
  assert.equal(precioConMargen(100, 35), 135);
});

test("porRubro respeta el orden en que aparece cada rubro", () => {
  const g = porRubro([{ rubro: "B" }, { rubro: "A" }, { rubro: "B" }]);
  assert.deepEqual(g.map((x) => [x.rubro, x.items.length]), [["B", 2], ["A", 1]]);
});

test("lo enviado no se edita y lo vencido no se responde", () => {
  assert.equal(sePuedeEditar("BORRADOR"), true);
  assert.equal(sePuedeEditar("ENVIADO"), false);
  const hoy = new Date("2026-11-01T12:00:00Z");
  assert.equal(clientePuedeResponder({ estado: "ENVIADO", validoHasta: new Date("2026-11-02T00:00:00Z") }, hoy), true);
  assert.equal(clientePuedeResponder({ estado: "ENVIADO", validoHasta: new Date("2026-10-31T00:00:00Z") }, hoy), false);
  assert.equal(clientePuedeResponder({ estado: "APROBADO", validoHasta: null }, hoy), false);
});

test("aprobar nunca hace retroceder un proyecto", () => {
  assert.equal(etapaAlAprobar("ARQUITECTURA", "PROPUESTA"), "APROBADO");
  assert.equal(etapaAlAprobar("ARQUITECTURA", "ARMADO"), "ARMADO");
});

test("las paredes dependen de los lados abiertos", () => {
  assert.deepEqual(paredesDe("ISLA"), []);
  assert.deepEqual(paredesDe("ESQUINA"), ["fondo", "izquierda"]);
  const d = { ...disenoInicial("ESQUINA", 6, 4), altoPared: 3 };
  assert.equal(superficieParedes(d), 30);
});

test("una pieza no se sale del lote y cae en la grilla", () => {
  const p = dentroDelLote({ id: "a", tipo: "MOSTRADOR", x: 99, z: -99, giro: 0 }, { ancho: 6, fondo: 4 });
  assert.equal(p.x, 2.25);
  assert.equal(p.z, -1.7);
});

test("el diseño roto no pasa y el recuperable se corrige", () => {
  assert.equal(normalizarDiseno(null), null);
  assert.equal(normalizarDiseno({ tipo: "HACK", ancho: 3, fondo: 3 }), null);
  const d = normalizarDiseno({
    tipo: "ISLA",
    ancho: 999,
    fondo: 1,
    colorPared: "red;}",
    piezas: [{ tipo: "__proto__", x: 0, z: 0 }, { tipo: "TOTEM", x: "nan", z: 0 }, { tipo: "TOTEM", x: 0, z: 0, giro: 7 }],
  });
  assert.ok(d);
  assert.equal(d.ancho, 30);
  assert.equal(d.fondo, 2);
  assert.equal(d.colorPared, "#E3E1D4");
  assert.equal(d.piezas.length, 1);
  assert.equal(d.piezas[0].giro, 3);
});

test("el cómputo sale del dibujo: isla sin paredes, piezas contadas", () => {
  const isla = computar({ ...disenoInicial("ISLA", 5, 4), piezas: [{ id: "a", tipo: "TOTEM", x: 0, z: 0, giro: 0 }, { id: "b", tipo: "TOTEM", x: 1, z: 0, giro: 0 }] });
  assert.equal(isla.find((l) => l.clave === "pared"), undefined);
  assert.equal(isla.find((l) => l.clave === "piso")?.cantidad, 20);
  assert.equal(isla.find((l) => l.clave === "TOTEM")?.cantidad, 2);
});

test("los costos guardados pisan a los de referencia, sin aceptar basura", () => {
  const c = costosVigentes({ piso: 1000, pared: "x", flete: -5 });
  assert.equal(c.piso, 1000);
  assert.equal(c.pared, 65000);
  assert.equal(c.flete, 280000);
});
