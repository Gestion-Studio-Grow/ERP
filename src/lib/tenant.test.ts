// Tests de resolución de tenant por host — lógica pura (ADR-015 / ADR-018 §4).
// Cubre el fix de C-1 (reporte QA 2026-07-06): TENANT_HOST_MAP se documentaba en
// docs/runbooks/recuperar-chestetica.md pero no se leía en ningún lado.

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSubdomain, parseTenantHostMap } from "./tenant";

test("parseTenantHostMap: parsea pares host=sub separados por ';'", () => {
  const map = parseTenantHostMap(
    "chestetica-erp.vercel.app=chestetica;magra-erp.vercel.app=magra",
  );
  assert.equal(map.get("chestetica-erp.vercel.app"), "chestetica");
  assert.equal(map.get("magra-erp.vercel.app"), "magra");
  assert.equal(map.size, 2);
});

test("parseTenantHostMap: normaliza a minúsculas y recorta espacios", () => {
  const map = parseTenantHostMap(" CH-Erp.vercel.app = Chestetica ; ");
  assert.equal(map.get("ch-erp.vercel.app"), "chestetica");
});

test("parseTenantHostMap: input vacío/null/inválido no rompe", () => {
  assert.equal(parseTenantHostMap(undefined).size, 0);
  assert.equal(parseTenantHostMap(null).size, 0);
  assert.equal(parseTenantHostMap("").size, 0);
  assert.equal(parseTenantHostMap("sin-igual;otra-basura==x").size, 0);
});

test("extractSubdomain: sin TENANT_HOST_MAP ni APP_BASE_DOMAIN, host libre → null", () => {
  const prevMap = process.env.TENANT_HOST_MAP;
  const prevBase = process.env.APP_BASE_DOMAIN;
  delete process.env.TENANT_HOST_MAP;
  delete process.env.APP_BASE_DOMAIN;
  try {
    assert.equal(extractSubdomain("chestetica-erp.vercel.app"), null);
  } finally {
    if (prevMap !== undefined) process.env.TENANT_HOST_MAP = prevMap; else delete process.env.TENANT_HOST_MAP;
    if (prevBase !== undefined) process.env.APP_BASE_DOMAIN = prevBase; else delete process.env.APP_BASE_DOMAIN;
  }
});

test("extractSubdomain: con TENANT_HOST_MAP, resuelve el host exacto al subdomain mapeado (caso C-1)", () => {
  const prevMap = process.env.TENANT_HOST_MAP;
  const prevBase = process.env.APP_BASE_DOMAIN;
  process.env.TENANT_HOST_MAP =
    "chestetica-erp.vercel.app=chestetica;magra-erp.vercel.app=magra;shinevelas-erp.vercel.app=shinevelas;adosmanos-erp.vercel.app=adosmanos";
  delete process.env.APP_BASE_DOMAIN;
  try {
    assert.equal(extractSubdomain("chestetica-erp.vercel.app"), "chestetica");
    assert.equal(extractSubdomain("magra-erp.vercel.app"), "magra");
    assert.equal(extractSubdomain("host-no-mapeado.vercel.app"), null);
  } finally {
    if (prevMap !== undefined) process.env.TENANT_HOST_MAP = prevMap; else delete process.env.TENANT_HOST_MAP;
    if (prevBase !== undefined) process.env.APP_BASE_DOMAIN = prevBase; else delete process.env.APP_BASE_DOMAIN;
  }
});

test("extractSubdomain: TENANT_HOST_MAP tiene prioridad sobre APP_BASE_DOMAIN cuando ambos matchean", () => {
  const prevMap = process.env.TENANT_HOST_MAP;
  const prevBase = process.env.APP_BASE_DOMAIN;
  process.env.TENANT_HOST_MAP = "caro.base.com=otro-slug";
  process.env.APP_BASE_DOMAIN = "base.com";
  try {
    assert.equal(extractSubdomain("caro.base.com"), "otro-slug");
  } finally {
    if (prevMap !== undefined) process.env.TENANT_HOST_MAP = prevMap; else delete process.env.TENANT_HOST_MAP;
    if (prevBase !== undefined) process.env.APP_BASE_DOMAIN = prevBase; else delete process.env.APP_BASE_DOMAIN;
  }
});

test("extractSubdomain: sin match en TENANT_HOST_MAP, cae al recorte por APP_BASE_DOMAIN", () => {
  const prevMap = process.env.TENANT_HOST_MAP;
  const prevBase = process.env.APP_BASE_DOMAIN;
  delete process.env.TENANT_HOST_MAP;
  process.env.APP_BASE_DOMAIN = "base.com";
  try {
    assert.equal(extractSubdomain("caro.base.com"), "caro");
    assert.equal(extractSubdomain("base.com"), null);
    assert.equal(extractSubdomain("www.base.com"), null);
    assert.equal(extractSubdomain("otrodominio.com"), null);
    assert.equal(extractSubdomain(null), null);
  } finally {
    if (prevMap !== undefined) process.env.TENANT_HOST_MAP = prevMap; else delete process.env.TENANT_HOST_MAP;
    if (prevBase !== undefined) process.env.APP_BASE_DOMAIN = prevBase; else delete process.env.APP_BASE_DOMAIN;
  }
});
