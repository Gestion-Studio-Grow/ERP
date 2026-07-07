// Tests del catálogo REAL del producto + la migración de ARCA + el flag. node:test.
// Cierra el contrato end-to-end contra módulos reales (nativos + arca + mercadopago).

import { test } from "node:test";
import assert from "node:assert/strict";
import { construirCatalogo, DESCRIPTORES_CATALOGO } from "./catalog";
import { resolverActivacion } from "./activation";
import { moduleRegistryEnabled } from "./flags";
import { arcaModule, arcaManifest } from "@/plugins/arca/module";
import { toLegacyPluginManifest } from "./contract";

test("el catálogo real se construye y valida estricto (fail-closed no dispara)", () => {
  assert.doesNotThrow(() => construirCatalogo());
});

test("el catálogo real no tiene errores de validación", () => {
  const r = construirCatalogo();
  const errores = r.validar().filter((p) => p.severidad === "error");
  assert.deepEqual(errores, []);
});

test("ids del catálogo son únicos", () => {
  const ids = DESCRIPTORES_CATALOGO.map((d) => d.id);
  assert.equal(ids.length, new Set(ids).size);
});

test("ARCA y Mercado Pago están en el catálogo como plugins", () => {
  const r = construirCatalogo();
  assert.equal(r.get("arca").kind, "plugin");
  assert.equal(r.get("mercadopago").kind, "plugin");
});

test("waitlist depende de agenda y ambos están en el catálogo real", () => {
  const r = construirCatalogo();
  const wl = r.get("waitlist");
  assert.ok(wl.dependencias?.some((d) => d.id === "agenda"));
  assert.ok(r.tiene("agenda"));
});

test("MIGRACIÓN ARCA: el manifiesto legado se deriva del descriptor (misma data)", () => {
  // arcaManifest debe ser exactamente la proyección legada del descriptor.
  assert.deepEqual(arcaManifest, toLegacyPluginManifest(arcaModule));
  // Y conservar la forma que consumían arca/index y mercadopago.
  assert.equal(arcaManifest.key, "arca");
  assert.deepEqual(arcaManifest.consumeEventos, ["InvoiceCreated"]);
  assert.deepEqual(arcaManifest.llamaComandos, ["RegisterFiscalDocument"]);
  assert.equal(arcaManifest.configSchema.certificadoPem.secreto, true);
  assert.equal(arcaManifest.configSchema.clavePrivadaPem.secreto, true);
});

test("variante sobre el catálogo real: commissions solo aplica a servicios", () => {
  const r = construirCatalogo();
  const enCarniceria = resolverActivacion(
    { tenantId: "t", blueprintId: "carniceria", modules: ["catalog", "commissions"] },
    r,
  );
  assert.ok(enCarniceria.incompatibles.some((x) => x.id === "commissions"));

  const enServicios = resolverActivacion(
    { tenantId: "t", blueprintId: "servicios", modules: ["reports", "commissions"] },
    r,
  );
  assert.ok(enServicios.activos.some((d) => d.id === "commissions"));
});

test("flag MODULE_REGISTRY_ENABLED: default OFF, se prende con valores esperados", () => {
  assert.equal(moduleRegistryEnabled({}), false);
  assert.equal(moduleRegistryEnabled({ MODULE_REGISTRY_ENABLED: "false" }), false);
  assert.equal(moduleRegistryEnabled({ MODULE_REGISTRY_ENABLED: "0" }), false);
  assert.equal(moduleRegistryEnabled({ MODULE_REGISTRY_ENABLED: "1" }), true);
  assert.equal(moduleRegistryEnabled({ MODULE_REGISTRY_ENABLED: "true" }), true);
  assert.equal(moduleRegistryEnabled({ MODULE_REGISTRY_ENABLED: "on" }), true);
});
