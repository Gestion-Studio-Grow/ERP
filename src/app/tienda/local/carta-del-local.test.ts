// «Pedí Local»: la carta explícita del local (carta-del-local.ts) cruzada con la del servidor por
// nombre, con la regla por palabras de carta.ts como respaldo; y la carta real de Bitácora.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cartaPorCategoria, categoriaDe, resumenDelPedido } from "./carta";
import { destacadosDeLaCarta, fichasDeLaCarta, type CartaDelLocal } from "@/lib/delivery-local/carta-del-local";
import { CARTA_BITACORA } from "@/lib/delivery-local/carta-bitacora";
import { configDeliveryLocal } from "@/lib/delivery-local/config";

const p = (id: string, name: string) => ({ id, name });

const CARTA: CartaDelLocal = [
  { id: "combos", titulo: "Combos", dibujo: "cafe", productos: [{ codigo: "a", nombre: "Café con 2 medialunas", precio: 1, destacado: true }] },
  {
    id: "cafeteria",
    titulo: "Cafetería",
    dibujo: "cafe",
    productos: [
      { codigo: "b", nombre: "Espresso", precio: 1, descripcion: "  Corto.  ", imagen: "https://x.test/e.jpg" },
      { codigo: "c", nombre: "Capuccino", precio: 1, imagen: "javascript:alert(1)" },
    ],
  },
];

test("regla por palabras: «Capuccino» y «Moccacino» son café (antes caían en «Más de la carta»)", () => {
  assert.equal(categoriaDe("Capuccino").id, "cafe");
  assert.equal(categoriaDe("Moccacino").id, "cafe");
  assert.equal(categoriaDe("Cappuccino").id, "cafe");
  assert.equal(categoriaDe("Capuchino").id, "cafe");
});

test("cartaPorCategoria con la carta del local: sus categorías y su orden primero, el resto por palabras", () => {
  const carta = cartaPorCategoria([p("1", "capuccino"), p("2", "Brownie"), p("3", "ESPRESSO"), p("4", "Café con 2 medialunas"), p("5", "Gift card")], CARTA);
  assert.deepEqual(
    carta.map((g) => [g.categoria.id, g.productos.map((x) => x.id)]),
    [
      ["combos", ["4"]],
      ["cafeteria", ["3", "1"]],
      ["pasteleria", ["2"]],
      ["otros", ["5"]],
    ],
  );
  assert.equal(carta[0].categoria.dibujo, "cafe");
  assert.equal(carta[2].categoria.dibujo, undefined, "los de la regla por palabras usan su id como dibujo");
  // Sin carta del local, lo de siempre.
  assert.deepEqual(
    cartaPorCategoria([p("1", "Capuccino")]).map((g) => g.categoria.id),
    ["cafe"],
  );
});

test("fichas: descripción recortada, sólo URLs seguras y destacados en el orden del local", () => {
  const f = fichasDeLaCarta(CARTA);
  assert.equal(f.get("espresso")?.descripcion, "Corto.");
  assert.equal(f.get("espresso")?.imagen, "https://x.test/e.jpg");
  assert.equal(f.get("capuccino")?.imagen, null, "una URL rara no llega al <img>");
  assert.equal(f.get("capuccino")?.descripcion, null);
  assert.equal(fichasDeLaCarta(undefined).size, 0);
  const prods = [p("1", "Espresso"), p("2", "cafe con 2 medialunas")];
  assert.deepEqual(destacadosDeLaCarta(prods, CARTA).map((x) => x.id), ["2"]);
  assert.deepEqual(destacadosDeLaCarta([p("1", "Espresso")], CARTA), [], "el destacado que no está hoy no se muestra");
});

test("Bitácora: 8 categorías en el orden del local, combos primero y cada producto en la suya", () => {
  const cfg = configDeliveryLocal("bitacora")!;
  assert.equal(cfg.carta, CARTA_BITACORA);
  assert.deepEqual(
    CARTA_BITACORA.map((c) => c.id),
    ["combos", "cafeteria", "bebidas-frias", "panaderia-salados", "dulces", "tortas", "almuerzos", "para-casa"],
  );
  const todos = CARTA_BITACORA.flatMap((c) => c.productos.map((x) => p(x.codigo, x.nombre)));
  assert.equal(todos.length, 84);
  const carta = cartaPorCategoria(todos, cfg.carta);
  assert.deepEqual(carta.map((g) => g.categoria.id), CARTA_BITACORA.map((c) => c.id));
  for (const g of carta) {
    const esperado = CARTA_BITACORA.find((c) => c.id === g.categoria.id)!;
    assert.deepEqual(g.productos.map((x) => x.id), esperado.productos.map((x) => x.codigo), g.categoria.id);
    assert.ok(["cafe", "bebidas", "brunch", "pasteleria", "granos"].includes(g.categoria.dibujo ?? ""), g.categoria.id);
  }
  // Los que la regla por palabras ubicaba mal, ahora en su lugar.
  const de = (nombre: string) => carta.find((g) => g.productos.some((x) => x.name === nombre))?.categoria.id;
  assert.equal(de("Café con 2 medialunas"), "combos");
  assert.equal(de("Capuccino"), "cafeteria");
  assert.equal(de("Moccacino"), "cafeteria");
  assert.equal(de("Cerveza artesanal"), "bebidas-frias");
  assert.equal(de("Tiramisú"), "tortas");
  assert.equal(de("Media docena de medialunas"), "para-casa");
  // Fotos: todas https de Fudo; 6 destacados; 9 sin foto (provisional a confirmar).
  const f = [...fichasDeLaCarta(cfg.carta).values()];
  assert.equal(f.filter((x) => x.destacado).length, 6);
  assert.equal(f.filter((x) => x.imagen === null).length, 9);
  assert.ok(f.every((x) => x.imagen === null || x.imagen.startsWith("https://")));
});

test("resumenDelPedido: «Lo de siempre» en una línea", () => {
  assert.equal(resumenDelPedido([{ nombre: "Flat white", cantidad: 1, saleUnit: "UNIT" }, { nombre: "Medialuna de manteca", cantidad: 2, saleUnit: "UNIT" }]), "Flat white + 2 × Medialuna de manteca");
  const cuatro = ["A", "B", "C", "D"].map((nombre) => ({ nombre, cantidad: 1, saleUnit: "UNIT" as const }));
  assert.equal(resumenDelPedido(cuatro), "A + B + C y 1 más");
  assert.equal(resumenDelPedido([{ nombre: "Café en grano", cantidad: 0.25, saleUnit: "WEIGHT" }]), "0,25 kg de Café en grano");
});

test("opciones de Bitácora: cada producto con opciones existe en su carta y los grupos son de la config", async () => {
  const { OPCIONES_BITACORA } = await import("@/lib/delivery-local/opciones-bitacora");
  const cfg = configDeliveryLocal("bitacora")!;
  assert.equal(cfg.opciones, OPCIONES_BITACORA);
  assert.equal(OPCIONES_BITACORA.length, 40);
  const fichas = fichasDeLaCarta(cfg.carta);
  for (const o of OPCIONES_BITACORA) assert.ok(fichas.has(o.producto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()), o.producto);
  // «Hacelo combo» de los almuerzos: el único recargo real de Fudo ($3.000).
  const combo = OPCIONES_BITACORA.find((o) => o.producto === "Sándwich de bondiola")!.grupos[0];
  assert.equal(combo.opciones[0].recargo, 3000);
});
