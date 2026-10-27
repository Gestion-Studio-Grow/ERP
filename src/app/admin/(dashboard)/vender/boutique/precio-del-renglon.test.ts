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
  avisoDeQueNoEntro,
  avisoDeQueYaNoSeVende,
  noEntraronEnLaVenta,
  queYaNoSeVenden,
  sinLosQueNoSeVenden,
  vendibles,
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

test("lo que se ve y ya no se vende (pausado, borrado, sin precio) frena el cobro; lo ajeno lo decide el alta", () => {
  const fila = <T extends object>(p: T, extra: { active?: boolean; deletedAt?: Date | null } = {}) => ({ ...p, active: true, deletedAt: null, ...extra });
  const vistos = leerPreciosVistos(["p_vacio||12500", "p_crema|9000|", "p_pausa|700|", "p_borr|800|", "p_sinp||1000", "p_ajeno|5|"]);
  const filas = [
    fila(vacio),
    fila(crema),
    fila({ id: "p_pausa", name: "Pausado", saleUnit: "UNIT" as const, price: 700, pricePerKg: null }, { active: false }),
    fila({ id: "p_borr", name: "Borrado", saleUnit: "UNIT" as const, price: 800, pricePerKg: null }, { deletedAt: new Date(0) }),
    // Por kilo sin precio por kilo (el de unidad no cuenta).
    fila({ id: "p_sinp", name: "Sin precio", saleUnit: "WEIGHT" as const, price: 1000, pricePerKg: null }),
  ];
  const no = queYaNoSeVenden(vistos, filas);
  assert.deepEqual(no, [
    { id: "p_pausa", nombre: "Pausado" },
    { id: "p_borr", nombre: "Borrado" },
    { id: "p_sinp", nombre: "Sin precio" },
  ]);
  assert.deepEqual(vendibles(filas).map((f) => f.id), ["p_vacio", "p_crema"]);
  // Con los vendibles, el control de precio no dice «Bajó a $0» por el que se quedó sin precio.
  assert.deepEqual(cambiosContraLoVisto(vistos, vendibles(filas)), []);
  assert.match(avisoDeQueYaNoSeVende(no), /^Pausado · Borrado · Sin precio: ya no se vende/);
  assert.match(avisoDeQueYaNoSeVende(no), /no se cobró nada/);
});

test("la pantalla saca los renglones que ya no se venden; si no queda ninguno, deja uno vacío", () => {
  const ls = [
    { key: 1, productId: "p_a", qtyText: "1" },
    { key: 2, productId: "p_b", qtyText: "2" },
    { key: 3, productId: "p_a", qtyText: "3" },
  ];
  assert.deepEqual(sinLosQueNoSeVenden(ls, new Set(["p_a"]), 9), { lineas: [ls[1]], usoKeyVacia: false });
  assert.deepEqual(sinLosQueNoSeVenden(ls, new Set(["p_a", "p_b"]), 9), {
    lineas: [{ key: 9, productId: "", qtyText: "", etiqueta: undefined }],
    usoKeyVacia: true,
  });
  assert.deepEqual(sinLosQueNoSeVenden(ls, new Set(["p_x"]), 9).lineas, ls);
});

test("F2: lo pedido que pasó el control y no quedó grabado (pausado en el instante del alta) se avisa", () => {
  const enBase = [vacio, crema];
  // Pedidos los dos, grabado sólo el vacío: la crema no entró.
  const faltan = noEntraronEnLaVenta([vacio.id, crema.id], [{ productId: vacio.id }], enBase);
  assert.deepEqual(faltan, [{ id: crema.id, nombre: "Crema" }]);
  assert.match(avisoDeQueNoEntro(faltan), /^Ojo: Crema no entró en la venta/);
  // Todo grabado, o un id que no pasó el control (lo decide el alta): nada que avisar.
  assert.deepEqual(noEntraronEnLaVenta([vacio.id, crema.id], [{ productId: vacio.id }, { productId: crema.id }], enBase), []);
  assert.deepEqual(noEntraronEnLaVenta(["p_ajeno"], [], enBase), []);
  // Un producto en el ticket sin cantidad no se pidió: no se avisa.
  assert.deepEqual(noEntraronEnLaVenta([vacio.id], [{ productId: vacio.id }], enBase), []);
});

test("un producto con precio $0 cuenta como «ya no se vende»: frena con aviso en vez de grabar la venta sin él", () => {
  const fila = <T extends object>(p: T) => ({ ...p, active: true, deletedAt: null });
  const vistos = leerPreciosVistos(["p_cero|0|", "p_kcero||0", "p_crema|9000|"]);
  const filas = [
    fila({ id: "p_cero", name: "A precio cero", saleUnit: "UNIT" as const, price: 0, pricePerKg: null }),
    fila({ id: "p_kcero", name: "Kilo a cero", saleUnit: "WEIGHT" as const, price: null, pricePerKg: 0 }),
    fila(crema),
  ];
  assert.deepEqual(queYaNoSeVenden(vistos, filas), [
    { id: "p_cero", nombre: "A precio cero" },
    { id: "p_kcero", nombre: "Kilo a cero" },
  ]);
  assert.deepEqual(vendibles(filas).map((f) => f.id), ["p_crema"]);
});
