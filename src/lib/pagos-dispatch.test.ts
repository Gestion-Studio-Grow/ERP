// Tests del dispatch de cobros por tenant (CORE PAGOS, fase 3; Tanda P1: token por conexión).
// node:test + tsx. Sin red ni base: las lecturas de la conexión entran por deps falsas.

import { test } from "node:test";
import assert from "node:assert/strict";

import { RegistroGateways, ProveedorPagoDesconocidoError } from "@/plugins/pagos";
import { CLAVE_MERCADOPAGO, StubMercadoPagoClient } from "@/plugins/mercadopago";
import {
  CobrosSinConexionError,
  configCobrosDesde,
  construirRegistroCobros,
  gatewayCobrosDeConexion,
  gatewayCobrosPara,
  type ConfigCobrosPort,
  type DepsConfigCobros,
} from "@/lib/pagos-dispatch";

/** Deps falsas: `conexiones` = negocio → { conexionId, token }. */
function depsFalsas(
  env: Record<string, string | undefined>,
  conexiones: Record<string, { conexionId: string; token: string | null }> = {},
) {
  const auditados: Array<{ tenantId: string; conToken: boolean }> = [];
  const tokensLeidos: string[] = [];
  const deps: DepsConfigCobros = {
    env,
    conexionMP: async (t) => (conexiones[t] ? { conexionId: conexiones[t].conexionId } : null),
    tokenDe: async (t, c) => {
      tokensLeidos.push(`${t}/${c}`);
      const x = conexiones[t];
      return x && x.conexionId === c ? x.token : null;
    },
    auditarLegado: async (tenantId, d) => {
      auditados.push({ tenantId, conToken: d.conToken });
    },
  };
  return { deps, auditados, tokensLeidos };
}

test("el registro de cobros trae Mercado Pago registrado", () => {
  const registro = construirRegistroCobros();
  assert.equal(registro.tiene(CLAVE_MERCADOPAGO), true);
  assert.deepEqual(registro.proveedores(), [CLAVE_MERCADOPAGO]);
});

test("P1-C4: con conexión, el token sale de la conexión del negocio (aunque haya token global)", async () => {
  const f = depsFalsas(
    { MP_ACCESS_TOKEN: "APP_USR-global", MP_MODO_LEGADO: "1" },
    { "t-a": { conexionId: "con-a", token: "APP_USR-de-a" }, "t-b": { conexionId: "con-b", token: "APP_USR-de-b" } },
  );
  const port = configCobrosDesde(f.deps);
  assert.deepEqual(await port.configDe("t-a"), { proveedor: CLAVE_MERCADOPAGO, config: { credenciales: { accessToken: "APP_USR-de-a" } } });
  assert.deepEqual(await port.configDe("t-b"), { proveedor: CLAVE_MERCADOPAGO, config: { credenciales: { accessToken: "APP_USR-de-b" } } });
  assert.deepEqual(f.tokensLeidos, ["t-a/con-a", "t-b/con-b"]);
  assert.equal(f.auditados.length, 0, "con conexión no hay modo legado");
});

test("P1-C4: sin conexión y sin MP_MODO_LEGADO → falla cerrada clara, sin tocar el token global", async () => {
  for (const flag of [undefined, "", "0", "true", "si", " 2 "]) {
    const f = depsFalsas({ MP_ACCESS_TOKEN: "APP_USR-global", MP_MODO_LEGADO: flag });
    await assert.rejects(
      async () => configCobrosDesde(f.deps).configDe("t-sin"),
      (e: unknown) =>
        e instanceof CobrosSinConexionError &&
        e.motivo === "sin_conexion" &&
        e.tenantId === "t-sin" &&
        /no tiene Mercado Pago conectado/.test(e.message) &&
        !e.message.includes("APP_USR"),
    );
    assert.equal(f.auditados.length, 0);
  }
  // Y gatewayCobrosPara propaga la falla (nunca un stub silencioso).
  const f = depsFalsas({});
  await assert.rejects(() => gatewayCobrosPara("t-sin", construirRegistroCobros(), configCobrosDesde(f.deps)), CobrosSinConexionError);
});

test("P1-C4: sin conexión con MP_MODO_LEGADO=1 → token global, y queda auditado en el negocio", async () => {
  const f = depsFalsas({ MP_ACCESS_TOKEN: " APP_USR-global ", MP_MODO_LEGADO: "1" });
  const cfg = await configCobrosDesde(f.deps).configDe("t-viejo");
  assert.deepEqual(cfg, { proveedor: CLAVE_MERCADOPAGO, config: { credenciales: { accessToken: "APP_USR-global" } } });
  assert.deepEqual(f.auditados, [{ tenantId: "t-viejo", conToken: true }]);

  // Legado sin token global → el stub de siempre (dev), también auditado.
  const g = depsFalsas({ MP_MODO_LEGADO: "1" });
  const gw = await gatewayCobrosPara("t-1", construirRegistroCobros(), configCobrosDesde(g.deps));
  assert.ok(gw instanceof StubMercadoPagoClient, "legado sin token → stub en memoria");
  assert.deepEqual(g.auditados, [{ tenantId: "t-1", conToken: false }]);
  const stub = gw as StubMercadoPagoClient;
  stub.simularPago({ id: "p1", estado: "approved", monto: 100, externalReference: "" });
  const pago = await gw.getPayment("p1");
  assert.equal(pago.id, "p1");
  assert.equal(pago.estado, "approved");
});

test("P1-C4: conexión sin access_token → falla cerrada (no cae al legado aunque esté el flag)", async () => {
  const f = depsFalsas({ MP_ACCESS_TOKEN: "APP_USR-global", MP_MODO_LEGADO: "1" }, { "t-a": { conexionId: "con-a", token: null } });
  await assert.rejects(
    async () => configCobrosDesde(f.deps).configDe("t-a"),
    (e: unknown) => e instanceof CobrosSinConexionError && e.motivo === "sin_token",
  );
  assert.equal(f.auditados.length, 0);
});

test("gatewayCobrosDeConexion usa el token de ESA conexión (adapter real) y sin token falla cerrado", async () => {
  const f = depsFalsas({}, { "t-a": { conexionId: "con-a", token: "APP_USR-de-a" } });
  const gw = await gatewayCobrosDeConexion("t-a", "con-a", construirRegistroCobros(), f.deps);
  assert.ok(!(gw instanceof StubMercadoPagoClient), "con token → adapter real");
  await assert.rejects(() => gatewayCobrosDeConexion("t-a", "con-otra", construirRegistroCobros(), f.deps), CobrosSinConexionError);
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
