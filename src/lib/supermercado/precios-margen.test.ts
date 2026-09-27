// Actualizar precios en el supermercado: por margen sobre el costo, por sección y por proveedor.
// Es el MISMO plan de Actualizar precios (catalogo/aumento-core.ts): mismo redondeo en centavos,
// misma huella, misma escritura. Y la lista del proveedor, leída y comparada.

import { test } from "node:test";
import assert from "node:assert/strict";
import { planificarAumento, pedidoDesdeAfuera, precioConPorcentaje, type ProductoParaPrecios } from "@/lib/catalogo/aumento-core";
import { compararConElCatalogo, costosDeLasListas, leerPlanillaDeLista } from "./listas-proveedor";

const p = (x: Partial<ProductoParaPrecios> & Pick<ProductoParaPrecios, "id" | "name">): ProductoParaPrecios => ({
  active: true,
  saleUnit: "UNIT",
  price: 1000,
  pricePerKg: null,
  category: null,
  ...x,
});

const catalogo = [
  p({ id: "coca", name: "Gaseosa Coca-Cola 2,25 L", price: 4600, seccion: "bebidas", proveedores: ["prov-bebidas"], costo: 3100 }),
  p({ id: "agua", name: "Agua mineral 2 L", price: 1790, seccion: "bebidas", proveedores: ["prov-bebidas"], costo: null }),
  p({ id: "yerba", name: "Yerba 1 kg", price: 5900, seccion: "almacen", proveedores: ["prov-almacen"], costo: 4200 }),
  p({ id: "queso", name: "Queso cremoso", saleUnit: "WEIGHT", price: null, pricePerKg: 12990, seccion: "fiambreria", costo: 9000 }),
];

test("por margen: precio = costo × (1 + margen), redondeado para arriba al paso", () => {
  const plan = planificarAumento(catalogo, { alcance: { tipo: "todos" }, sentido: "subir", porcentaje: "45", redondeo: 50, modo: "margen" });
  assert.equal(plan.error, null);
  assert.equal(plan.modo, "margen");
  const coca = plan.filas.find((f) => f.productId === "coca")!;
  // 3.100 × 1,45 = 4.495 → al paso de $50 para arriba: 4.500.
  assert.equal(coca.despues, 4500);
  assert.equal(coca.despues, precioConPorcentaje(3100, 45, "subir", 50));
  // El queso (por kilo): 9.000 × 1,45 = 13.050 el kilo.
  assert.deepEqual(plan.filas.find((f) => f.productId === "queso")!.despues, 13050);
  // El agua no tiene costo: no se toca y se dice.
  assert.deepEqual(plan.sinCosto, [{ id: "agua", nombre: "Agua mineral 2 L" }]);
  // El margen puede BAJAR un precio (la Coca estaba a $4.600).
  assert.ok(coca.efectivo < 0);
});

test("por margen, un precio que se mueve más del 30 % pide la confirmación extra", () => {
  const plan = planificarAumento(catalogo, { alcance: { tipo: "tildados", ids: ["yerba"] }, sentido: "subir", porcentaje: "100", redondeo: 10, modo: "margen" });
  // 4.200 × 2 = 8.400 (vs 5.900: +42 %).
  assert.equal(plan.filas[0].despues, 8400);
  assert.equal(plan.pideConfirmacion, true);
  const suave = planificarAumento(catalogo, { alcance: { tipo: "tildados", ids: ["yerba"] }, sentido: "subir", porcentaje: "45", redondeo: 10, modo: "margen" });
  assert.equal(suave.pideConfirmacion, false);
});

test("por sección y por proveedor: elige sólo esos productos", () => {
  const bebidas = planificarAumento(catalogo, { alcance: { tipo: "seccion", seccion: "bebidas" }, sentido: "subir", porcentaje: "10", redondeo: 10 });
  assert.deepEqual(bebidas.filas.map((f) => f.productId).sort(), ["agua", "coca"]);
  const almacen = planificarAumento(catalogo, { alcance: { tipo: "proveedor", proveedorId: "prov-almacen" }, sentido: "subir", porcentaje: "10", redondeo: 10 });
  assert.deepEqual(almacen.filas.map((f) => f.productId), ["yerba"]);
});

test("sin ningún costo, el margen dice qué cargar", () => {
  const plan = planificarAumento([catalogo[1]], { alcance: { tipo: "todos" }, sentido: "subir", porcentaje: "40", redondeo: 10, modo: "margen" });
  assert.match(plan.error ?? "", /costo cargado/);
});

test("lo que llega del navegador: sección, proveedor y modo se validan", () => {
  const ok = pedidoDesdeAfuera({ alcance: { tipo: "seccion", seccion: "bebidas" }, sentido: "subir", porcentaje: "8", redondeo: 50, modo: "margen" });
  assert.deepEqual(ok, { alcance: { tipo: "seccion", seccion: "bebidas" }, sentido: "subir", porcentaje: "8", redondeo: 50, modo: "margen" });
  assert.equal(pedidoDesdeAfuera({ alcance: { tipo: "seccion", seccion: "<script>" }, sentido: "subir", porcentaje: "8", redondeo: 50 }), null);
  assert.equal(pedidoDesdeAfuera({ alcance: { tipo: "proveedor", proveedorId: "" }, sentido: "subir", porcentaje: "8", redondeo: 50 }), null);
  assert.equal(pedidoDesdeAfuera({ alcance: { tipo: "todos" }, sentido: "subir", porcentaje: "8", redondeo: 50, modo: "otro" }), null);
  // Sin modo: el de siempre (porcentaje sobre el precio), sin agregar el campo.
  assert.deepEqual(pedidoDesdeAfuera({ alcance: { tipo: "todos" }, sentido: "bajar", porcentaje: "5", redondeo: 10 }), {
    alcance: { tipo: "todos" },
    sentido: "bajar",
    porcentaje: "5",
    redondeo: 10,
  });
});

test("la lista del proveedor se lee con punto y coma, coma o tabulación, y la plata como se escribe acá", () => {
  const l = leerPlanillaDeLista(
    [
      "Código;Descripción;Costo",
      "7791100000130;Gaseosa Coca-Cola 2,25 L;3.250,50",
      "7791100000147\tAgua 2 L\t$ 1.100",
      "7791100000154,Soda 2 L,980",
      "7791/100;mal;10",
      "7791100000161;Sin costo;",
      "7791100000130;Repetido;3.300",
    ].join("\n"),
  );
  assert.deepEqual(
    l.renglones.map((r) => [r.codigo, r.costo]),
    [
      ["7791100000130", 3300],
      ["7791100000147", 1100],
      ["7791100000154", 980],
    ],
  );
  assert.deepEqual(
    l.errores.map((e) => e.fila),
    [5, 6, 7],
  );
});

test("comparar la lista con el catálogo: variación por código y lo que no está cargado", () => {
  const c = compararConElCatalogo(
    [
      { codigo: "111", nombre: "A", costo: 1100 },
      { codigo: "222", nombre: "B", costo: 500 },
      { codigo: "999", nombre: "Nuevo", costo: 10 },
    ],
    [
      { id: "a", name: "Producto A", codigo: "111", costo: 1000 },
      { id: "b", name: "Producto B", codigo: "222", costo: null },
    ],
  );
  assert.deepEqual(
    c.encontrados.map((e) => [e.productId, e.costoLista, e.costoHoy, e.variacion]),
    [
      ["a", 1100, 1000, 10],
      ["b", 500, null, null],
    ],
  );
  assert.deepEqual(c.sinProducto.map((r) => r.codigo), ["999"]);
});

test("costo de las listas: la más nueva manda y se juntan los proveedores", () => {
  const m = costosDeLasListas([
    { proveedorId: "p1", renglones: [{ codigo: "111", nombre: "", costo: 100 }], vigenteDesde: "2026-09-01", version: "v1", cargada: new Date("2026-09-01"), por: "u" },
    { proveedorId: "p2", renglones: [{ codigo: "111", nombre: "", costo: 90 }], vigenteDesde: "2026-09-20", version: "v2", cargada: new Date("2026-09-20"), por: "u" },
  ]);
  assert.deepEqual(m.get("111"), { costo: 90, proveedores: ["p1", "p2"] });
});
