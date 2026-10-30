// Vidriera compartida (ronda 2, P0-3): la bolsa guardada, los renglones que viajan con el precio visto y la adopción
// en las cuatro tiendas. Toca pedidos y precios: certificador COMPLETO.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { limpiarBolsaGuardada, mandaPreciosVistos, renglonesDelPedido, TOPE_GUARDADO } from "./bolsa";
import CamposDelPedido from "./CamposDelPedido";
import { CLAVE_BOLSA, CLAVE_ENVIO } from "./claves";
import { preciosVistos } from "@/app/tienda/reglas-tienda";

test("bolsa guardada: sólo productos de hoy, con variante, y cantidades sanas", () => {
  const ids = new Set(["a", "b"]);
  const b = limpiarBolsaGuardada({ a: 2, "b|Vainilla": 1, c: 3, "a|x": -1, "b|y": Infinity, "b|z": "2", "a|w": TOPE_GUARDADO + 1, ["b|" + "x".repeat(81)]: 1 }, ids);
  assert.deepEqual(b, { a: 2, "b|Vainilla": 1 });
  assert.deepEqual(limpiarBolsaGuardada(null, ids), {});
  assert.deepEqual(limpiarBolsaGuardada([1, 2], ids), {});
  assert.deepEqual(limpiarBolsaGuardada("a", ids), {});
  assert.deepEqual(limpiarBolsaGuardada({ a: 1.5 }, ids), { a: 1.5 }, "kilos de lo que se vende por peso");
});

test("renglones del pedido: el precio que se mostró, nada de productos que ya no están", () => {
  const porId = new Map([
    ["a", { id: "a", precio: 1200 }],
    ["b", { id: "b", precio: 0 }],
  ]);
  const r = renglonesDelPedido({ a: 2, b: 1, fantasma: 4 }, porId, (p) => p.precio);
  assert.deepEqual(r, [
    { productId: "a", quantity: 2, unitPrice: 1200 },
    { productId: "b", quantity: 1, unitPrice: null },
  ]);
  assert.equal(mandaPreciosVistos(r), false, "uno sin precio visible: no se manda ninguno");
  assert.equal(mandaPreciosVistos([{ productId: "a", quantity: 1, unitPrice: 10 }]), true);
  assert.equal(mandaPreciosVistos([]), false);
});

test("los campos del pedido viajan en el orden que el servidor empareja (productId ↔ unitPrice)", () => {
  const html = renderToStaticMarkup(
    createElement(CamposDelPedido, {
      renglones: [
        { productId: "a", quantity: 2, unitPrice: 1200 },
        { productId: "b", quantity: 1, unitPrice: 990.5 },
      ],
      clave: "web-123",
    }),
  );
  const valores = (n: string) => [...html.matchAll(new RegExp(`name="${n}" value="([^"]*)"`, "g"))].map((m) => m[1]);
  assert.deepEqual(valores("productId"), ["a", "b"]);
  assert.deepEqual(valores("quantity"), ["2", "1"]);
  assert.deepEqual(valores("idempotencyKey"), ["web-123"]);
  // Lo que hace el servidor con eso: un precio por renglón, emparejado por posición.
  assert.deepEqual(preciosVistos(valores("unitPrice"), 2), [1200, 990.5]);

  const sinPrecio = renderToStaticMarkup(createElement(CamposDelPedido, { renglones: [{ productId: "a", quantity: 1, unitPrice: 10 }, { productId: "b", quantity: 1, unitPrice: null }], clave: "k" }));
  assert.ok(!sinPrecio.includes('name="unitPrice"'), "todos o ninguno");
});

test("una sola clave del navegador para las cuatro tiendas", () => {
  assert.equal(CLAVE_BOLSA("shinevelas"), "gsg:bolsa:shinevelas");
  assert.equal(CLAVE_ENVIO("magra"), "gsg:bolsa-enviada:magra");
});

const leer = (f: string) => readFileSync(f, "utf8");

test("adopción: las cuatro bolsas mandan el precio visto con CamposDelPedido", () => {
  for (const f of ["src/app/tienda/quebienoles/Bolsa.tsx", "src/app/tienda/shine/Bolsa.tsx", "src/app/tienda/adosmanos/Bolsa.tsx"]) {
    const s = leer(f);
    assert.match(s, /<CamposDelPedido /, f);
    assert.doesNotMatch(s, /name="productId"/, `${f}: campos a mano`);
  }
  // Magra ya mandaba el precio visto renglón por renglón (con su aviso al lado): sigue igual.
  assert.match(leer("src/app/tienda/magra/MagraTienda.tsx"), /name="unitPrice" value=\{unitPrice\(l\.p\)\}/);
});

test("adopción: la bolsa se guarda en las cuatro tiendas y se olvida al confirmar", () => {
  for (const f of ["src/app/tienda/shine/ShineFront.tsx", "src/app/tienda/adosmanos/AdosmanosFront.tsx", "src/app/tienda/magra/MagraTienda.tsx"]) {
    const s = leer(f);
    assert.match(s, /useBolsaGuardada\(tenantKey/, f);
    assert.match(s, /marcarEnvio/, f);
  }
  assert.match(leer("src/app/tienda/vidriera/useVidriera.ts"), /CLAVE_BOLSA\(tenantKey\)/, "Qué Bien Olés ya la guardaba");
  for (const f of ["src/app/tienda/magra/GraciasMagra.tsx", "src/app/tienda/quebienoles/GraciasQuebienoles.tsx", "src/app/tienda/adosmanos/GraciasAdosmanos.tsx", "src/components/vidriera/Gracias.tsx"]) {
    assert.match(leer(f), /<OlvidarBolsa /, f);
  }
});

test("adopción: ninguna tienda abre un <dialog> a mano (la hoja compartida maneja «atrás»)", () => {
  const archivos = [
    "src/app/tienda/quebienoles/Bolsa.tsx",
    "src/app/tienda/quebienoles/Ficha.tsx",
    "src/app/tienda/shine/Bolsa.tsx",
    "src/app/tienda/shine/Ficha.tsx",
    "src/app/tienda/shine/Aromas.tsx",
    "src/app/tienda/adosmanos/Bolsa.tsx",
    "src/app/tienda/adosmanos/Ficha.tsx",
    "src/app/tienda/adosmanos/AdosmanosFront.tsx",
    "src/app/tienda/magra/MagraTienda.tsx",
    "src/app/tienda/vidriera/Ficha.tsx",
  ];
  for (const f of archivos) {
    const s = leer(f);
    assert.doesNotMatch(s, /\.showModal\(\)/, f);
    assert.match(s, /useHoja\(/, f);
  }
});

test("trinquete: ninguna tienda con hoja borra el estado del historial con replaceState(null) (deja un «atrás» muerto)", () => {
  const archivos = [
    "src/app/tienda/quebienoles/QuebienolesFront.tsx",
    "src/app/tienda/shine/ShineFront.tsx",
    "src/app/tienda/adosmanos/AdosmanosFront.tsx",
    "src/app/tienda/magra/MagraTienda.tsx",
  ];
  for (const f of archivos) assert.doesNotMatch(leer(f), /replaceState\(\s*null/, f);
});

test("la clave anti-duplicado se guarda con la bolsa y sólo se dibuja con renglones", async () => {
  const { claveGuardadaValida, CLAVE_DEL_PEDIDO } = await import("./claves");
  assert.equal(CLAVE_DEL_PEDIDO("magra"), "gsg:pedido:magra");
  assert.equal(claveGuardadaValida("6f1c2b1e-8d4a-4c1b-9a7e-1234567890ab"), "6f1c2b1e-8d4a-4c1b-9a7e-1234567890ab");
  assert.equal(claveGuardadaValida("1730000000000-abcdefghijkl"), "1730000000000-abcdefghijkl");
  for (const mala of [null, 42, "", "corta", "<script>", "x".repeat(65)]) assert.equal(claveGuardadaValida(mala), null);
  const vacia = renderToStaticMarkup(createElement(CamposDelPedido, { renglones: [], clave: "k".repeat(20) }));
  assert.doesNotMatch(vacia, /idempotencyKey/, "con la bolsa vacía no hay clave en el HTML (hidratación)");
  for (const f of ["src/components/vidriera/useBolsaGuardada.ts", "src/app/tienda/vidriera/useVidriera.ts"]) {
    assert.match(leer(f), /leerClaveGuardada\(/, f);
    assert.match(leer(f), /guardarClave\(/, f);
  }
});
