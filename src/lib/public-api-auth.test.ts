// ============================================================================
// TEST — una api-key NUNCA autentica a un tenant que no es el suyo.
// ============================================================================
//
// El agujero que cierra: `expectedKeyForSlug` caía a `EXTERNAL_ORDERS_API_KEY` cuando el
// slug no estaba en el mapa, y la devolvía como clave esperada PARA CUALQUIER SLUG. Como el
// tenant se resuelve por el `X-Tenant-Slug` declarado y lo único que lo valida es esa
// comparación, quien tuviera la clave de un negocio escribía en los otros tres: pedidos,
// descuento de stock por el ledger y —con ARCA encendido— un comprobante fiscal a nombre
// del otro contribuyente. Cuatro tenants reales comparten una base.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { expectedKeyForSlug } from "@/lib/public-api-auth";

const VARS = ["EXTERNAL_ORDERS_API_KEYS", "EXTERNAL_ORDERS_API_KEY", "EXTERNAL_ORDERS_API_KEY_SLUG"];
const guardado: Record<string, string | undefined> = {};
beforeEach(() => { for (const v of VARS) { guardado[v] = process.env[v]; delete process.env[v]; } });
afterEach(() => { for (const v of VARS) { if (guardado[v] === undefined) delete process.env[v]; else process.env[v] = guardado[v]; } });

test("sin nada configurado, ningún slug autentica (fail-closed)", () => {
  assert.equal(expectedKeyForSlug("beauty-spa"), null);
});

test("con el mapa por slug, cada uno recibe la suya", () => {
  process.env.EXTERNAL_ORDERS_API_KEYS = JSON.stringify({ "beauty-spa": "K-SPA", magra: "K-MAGRA" });
  assert.equal(expectedKeyForSlug("beauty-spa"), "K-SPA");
  assert.equal(expectedKeyForSlug("magra"), "K-MAGRA");
});

// EL CASO QUE ERA EL BUG.
test("un slug fuera del mapa NO cae a la clave única, aunque esté seteada", () => {
  process.env.EXTERNAL_ORDERS_API_KEYS = JSON.stringify({ "beauty-spa": "K-SPA" });
  process.env.EXTERNAL_ORDERS_API_KEY = "K-GLOBAL";
  process.env.EXTERNAL_ORDERS_API_KEY_SLUG = "beauty-spa";
  assert.equal(expectedKeyForSlug("magra"), null, "si el mapa está seteado es la ÚNICA fuente");
  assert.equal(expectedKeyForSlug("shinevelas"), null);
  assert.equal(expectedKeyForSlug("adosmanos"), null);
});

test("un JSON mal formado no abre la API para todos: se trata como no configurado", () => {
  process.env.EXTERNAL_ORDERS_API_KEYS = "{esto no es json";
  process.env.EXTERNAL_ORDERS_API_KEY = "K-GLOBAL";
  process.env.EXTERNAL_ORDERS_API_KEY_SLUG = "beauty-spa";
  for (const slug of ["beauty-spa", "magra", "shinevelas"]) {
    assert.equal(expectedKeyForSlug(slug), null, `${slug} no puede autenticar con el JSON roto`);
  }
});

test("la clave única sirve SÓLO para el slug que la declara dueña", () => {
  process.env.EXTERNAL_ORDERS_API_KEY = "K-GLOBAL";
  process.env.EXTERNAL_ORDERS_API_KEY_SLUG = "beauty-spa";
  assert.equal(expectedKeyForSlug("beauty-spa"), "K-GLOBAL");
  for (const otro of ["magra", "shinevelas", "adosmanos"]) {
    assert.equal(expectedKeyForSlug(otro), null, `${otro} no puede usar la clave de beauty-spa`);
  }
});

test("clave única sin dueño declarado no autentica a nadie", () => {
  process.env.EXTERNAL_ORDERS_API_KEY = "K-GLOBAL";
  assert.equal(expectedKeyForSlug("beauty-spa"), null, "un olvido de config no puede abrir los cuatro negocios");
});

test("el slug del dueño se compara normalizado", () => {
  process.env.EXTERNAL_ORDERS_API_KEY = "K-GLOBAL";
  process.env.EXTERNAL_ORDERS_API_KEY_SLUG = "  Beauty-Spa  ";
  assert.equal(expectedKeyForSlug("beauty-spa"), "K-GLOBAL");
});
