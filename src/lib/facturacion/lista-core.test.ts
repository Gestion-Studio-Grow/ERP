// Reglas puras de la lista de comprobantes (lista-core.ts): filtros de la URL, buscador, CSV.

import { test } from "node:test";
import assert from "node:assert/strict";
import { esNotaDeCredito } from "@/lib/libros/libro-iva";
import { TipoComprobante } from "@/plugins/arca/domain/catalogos";
import {
  CABECERA_CSV,
  POR_PAGINA,
  TIPOS_NOTA_DE_CREDITO,
  camposCsv,
  escaparLike,
  estadosDelFiltro,
  interpretarBusqueda,
  leerFiltros,
  mesDe,
  nombreDeTipo,
  nombreDelReceptor,
  paginasPara,
  tiposDelFiltro,
  urlDeLista,
} from "./lista-core";

const HOY = "2026-09-26";

test("sin nada en la URL la lista muestra el mes en curso, página 1, todos los estados y tipos", () => {
  const f = leerFiltros({}, HOY);
  assert.deepEqual(f, { estado: "todos", tipo: "todos", puntoVenta: null, desde: "2026-09-01", hasta: "2026-09-30", q: "", pagina: 1 });
});

test("el mes en curso termina el último día del mes, también en febrero bisiesto", () => {
  assert.deepEqual(mesDe("2028-02-10"), { desde: "2028-02-01", hasta: "2028-02-29" });
  assert.deepEqual(mesDe("2026-12-31"), { desde: "2026-12-01", hasta: "2026-12-31" });
});

test("buscar sin período en la URL busca en todos los meses", () => {
  const f = leerFiltros({ q: "20304050607" }, HOY);
  assert.equal(f.desde, null);
  assert.equal(f.hasta, null);
});

test("buscar con período en la URL respeta el período", () => {
  const f = leerFiltros({ q: "Pérez", desde: "2026-01-01" }, HOY);
  assert.equal(f.desde, "2026-01-01");
  assert.equal(f.hasta, null);
});

test("lo inválido en la URL cae al valor por defecto y un período al revés se da vuelta", () => {
  const f = leerFiltros({ estado: "cualquiera", tipo: "Z", pv: "-3", pagina: "abc", desde: "2026-09-31", hasta: "2026-02-30" }, HOY);
  assert.equal(f.estado, "todos");
  assert.equal(f.tipo, "todos");
  assert.equal(f.puntoVenta, null);
  assert.equal(f.pagina, 1);
  assert.equal(f.desde, "2026-09-01"); // fechas imposibles → mes en curso
  const g = leerFiltros({ desde: "2026-09-10", hasta: "2026-09-01" }, HOY);
  assert.deepEqual([g.desde, g.hasta], ["2026-09-01", "2026-09-10"]);
});

test("«necesitan atención» son las pendientes y las rechazadas", () => {
  assert.deepEqual(estadosDelFiltro("atencion"), ["PENDING", "REJECTED"]);
  assert.equal(estadosDelFiltro("todos"), null);
});

test("el tipo usa los códigos de ARCA: A=1, B=6, C=11, notas de crédito 3, 8 y 13", () => {
  assert.deepEqual(tiposDelFiltro("A"), [1]);
  assert.deepEqual(tiposDelFiltro("B"), [6]);
  assert.deepEqual(tiposDelFiltro("C"), [11]);
  assert.deepEqual(tiposDelFiltro("NC"), [3, 8, 13]);
  assert.equal(nombreDeTipo(8), "Nota de crédito B");
  assert.equal(nombreDeTipo(null), "Sin autorizar");
});

test("buscador: un nombre busca por receptor", () => {
  assert.deepEqual(interpretarBusqueda("  María Pérez "), { texto: "María Pérez", documento: null, numero: null, puntoVenta: null, importe: null });
});

test("buscador: «0001-00000123» es punto de venta y número", () => {
  const b = interpretarBusqueda("0001-00000123");
  assert.equal(b.puntoVenta, 1);
  assert.equal(b.numero, 123);
  assert.equal(b.documento, null);
});

test("buscador: un CUIT con guiones busca por documento, no por número de comprobante", () => {
  const b = interpretarBusqueda("20-30405060-7");
  assert.equal(b.documento, "20304050607");
  assert.equal(b.numero, null);
});

test("buscador: una cifra corta puede ser número de comprobante o importe", () => {
  const b = interpretarBusqueda("1210");
  assert.equal(b.numero, 1210);
  assert.equal(b.importe, 1210);
  assert.equal(b.documento, null);
});

test("buscador: un importe con centavos a la argentina («12.500,50» o «$ 12.500,50») busca el total", () => {
  assert.equal(interpretarBusqueda("12.500,50").importe, 12500.5);
  assert.equal(interpretarBusqueda("$ 12.500,50").importe, 12500.5);
  assert.equal(interpretarBusqueda("12.500,50").numero, null);
});

test("buscador: un DNI de 8 cifras busca como documento y como número", () => {
  const b = interpretarBusqueda("30405060");
  assert.equal(b.documento, "30405060");
  assert.equal(b.numero, 30405060);
});

test("los comodines de LIKE se buscan como texto", () => {
  assert.equal(escaparLike("50%_a\\b"), "50\\%\\_a\\\\b");
});

test("50 por página y siempre al menos una página", () => {
  assert.equal(POR_PAGINA, 50);
  assert.equal(paginasPara(0), 1);
  assert.equal(paginasPara(50), 1);
  assert.equal(paginasPara(51), 2);
});

test("la URL guarda sólo lo que no es por defecto y cambiar un filtro vuelve a la página 1 si se pide", () => {
  const f = leerFiltros({ estado: "rechazada", pagina: "3" }, HOY);
  assert.equal(urlDeLista("/admin/facturacion", f), "/admin/facturacion?estado=rechazada&desde=2026-09-01&hasta=2026-09-30&pagina=3");
  assert.equal(urlDeLista("/admin/facturacion", f, { pagina: 1, estado: "todos" }), "/admin/facturacion?desde=2026-09-01&hasta=2026-09-30");
});

test("el receptor sin nombre se muestra por su documento; el 99 es consumidor final", () => {
  assert.equal(nombreDelReceptor({ receptor: null, docTipo: 80, docNro: "20304050607" }), "CUIT 20304050607");
  assert.equal(nombreDelReceptor({ receptor: null, docTipo: 99, docNro: "0" }), "Consumidor final");
  assert.equal(nombreDelReceptor({ receptor: " Ana ", docTipo: 96, docNro: "30405060" }), "Ana");
});

test("el renglón del CSV lleva fecha dd/mm/aaaa, tipo en palabras, estado ante ARCA y el total exacto", () => {
  const campos = camposCsv({
    id: "x", fecha: "20260915", tipoComprobante: 6, puntoVenta: 2, numero: 45, status: "REJECTED", total: 1210.5,
    docTipo: 99, docNro: "0", receptor: null, cae: null, rechazoMotivo: "10015: el documento no es válido",
  });
  assert.deepEqual(campos, ["15/09/2026", "Factura B", 2, 45, "Consumidor final", "", "Rechazado", "", "1210,50", "10015: el documento no es válido"]);
});

test("los tipos que restan en los totales son las notas de crédito del Libro IVA (A, B y C) y ninguno más", () => {
  const todos = Object.values(TipoComprobante).filter((v): v is TipoComprobante => typeof v === "number");
  const ascendente = (xs: readonly number[]) => [...xs].sort((a, b) => a - b);
  assert.deepEqual(ascendente(TIPOS_NOTA_DE_CREDITO), ascendente(todos.filter((t) => esNotaDeCredito(t))));
  assert.deepEqual(tiposDelFiltro("NC"), [...TIPOS_NOTA_DE_CREDITO], "el filtro «Notas de crédito» usa la misma lista");
  // Las notas de débito suman, como la factura que ajustan.
  assert.ok(!TIPOS_NOTA_DE_CREDITO.includes(TipoComprobante.NotaDebitoB));
});

test("en el CSV la nota de crédito va en negativo y la cabecera lo dice: la columna suma como el Libro IVA", () => {
  const campos = camposCsv({
    id: "nc", fecha: "20260916", tipoComprobante: 8, puntoVenta: 1, numero: 7, status: "AUTHORIZED", total: -10000,
    docTipo: 99, docNro: "0", receptor: null, cae: "86399990000002", rechazoMotivo: null,
  });
  assert.equal(campos[1], "Nota de crédito B");
  assert.equal(campos[8], "-10000,00");
  assert.equal(CABECERA_CSV[8], "Total (las notas de crédito, en negativo)");
});
