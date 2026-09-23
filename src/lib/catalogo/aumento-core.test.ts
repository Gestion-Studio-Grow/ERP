// ============================================================================
// Actualizar precios: el redondeo va siempre a favor del sentido del cambio, la vista previa es
// el plan que se escribe, y un cambio grande pide confirmar dos veces.
// ============================================================================
//
// Se ejecuta la decisión con datos: `precioConPorcentaje` con los números que rompían el
// punto flotante, y `planificarAumento` sobre un catálogo como el de MAGRA (60 cortes que
// dicen "vacuno" y otros que no).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DESVIO_POR_REDONDEO,
  PASOS_REDONDEO,
  aumentoAplicable,
  elegirProductos,
  leerPorcentaje,
  pedidoDesdeAfuera,
  pideConfirmacionExtra,
  planificarAumento,
  precioConPorcentaje,
  redondearPrecio,
  textoDelPorcentaje,
  type PedidoAumento,
  type ProductoParaPrecios,
} from "./aumento-core";
import { armarPlanDeCambios } from "./planilla-core";

const prod = (p: Partial<ProductoParaPrecios> & { id: string; name: string }): ProductoParaPrecios => ({
  active: true,
  saleUnit: "WEIGHT",
  price: null,
  pricePerKg: null,
  category: null,
  ...p,
});

/** 60 cortes "vacuno" con precios distintos, 5 de cerdo, 1 vacuno sin precio y 1 por unidad. */
function catalogoMagra(): ProductoParaPrecios[] {
  const out: ProductoParaPrecios[] = [];
  for (let i = 1; i <= 60; i++) {
    out.push(prod({ id: `v${i}`, name: `Corte vacuno ${String(i).padStart(2, "0")}`, pricePerKg: 9000 + i * 137 }));
  }
  for (let i = 1; i <= 5; i++) out.push(prod({ id: `c${i}`, name: `Bondiola de cerdo ${i}`, pricePerKg: 8000 + i * 100 }));
  out.push(prod({ id: "v-sin", name: "Vacuno de prueba sin precio" }));
  out.push(prod({ id: "u1", name: "Chorizo parrillero", saleUnit: "UNIT", price: 950 }));
  return out;
}

const pedido = (p: Partial<PedidoAumento>): PedidoAumento => ({
  alcance: { tipo: "todos" },
  sentido: "subir",
  porcentaje: "8",
  redondeo: 10,
  ...p,
});

// ── Redondeo ─────────────────────────────────────────────────────────────────

test("redondeo SIEMPRE para arriba en un aumento, sin la trampa del flotante: $12.500 + 10 % a $50 da $13.750", () => {
  // En punto flotante 12500 × 1,10 = 13750,000000000002: redondeado para arriba a $50 daba
  // $13.800. La cuenta en centavos enteros lo deja exacto.
  assert.equal(12500 * 1.1 > 13750, true, "la trampa del flotante existe");
  assert.equal(Math.ceil((12500 * 1.1) / 50) * 50, 13800, "la cuenta ingenua da $13.800");
  assert.equal(precioConPorcentaje(12500, 10, "subir", 50), 13750);
  assert.equal(precioConPorcentaje(1500, 10, "subir", 10), 1650, "1500 × 1,1 = 1650,0000000000002");
  assert.equal(precioConPorcentaje(1000, 8, "subir", 10), 1080);
  assert.equal(precioConPorcentaje(1000, 8, "subir", 1), 1080);
  assert.equal(precioConPorcentaje(1000, 8, "subir", 50), 1100);
  assert.equal(precioConPorcentaje(1000, 8, "subir", 100), 1100);
  // 12.345 + 8 % = 13.332,60 → siempre hacia arriba, nunca al más cercano.
  assert.equal(precioConPorcentaje(12345, 8, "subir", 1), 13333);
  assert.equal(precioConPorcentaje(12345, 8, "subir", 10), 13340);
  assert.equal(precioConPorcentaje(12345, 8, "subir", 50), 13350);
  assert.equal(precioConPorcentaje(12345, 8, "subir", 100), 13400);
  // 13.301 → a $100 va a 13.400 aunque esté a un peso de 13.300.
  assert.equal(redondearPrecio(13301, 100, "subir"), 13400);
  // Un precio que ya es múltiplo del paso no se mueve de más.
  assert.equal(redondearPrecio(13300, 100, "subir"), 13300);
  assert.equal(redondearPrecio(1000, 50, "subir"), 1000);
});

test("redondeo con decimales en el porcentaje y en el precio: 8,5 % y $1.234,56", () => {
  // 10.000 × 1,085 = 10.850 exacto.
  assert.equal(precioConPorcentaje(10000, 8.5, "subir", 10), 10850);
  assert.equal(precioConPorcentaje(10000, 8.5, "subir", 100), 10900);
  // 1.234,56 × 1,10 = 1.358,016 → al peso, para arriba: 1.359.
  assert.equal(precioConPorcentaje(1234.56, 10, "subir", 1), 1359);
});

test("en una baja el redondeo va SIEMPRE para abajo: una baja nunca termina subiendo el precio", () => {
  assert.equal(precioConPorcentaje(1000, 5, "bajar", 1), 950);
  assert.equal(precioConPorcentaje(1000, 5, "bajar", 50), 950);
  assert.equal(precioConPorcentaje(1000, 5, "bajar", 100), 900);
  // 1.050 − 1 % = 1.039,50 → a $100 para abajo: 1.000 (redondear para arriba daba 1.100, más caro).
  assert.equal(precioConPorcentaje(1050, 1, "bajar", 100), 1000);
});

test("propiedad: el aumento real nunca es menor que el pedido, y la baja real nunca es menor que la pedida", () => {
  let casos = 0;
  for (let precio = 37; precio < 60000; precio += 997) {
    for (const pct of [1, 2.5, 8, 12.75, 30, 80]) {
      for (const paso of PASOS_REDONDEO) {
        const sube = precioConPorcentaje(precio, pct, "subir", paso);
        assert.ok(sube * 100 >= Math.round(precio * (100 + pct)) - 1e-6, `${precio} +${pct}% a $${paso} dio ${sube}`);
        assert.equal(Math.round(sube * 100) % (paso * 100), 0, `${sube} no es múltiplo de $${paso}`);
        const baja = precioConPorcentaje(precio, Math.min(pct, 80), "bajar", paso);
        assert.ok(baja <= precio * (1 - Math.min(pct, 80) / 100) + 1e-6, `${precio} −${pct}% a $${paso} dio ${baja}`);
        casos++;
      }
    }
  }
  assert.ok(casos > 1000);
});

// ── Porcentaje ───────────────────────────────────────────────────────────────

test("el porcentaje se lee como se tipea: '8', '8,5', '12.5 %'; sin signo, con topes", () => {
  assert.deepEqual(leerPorcentaje("8", "subir"), { estado: "ok", valor: 8 });
  assert.deepEqual(leerPorcentaje("8,5", "subir"), { estado: "ok", valor: 8.5 });
  assert.deepEqual(leerPorcentaje("12.5 %", "subir"), { estado: "ok", valor: 12.5 });
  assert.deepEqual(leerPorcentaje("", "subir"), { estado: "vacio" });
  assert.equal(leerPorcentaje("-5", "subir").estado, "invalido", "el '-' no convierte un aumento en baja");
  assert.equal(leerPorcentaje("abc", "subir").estado, "invalido");
  assert.equal(leerPorcentaje("0", "subir").estado, "invalido");
  assert.equal(leerPorcentaje("8,555", "subir").estado, "invalido", "más de dos decimales");
  assert.equal(leerPorcentaje("600", "subir").estado, "invalido");
  assert.equal(leerPorcentaje("500", "subir").estado, "ok");
  assert.equal(leerPorcentaje("90", "bajar").estado, "invalido", "una baja del 90 % deja todo casi en cero");
  assert.equal(leerPorcentaje("89", "bajar").estado, "ok");
});

test("confirmación extra: más del 30 % (en cualquier sentido) sí; 30 % justo, no", () => {
  assert.equal(pideConfirmacionExtra(80), true);
  assert.equal(pideConfirmacionExtra(30.01), true);
  assert.equal(pideConfirmacionExtra(30), false);
  assert.equal(pideConfirmacionExtra(8), false);
  const cat = catalogoMagra();
  assert.equal(planificarAumento(cat, pedido({ porcentaje: "80" })).pideConfirmacion, true);
  assert.equal(planificarAumento(cat, pedido({ porcentaje: "35", sentido: "bajar" })).pideConfirmacion, true);
  assert.equal(planificarAumento(cat, pedido({ porcentaje: "8" })).pideConfirmacion, false);
});

// ── El criterio de MAGRA ─────────────────────────────────────────────────────

test("MAGRA: +8 % a los que dicen 'vacuno', redondeo $50 → 60 cambian con su antes y después; los demás no se tocan", () => {
  const cat = catalogoMagra();
  const plan = planificarAumento(cat, pedido({ alcance: { tipo: "texto", texto: "VACUNO" }, porcentaje: "8", redondeo: 50 }));
  assert.equal(plan.error, null);
  assert.ok(aumentoAplicable(plan));
  assert.equal(plan.elegidos, 61, "60 con precio + 1 sin precio (el texto no distingue mayúsculas)");
  assert.equal(plan.filas.length, 60);
  assert.deepEqual(plan.sinPrecio, [{ id: "v-sin", nombre: "Vacuno de prueba sin precio" }]);
  assert.equal(plan.plan.cambios.length, 60, "el plan que se escribe tiene los mismos 60");
  for (const f of plan.filas) {
    assert.ok(f.productId.startsWith("v"), `${f.nombre} no dice vacuno`);
    assert.equal(f.despues % 50, 0);
    assert.ok(f.despues >= f.antes * 1.08, `${f.nombre}: ${f.antes} → ${f.despues}`);
  }
  // El primero: 9.137 × 1,08 = 9.867,96 → $9.900 (para arriba a $50).
  assert.deepEqual(
    { antes: plan.filas[0].antes, despues: plan.filas[0].despues },
    { antes: 9137, despues: 9900 },
  );
  // Lo que se escribe va en el campo de su forma de venta: por kilo.
  assert.deepEqual(plan.plan.cambios[0].data, { pricePerKg: 9900 });
  assert.equal(plan.plan.altas.length, 0, "un aumento nunca da de alta nada");
});

test("por unidad se escribe en `price`; un pausado entra y se marca", () => {
  const cat = [
    prod({ id: "u1", name: "Chorizo", saleUnit: "UNIT", price: 950 }),
    prod({ id: "p1", name: "Matambre", pricePerKg: 11000, active: false }),
  ];
  const plan = planificarAumento(cat, pedido({ porcentaje: "10", redondeo: 10 }));
  assert.deepEqual(plan.plan.cambios.map((c) => c.data), [{ price: 1050 }, { pricePerKg: 12100 }]);
  assert.deepEqual(plan.filas.map((f) => f.pausado), [false, true]);
});

test("el redondeo que se aleja mucho del porcentaje se marca: $30 + 8 % a $50 queda en $50 (+66,7 %)", () => {
  const plan = planificarAumento([prod({ id: "x", name: "Limón", saleUnit: "UNIT", price: 30 })], pedido({ redondeo: 50 }));
  assert.equal(plan.filas[0].despues, 50);
  assert.equal(plan.filas[0].efectivo, 66.7);
  assert.equal(plan.filas[0].porRedondeo, true);
  const normal = planificarAumento([prod({ id: "y", name: "Vacío", pricePerKg: 12500 })], pedido({ redondeo: 50 }));
  assert.ok(Math.abs(normal.filas[0].efectivo - 8) <= DESVIO_POR_REDONDEO);
  assert.equal(normal.filas[0].porRedondeo, false);
});

test("una baja que con el redondeo deja un precio en $0 frena TODO el plan, con el nombre", () => {
  const cat = [prod({ id: "a", name: "Vacío", pricePerKg: 12500 }), prod({ id: "b", name: "Sal", saleUnit: "UNIT", price: 30 })];
  const plan = planificarAumento(cat, pedido({ sentido: "bajar", porcentaje: "10", redondeo: 50 }));
  assert.match(plan.error ?? "", /"Sal" quedaría en \$0/);
  assert.equal(aumentoAplicable(plan), false);
});

test("sin nada que cambiar: ninguno elegido, todos sin precio, o el redondeo los deja igual", () => {
  const cat = catalogoMagra();
  assert.equal(planificarAumento(cat, pedido({ alcance: { tipo: "texto", texto: "pollo" } })).error, "No hay productos elegidos.");
  assert.equal(planificarAumento(cat, pedido({ alcance: { tipo: "texto", texto: "  " } })).error, "No hay productos elegidos.");
  assert.match(planificarAumento(cat, pedido({ alcance: { tipo: "tildados", ids: ["v-sin"] } })).error ?? "", /Ninguno/);
  assert.equal(planificarAumento(cat, pedido({ porcentaje: "" })).error, "Escribí el porcentaje.");
  // 0,01 % sobre $1.000 al peso para abajo: 999,90 → $999. Pero para arriba al peso: 1000,10 → $1.001.
  const casiNada = planificarAumento([prod({ id: "z", name: "Z", pricePerKg: 1000 })], pedido({ porcentaje: "0,01", redondeo: 1 }));
  assert.equal(casiNada.filas[0].despues, 1001);
});

test("elegir: todos, una góndola (por nombre o la cargada), texto sin acentos, tildados", () => {
  const cat = [
    prod({ id: "1", name: "Vacío" }),
    prod({ id: "2", name: "Bondiola de cerdo" }),
    prod({ id: "3", name: "Algo raro", category: "cerdo" }),
    prod({ id: "4", name: "Pechuga de pollo" }),
  ];
  assert.equal(elegirProductos(cat, { tipo: "todos" }).length, 4);
  assert.deepEqual(elegirProductos(cat, { tipo: "gondola", gondola: "cerdo" }).map((p) => p.id), ["2", "3"]);
  assert.deepEqual(elegirProductos(cat, { tipo: "texto", texto: "vacio" }).map((p) => p.id), ["1"]);
  assert.deepEqual(elegirProductos(cat, { tipo: "tildados", ids: ["4", "no-existe"] }).map((p) => p.id), ["4"]);
});

test("huella: el mismo pedido sobre el mismo catálogo da la misma; si un precio cambió en el medio, otra", () => {
  const cat = catalogoMagra();
  const p = pedido({ alcance: { tipo: "texto", texto: "vacuno" }, redondeo: 50 });
  const a = planificarAumento(cat, p);
  assert.equal(planificarAumento(cat, p).plan.huella, a.plan.huella);
  const otro = cat.map((x) => (x.id === "v7" ? { ...x, pricePerKg: 20000 } : x));
  assert.notEqual(planificarAumento(otro, p).plan.huella, a.plan.huella);
  // Y es la misma huella que arma la planilla con los mismos cambios.
  assert.equal(armarPlanDeCambios(a.plan.cambios).huella, a.plan.huella);
});

test("lo que llega del navegador se valida campo por campo", () => {
  const ok = { alcance: { tipo: "texto", texto: "vacuno" }, sentido: "subir", porcentaje: "8", redondeo: 50 };
  assert.deepEqual(pedidoDesdeAfuera(ok), ok);
  assert.equal(pedidoDesdeAfuera(null), null);
  assert.equal(pedidoDesdeAfuera({ ...ok, redondeo: 25 }), null, "un redondeo que la pantalla no ofrece");
  assert.equal(pedidoDesdeAfuera({ ...ok, sentido: "duplicar" }), null);
  assert.equal(pedidoDesdeAfuera({ ...ok, porcentaje: 8 }), null, "el porcentaje viaja como texto");
  assert.equal(pedidoDesdeAfuera({ ...ok, alcance: { tipo: "gondola", gondola: "dinosaurio" } }), null);
  assert.equal(pedidoDesdeAfuera({ ...ok, alcance: { tipo: "tildados", ids: [1, 2] } }), null);
  assert.equal(pedidoDesdeAfuera({ ...ok, alcance: { tipo: "sql", texto: "1=1" } }), null);
  assert.deepEqual(pedidoDesdeAfuera({ ...ok, alcance: { tipo: "tildados", ids: ["a", "b"] } })?.alcance, { tipo: "tildados", ids: ["a", "b"] });
});

test("el porcentaje en palabras: +8 %, −5 %, +8,5 %", () => {
  assert.equal(textoDelPorcentaje("subir", 8), "+8 %");
  assert.equal(textoDelPorcentaje("bajar", 5), "−5 %");
  assert.equal(textoDelPorcentaje("subir", 8.5), "+8,5 %");
});
