import { test } from "node:test";
import assert from "node:assert/strict";
import { detectBrandFromUrl, normalizeSiteUrl, type FetchLike } from "./detect";

test("normalizeSiteUrl: agrega https, valida esquema, rechaza basura", () => {
  assert.equal(normalizeSiteUrl("magra.com.ar"), "https://magra.com.ar/");
  assert.equal(normalizeSiteUrl("http://x.com"), "http://x.com/");
  assert.equal(normalizeSiteUrl("ftp://x.com"), null);
  assert.equal(normalizeSiteUrl(""), null);
  assert.equal(normalizeSiteUrl("   "), null);
});

// fetch inyectado → sin red real.
function fakeFetch(html: string, ok = true, status = 200): FetchLike {
  return async () => ({ ok, status, text: async () => html });
}

test("detectBrandFromUrl: HTML válido → propuesta con preset oxblood", async () => {
  const html = `<title>Magra</title><meta name="theme-color" content="#6e1e28"><link rel="apple-touch-icon" href="/l.png">`;
  const r = await detectBrandFromUrl("magra.example", { fetchImpl: fakeFetch(html) });
  assert.equal(r.ok, true);
  assert.equal(r.error, null);
  assert.equal(r.proposal?.nearestPreset, "oxblood");
  assert.equal(r.proposal?.logoUrl, "https://magra.example/l.png");
});

test("detectBrandFromUrl: URL inválida → error, sin fetch", async () => {
  let called = false;
  const r = await detectBrandFromUrl("javascript:alert(1)", { fetchImpl: (() => { called = true; return Promise.reject(); }) as unknown as FetchLike });
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /inválida/i);
  assert.equal(called, false, "no debería intentar el fetch con URL inválida");
});

test("detectBrandFromUrl: respuesta no-ok → error legible", async () => {
  const r = await detectBrandFromUrl("x.example", { fetchImpl: fakeFetch("", false, 404) });
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /404/);
});

test("detectBrandFromUrl: el fetch tira → error atrapado, nunca lanza", async () => {
  const boom: FetchLike = async () => { throw new Error("network down"); };
  const r = await detectBrandFromUrl("x.example", { fetchImpl: boom });
  assert.equal(r.ok, false);
  assert.equal(r.proposal, null);
  assert.ok(r.error);
});
