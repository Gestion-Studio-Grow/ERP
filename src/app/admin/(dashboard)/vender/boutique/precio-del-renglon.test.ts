// VENDER BOUTIQUE · el precio del renglón (tanda perf): reglas puras, sin base.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAMPO_PRECIO_VISTO,
  CONTROL_DEL_RENGLON_MS,
  MAX_PRECIOS_VISTOS,
  avisoDePrecioAlGrabar,
  avisoDePrecioAlSumar,
  camposDePreciosVistos,
  cambiosContraLoVisto,
  cambiosEnLoCobrado,
  cobradoPorProducto,
  debeControlarPrecio,
  leerPreciosVistos,
} from "./precio-del-renglon";

const vacio = { id: "p_vacio", name: "Vacío", saleUnit: "WEIGHT" as const, price: null, pricePerKg: 12500 };
const crema = { id: "p_crema", name: "Crema", saleUnit: "UNIT" as const, price: 9000, pricePerKg: null };

test("los campos del precio visto: uno por producto, sin repetir, y se leen igual del otro lado", () => {
  const campos = camposDePreciosVistos([vacio, crema, vacio, { id: "x y", price: 1, pricePerKg: null }]);
  assert.deepEqual(campos, [
    [CAMPO_PRECIO_VISTO, "p_vacio||12500"],
    [CAMPO_PRECIO_VISTO, "p_crema|9000|"],
  ]);
  const leidos = leerPreciosVistos(campos.map(([, v]) => v));
  assert.deepEqual([...leidos], [
    ["p_vacio", { price: null, pricePerKg: 12500 }],
    ["p_crema", { price: 9000, pricePerKg: null }],
  ]);
});

test("lo que manda la pantalla no se cree: formas raras, negativos y de más se descartan", () => {
  const leidos = leerPreciosVistos(["p_a|-1|", "p_b|abc|", "p_c|1", "x y|1|", 42, "p_d|1|2|3", "p_e|Infinity|", "p_f|10|", "p_f|20|"]);
  assert.deepEqual([...leidos], [["p_f", { price: 10, pricePerKg: null }]]);
  const muchos = Array.from({ length: MAX_PRECIOS_VISTOS + 5 }, (_, i) => `p_${i}|1|`);
  assert.equal(leerPreciosVistos(muchos).size, MAX_PRECIOS_VISTOS);
});

test("el control antes de grabar: compara por kilo o por unidad según la BASE, al centavo", () => {
  const vistos = leerPreciosVistos(["p_vacio||12500", "p_crema|9000|"]);
  assert.deepEqual(cambiosContraLoVisto(vistos, [vacio, crema]), []);
  const subio = cambiosContraLoVisto(vistos, [{ ...vacio, pricePerKg: 13000 }, { ...crema, price: 9000.004 }]);
  assert.deepEqual(subio, [{ id: "p_vacio", nombre: "Vacío", porKilo: true, antes: 12500, ahora: 13000 }]);
  // Un producto que no está en la base del negocio (de otro, borrado) no cuenta: lo decide el alta.
  assert.deepEqual(cambiosContraLoVisto(leerPreciosVistos(["p_otro|1|"]), [vacio]), []);
});

test("el control después de grabar: el precio con que quedó cada producto, por nombre o, si no se puede, null", () => {
  const lineas = [
    { nombre: "Vacío", precio: 13000, aMano: false },
    { nombre: "Bondiola", precio: 5000, aMano: true },
    { nombre: "Envío · Centro", precio: 1500, aMano: false, envio: true as const },
  ];
  assert.deepEqual(cobradoPorProducto(lineas, [vacio, crema]), [{ productId: "p_vacio", precio: 13000 }]);
  assert.equal(cobradoPorProducto(lineas, [vacio, { ...crema, name: "Vacío" }]), null, "dos con el mismo nombre");
  assert.equal(cobradoPorProducto([{ nombre: "Vacío nuevo", precio: 1, aMano: false }], [vacio]), null, "cambió de nombre");
  const vistos = leerPreciosVistos(["p_vacio||12500"]);
  assert.deepEqual(cambiosEnLoCobrado([{ productId: "p_vacio", precio: 12500 }], vistos, [vacio]), []);
  const tarde = cambiosEnLoCobrado([{ productId: "p_vacio", precio: 13000 }, { productId: "p_vacio", precio: 13000 }], vistos, [vacio]);
  assert.deepEqual(tarde, [{ id: "p_vacio", nombre: "Vacío", porKilo: true, antes: 12500, ahora: 13000 }]);
  assert.match(avisoDePrecioAlGrabar(tarde), /^Ojo: un precio cambió justo mientras se cobraba \(Vacío subió a \$\s?13\.000 recién\)/);
});

test("al sumar: una vez por minuto y por producto; el aviso no pide cobrar de nuevo", () => {
  assert.equal(debeControlarPrecio(undefined, 1000), true);
  assert.equal(debeControlarPrecio(1000, 1000 + CONTROL_DEL_RENGLON_MS - 1), false);
  assert.equal(debeControlarPrecio(1000, 1000 + CONTROL_DEL_RENGLON_MS), true);
  const aviso = avisoDePrecioAlSumar([{ id: "p_vacio", nombre: "Vacío", porKilo: true, antes: 12500, ahora: 13000 }]);
  assert.match(aviso, /^Cambió un precio en el catálogo: Vacío subió a/);
  assert.doesNotMatch(aviso, /cobrá de nuevo/);
});
