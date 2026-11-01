import { test } from "node:test";
import assert from "node:assert/strict";
import { esApexDelDominio } from "./proxy";

test("el apex del dominio y su www van a la portada de GSG; un subdominio, no", () => {
  assert.equal(esApexDelDominio("gsgapp.com.ar", "gsgapp.com.ar"), true);
  assert.equal(esApexDelDominio("WWW.gsgapp.com.ar:443", "gsgapp.com.ar"), true);
  assert.equal(esApexDelDominio("chestetica.gsgapp.com.ar", "gsgapp.com.ar"), false);
  assert.equal(esApexDelDominio("redsur.gsgapp.com.ar", "gsgapp.com.ar"), false);
  assert.equal(esApexDelDominio("chestetica-erp.vercel.app", "gsgapp.com.ar"), false);
});

test("sin dominio base configurado, nunca (no rompe el modo de un solo negocio)", () => {
  assert.equal(esApexDelDominio("localhost", undefined), false);
  assert.equal(esApexDelDominio("localhost", ""), false);
});
