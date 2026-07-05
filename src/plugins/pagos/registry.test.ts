// Tests del registro de proveedores de gateway (core pagos). node:test + tsx.
// Puro: los "gateways" son stubs triviales; no hay red ni proveedores reales.

import { test } from "node:test";
import assert from "node:assert/strict";

import { CriterioBusqueda, GatewayPagos, PaginaPagos, PagoNormalizado } from "./port";
import { ProveedorPagoDesconocidoError, RegistroGateways } from "./registry";

/** Gateway de juguete que recuerda con qué tenant se lo construyó. */
function gatewayFake(marca: string): GatewayPagos {
  return {
    async getPayment(id: string): Promise<PagoNormalizado> {
      return { id: `${marca}:${id}`, estado: "approved", monto: 1, externalReference: "" };
    },
    async listPayments(_c: CriterioBusqueda): Promise<PaginaPagos> {
      return { pagos: [] };
    },
  };
}

test("registrar + gatewayPara resuelve el proveedor y le pasa el tenant", async () => {
  const registro = new RegistroGateways();
  registro.registrar("fake", (tenantId) => gatewayFake(tenantId));

  const gw = registro.gatewayPara("fake", "t-1");
  const pago = await gw.getPayment("p9");
  assert.equal(pago.id, "t-1:p9");
});

test("tiene() y proveedores() reflejan lo registrado (orden de inserción)", () => {
  const registro = new RegistroGateways()
    .registrar("mercadopago", () => gatewayFake("mp"))
    .registrar("otro", () => gatewayFake("otro"));

  assert.equal(registro.tiene("mercadopago"), true);
  assert.equal(registro.tiene("stripe"), false);
  assert.deepEqual(registro.proveedores(), ["mercadopago", "otro"]);
});

test("registrar pisa la fábrica previa de una misma clave", async () => {
  const registro = new RegistroGateways()
    .registrar("x", () => gatewayFake("v1"))
    .registrar("x", () => gatewayFake("v2"));
  const pago = await registro.gatewayPara("x", "t").getPayment("p");
  assert.equal(pago.id, "v2:p");
  assert.equal(registro.proveedores().length, 1); // no duplica la clave
});

test("gatewayPara con proveedor desconocido lanza error con las claves disponibles", () => {
  const registro = new RegistroGateways().registrar("mercadopago", () => gatewayFake("mp"));
  assert.throws(
    () => registro.gatewayPara("stripe", "t-1"),
    (e: unknown) =>
      e instanceof ProveedorPagoDesconocidoError &&
      e.proveedor === "stripe" &&
      /mercadopago/.test(e.message),
  );
});

test("la config opaca llega a la fábrica sin que el registro la interprete", () => {
  const registro = new RegistroGateways();
  let recibida: unknown;
  registro.registrar("fake", (_t, config) => {
    recibida = config;
    return gatewayFake("fake");
  });
  const cfg = { credenciales: { accessToken: "secreto" } };
  registro.gatewayPara("fake", "t-1", cfg);
  assert.deepEqual(recibida, cfg);
});
