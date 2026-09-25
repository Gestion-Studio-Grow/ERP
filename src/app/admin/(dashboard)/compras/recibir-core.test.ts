// Recibir mercadería con el diseño nuevo: las reglas puras de la pantalla. Nombres, stock y mínimos
// de MAGRA y los proveedores son los de `erp_lab` (25/09/2026); las cantidades y los costos del
// remito son armados para la prueba.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cortosParaSumar,
  detalleDeEntrada,
  leerRenglones,
  proveedorDeLaUrl,
  queFaltaParaRegistrar,
  renglonVacio,
  renglonesQueEntran,
  totalDelRemito,
  type EstadoDelRemito,
  type ProductoRecibible,
} from "./recibir-core";

const bife: ProductoRecibible = {
  id: "p-bife",
  name: "Bife de chorizo",
  unit: "kg",
  stock: 0.847,
  lowStockAt: 5,
};
const ojo: ProductoRecibible = {
  id: "p-ojo",
  name: "Ojo de bife",
  unit: "kg",
  stock: 2.925,
  lowStockAt: 5,
};
const cuadril: ProductoRecibible = {
  id: "p-cuadril",
  name: "Cuadril",
  unit: "kg",
  stock: 3.8,
  lowStockAt: 5,
};
const bondiola: ProductoRecibible = {
  id: "p-bondiola",
  name: "Bondiola",
  unit: "kg",
  stock: 5.158,
  lowStockAt: 5,
};
const porId = new Map([bife, ojo, cuadril, bondiola].map((p) => [p.id, p]));
const proveedores = [
  {
    id: "s-ramon",
    name: "Frigorífico Don Ramón (prueba)",
    taxId: "30716000105",
  },
  { id: "s-aromos", name: "Granja Los Aromos (prueba)", taxId: "30716000296" },
];

const base = (parcial: Partial<EstadoDelRemito>): EstadoDelRemito => ({
  esCompra: true,
  conCostos: true,
  medio: "EFECTIVO",
  conMaestro: true,
  proveedorId: "s-ramon",
  leidos: [],
  ...parcial,
});

test("un renglón con coma decimal y costo con miles se lee como en la pantalla de siempre", () => {
  const [r] = leerRenglones([{ key: 1, productId: "p-bife", qtyText: "12,5", costText: "18.900" }], porId, true);
  assert.equal(r.cantidad, 12.5);
  assert.equal(r.costo, 18900);
  assert.equal(r.importe, 236250);
  assert.equal(r.cantidadMal, false);
});

test("quien no ve costos no lee costo aunque venga tipeado, y el remito no suma plata", () => {
  const leidos = leerRenglones([{ key: 1, productId: "p-bife", qtyText: "10", costText: "18.900" }], porId, false);
  assert.equal(leidos[0].costo, 0);
  assert.equal(totalDelRemito(leidos), 0);
  assert.equal(renglonesQueEntran(leidos).length, 1);
});

test("el total del remito suma sólo los renglones con cantidad y costo", () => {
  const leidos = leerRenglones(
    [
      { key: 1, productId: "p-bife", qtyText: "10", costText: "18.900" },
      { key: 2, productId: "p-cuadril", qtyText: "8", costText: "" },
      renglonVacio(3),
    ],
    porId,
    true,
  );
  assert.equal(totalDelRemito(leidos), 189000);
  assert.equal(renglonesQueEntran(leidos).length, 2);
});

test("sin nada cargado, el botón dice que falta cargar qué llegó", () => {
  const leidos = leerRenglones([renglonVacio(1)], porId, true);
  assert.equal(queFaltaParaRegistrar(base({ leidos })), "Cargá qué llegó y cuánto.");
});

test("una cantidad ilegible frena todo el remito y nombra el producto", () => {
  const leidos = leerRenglones(
    [
      { key: 1, productId: "p-bife", qtyText: "10", costText: "18.900" },
      { key: 2, productId: "p-cuadril", qtyText: "ocho", costText: "" },
    ],
    porId,
    true,
  );
  assert.match(queFaltaParaRegistrar(base({ leidos })) ?? "", /La cantidad de Cuadril no se entiende/);
});

test("una compra de quien ve costos necesita el medio de pago", () => {
  const leidos = leerRenglones([{ key: 1, productId: "p-bife", qtyText: "10", costText: "18.900" }], porId, true);
  assert.equal(queFaltaParaRegistrar(base({ leidos, medio: "" })), "Falta decir cómo se pagó.");
  assert.equal(queFaltaParaRegistrar(base({ leidos })), null);
});

test("la reposición interna y la recepción del encargado no piden medio de pago", () => {
  const leidos = leerRenglones([{ key: 1, productId: "p-bife", qtyText: "10", costText: "" }], porId, true);
  assert.equal(queFaltaParaRegistrar(base({ leidos, medio: "", esCompra: false })), null);
  assert.equal(queFaltaParaRegistrar(base({ leidos, medio: "", conCostos: false })), null);
});

test("a cuenta corriente pide proveedor de la lista y costo, como el servidor", () => {
  const conCosto = leerRenglones([{ key: 1, productId: "p-bife", qtyText: "10", costText: "18.900" }], porId, true);
  const sinCosto = leerRenglones([{ key: 1, productId: "p-bife", qtyText: "10", costText: "" }], porId, true);
  const cc = { medio: "CUENTA_CORRIENTE" as const };
  assert.match(queFaltaParaRegistrar(base({ ...cc, leidos: conCosto, conMaestro: false })) ?? "", /Proveedores/);
  assert.match(queFaltaParaRegistrar(base({ ...cc, leidos: conCosto, proveedorId: "" })) ?? "", /a qué proveedor/);
  assert.match(queFaltaParaRegistrar(base({ ...cc, leidos: sinCosto })) ?? "", /sin costo no hay deuda/);
  assert.equal(queFaltaParaRegistrar(base({ ...cc, leidos: conCosto })), null);
});

test("el proveedor que llega por la dirección sólo vale si es de la lista", () => {
  assert.equal(proveedorDeLaUrl("s-ramon", proveedores), "s-ramon");
  assert.equal(proveedorDeLaUrl(["s-aromos", "x"], proveedores), "s-aromos");
  assert.equal(proveedorDeLaUrl("s-de-otro-negocio", proveedores), "");
  assert.equal(proveedorDeLaUrl(undefined, proveedores), "");
});

test("«estaba corto» pone primero lo que más lejos quedó del mínimo y deja afuera lo que está bien", () => {
  const cortos = cortosParaSumar([cuadril, bondiola, ojo, bife], (p) => p.stock < p.lowStockAt);
  assert.deepEqual(
    cortos.map((p) => p.name),
    ["Bife de chorizo", "Ojo de bife", "Cuadril"],
  );
  assert.equal(cortosParaSumar([cuadril, ojo, bife], (p) => p.stock < p.lowStockAt, 2).length, 2);
});

test("el detalle de una entrada nombra dos productos y cuenta el resto", () => {
  assert.equal(
    detalleDeEntrada([
      { name: "Vacío", quantity: 12, unit: "kg" },
      { name: "Matambre", quantity: 8.5, unit: "kg" },
      { name: "Chorizo", quantity: 20, unit: "unidad" },
    ]),
    "Vacío 12 kg · Matambre 8,5 kg y 1 más",
  );
  assert.equal(detalleDeEntrada([{ name: "Vela de soja", quantity: 24, unit: "unidad" }]), "Vela de soja 24 u");
});
