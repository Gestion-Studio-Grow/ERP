import { test } from "node:test";
import assert from "node:assert/strict";
import type { PagoMP } from "@/plugins/mercadopago";
import {
  CONFIG_FACTURACION_MP_APAGADA,
  clasificarPagoMP,
  configDeLaConexion,
  validarConfigFacturacionMP,
  type ConfigFacturacionMP,
  type ContextoClasificacion,
} from "./mercadopago-clasificacion";

const PAGO: PagoMP = { id: "1320001", estado: "approved", monto: 15000, externalReference: "", operacion: "pago", tipoOperacionMP: "regular_payment", descripcion: "Torta de chocolate", comision: 950 };
const AUTO: ConfigFacturacionMP = { modo: "automatico", puntoVenta: 3, concepto: 1, importeMinimo: 100, palabrasExcluidas: ["Propina", "devolución"] };
const ctx = (o: Partial<ContextoClasificacion> = {}): ContextoClasificacion => ({ config: AUTO, cuitNegocio: "20111111112", umbralIdentificacion: 600000, facturaDeLaReferencia: null, ...o });

test("apagada por defecto: con la configuración vacía, rara o vieja no pasa nada", () => {
  assert.deepEqual(configDeLaConexion(null), CONFIG_FACTURACION_MP_APAGADA);
  assert.deepEqual(configDeLaConexion({ facturacion: { modo: "a-full" } }), CONFIG_FACTURACION_MP_APAGADA);
  assert.deepEqual(configDeLaConexion({ otra: 1 }), CONFIG_FACTURACION_MP_APAGADA);
  assert.deepEqual(clasificarPagoMP(PAGO, ctx({ config: CONFIG_FACTURACION_MP_APAGADA })), { tipo: "nada", motivo: "apagado" });
});

test("transferencias, retiros, fondeos y lo desconocido nunca aparecen (ni como propuesta)", () => {
  for (const tipo of ["money_transfer", "account_fund", "pos_payment", "recurring_payment", "cellphone_recharge", undefined]) {
    assert.deepEqual(clasificarPagoMP({ ...PAGO, tipoOperacionMP: tipo }, ctx()), { tipo: "excluir", motivo: "no_es_venta" }, String(tipo));
    assert.deepEqual(clasificarPagoMP({ ...PAGO, tipoOperacionMP: tipo }, ctx({ config: { ...AUTO, modo: "proponer" } })).tipo, "excluir");
  }
});

test("sólo lo aprobado; monto raro afuera", () => {
  for (const estado of ["pending", "in_process", "rejected", "cancelled", "refunded"] as const) {
    assert.deepEqual(clasificarPagoMP({ ...PAGO, estado }, ctx()), { tipo: "excluir", motivo: "no_aprobado" });
  }
  assert.deepEqual(clasificarPagoMP({ ...PAGO, monto: 0 }, ctx()), { tipo: "excluir", motivo: "monto_invalido" });
  assert.deepEqual(clasificarPagoMP({ ...PAGO, monto: Number.NaN }, ctx()), { tipo: "excluir", motivo: "monto_invalido" });
  assert.deepEqual(clasificarPagoMP({ ...PAGO, monto: -50 }, ctx()), { tipo: "excluir", motivo: "monto_invalido" });
});

test("exclusiones del negocio: su propio CUIT, el mínimo y las palabras (sin tildes ni mayúsculas)", () => {
  assert.deepEqual(clasificarPagoMP({ ...PAGO, pagadorDoc: { tipo: "CUIT", numero: "20111111112" } }, ctx()), { tipo: "excluir", motivo: "cuenta_propia" });
  assert.equal(clasificarPagoMP({ ...PAGO, pagadorDoc: { tipo: "CUIT", numero: "20111111112" } }, ctx({ cuitNegocio: null })).tipo, "emitir");
  assert.deepEqual(clasificarPagoMP({ ...PAGO, monto: 99.99 }, ctx()), { tipo: "excluir", motivo: "bajo_minimo" });
  assert.equal(clasificarPagoMP({ ...PAGO, monto: 100 }, ctx()).tipo, "emitir", "el mínimo se incluye");
  assert.deepEqual(clasificarPagoMP({ ...PAGO, descripcion: "PROPINA mesa 4" }, ctx()), { tipo: "excluir", motivo: "palabra_excluida" });
  assert.deepEqual(clasificarPagoMP({ ...PAGO, descripcion: "Devolucion parcial" }, ctx()), { tipo: "excluir", motivo: "palabra_excluida" });
});

test("lo ya facturado por su referencia se enlaza, no se factura de nuevo", () => {
  assert.deepEqual(clasificarPagoMP({ ...PAGO, externalReference: "pedido:9" }, ctx({ facturaDeLaReferencia: "inv_9" })), { tipo: "enlazar", invoiceId: "inv_9" });
});

test("se factura el BRUTO, al centavo (la comisión no se descuenta)", () => {
  assert.deepEqual(clasificarPagoMP({ ...PAGO, monto: 0.1 + 0.2 + 1000 }, ctx()), { tipo: "emitir", importe: 1000.3 });
  assert.deepEqual(clasificarPagoMP(PAGO, ctx()), { tipo: "emitir", importe: 15000 });
});

test("umbral de identificación: sin documento pide datos (en los dos modos); con documento sigue", () => {
  const grande = { ...PAGO, monto: 600000 };
  assert.deepEqual(clasificarPagoMP(grande, ctx()), { tipo: "pendiente_datos", importe: 600000 });
  assert.deepEqual(clasificarPagoMP(grande, ctx({ config: { ...AUTO, modo: "proponer" } })), { tipo: "pendiente_datos", importe: 600000 });
  assert.deepEqual(clasificarPagoMP({ ...grande, monto: 599999.99 }, ctx()).tipo, "emitir");
  assert.deepEqual(clasificarPagoMP({ ...grande, pagadorDoc: { tipo: "DNI", numero: "30111222" } }, ctx()), { tipo: "emitir", importe: 600000 });
  assert.deepEqual(clasificarPagoMP(PAGO, ctx({ config: { ...AUTO, modo: "proponer" } })), { tipo: "proponer", importe: 15000 });
});

test("validación de la configuración: errores en criollo; normaliza palabras repetidas", () => {
  const r = validarConfigFacturacionMP({ modo: "x", puntoVenta: 0, concepto: 7, importeMinimo: -1, palabrasExcluidas: ["a".repeat(41)] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(Object.keys(r.errores).sort(), ["concepto", "importeMinimo", "modo", "palabrasExcluidas", "puntoVenta"]);
  const ok = validarConfigFacturacionMP({ modo: "proponer", puntoVenta: "4", concepto: 2, importeMinimo: "150.555", palabrasExcluidas: [" seña ", "seña", "", 3] });
  assert.deepEqual(ok, { ok: true, config: { modo: "proponer", puntoVenta: 4, concepto: 2, importeMinimo: 150.56, palabrasExcluidas: ["seña"] } });
});
