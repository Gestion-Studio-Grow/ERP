// R3 (cert. Magra T1) — lo puro: la lectura de la factura del proveedor en la compra del local, la
// decisión ante una factura que ya está, las notas, y el aviso de la importación con vinculados.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decidirFacturaDeCompra,
  leerFacturaDeCompra,
  MARCA_FACTURA_DEL_LOCAL,
  notasDeCompraConFactura,
  notasDelLocalSinMarca,
  rotuloDeLaFactura,
} from "./factura-de-compra";
import { aRevisarDeNotas, claveRecibido } from "@/lib/contador/recibidos-formato";
import { avisoDeLaCarga } from "@/lib/contador/recibidos-aviso";

const HOY = "2026-10-22";
const CUIT = "20123456786";

test("sin tipo, punto de venta ni número: la compra no trae factura (como siempre)", () => {
  assert.deepEqual(leerFacturaDeCompra({}, { hoy: HOY, cuitDelProveedor: CUIT }), { ok: true, factura: null });
  assert.deepEqual(leerFacturaDeCompra({ tipo: " ", cuit: "20-12345678-6" }, { hoy: HOY, cuitDelProveedor: null }), { ok: true, factura: null });
});

test("la factura completa: CUIT del proveedor si el campo está vacío, fecha de hoy si no se pone, misma clave que la importación", () => {
  const r = leerFacturaDeCompra({ tipo: "1", puntoVenta: "0003", numero: "00001234" }, { hoy: HOY, cuitDelProveedor: "20-12345678-6" });
  assert.deepEqual(r, { ok: true, factura: { tipo: 1, puntoVenta: 3, numero: 1234, cuit: CUIT, fecha: "20261022" } });
  if (!r.ok || !r.factura) return;
  assert.equal(rotuloDeLaFactura(r.factura), "Factura A 00003-00001234");
  assert.equal(
    claveRecibido({ cuitEmisor: r.factura.cuit, tipo: r.factura.tipo, puntoVenta: r.factura.puntoVenta, numero: r.factura.numero }),
    claveRecibido({ cuitEmisor: CUIT, tipo: 1, puntoVenta: 3, numero: 1234 }),
  );
  const conFecha = leerFacturaDeCompra({ tipo: "6", puntoVenta: "2", numero: "9", cuit: "20.12345678.6", fecha: "2026-08-10" }, { hoy: HOY, cuitDelProveedor: null });
  assert.deepEqual(conFecha, { ok: true, factura: { tipo: 6, puntoVenta: 2, numero: 9, cuit: CUIT, fecha: "20260810" } });
});

test("a medio cargar o mal: rechazo con el porqué, en criollo", () => {
  const leer = (f: Record<string, string>, prov: string | null = CUIT) => {
    const r = leerFacturaDeCompra(f, { hoy: HOY, cuitDelProveedor: prov });
    return r.ok ? null : r.error;
  };
  assert.match(leer({ tipo: "3", puntoVenta: "1", numero: "1" })!, /Factura A, B, C o M/, "una nota de crédito no es una compra");
  assert.match(leer({ tipo: "1", numero: "1" })!, /punto de venta/);
  assert.match(leer({ tipo: "1", puntoVenta: "100000", numero: "1" })!, /punto de venta/);
  assert.match(leer({ tipo: "1", puntoVenta: "1" })!, /número de la factura/);
  assert.match(leer({ tipo: "1", puntoVenta: "1", numero: "12-3" })!, /número de la factura/);
  assert.match(leer({ tipo: "1", puntoVenta: "1", numero: "1" }, null)!, /Poné el CUIT/);
  assert.match(leer({ tipo: "1", puntoVenta: "1", numero: "1", cuit: "20-12345678-9" })!, /CUIT del proveedor: /);
  assert.match(leer({ tipo: "1", puntoVenta: "1", numero: "1", cuit: "27-12345678-0" })!, /no es el del proveedor elegido/);
  assert.match(leer({ tipo: "1", puntoVenta: "1", numero: "1", fecha: "2026-02-30" })!, /fecha/);
});

test("qué hacer con una factura que ya está: nueva, vincular con la importada sin renglones, o rechazo", () => {
  const rot = "Factura A 00003-00001234";
  assert.deepEqual(decidirFacturaDeCompra(null, rot), { accion: "nueva" });
  assert.deepEqual(decidirFacturaDeCompra({ code: 7, renglones: 0, importada: true }, rot), { accion: "vincular" });
  const yaDelLocal = decidirFacturaDeCompra({ code: 7, renglones: 2, importada: false }, rot);
  assert.equal(yaDelLocal.accion, "rechazo");
  assert.match(yaDelLocal.accion === "rechazo" ? yaDelLocal.error : "", /ya está cargada en la compra #7/);
  assert.equal(decidirFacturaDeCompra({ code: 8, renglones: 1, importada: true }, rot).accion, "rechazo", "ya vinculada: no otra vez");
});

test("las notas de la compra del local: quedan «a revisar» hasta el IVA de ARCA, y al vincular se conserva lo escrito", () => {
  const n = notasDeCompraConFactura("remito 42");
  assert.ok(n.startsWith("remito 42 "));
  assert.ok(aRevisarDeNotas(n));
  assert.equal(notasDelLocalSinMarca(n), "remito 42");
  assert.equal(notasDeCompraConFactura(null), MARCA_FACTURA_DEL_LOCAL);
  assert.equal(notasDelLocalSinMarca(MARCA_FACTURA_DEL_LOCAL), "");
  assert.equal(notasDelLocalSinMarca(null), "");
});

test("el aviso de la importación dice cuántas completaron una compra del local", () => {
  const base = { entraron: 3, notasDeCredito: 0, aRevisar: 0, yaCargados: 0, repetidosEnElArchivo: 0, conErrores: 0 };
  assert.equal(avisoDeLaCarga(base), "Entraron 3 comprobantes.");
  assert.match(avisoDeLaCarga({ ...base, vinculados: 1 }), /1 ya lo había cargado el local.*no se duplica/);
  assert.match(avisoDeLaCarga({ ...base, vinculados: 2 }), /2 ya los había cargado el local.*no se duplican/);
});
