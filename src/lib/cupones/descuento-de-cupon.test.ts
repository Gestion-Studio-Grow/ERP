/**
 * El descuento de un cupón se calcula en UN lugar (ENG-109, D1-PLAN §3.3 R4): `montoDeCupon`.
 * Antes eran tres cuentas: la reserva de turno (`actions.ts`, bookAppointment) y la vista previa
 * del cupón en la web de turnos (`coupon-actions.ts`, checkCoupon) con `Math.round` al peso, que
 * bajaba el medio peso por error de binario y no topeaba el 100 %; la venta y la tienda
 * (`venta-reglas.ts`) al centavo, con un `round2` que bajaba el medio centavo.
 *
 * A qué unidad se redondea el % es decisión del dueño (D1-PLAN §7), todavía pendiente. Hasta que
 * decida, cada camino CONSERVA la unidad que tenía (revisión de ENG-109, vuelta 2): turnos al
 * peso, venta y tienda al centavo. Lo único que cambia en cada uno es el arreglo mismo: el medio
 * que bajaba ahora sube, el 100 % deja la compra en cero y un cupón que no descuenta nada se
 * rechaza en vez de gastarse.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import { aplicarCupon, montoDeCupon, UNIDAD_DEL_DESCUENTO_DE_CUPON, type CuponLeido } from "@/lib/venta-reglas";

const leer = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");
const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** El cuerpo de una función, desde su firma hasta el cierre de su llave. */
function cuerpoDe(fuente: string, firma: RegExp): string {
  const t = sinComentarios(fuente);
  const m = firma.exec(t);
  assert.ok(m, `no encontré ${firma}`);
  let i = t.indexOf("{", t.indexOf(")", m.index));
  const inicio = i;
  let nivel = 0;
  for (; i < t.length; i++) {
    if (t[i] === "{") nivel++;
    else if (t[i] === "}" && --nivel === 0) break;
  }
  return t.slice(inicio, i + 1);
}

/** Las cuentas de HEAD, copiadas tal cual para medir qué cambia (no son código de la app). */
const antes = {
  venta: (b: number, v: number) => {
    const round2Viejo = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    return round2Viejo((round2Viejo(b) * Math.min(v, 100)) / 100);
  },
  turno: (precio: number, v: number) => Math.round(precio * (v / 100)),
};

const AHORA = new Date("2026-09-25T15:00:00.000Z");
const cupon = (over: Partial<CuponLeido> = {}): CuponLeido => ({
  code: "CINCO",
  type: "PERCENT",
  value: 5,
  active: true,
  expiresAt: null,
  maxUses: 1,
  usedCount: 0,
  ...over,
});

test("hasta que el dueño decida la unidad, cada camino conserva la suya: turnos al peso, venta y tienda al centavo", () => {
  assert.deepEqual(UNIDAD_DEL_DESCUENTO_DE_CUPON, { turno: "peso", venta: "centavo" });
});

test("en la venta y la tienda 10 % de $12.345 sigue siendo $1.234,50, como antes de ENG-109", () => {
  assert.equal(antes.venta(12_345, 10), 1234.5);
  assert.equal(montoDeCupon("PERCENT", 10, 12_345, "venta"), 1234.5);
  // Sin decir el camino es la venta: la tienda y Vender (pantallas) lo llaman así.
  assert.equal(montoDeCupon("PERCENT", 10, 12_345), 1234.5);
});

test("en turnos 10 % de $12.345 da $1.235 (el medio peso sube) y 10 % de $12.344 da $1.234", () => {
  assert.equal(montoDeCupon("PERCENT", 10, 12_345, "turno"), 1235);
  assert.equal(montoDeCupon("PERCENT", 10, 12_344, "turno"), 1234);
});

test("la venta, contra la cuenta de antes, sólo cambia el medio centavo que bajaba, y siempre por $0,01 hacia arriba", () => {
  // Bases de $0,01 a $5.000,00 (cada centavo) con porcentajes que dejan medio centavo.
  const porcentajes = [5, 10, 15, 21, 29, 33, 50, 99.99];
  let cambian = 0;
  let total = 0;
  for (let c = 1; c <= 500_000; c++) {
    const b = c / 100;
    for (const v of porcentajes) {
      total++;
      const viejo = antes.venta(b, v);
      const nuevo = montoDeCupon("PERCENT", v, b, "venta");
      if (viejo === nuevo) continue;
      cambian++;
      // Es exactamente medio centavo (centavos × centésimos de punto termina en 5.000)…
      assert.equal((c * Math.round(v * 100)) % 10_000, 5_000, `$${b} al ${v} %: ${viejo} → ${nuevo}`);
      // …y sube un centavo.
      assert.equal(Math.round((nuevo - viejo) * 100), 1, `$${b} al ${v} %: ${viejo} → ${nuevo}`);
    }
  }
  assert.ok(cambian > 0 && cambian < total / 100, `cambian ${cambian} de ${total}`);
});

test("la venta con precios enteros de $1 a $100.000 no cambia en ningún caso (la revisión midió 575.000 cambios al peso)", () => {
  let cambian = 0;
  for (let p = 1; p <= 100_000; p++) {
    for (const v of [5, 10, 15, 20, 25, 30, 50]) if (antes.venta(p, v) !== montoDeCupon("PERCENT", v, p)) cambian++;
  }
  assert.equal(cambian, 0);
});

test("turnos, contra la cuenta de antes, sólo cambia el medio peso que bajaba (29 % de $750: $217 → $218)", () => {
  assert.equal(antes.turno(750, 29), 217);
  assert.equal(montoDeCupon("PERCENT", 29, 750, "turno"), 218);
  let cambian = 0;
  for (let p = 1; p <= 50_000; p++) {
    for (let v = 1; v < 100; v++) {
      const viejo = antes.turno(p, v);
      const nuevo = montoDeCupon("PERCENT", v, p, "turno");
      if (viejo === nuevo) continue;
      cambian++;
      assert.equal((p * v) % 100, 50, `$${p} al ${v} %: ${viejo} → ${nuevo}`);
      assert.equal(nuevo - viejo, 1, `$${p} al ${v} %: ${viejo} → ${nuevo}`);
    }
  }
  assert.ok(cambian > 0, "el barrido no encontró el medio peso");
});

test("un solo redondeo: en turnos 10 % de $12.344,95 es $1.234,495 y da $1.234, no $1.235", () => {
  assert.equal(montoDeCupon("PERCENT", 10, 12_344.95, "turno"), 1234);
});

test("el porcentaje no pasa del 100 % ni el descuento pasa de la compra, en los dos caminos", () => {
  for (const camino of ["turno", "venta"] as const) {
    assert.equal(montoDeCupon("PERCENT", 150, 1000, camino), 1000);
    assert.equal(montoDeCupon("PERCENT", 100, 12_345.5, camino), 12_345.5);
    assert.equal(montoDeCupon("FIXED", 5000, 300, camino), 300);
  }
});

test("el monto fijo va al centavo: $99,999 descuenta $100,00 y $500 sobre $1.000 descuenta $500", () => {
  assert.equal(montoDeCupon("FIXED", 99.999, 1000), 100);
  assert.equal(montoDeCupon("FIXED", 500, 1000, "turno"), 500);
});

test("un cupón sin valor, negativo o roto no descuenta ni sube el precio", () => {
  for (const camino of ["turno", "venta"] as const) {
    assert.equal(montoDeCupon("PERCENT", 0, 1000, camino), 0);
    assert.equal(montoDeCupon("FIXED", -500, 1000, camino), 0);
    assert.equal(montoDeCupon("PERCENT", -10, 1000, camino), 0);
    assert.equal(montoDeCupon("PERCENT", Number.NaN, 1000, camino), 0);
    assert.equal(montoDeCupon("PERCENT", 10, 0, camino), 0);
    assert.equal(montoDeCupon("PERCENT", 10, -1000, camino), 0);
  }
});

test("un cupón de 100 % o más deja la compra en cero aunque tenga centavos", () => {
  // En turnos, al peso, 100 % de $4.500,40 daba $4.500 y quedaban $0,40 a pagar.
  assert.equal(antes.turno(4_500.4, 100), 4_500);
  assert.equal(montoDeCupon("PERCENT", 100, 4_500.4, "turno"), 4_500.4);
  assert.equal(montoDeCupon("PERCENT", 150, 10.4, "turno"), 10.4);
  assert.equal(montoDeCupon("PERCENT", 100, 0.4, "turno"), 0.4);
  // Debajo del 100 % sigue la regla del peso, sin pasarse de la compra.
  assert.equal(montoDeCupon("PERCENT", 99.99, 4_500.4, "turno"), 4_500);
  // Al peso, el 99 % de $0,60 ($0,594) subiría a $1: el tope es lo que se compra.
  assert.equal(montoDeCupon("PERCENT", 99, 0.6, "turno"), 0.6);
});

test("un cupón válido que no llega a descontar nada se rechaza con el motivo, no se aplica en $0", () => {
  // Turnos: 5 % de $9 es $0,45 y al peso da $0. Antes la reserva lo aplicaba y gastaba el uso.
  assert.equal(montoDeCupon("PERCENT", 5, 9, "turno"), 0);
  const turno = aplicarCupon({ cupon: cupon(), base: 9, ahora: AHORA, camino: "turno" });
  assert.deepEqual(turno, { ok: false, error: "El cupón CINCO no llega a descontar nada sobre $9,00.", sinDescuento: true });
  // Venta: 1 % de $0,49 es menos de medio centavo.
  const venta = aplicarCupon({ cupon: cupon({ value: 1 }), base: 0.49, ahora: AHORA });
  assert.equal(venta.ok, false);
  assert.ok(!venta.ok && venta.sinDescuento === true);
  // Con algo que descontar se aplica igual que siempre, y es lo mismo que montoDeCupon.
  assert.deepEqual(aplicarCupon({ cupon: cupon(), base: 100, ahora: AHORA, camino: "turno" }), { ok: true, codigo: "CINCO", descuento: 5 });
  assert.deepEqual(aplicarCupon({ cupon: cupon({ value: 10 }), base: 12_345, ahora: AHORA }), { ok: true, codigo: "CINCO", descuento: 1234.5 });
});

test("la reserva de turno (bookAppointment) toma el cupón sólo con cuponDeLaReserva (lectura del código)", () => {
  // Lo que hace cuponDeLaReserva contra Postgres lo EJECUTA cupon-de-reserva-postgres.test.ts;
  // acá sólo se mira que la reserva no tenga otra cuenta ni otro consumo del cupón.
  const cuerpo = cuerpoDe(leer("src/lib/actions.ts"), /async function bookAppointment\(/);
  assert.match(cuerpo, /await\s+cuponDeLaReserva\(\s*tx\s*,/);
  assert.doesNotMatch(cuerpo, /tx\.coupon\./);
  assert.doesNotMatch(cuerpo, /montoDeCupon\(|Math\.(round|floor|ceil|trunc)\(/);
});

test("ningún archivo de src (fuera de montoDeCupon) calcula a mano el % de un cupón (lectura del código)", () => {
  const raiz = new URL("../../", import.meta.url);
  const archivos = (readdirSync(raiz, { recursive: true }) as string[]).filter(
    (p) => /\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p) && !p.includes("generated"),
  );
  assert.ok(archivos.length > 500, `sólo ${archivos.length} archivos: el barrido no recorre src`);
  const aMano = [
    /\b(coupon|cupon|cupón)\w*\.(value|valor)\s*\/\s*100/i,
    /\b100\s*\/\s*\w*\b(coupon|cupon)\w*\.(value|valor)\b/i,
    /Math\.(round|floor|ceil|trunc)\([^;]*\b(coupon|cupon)\w*\.(value|valor)\b/i,
  ];
  const hallados: string[] = [];
  for (const p of archivos) {
    const t = sinComentarios(readFileSync(new URL(p, raiz), "utf8"));
    if (aMano.some((re) => re.test(t))) hallados.push(p);
  }
  assert.deepEqual(hallados, []);
});
