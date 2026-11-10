// «Pedí Local»: la carta por categoría, los totales de la bolsa, el control del formulario y el
// mensaje del botón de arrepentimiento. Lógica pura (carta.ts), sin red ni DOM.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cantidadTrasToque,
  cartaPorCategoria,
  categoriaDe,
  lineasDeLaBolsa,
  mensajeDeCancelacion,
  numeroDePedido,
  revisarPedidoLocal,
  totalesDeLaBolsa,
  type DatosDelPedido,
  type ProductoDeLaCarta,
} from "./carta";

const prod = (id: string, name: string, price: number, extra: Partial<ProductoDeLaCarta> = {}): ProductoDeLaCarta => ({
  id,
  name,
  saleUnit: "UNIT",
  price,
  pricePerKg: null,
  unit: "u",
  ...extra,
});

test("categoriaDe: palabras de cafetería, sin importar tildes ni mayúsculas", () => {
  assert.equal(categoriaDe("Café con leche").id, "cafe");
  assert.equal(categoriaDe("FLAT WHITE").id, "cafe");
  assert.equal(categoriaDe("Té verde").id, "bebidas");
  assert.equal(categoriaDe("Tostado de jamón y queso").id, "brunch");
  assert.equal(categoriaDe("Medialuna de manteca").id, "pasteleria");
  assert.equal(categoriaDe("Café en grano 250 g").id, "granos");
  assert.equal(categoriaDe("Tostón de palta").id, "brunch");
  assert.equal(categoriaDe("Vela aromática").id, "otros");
  // «te» suelto, no dentro de otra palabra.
  assert.equal(categoriaDe("Tentación de chocolate").id, "otros");
});

test("cartaPorCategoria: orden de la carta, sin grupos vacíos, «Más de la carta» al final", () => {
  const carta = cartaPorCategoria([prod("1", "Brownie", 1), prod("2", "Gift card", 1), prod("3", "Cortado", 1), prod("4", "Muffin", 1)]);
  assert.deepEqual(
    carta.map((g) => [g.categoria.id, g.productos.map((p) => p.id)]),
    [
      ["cafe", ["3"]],
      ["pasteleria", ["1", "4"]],
      ["otros", ["2"]],
    ],
  );
  assert.deepEqual(cartaPorCategoria([]), []);
});

test("lineasDeLaBolsa + totalesDeLaBolsa: subtotal + envío = total, con el peso como una cosa", () => {
  const productos = [prod("a", "Cortado", 2500), prod("b", "Café en grano", 0, { saleUnit: "WEIGHT", price: null, pricePerKg: 30000 }), prod("c", "Alfajor", 1200)];
  const lineas = lineasDeLaBolsa(productos, { a: 2, b: 0.25, x: 3 });
  assert.deepEqual(
    lineas.map((l) => [l.producto.id, l.importe]),
    [
      ["a", 5000],
      ["b", 7500],
    ],
  );
  assert.deepEqual(totalesDeLaBolsa(lineas, 1500), { subtotal: 12500, envio: 1500, total: 14000, unidades: 3 });
  assert.deepEqual(totalesDeLaBolsa(lineas, 0), { subtotal: 12500, envio: 0, total: 12500, unidades: 3 });
  // Un envío raro no suma (NaN o negativo).
  assert.equal(totalesDeLaBolsa(lineas, Number.NaN).total, 12500);
  assert.equal(totalesDeLaBolsa(lineas, -10).total, 12500);
  // Centavos: 3 × 0,1 no da 0,30000000000000004.
  const l2 = lineasDeLaBolsa([prod("d", "Caramelo", 0.1)], { d: 3 });
  assert.equal(totalesDeLaBolsa(l2, 0).total, 0.3);
});

test("cantidadTrasToque: no baja de 0, no suma sin stock, el peso va de a 250 g", () => {
  assert.equal(cantidadTrasToque({ saleUnit: "UNIT" }, 0, -1), 0);
  assert.equal(cantidadTrasToque({ saleUnit: "UNIT" }, 1, 1), 2);
  assert.equal(cantidadTrasToque({ saleUnit: "UNIT", disponibilidad: "sin-stock" }, 0, 1), 0);
  assert.equal(cantidadTrasToque({ saleUnit: "UNIT", disponibilidad: "sin-stock" }, 2, -1), 1);
  assert.equal(cantidadTrasToque({ saleUnit: "WEIGHT" }, 0.5, 1), 0.75);
});

const base: DatosDelPedido = {
  nombre: "Ana Pérez",
  telefono: "11 2345-6789",
  fulfillment: "DELIVERY",
  direccion: "Alem 123, Monte Grande",
  medio: "transferencia",
  pagaCon: "",
  acepta: true,
  total: 9000,
  medios: ["transferencia", "efectivo", "mercadopago"],
};

test("revisarPedidoLocal: un pedido completo pasa", () => {
  assert.deepEqual(revisarPedidoLocal(base), { ok: true });
  assert.deepEqual(revisarPedidoLocal({ ...base, fulfillment: "PICKUP", direccion: "" }), { ok: true });
  assert.deepEqual(revisarPedidoLocal({ ...base, medio: "efectivo", pagaCon: "" }), { ok: true });
  assert.deepEqual(revisarPedidoLocal({ ...base, medio: "efectivo", pagaCon: "10.000" }), { ok: true });
  assert.deepEqual(revisarPedidoLocal({ ...base, medio: "", medios: [] }), { ok: true });
});

test("revisarPedidoLocal: frena en el primer campo que falta, en el orden de la pantalla", () => {
  const campo = (d: Partial<DatosDelPedido>) => {
    const r = revisarPedidoLocal({ ...base, ...d });
    return r.ok ? null : r.campo;
  };
  assert.equal(campo({ nombre: " " }), "customerName");
  assert.equal(campo({ telefono: "1234" }), "customerPhone");
  assert.equal(campo({ telefono: "1".repeat(16) }), "customerPhone");
  assert.equal(campo({ direccion: "" }), "address");
  assert.equal(campo({ medio: "" }), "medioPreferido");
  assert.equal(campo({ medio: "bitcoin" }), "medioPreferido");
  assert.equal(campo({ medio: "mercadopago", medios: ["efectivo"] }), "medioPreferido");
  assert.equal(campo({ medio: "efectivo", pagaCon: "abc" }), "pagaCon");
  assert.equal(campo({ medio: "efectivo", pagaCon: "5000" }), "pagaCon");
  assert.equal(campo({ acepta: false }), "aceptaTerminos");
  assert.equal(campo({ nombre: "", acepta: false }), "customerName");
});

test("revisarPedidoLocal: «paga con» menor al total dice cuánto es el total", () => {
  const r = revisarPedidoLocal({ ...base, medio: "efectivo", pagaCon: "5.000" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /9\.000/);
});

test("numeroDePedido y mensajeDeCancelacion: el número sólo si parece uno", () => {
  assert.equal(numeroDePedido("#ab-12"), "AB-12");
  assert.equal(numeroDePedido(["P7", "x"]), "P7");
  assert.equal(numeroDePedido("<script>"), null);
  assert.equal(numeroDePedido(undefined), null);
  assert.equal(mensajeDeCancelacion("Bitácora Café", "P7"), "Hola Bitácora Café, quiero cancelar mi pedido #P7. Mi nombre es ___. Gracias.");
  assert.match(mensajeDeCancelacion("Bitácora Café", "no válido!"), /número: ___/);
});
