// Tests de la resolución de subdominio → tenant (routing multi-tenant, ADR-018 §4).
// `extractSubdomain` es la pieza PURA de la que cuelga el aislamiento por host el
// día del 2º tenant; cubrirla ahora de-risca ese gate sin activar nada (no toca
// RLS ni la DB). Lee `APP_BASE_DOMAIN` en cada llamada, así que se setea acá.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { extractSubdomain, forcedTenantSlug, resolveForcedTenantId } from "./tenant";

before(() => {
  process.env.APP_BASE_DOMAIN = "miapp.com";
});

test("devuelve el subdominio de un host del dominio base", () => {
  assert.equal(extractSubdomain("carolina.miapp.com"), "carolina");
  assert.equal(extractSubdomain("magra.miapp.com"), "magra");
});

test("ignora puerto y mayúsculas", () => {
  assert.equal(extractSubdomain("Carolina.MiApp.com:3000"), "carolina");
});

test("el dominio base pelado o www NO tienen subdominio (fallback single-tenant)", () => {
  assert.equal(extractSubdomain("miapp.com"), null);
  assert.equal(extractSubdomain("www.miapp.com"), null);
});

test("un host ajeno al dominio base devuelve null (no cross-tenant por accidente)", () => {
  assert.equal(extractSubdomain("otrodominio.com"), null);
  assert.equal(extractSubdomain("carolina.otrodominio.com"), null);
});

test("toma solo el primer host de una lista x-forwarded y el primer label", () => {
  assert.equal(extractSubdomain("magra.miapp.com, proxy.interno"), "magra");
  // Sub-subdominio: se queda con el primer label, no con todo el prefijo.
  assert.equal(extractSubdomain("a.b.miapp.com"), "a");
});

test("host vacío o ausente devuelve null", () => {
  assert.equal(extractSubdomain(""), null);
  assert.equal(extractSubdomain(null), null);
  assert.equal(extractSubdomain(undefined), null);
});

test("sin APP_BASE_DOMAIN configurado, siempre null (single-tenant)", () => {
  const prev = process.env.APP_BASE_DOMAIN;
  delete process.env.APP_BASE_DOMAIN;
  try {
    assert.equal(extractSubdomain("carolina.miapp.com"), null);
  } finally {
    process.env.APP_BASE_DOMAIN = prev;
  }
});

// --- Opción A: pin de tenant por env (FORCE_TENANT_SLUG) -----------------------

test("forcedTenantSlug: null si la env var no está o está vacía", () => {
  assert.equal(forcedTenantSlug({}), null);
  assert.equal(forcedTenantSlug({ FORCE_TENANT_SLUG: "" }), null);
  assert.equal(forcedTenantSlug({ FORCE_TENANT_SLUG: "   " }), null);
});

test("forcedTenantSlug: normaliza trim + lowercase", () => {
  assert.equal(forcedTenantSlug({ FORCE_TENANT_SLUG: "magra" }), "magra");
  assert.equal(forcedTenantSlug({ FORCE_TENANT_SLUG: "  Magra  " }), "magra");
  assert.equal(forcedTenantSlug({ FORCE_TENANT_SLUG: "BEAUTY-SPA" }), "beauty-spa");
});

test("resolveForcedTenantId: devuelve el id cuando el slug matchea", async () => {
  const id = await resolveForcedTenantId("magra", async (slug) => {
    assert.equal(slug, "magra"); // el slug forzado llega al lookup tal cual
    return { id: "t_magra" };
  });
  assert.equal(id, "t_magra");
});

test("resolveForcedTenantId: THROW fail-closed si el slug no existe", async () => {
  await assert.rejects(
    () => resolveForcedTenantId("noexiste", async () => null),
    /FORCE_TENANT_SLUG="noexiste" no matchea.*fail-closed/,
  );
});
