import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aplicarPromociones,
  condicionesDePromocion,
  problemaDeLaPromocion,
  repartirCentavos,
  rotuloDePromocion,
  vigenteEn,
  type ContextoDePromo,
  type Promocion,
  type RenglonParaPromo,
} from "./promociones";

// Martes 27/10/2026 (el día se pasa explícito: el motor no mira el reloj).
const MARTES: ContextoDePromo = { fecha: "2026-10-27", diaSemana: 2, medio: null };

const base = (p: Partial<Promocion> & Pick<Promocion, "id" | "tipo">): Promocion => ({
  nombre: p.id,
  productos: [],
  secciones: [],
  dias: [],
  prioridad: 50,
  acumulable: false,
  activa: true,
  ...p,
});

const u = (clave: string, productId: string, cantidad: number, precio: number, seccion = "bebidas"): RenglonParaPromo => ({
  clave,
  productId,
  seccion,
  saleUnit: "UNIT",
  cantidad,
  precioUnitario: precio,
  importe: cantidad * precio,
});
const kg = (clave: string, productId: string, kilos: number, precioKg: number, importe: number, seccion = "verduleria"): RenglonParaPromo => ({
  clave,
  productId,
  seccion,
  saleUnit: "WEIGHT",
  cantidad: kilos,
  precioUnitario: precioKg,
  importe,
});

const renglon = (r: ReturnType<typeof aplicarPromociones>, clave: string) => r.renglones.find((x) => x.clave === clave)!;

test("2×1: llevando 2 Coca-Cola se regala una; con 3, sólo una (la tercera se paga)", () => {
  const dosPorUno = base({ id: "coca-2x1", nombre: "2×1 Coca-Cola 2,25 L", tipo: "nxm", lleva: 2, paga: 1, productos: ["coca"] });
  const r2 = aplicarPromociones([u("a", "coca", 2, 4600)], [dosPorUno], MARTES);
  assert.equal(renglon(r2, "a").descuento, 4600);
  assert.equal(renglon(r2, "a").neto, 4600);
  assert.deepEqual(r2.aplicadas, [{ promocionId: "coca-2x1", nombre: "2×1 Coca-Cola 2,25 L", descuento: 4600, claves: ["a"] }]);
  const r3 = aplicarPromociones([u("a", "coca", 3, 4600)], [dosPorUno], MARTES);
  assert.equal(r3.totalDescuento, 4600);
});

test("3×2 mezclando productos de la promo: se regala el más barato de cada grupo de 3", () => {
  const tresPorDos = base({ id: "yog", tipo: "nxm", lleva: 3, paga: 2, productos: ["y1", "y2"] });
  // 2 yogures de $1.490 y 1 de $1.290: se regala el de $1.290.
  const r = aplicarPromociones([u("a", "y1", 2, 1490, "lacteos"), u("b", "y2", 1, 1290, "lacteos")], [tresPorDos], MARTES);
  assert.equal(renglon(r, "a").descuento, 0);
  assert.equal(renglon(r, "b").descuento, 1290);
});

test("segunda unidad al 70 % off: la más barata de cada par lleva el descuento", () => {
  const segunda = base({ id: "seg", tipo: "segunda-unidad", porcentaje: 70, productos: ["shampoo"] });
  const r = aplicarPromociones([u("a", "shampoo", 3, 4290, "perfumeria")], [segunda], MARTES);
  // Un par (70 % de 4.290 = 3.003) y una unidad suelta sin descuento.
  assert.equal(renglon(r, "a").descuento, 3003);
  assert.equal(renglon(r, "a").neto, 3 * 4290 - 3003);
});

test("% por sección y día: martes 20 % en verdulería, también en lo pesado", () => {
  const martesVerde = base({ id: "verde", tipo: "porcentaje", porcentaje: 20, secciones: ["verduleria"], dias: [2] });
  const renglones = [kg("p", "papa", 1.234, 1490, 1838.66), u("c", "coca", 1, 4600)];
  const r = aplicarPromociones(renglones, [martesVerde], MARTES);
  // 20 % de 1.838,66 = 367,732 → 367,73.
  assert.equal(renglon(r, "p").descuento, 367.73);
  assert.equal(renglon(r, "c").descuento, 0);
  // El miércoles no aplica.
  assert.equal(aplicarPromociones(renglones, [martesVerde], { ...MARTES, diaSemana: 3 }).totalDescuento, 0);
});

test("% por medio de pago: sólo si se paga TODO con ese medio", () => {
  const mp = base({ id: "mp", tipo: "medio-de-pago", porcentaje: 10, medios: ["MERCADOPAGO"], prioridad: 90, acumulable: true });
  const renglones = [u("a", "coca", 1, 4600), u("b", "yerba", 1, 5900, "almacen")];
  assert.equal(aplicarPromociones(renglones, [mp], MARTES).totalDescuento, 0); // sin medio elegido (o mixto)
  assert.equal(aplicarPromociones(renglones, [mp], { ...MARTES, medio: "EFECTIVO" }).totalDescuento, 0);
  const r = aplicarPromociones(renglones, [mp], { ...MARTES, medio: "MERCADOPAGO" });
  assert.equal(renglon(r, "a").descuento, 460);
  assert.equal(renglon(r, "b").descuento, 590);
});

test("combo a precio fijo: el descuento se reparte entre sus productos en proporción, al centavo", () => {
  const fernetCoca = base({
    id: "combo",
    nombre: "Fernet + Coca",
    tipo: "combo",
    combo: { componentes: [{ productId: "fernet", cantidad: 1 }, { productId: "coca", cantidad: 1 }], precio: 19900 },
  });
  const r = aplicarPromociones([u("f", "fernet", 1, 16900), u("c", "coca", 2, 4600)], [fernetCoca], MARTES);
  // Suelto: 16.900 + 4.600 = 21.500. Descuento 1.600, repartido 16.900 : 4.600.
  assert.equal(r.totalDescuento, 1600);
  assert.equal(renglon(r, "f").descuento + renglon(r, "c").descuento, 1600);
  assert.equal(renglon(r, "f").descuento, 1257.67);
  assert.equal(renglon(r, "c").descuento, 342.33);
  // La segunda Coca no tiene su Fernet: se paga entera.
  assert.equal(renglon(r, "c").neto, 2 * 4600 - 342.33);
});

test("no acumulable: la primera promo (por prioridad) se queda con el renglón y la segunda no entra", () => {
  const dosPorUno = base({ id: "a-2x1", tipo: "nxm", lleva: 2, paga: 1, productos: ["coca"], prioridad: 20 });
  const diezBebidas = base({ id: "b-10", tipo: "porcentaje", porcentaje: 10, secciones: ["bebidas"], prioridad: 40 });
  const r = aplicarPromociones([u("a", "coca", 2, 4600), u("b", "agua", 1, 1790)], [diezBebidas, dosPorUno], MARTES);
  assert.equal(renglon(r, "a").descuento, 4600); // sólo el 2×1
  assert.equal(renglon(r, "b").descuento, 179); // el 10 % sí entra en el agua
  assert.deepEqual(renglon(r, "a").promos, ["a-2x1"]);
});

test("acumulable: el 10 % se aplica sobre lo que queda después del 2×1", () => {
  const dosPorUno = base({ id: "a-2x1", tipo: "nxm", lleva: 2, paga: 1, productos: ["coca"], prioridad: 20, acumulable: true });
  const diezBebidas = base({ id: "b-10", tipo: "porcentaje", porcentaje: 10, secciones: ["bebidas"], prioridad: 40, acumulable: true });
  const r = aplicarPromociones([u("a", "coca", 2, 4600)], [dosPorUno, diezBebidas], MARTES);
  assert.equal(renglon(r, "a").descuento, 4600 + 460);
  assert.deepEqual(renglon(r, "a").promos, ["a-2x1", "b-10"]);
});

test("una promo acumulable no entra en un renglón que cerró una no acumulable", () => {
  const cierra = base({ id: "a", tipo: "porcentaje", porcentaje: 15, productos: ["coca"], prioridad: 10, acumulable: false });
  const mp = base({ id: "mp", tipo: "medio-de-pago", porcentaje: 10, medios: ["MERCADOPAGO"], prioridad: 90, acumulable: true });
  const r = aplicarPromociones([u("a", "coca", 1, 4600), u("b", "agua", 1, 1790)], [cierra, mp], { ...MARTES, medio: "MERCADOPAGO" });
  assert.equal(renglon(r, "a").descuento, 690);
  assert.equal(renglon(r, "b").descuento, 179);
});

test("la prioridad decide el orden, no el orden en que llegaron; empate por id", () => {
  const p1 = base({ id: "x", tipo: "porcentaje", porcentaje: 50, productos: ["coca"], prioridad: 5 });
  const p2 = base({ id: "y", tipo: "porcentaje", porcentaje: 10, productos: ["coca"], prioridad: 1 });
  const r1 = aplicarPromociones([u("a", "coca", 1, 1000)], [p1, p2], MARTES);
  const r2 = aplicarPromociones([u("a", "coca", 1, 1000)], [p2, p1], MARTES);
  assert.deepEqual(r1, r2);
  assert.equal(r1.totalDescuento, 100); // gana la de prioridad 1
});

test("una misma unidad no entra en dos promos de cantidad aunque sean acumulables", () => {
  const combo = base({
    id: "c",
    tipo: "combo",
    acumulable: true,
    prioridad: 10,
    combo: { componentes: [{ productId: "fernet", cantidad: 1 }, { productId: "coca", cantidad: 1 }], precio: 19900 },
  });
  const dosPorUno = base({ id: "d", tipo: "nxm", lleva: 2, paga: 1, productos: ["coca"], acumulable: true, prioridad: 20 });
  // 1 Fernet + 2 Coca: una Coca va al combo; queda 1 sola para el 2×1 → no alcanza.
  const r = aplicarPromociones([u("f", "fernet", 1, 16900), u("c", "coca", 2, 4600)], [combo, dosPorUno], MARTES);
  assert.equal(r.aplicadas.map((a) => a.promocionId).join(), "c");
});

test("el descuento de un renglón nunca pasa lo que vale", () => {
  const cien = base({ id: "a", tipo: "porcentaje", porcentaje: 100, productos: ["coca"], acumulable: true, prioridad: 1 });
  const otra = base({ id: "b", tipo: "porcentaje", porcentaje: 50, productos: ["coca"], acumulable: true, prioridad: 2 });
  const r = aplicarPromociones([u("a", "coca", 1, 4600)], [cien, otra], MARTES);
  assert.equal(renglon(r, "a").neto, 0);
  assert.equal(r.totalDescuento, 4600);
});

test("las promos de cantidad no tocan lo que se vende por peso", () => {
  const dosPorUno = base({ id: "a", tipo: "nxm", lleva: 2, paga: 1, secciones: ["verduleria"] });
  const r = aplicarPromociones([kg("p", "papa", 2, 1490, 2980)], [dosPorUno], MARTES);
  assert.equal(r.totalDescuento, 0);
});

test("pausada, fuera de fecha o mal definida, no aplica", () => {
  const p = base({ id: "a", tipo: "porcentaje", porcentaje: 10, productos: ["coca"] });
  const renglones = [u("a", "coca", 1, 1000)];
  assert.equal(aplicarPromociones(renglones, [{ ...p, activa: false }], MARTES).totalDescuento, 0);
  assert.equal(aplicarPromociones(renglones, [{ ...p, desde: "2026-11-01" }], MARTES).totalDescuento, 0);
  assert.equal(aplicarPromociones(renglones, [{ ...p, hasta: "2026-10-26" }], MARTES).totalDescuento, 0);
  assert.equal(aplicarPromociones(renglones, [{ ...p, porcentaje: 0 }], MARTES).totalDescuento, 0);
  assert.equal(vigenteEn({ ...p, desde: "2026-10-27", hasta: "2026-10-27" }, MARTES), true);
});

test("la suma de los netos es exactamente lo vendido menos el descuento total (al centavo)", () => {
  const promos = [
    base({ id: "a", tipo: "porcentaje", porcentaje: 33.33, secciones: ["verduleria"], acumulable: true, prioridad: 1 }),
    base({ id: "b", tipo: "medio-de-pago", porcentaje: 7.5, medios: ["EFECTIVO"], acumulable: true, prioridad: 2 }),
  ];
  const renglones = [kg("p", "papa", 1.237, 1490, 1843.13), kg("t", "tomate", 0.873, 2990, 2610.27), u("c", "coca", 3, 4600)];
  const r = aplicarPromociones(renglones, promos, { ...MARTES, medio: "EFECTIVO" });
  const vendido = renglones.reduce((s, x) => s + Math.round(x.importe * 100), 0);
  const netos = r.renglones.reduce((s, x) => s + Math.round(x.neto * 100), 0);
  assert.equal(netos, vendido - Math.round(r.totalDescuento * 100));
  assert.equal(r.aplicadas.reduce((s, a) => s + Math.round(a.descuento * 100), 0), Math.round(r.totalDescuento * 100));
});

test("reparto por resto mayor: suma exacta, y en empate gana el primero", () => {
  assert.deepEqual(repartirCentavos(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(repartirCentavos(1, [5, 5]), [1, 0]);
  assert.deepEqual(repartirCentavos(0, [5, 5]), [0, 0]);
  assert.deepEqual(repartirCentavos(10, [0, 0]), [0, 0]);
  const grande = repartirCentavos(999_999_999_99, [123_456_789_01, 98_765_432_10, 1]);
  assert.equal(grande.reduce((a, b) => a + b, 0), 999_999_999_99);
});

test("validación: lo que falta se dice en castellano", () => {
  assert.match(problemaDeLaPromocion(base({ id: "a", tipo: "nxm", lleva: 2, paga: 2, productos: ["x"] })) ?? "", /Paga menos/);
  assert.match(problemaDeLaPromocion(base({ id: "a", tipo: "nxm", lleva: 2, paga: 1 })) ?? "", /Elegí los productos/);
  assert.match(problemaDeLaPromocion(base({ id: "a", tipo: "porcentaje", porcentaje: 12.345, productos: ["x"] })) ?? "", /dos decimales/);
  assert.match(problemaDeLaPromocion(base({ id: "a", tipo: "medio-de-pago", porcentaje: 10 })) ?? "", /medio de pago/);
  assert.match(
    problemaDeLaPromocion(base({ id: "a", tipo: "combo", combo: { componentes: [{ productId: "x", cantidad: 1 }], precio: 100 } })) ?? "",
    /al menos dos/,
  );
  assert.match(problemaDeLaPromocion(base({ id: "a", tipo: "porcentaje", porcentaje: 10, productos: ["x"], desde: "2026-10-10", hasta: "2026-10-01" })) ?? "", /termina antes/);
  assert.equal(problemaDeLaPromocion(base({ id: "a", nombre: "Ok", tipo: "porcentaje", porcentaje: 0.07, productos: ["x"] })), null);
});

test("rótulo y condiciones para el cartel y la vidriera", () => {
  assert.equal(rotuloDePromocion(base({ id: "a", tipo: "nxm", lleva: 3, paga: 2 })), "3×2");
  assert.equal(rotuloDePromocion(base({ id: "a", tipo: "segunda-unidad", porcentaje: 70 })), "2ª 70 % off");
  assert.equal(
    condicionesDePromocion(base({ id: "a", tipo: "medio-de-pago", porcentaje: 10, medios: ["MERCADOPAGO"], dias: [4, 2] })),
    "Los martes y jueves, pagando todo con Mercado Pago.",
  );
  assert.equal(condicionesDePromocion(base({ id: "a", tipo: "porcentaje", porcentaje: 10 })), "Todos los días.");
});
