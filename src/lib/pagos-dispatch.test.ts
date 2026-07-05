// Tests del dispatch de cobros por tenant (CORE PAGOS, fase 3).
// node:test + tsx. Sin red: la fábrica MP sin credenciales construye el stub.

import { test } from "node:test";
import assert from "node:assert/strict";

import { RegistroGateways, ProveedorPagoDesconocidoError } from "@/plugins/pagos";
import { CLAVE_MERCADOPAGO, StubMercadoPagoClient } from "@/plugins/mercadopago";
import {
  construirRegistroCobros,
  configCobrosPorDefecto,
  gatewayCobrosPara,
  type ConfigCobrosPort,
} from "@/lib/pagos-dispatch";

test("el registro de cobros trae Mercado Pago registrado", () => {
  const registro = construirRegistroCobros();
  assert.equal(registro.tiene(CLAVE_MERCADOPAGO), true);
  assert.deepEqual(registro.proveedores(), [CLAVE_MERCADOPAGO]);
});

test("la config por defecto apunta a Mercado Pago (provisional, sin credenciales)", async () => {
  const cfg = await configCobrosPorDefecto.configDe("t-1");
  assert.equal(cfg.proveedor, CLAVE_MERCADOPAGO);
  assert.equal(cfg.config, undefined);
});

test("gatewayCobrosPara resuelve el stub cuando el tenant no tiene credenciales", async () => {
  const gw = await gatewayCobrosPara("t-1");
  assert.ok(gw instanceof StubMercadoPagoClient, "sin token → stub en memoria");

  // Y el stub cumple el contrato GatewayPagos (getPayment).
  const stub = gw as StubMercadoPagoClient;
  stub.simularPago({ id: "p1", estado: "approved", monto: 100, externalReference: "" });
  const pago = await gw.getPayment("p1");
  assert.equal(pago.id, "p1");
  assert.equal(pago.estado, "approved");
});

test("cada tenant resuelve el proveedor que declara su config", async () => {
  // Config inyectada: t-mp usa mercadopago; el registro sabe resolverlo.
  const configPort: ConfigCobrosPort = {
    configDe: (tenantId) =>
      tenantId === "t-con-token"
        ? { proveedor: CLAVE_MERCADOPAGO, config: { credenciales: { accessToken: "APP_USR-x" } } }
        : { proveedor: CLAVE_MERCADOPAGO },
  };

  const sinToken = await gatewayCobrosPara("t-1", construirRegistroCobros(), configPort);
  assert.ok(sinToken instanceof StubMercadoPagoClient, "sin token → stub");

  const conToken = await gatewayCobrosPara("t-con-token", construirRegistroCobros(), configPort);
  assert.ok(!(conToken instanceof StubMercadoPagoClient), "con token → adapter real, no stub");
});

test("un proveedor no registrado tira ProveedorPagoDesconocidoError", async () => {
  const registroVacio = new RegistroGateways();
  const configPort: ConfigCobrosPort = {
    configDe: () => ({ proveedor: "modo" }),
  };
  await assert.rejects(
    () => gatewayCobrosPara("t-1", registroVacio, configPort),
    ProveedorPagoDesconocidoError,
  );
});
