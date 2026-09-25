/**
 * Cómo se lee un importe escrito a mano (ENG-109, D1-PLAN §3.1 y §3.6). Un solo lector para la
 * pantalla y para el servidor: "12.500" son doce mil quinientos pesos, no doce con cincuenta.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { importeONaN, leerImporte } from "./leer";
import * as posPeso from "../pos-peso";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../../..");

function valor(texto: string): number | "vacio" | "invalida" {
  const l = leerImporte(texto);
  return l.estado === "ok" ? l.valor : l.estado;
}

test("un punto o una coma seguidos de tres cifras son de miles: 12.500 y 12,500 son $12.500", () => {
  assert.equal(valor("12.500"), 12500);
  assert.equal(valor("12,500"), 12500);
  assert.equal(valor("1.000"), 1000);
  assert.equal(valor("1.234.567"), 1234567);
});

test("con dos separadores distintos, el último es el de los centavos: 1.234,56 y 1,234.56", () => {
  assert.equal(valor("1.234,56"), 1234.56);
  assert.equal(valor("1,234.56"), 1234.56);
  assert.equal(valor("9.999.999,99"), 9999999.99);
});

test("una o dos cifras después del separador son centavos: 12,5 → $12,50 y 12.05 → $12,05", () => {
  assert.equal(valor("12,5"), 12.5);
  assert.equal(valor("12.05"), 12.05);
  assert.equal(valor("0,99"), 0.99);
  assert.equal(valor("22000"), 22000);
});

test("la forma en que viaja un importe desde la pantalla se relee igual (punto decimal, sin miles)", () => {
  for (const n of [0.01, 1.5, 12.5, 1234.56, 22000, 12500, 9999999.99]) {
    assert.equal(valor(String(n)), n, String(n));
  }
});

test("un tercer decimal no es plata y rebota: 1234,567 y 0,555", () => {
  assert.equal(valor("1234,567"), "invalida");
  assert.equal(valor("0,555"), "invalida");
  assert.equal(valor("12,345,6"), "invalida");
});

test("se toleran el signo $ y los espacios que se arrastran al copiar de un extracto", () => {
  assert.equal(valor("$ 1.234"), 1234);
  assert.equal(valor(" $12.500,50 "), 12500.5);
});

test("un campo vacío es vacío, no cero", () => {
  assert.equal(valor(""), "vacio");
  assert.equal(valor("   "), "vacio");
  assert.equal(leerImporte(null).estado, "vacio");
  assert.equal(leerImporte(undefined).estado, "vacio");
});

test("lo que no es un importe rebota: negativos, notación científica, letras y separadores dobles", () => {
  for (const t of ["-5", "−5", "1e3", "abc", "12..5", "12,,5", "1.23.4", "Infinity", "NaN"]) {
    assert.equal(valor(t), "invalida", t);
  }
});

test("importeONaN: vacío, ilegible o un archivo dan NaN, y la validación de cada acción lo rechaza", () => {
  assert.ok(Number.isNaN(importeONaN(null)));
  assert.ok(Number.isNaN(importeONaN("")));
  assert.ok(Number.isNaN(importeONaN("doce mil")));
  assert.ok(Number.isNaN(importeONaN(new File(["12500"], "monto.txt"))));
  assert.equal(importeONaN("12.500"), 12500);
  assert.equal(importeONaN("1.234,56"), 1234.56);
});

test("el mostrador y el servidor usan el mismo lector: pos-peso lo re-exporta, no tiene otra copia", () => {
  assert.equal(posPeso.leerImporte, leerImporte);
  assert.equal(posPeso.importeParaFormulario(1.005), "1.01", "el valor que viaja se redondea con la regla única");
  assert.equal(posPeso.importeDelFormulario("12.500", "Monto"), 12500);
});

/**
 * Las acciones de servidor que leían plata con `Number(...)` (D1-PLAN §3.6): cada campo se lee con
 * el lector de plata. Con `Number`, "12.500" era 12,5 y "1.234,56" era NaN.
 */
const CAMPOS_DE_PLATA: Record<string, string[]> = {
  "src/lib/actions.ts": ["senaMonto", "amount"],
  "src/lib/cobros-actions.ts": ["monto"],
  "src/lib/catalog-actions.ts": ["price", "residentPrice", "depositAmount"],
};

test("las acciones de turnos, cobros y catálogo leen cada campo de plata con el lector, nunca con Number", () => {
  const conNumber: string[] = [];
  let lecturas = 0;
  for (const [archivo, campos] of Object.entries(CAMPOS_DE_PLATA)) {
    const lineas = readFileSync(path.join(RAIZ, archivo), "utf8").split("\n");
    for (const campo of campos) {
      const donde = lineas
        .map((linea, i) => ({ linea, n: i + 1 }))
        .filter(({ linea }) => linea.includes(`formData.get("${campo}")`));
      assert.ok(donde.length > 0, `${archivo}: no se encontró la lectura de "${campo}"`);
      for (const { linea, n } of donde) {
        lecturas++;
        if (/\bNumber\(/.test(linea) || !/\b(importeONaN|leerImporte)\(/.test(linea)) {
          conNumber.push(`${archivo}:${n}`);
        }
      }
    }
  }
  assert.ok(lecturas >= 7, `se revisaron ${lecturas} lecturas`);
  assert.deepEqual(conNumber, []);
});
