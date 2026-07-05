// Tests de la fábrica de gateway de Mercado Pago (proveedor del core pagos).
// node:test + tsx. Sin red: el adapter real se construye pero no se lo invoca.

import { test } from "node:test";
import assert from "node:assert/strict";

import { RegistroGateways } from "@/plugins/pagos";
import { HttpMercadoPagoClient } from "./http";
import { StubMercadoPagoClient } from "./stub";
import { CLAVE_MERCADOPAGO, fabricaGatewayMP } from "./gateway";

test("fabricaGatewayMP sin credenciales devuelve el stub (dev/test)", () => {
  const gw = fabricaGatewayMP("t-1", undefined);
  assert.ok(gw instanceof StubMercadoPagoClient);
});

test("fabricaGatewayMP sin accessToken (config vacía) devuelve el stub", () => {
  const gw = fabricaGatewayMP("t-1", { credenciales: { accessToken: "" } });
  assert.ok(gw instanceof StubMercadoPagoClient);
});

test("fabricaGatewayMP con access token devuelve el adapter real HTTP", () => {
  const gw = fabricaGatewayMP("t-1", { credenciales: { accessToken: "APP_USR-abc" } });
  assert.ok(gw instanceof HttpMercadoPagoClient);
});

test("MP se registra como proveedor y se resuelve por su clave", async () => {
  const registro = new RegistroGateways().registrar(CLAVE_MERCADOPAGO, fabricaGatewayMP);
  assert.equal(registro.tiene(CLAVE_MERCADOPAGO), true);

  // Sin credenciales → stub, que además implementa GatewayPagos (getPayment).
  const gw = registro.gatewayPara(CLAVE_MERCADOPAGO, "t-1");
  const stub = gw as StubMercadoPagoClient;
  stub.simularPago({ id: "p1", estado: "approved", monto: 100, externalReference: "" });
  const pago = await gw.getPayment("p1");
  assert.equal(pago.id, "p1");
  assert.equal(pago.estado, "approved");
});
