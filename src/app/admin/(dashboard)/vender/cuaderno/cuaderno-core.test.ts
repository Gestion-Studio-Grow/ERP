// El núcleo puro de «Cargar ventas del cuaderno»: lo que llega del navegador, el formulario del
// alta, lo que contestó y el borrador.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_VENTAS_POR_CARGA,
  claveDelBorrador,
  faltaEnLaFila,
  filaCargada,
  filaNueva,
  filaVacia,
  formularioDeLaVenta,
  leerBorrador,
  leerHora,
  leerVentasDelCuaderno,
  ordenarPorHora,
  resultadoDeLaVenta,
  resumenDeLaCarga,
  totalDeLaFila,
  ventaDeLaFila,
  type FilaDelCuaderno,
  type ProductoDelCuaderno,
} from "./cuaderno-core";

const VENTA = { clave: "abcd-1234-efgh", dia: "2026-10-24", hora: "11:20", medio: "EFECTIVO", renglones: [{ productId: "p_vacio", cantidad: "1,1" }] };

test("leerHora: la hora como está en el cuaderno", () => {
  assert.equal(leerHora("11:20"), "11:20");
  assert.equal(leerHora(" 9.05 "), "09:05");
  assert.equal(leerHora("24:00"), null);
  assert.equal(leerHora("11"), null);
  assert.equal(leerHora("1120"), "11:20");
  assert.equal(leerHora("905"), "09:05");
  assert.equal(leerHora("2460"), null);
});

test("leerVentasDelCuaderno: forma estricta, sin confiar en el navegador", () => {
  const ok = leerVentasDelCuaderno([VENTA, { ...VENTA, clave: "otra-clave-123", cliente: "  Ana  " }]);
  assert.ok(ok.ok);
  assert.equal(ok.ventas[1].cliente, "Ana");
  assert.equal(ok.ventas[0].medio, "EFECTIVO");
  const malas: unknown[] = [
    null,
    [],
    [{ ...VENTA, clave: "corta" }],
    [{ ...VENTA, medio: "TARJETA" }],
    [{ ...VENTA, dia: "24/10/2026" }],
    [{ ...VENTA, hora: "11" }],
    [{ ...VENTA, renglones: [] }],
    [{ ...VENTA, renglones: [{ productId: 3, cantidad: "1" }] }],
    [VENTA, VENTA], // la misma clave dos veces
    Array.from({ length: MAX_VENTAS_POR_CARGA + 1 }, (_, i) => ({ ...VENTA, clave: `clave-${String(i).padStart(4, "0")}` })),
  ];
  for (const m of malas) assert.equal(leerVentasDelCuaderno(m).ok, false, JSON.stringify(m)?.slice(0, 80));
});

test("ordenarPorHora: en el orden en que se vendieron (estable a igual hora)", () => {
  const v = [
    { dia: "2026-10-24", hora: "11:35", n: 1 },
    { dia: "2026-10-23", hora: "18:00", n: 2 },
    { dia: "2026-10-24", hora: "09:05", n: 3 },
    { dia: "2026-10-24", hora: "11:35", n: 4 },
  ];
  assert.deepEqual(ordenarPorHora(v).map((x) => x.n), [2, 3, 1, 4]);
});

test("formularioDeLaVenta: mostrador, retiro, cobrada con un medio, la clave con prefijo y la hora; sin precios", () => {
  const fd = formularioDeLaVenta({ ...VENTA, medio: "MERCADOPAGO", renglones: [{ productId: "a", cantidad: "1,1" }, { productId: "b", cantidad: "6" }] });
  assert.equal(fd.get("channel"), "COUNTER");
  assert.equal(fd.get("fulfillment"), "PICKUP");
  assert.equal(fd.get("paid"), "on");
  assert.equal(fd.get("paymentMethod"), "MERCADOPAGO");
  assert.equal(fd.get("idempotencyKey"), "cuaderno:abcd-1234-efgh");
  assert.equal(fd.get("occurredAt"), "2026-10-24T11:20");
  assert.deepEqual(fd.getAll("productId"), ["a", "b"]);
  assert.deepEqual(fd.getAll("quantity"), ["1,1", "6"]);
  assert.equal(fd.get("customerName"), "Mostrador");
  for (const k of ["price", "unitPrice", "total", "subtotal", "pago.monto"]) assert.equal(fd.get(k), null, k);
});

test("resultadoDeLaVenta: grabada, ya estaba, rechazada, sin confirmar", () => {
  const venta = { id: "o1", code: 41, total: 31460 } as never;
  const g = resultadoDeLaVenta("k", { ok: true, venta });
  assert.deepEqual([g.estado, g.venta], ["grabada", { code: 41, total: 31460 }]);
  assert.match(g.mensaje, /^Venta #41 · \$\s?31\.460(,00)?$/);
  assert.equal(resultadoDeLaVenta("k", { ok: true, yaEstaba: true, venta }).estado, "ya-estaba");
  assert.equal(resultadoDeLaVenta("k", { ok: false, error: "Sin stock" }).estado, "rechazada");
  assert.equal(resultadoDeLaVenta("k", { ok: false, tipo: "sin-confirmar", error: "x" }).estado, "sin-confirmar");
  assert.equal(resultadoDeLaVenta("k", null).estado, "sin-confirmar");
});

const PRODUCTOS = new Map<string, ProductoDelCuaderno>([
  ["v", { id: "v", nombre: "Vacío", porPeso: true, precio: 28600 }],
  ["c", { id: "c", nombre: "Chorizo", porPeso: false, precio: 1900 }],
  ["s", { id: "s", nombre: "Sin precio", porPeso: false, precio: null }],
]);
const fila = (o: Partial<FilaDelCuaderno>): FilaDelCuaderno => ({ ...filaNueva("fila-0001-x"), ...o });

test("la fila: qué le falta, cuánto da (la cuenta del alta) y la venta que se manda", () => {
  assert.ok(filaVacia(filaNueva("fila-0001-x")));
  assert.match(faltaEnLaFila(fila({}), PRODUCTOS) ?? "", /Falta la hora/);
  assert.match(faltaEnLaFila(fila({ hora: "11:20" }), PRODUCTOS) ?? "", /Falta qué se vendió/);
  assert.match(faltaEnLaFila(fila({ hora: "11:20", renglones: [{ productId: "v", cantidad: "" }] }), PRODUCTOS) ?? "", /Falta el peso de «Vacío»/);
  assert.match(faltaEnLaFila(fila({ hora: "11:20", renglones: [{ productId: "s", cantidad: "1" }] }), PRODUCTOS) ?? "", /no tiene precio/);
  assert.match(faltaEnLaFila(fila({ hora: "11:20", renglones: [{ productId: "c", cantidad: "6" }] }), PRODUCTOS) ?? "", /Falta cómo pagó/);
  const completa = fila({ hora: "11:20", medio: "EFECTIVO", renglones: [{ productId: "v", cantidad: "1,1" }, { productId: "c", cantidad: "6" }, { productId: "", cantidad: "" }] });
  assert.equal(faltaEnLaFila(completa, PRODUCTOS), null);
  assert.equal(totalDeLaFila(completa, PRODUCTOS), 31460 + 11400);
  assert.equal(totalDeLaFila(fila({ renglones: [{ productId: "v", cantidad: "0,335" }] }), new Map([["v", { id: "v", nombre: "V", porPeso: true, precio: 12345 }]])), 4135.58);
  assert.deepEqual(ventaDeLaFila(completa, "2026-10-24"), {
    clave: "fila-0001-x",
    dia: "2026-10-24",
    hora: "11:20",
    medio: "EFECTIVO",
    renglones: [{ productId: "v", cantidad: "1,1" }, { productId: "c", cantidad: "6" }],
  });
  assert.equal(filaCargada({ ...completa, resultado: { clave: "x", estado: "ya-estaba", mensaje: "" } }), true);
  assert.equal(filaCargada({ ...completa, resultado: { clave: "x", estado: "rechazada", mensaje: "" } }), false);
});

test("resumenDeLaCarga y el borrador (con las claves, para que recargar no duplique)", () => {
  assert.equal(resumenDeLaCarga([{ clave: "a", estado: "grabada", mensaje: "" }, { clave: "b", estado: "ya-estaba", mensaje: "" }]), "Las 2 ventas quedaron cargadas con su hora.");
  assert.match(resumenDeLaCarga([{ clave: "a", estado: "grabada", mensaje: "" }, { clave: "b", estado: "rechazada", mensaje: "" }]), /Se cargaron 1 de 2\. Revisá/);
  assert.match(resumenDeLaCarga([{ clave: "a", estado: "sin-confirmar", mensaje: "" }]), /no se duplican/);
  const b = { v: 1, dia: "2026-10-24", filas: [fila({ hora: "11:20", medio: "EFECTIVO" }), { clave: "mala" }] };
  const leido = leerBorrador(JSON.stringify(b));
  assert.equal(leido?.filas.length, 1);
  assert.equal(leido?.filas[0].clave, "fila-0001-x");
  assert.equal(leerBorrador("{roto"), null);
  assert.equal(leerBorrador(JSON.stringify({ v: 2, dia: "x", filas: [] })), null);
  assert.equal(claveDelBorrador("tnt", "usr"), "gsg:vender:cuaderno:tnt:usr");
});
