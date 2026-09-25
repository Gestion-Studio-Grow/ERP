/**
 * La regla de redondeo de la plata (ENG-109). Cada test ejecuta la regla; los barridos
 * recorren todos los casos del criterio, no una muestra.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  admiteCentavos,
  centavosDe,
  redondearAlCentavo,
  sumarAlCentavo,
  textoAlCentavo,
} from "./redondeo";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../../..");

test("medio centavo va hacia arriba: 1,005 → 1,01; 2,675 → 2,68; 0,005 → 0,01", () => {
  assert.equal(redondearAlCentavo(1.005), 1.01);
  assert.equal(redondearAlCentavo(2.675), 2.68);
  assert.equal(redondearAlCentavo(0.005), 0.01);
  assert.equal(redondearAlCentavo(1.015), 1.02);
  // 599.999,995 es, en binario, 599.999,99499…: igual vale 599.999,995 y sube.
  assert.equal(redondearAlCentavo(599_999.995), 600_000);
  assert.equal(centavosDe(1.005), 101);
  assert.equal(centavosDe(2.675), 268);
});

test("menos de medio centavo va hacia abajo: 1,004 → 1,00; 0,004 → 0; 2,6749 → 2,67", () => {
  assert.equal(redondearAlCentavo(1.004), 1);
  assert.equal(redondearAlCentavo(0.004), 0);
  assert.equal(redondearAlCentavo(2.6749), 2.67);
  assert.equal(redondearAlCentavo(0.0009), 0);
  assert.equal(centavosDe(0.004), 0);
});

test("negativos: el medio centavo se aleja del cero (−2,675 → −2,68; −0,005 → −0,01)", () => {
  assert.equal(redondearAlCentavo(-2.675), -2.68);
  assert.equal(redondearAlCentavo(-0.005), -0.01);
  assert.equal(redondearAlCentavo(-1.234), -1.23);
  assert.equal(redondearAlCentavo(-1.236), -1.24);
  assert.equal(centavosDe(-2.675), -268);
  assert.equal(textoAlCentavo(-12.345), "-12.35");
});

test("un negativo que redondea a cero da 0, nunca −0 (−0,004 y −0)", () => {
  assert.ok(Object.is(redondearAlCentavo(-0.004), 0));
  assert.ok(Object.is(redondearAlCentavo(-0), 0));
  assert.ok(Object.is(centavosDe(-0.004), 0));
  assert.equal(textoAlCentavo(-0.004), "0.00");
});

test("un número vale lo que dicen sus 15 cifras: 0,1 + 0,2 → 0,30; 1234,5650000000001 → 1234,57", () => {
  assert.equal(redondearAlCentavo(0.1 + 0.2), 0.3);
  assert.equal(redondearAlCentavo(1234.5650000000001), 1234.57);
  assert.equal(textoAlCentavo(0.1 + 0.2), "0.30");
});

test("el redondeo arrastra a los enteros: 999,995 → 1.000,00; 9,995 → 10,00", () => {
  assert.equal(redondearAlCentavo(999.995), 1000);
  assert.equal(redondearAlCentavo(9.995), 10);
  assert.equal(textoAlCentavo(999.995), "1000.00");
  assert.equal(textoAlCentavo(-9.995), "-10.00");
  // Justo debajo del límite, las 15 cifras ya dan 10^13 ("10000000000000.0").
  assert.equal(redondearAlCentavo(9_999_999_999_999.996), 1e13);
  assert.equal(centavosDe(9_999_999_999_999.996), 1e15);
});

test("barrido: los 100.000.000 de x,xx5 de $0 a $1.000.000 van todos hacia arriba", () => {
  // (10k + 5) / 1000 es el double más cercano a k/100 + 0,005, igual que Number("k,kk5").
  let haciaAbajo = 0;
  let primero: number | null = null;
  for (let k = 0; k < 100_000_000; k++) {
    if (centavosDe((k * 10 + 5) / 1000) !== k + 1) {
      haciaAbajo++;
      if (primero === null) primero = (k * 10 + 5) / 1000;
    }
  }
  assert.equal(haciaAbajo, 0, `el primero hacia abajo: ${primero}`);
});

test("barrido negativo: los 10.000.000 de −x,xx5 de −$100.000 a $0 se alejan del cero", () => {
  let mal = 0;
  for (let k = 0; k < 10_000_000; k++) {
    if (centavosDe(-(k * 10 + 5) / 1000) !== -(k + 1)) mal++;
  }
  assert.equal(mal, 0);
});

test("lo que ya está al centavo no cambia: 1.000.000 de importes al azar de hasta ±$1.000.000.000.000", () => {
  let semilla = 20260925;
  const azar = () => {
    semilla = (semilla * 1103515245 + 12345) % 2147483648;
    return semilla / 2147483648;
  };
  let mal = 0;
  let ejemplo = "";
  for (let i = 0; i < 1_000_000; i++) {
    // centavos enteros en (−10^14, 10^14): hasta 12 cifras enteras, como numeric(14,2)
    const centavos = Math.floor((azar() * 2 - 1) * 1e14);
    const importe = centavos / 100;
    const absoluto = Math.abs(centavos);
    const esperado =
      `${centavos < 0 ? "-" : ""}${Math.floor(absoluto / 100)}.` + String(absoluto % 100).padStart(2, "0");
    const texto = textoAlCentavo(importe);
    const ok =
      redondearAlCentavo(importe) === importe &&
      centavosDe(importe) === (centavos === 0 ? 0 : centavos) &&
      texto === (centavos === 0 ? "0.00" : esperado);
    if (!ok) {
      mal++;
      if (!ejemplo) ejemplo = `${importe} → ${texto}`;
    }
  }
  assert.equal(mal, 0, ejemplo);
});

test("suma de renglones: cada renglón al centavo y el total es la suma exacta", () => {
  // Dos renglones de 1,005 son dos de 1,01: 2,02 (redondear la suma daría 2,01).
  assert.equal(sumarAlCentavo([1.005, 1.005]), 2.02);
  assert.equal(redondearAlCentavo(1.005 + 1.005), 2.01);
  // Con negativos (una devolución en el medio): 10,01 − 3,34.
  assert.equal(sumarAlCentavo([10.005, -3.335]), 6.67);
  assert.equal(sumarAlCentavo([]), 0);
  // 100.000 renglones de $1.234,56: la suma en double da 123.456.000,0001577; acá, exacta.
  const renglones = new Array<number>(100_000).fill(1234.56);
  assert.notEqual(renglones.reduce((s, x) => s + x, 0), 123_456_000);
  assert.equal(sumarAlCentavo(renglones), 123_456_000);
  assert.equal(textoAlCentavo(sumarAlCentavo(renglones)), "123456000.00");
});

test("texto para ARCA: siempre dos decimales con punto", () => {
  assert.equal(textoAlCentavo(0), "0.00");
  assert.equal(textoAlCentavo(1000), "1000.00");
  assert.equal(textoAlCentavo(826.446), "826.45");
  assert.equal(textoAlCentavo(1234567.8), "1234567.80");
  assert.equal(textoAlCentavo(0.05), "0.05");
  assert.equal(textoAlCentavo(9_999_999_999_999.98), "9999999999999.98");
});

test("texto para ARCA: lo que no es un importe no sale (NaN, infinito, 13 cifras enteras o más)", () => {
  for (const malo of [Number.NaN, Infinity, -Infinity, 1e13, -1e13, 1e21]) {
    assert.equal(admiteCentavos(malo), false, String(malo));
    assert.throws(() => textoAlCentavo(malo), RangeError, String(malo));
  }
  assert.equal(admiteCentavos(9_999_999_999_999.98), true);
});

test("lo que no es un número pasa sin cambios por el redondeo, como con Math.round", () => {
  assert.ok(Number.isNaN(redondearAlCentavo(Number.NaN)));
  assert.ok(Number.isNaN(centavosDe(Number.NaN)));
  assert.equal(redondearAlCentavo(Infinity), Infinity);
  assert.equal(centavosDe(-Infinity), -Infinity);
  // Fuera de rango no hay centavos que redondear: queda el valor de sus 15 cifras.
  assert.equal(redondearAlCentavo(1e20), 1e20);
  assert.equal(redondearAlCentavo(-12_345_678_901_234.5), -12_345_678_901_234.5);
});

test("el módulo de redondeo no importa nada (lo usan el navegador y el plugin ARCA)", () => {
  const fuente = readFileSync(path.join(AQUI, "redondeo.ts"), "utf8");
  assert.equal(/^\s*import\s/m.test(fuente), false);
  assert.equal(/\brequire\(/.test(fuente), false);
});

function archivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivosTs(ruta);
    return /\.tsx?$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) ? [ruta] : [];
  });
}

test("el plugin ARCA sólo trae del Core el módulo de redondeo y la decisión fiscal única (ADR-022, ADR-100 y D4)", () => {
  const plugin = path.join(RAIZ, "src/plugins/arca");
  // D4 (DECISIONS §5.0): el tipo de comprobante y la condición del receptor salen de la
  // decisión fiscal única, pura (sin base ni reloj). El reloj lo pone el Core (HandlerDeps).
  const permitidos = new Set([
    "@/lib/dinero/redondeo",
    "@/modules/contract",
    "@/lib/fiscal/decidir-comprobante",
  ]);
  const ajenos: string[] = [];
  for (const archivo of archivosTs(plugin)) {
    const fuente = readFileSync(archivo, "utf8");
    for (const m of fuente.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
      const destino = m[1];
      const sale =
        destino.startsWith("@/")
          ? !permitidos.has(destino)
          : destino.startsWith(".") &&
            !path.resolve(path.dirname(archivo), destino).startsWith(plugin + path.sep);
      if (sale) ajenos.push(`${path.relative(RAIZ, archivo)} → ${destino}`);
    }
  }
  assert.deepEqual(ajenos, []);
});

test("en el camino de la plata fiscal no queda redondeo a mano fuera de este módulo", () => {
  const redondeoAMano =
    /toFixed\(2\)|Math\.(round|floor|ceil|trunc)\([^;]*\*\s*(100|1e2)\b|\*\s*100\)\s*\/\s*100\b|Number\.EPSILON/;
  const lib = path.join(RAIZ, "src/lib");
  const archivos = [
    ...archivosTs(path.join(RAIZ, "src/plugins/arca")),
    ...archivosTs(path.join(lib, "fiscal")),
    ...archivosTs(path.join(lib, "libros")),
    ...readdirSync(lib)
      .filter((n) => /^(fiscal|round|invoice-.*|arca-.*|facturita-.*|facturacion-.*)\.ts$/.test(n))
      .filter((n) => !n.endsWith(".test.ts"))
      .map((n) => path.join(lib, n)),
  ];
  assert.ok(archivos.length > 20, `se revisaron ${archivos.length} archivos`);
  // El núcleo de decisión es de otro frente y no tiene commit: ENG-109 no lo edita. Su
  // `toFixed(2)` recibe importes ya al centavo (DEC-012: el plugin rechaza los demás), así que no
  // redondea nada; el parche para que use esta regla está en .qa/ENG-109/decidir-comprobante.diff.
  const deOtroFrente = new Set(["src/lib/fiscal/decidir-comprobante.ts"]);
  const conRedondeo: string[] = [];
  for (const archivo of archivos.filter((a) => !deOtroFrente.has(path.relative(RAIZ, a).split(path.sep).join("/")))) {
    readFileSync(archivo, "utf8")
      .split("\n")
      .forEach((linea, i) => {
        if (redondeoAMano.test(linea)) conRedondeo.push(`${path.relative(RAIZ, archivo)}:${i + 1}`);
      });
  }
  assert.deepEqual(conRedondeo, []);
});
