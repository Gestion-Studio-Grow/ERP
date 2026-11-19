// MIA-50 § 2.2 bis. V3: todo importe en pesos sale del helper único `pesos` (core). V2: las tablas de liquidaciones,
// bancos, historial e ítems de la ficha se vuelven tarjetas en el teléfono y ninguna celda con importe, estado o botón
// queda sin etiqueta o escondida.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pesos } from "@/lib/proyectos/core";
import { cssTarjetas, etiquetasFicha, importe, importeDeVenta } from "./_tabla";

const leer = (archivo: string) => readFileSync(new URL(archivo, import.meta.url), "utf8");

test("importe en pesos es exactamente `pesos`, con y sin centavos", () => {
  for (const n of [0, 1500, 1500.75, -320000, 6086300]) {
    assert.equal(importe(n), pesos(n));
    assert.equal(importe(n, "ARS"), pesos(n));
    assert.equal(importeDeVenta(n), pesos(n));
    assert.equal(importeDeVenta(n, "ARS", 1200), pesos(n));
  }
});

test("en dólares convierte con el cambio y no usa el símbolo de pesos", () => {
  assert.match(importe(150, "USD"), /US\$/);
  assert.match(importeDeVenta(120000, "USD", 1200), /US\$\s?100\b/);
  assert.equal(importeDeVenta(1500, "USD", 0), pesos(1500), "sin cambio cargado, en pesos");
});

const PANTALLAS = ["./administracion/_liquidaciones.tsx", "./administracion/_bancos.tsx", "./[id]/_pestanas-datos.tsx"];

test("las tablas tocadas usan las tarjetas del teléfono y ninguna fija su ancho mínimo fuera de md:", () => {
  for (const archivo of PANTALLAS) {
    const s = leer(archivo);
    for (const pieza of ["tablaMovil", "cabezaMovil", "filaMovil", "celdaMovil"]) assert.ok(s.includes(pieza), `${archivo}: falta ${pieza}`);
    assert.doesNotMatch(s, /className="[^"]*(?<!md:)min-w-\[\d+px\]/, `${archivo}: ancho mínimo que empuja la tabla en el teléfono`);
  }
});

test("cada celda de liquidaciones y bancos lleva su etiqueta (o es la de acciones)", () => {
  for (const archivo of ["./administracion/_liquidaciones.tsx", "./administracion/_bancos.tsx"]) {
    const s = leer(archivo);
    const celdas = s.match(/<td\b[^>]*>/g) ?? [];
    assert.ok(celdas.length > 0);
    for (const td of celdas) assert.ok(td.includes("data-label=") || td.includes("accionesMovil"), `${archivo}: ${td}`);
  }
  for (const etiqueta of ["Total", "Estado", "Visto"]) assert.ok(leer("./administracion/_liquidaciones.tsx").includes(`data-label="${etiqueta}"`));
  for (const etiqueta of ["Importe", "Conciliado con", "Lote"]) assert.ok(leer("./administracion/_bancos.tsx").includes(`data-label="${etiqueta}"`));
});

test("sin formateadores sueltos de plata en los archivos tocados", () => {
  for (const archivo of [...PANTALLAS, "./[id]/_planilla.tsx", "./[id]/_pestanas-plata.tsx"]) {
    const s = leer(archivo);
    assert.doesNotMatch(s, /\b(plataEn|ventaEn)\(/, `${archivo}: usa plataEn/ventaEn en vez de importe/pesos`);
    assert.doesNotMatch(s, /style: "currency"/, archivo);
  }
});

test("ítems de la ficha: las etiquetas de las tarjetas siguen el orden de las columnas de la tabla", () => {
  const fuente = leer("./[id]/_tabla-ficha.tsx");
  const cabeza = fuente.slice(fuente.indexOf("<thead"), fuente.indexOf("</thead>"));
  const columnas = [...cabeza.matchAll(/<th\b[^>]*>([^<]+)<\/th>/g)].map((m) => m[1].replace("{simbolo}", "$").trim());
  const todas = etiquetasFicha({ costoUnit: true, costoTotal: true, recargo: true, margen: true }, true, "ARS");
  assert.deepEqual(todas.slice(0, -1), columnas, "si cambian las columnas de _tabla-ficha.tsx, cambian las etiquetas");
  assert.equal(todas.at(-1), "", "la última es la de Borrar: sin etiqueta, a todo el ancho");
  assert.equal(etiquetasFicha({ costoUnit: false, costoTotal: false, recargo: false, margen: false }, false, "USD").join("|"), "Descripción|Proveedor|Cant.|Venta u. US$|Venta US$|Fecha límite|Estado|Visible|Adjuntos");
  assert.match(leer("./[id]/_pestanas-datos.tsx"), /data-tarjetas="ficha"/);
});

test("cssTarjetas: sólo en el teléfono, con etiquetas por posición y sin escapar del <style>", () => {
  const css = cssTarjetas("ficha", ["Descripción", "Venta $", "</style><b>", ""]);
  assert.ok(css.startsWith("@media (width < 48rem){") && css.endsWith("}"));
  assert.match(css, /\[data-tarjetas="ficha"\] td:nth-child\(1\)::before\{content:"Descripción"\}/);
  assert.match(css, /td:nth-child\(4\)\{display:block/);
  assert.doesNotMatch(css, /<\/style>/);
  assert.match(cssTarjetas('x"] *{', []), /\[data-tarjetas="x"\]/);
});
