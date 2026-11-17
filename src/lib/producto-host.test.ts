import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { vidrieraDelHost } from "./producto-host";
import { proxy } from "@/proxy";

test("el host de Facturita lleva su raíz a la vidriera; los demás no", () => {
  assert.equal(vidrieraDelHost("facturita-gsg.vercel.app"), "/facturita");
  assert.equal(vidrieraDelHost("factoque.gsgapp.com.ar"), "/facturita");
  assert.equal(vidrieraDelHost("FACTOQUE.gsgapp.com.ar:443"), "/facturita");
  assert.equal(vidrieraDelHost("Facturita-GSG.vercel.app:443"), "/facturita");
  assert.equal(vidrieraDelHost("facturita-gsg.vercel.app, proxy.interno"), "/facturita");
  assert.equal(vidrieraDelHost("chestetica-erp.vercel.app"), null);
  assert.equal(vidrieraDelHost("vercel.app"), null);
  assert.equal(vidrieraDelHost(null), null);
});

test("el host de ProfeTurnos lleva su raíz a su vidriera", () => {
  assert.equal(vidrieraDelHost("profeturnos.gsgapp.com.ar"), "/profeturnos");
  assert.equal(vidrieraDelHost("ProfeTurnos.gsgapp.com.ar:443"), "/profeturnos");
  assert.equal(vidrieraDelHost("profeturnos.gsgapp.com.ar.evil.test"), null);
});

test("el host de Unboxing Fest lleva su raíz a la portada de los juegos", () => {
  assert.equal(vidrieraDelHost("unboxingfest.gsgapp.com.ar"), "/juegos/unboxingfest/index.html");
  assert.equal(vidrieraDelHost("UnboxingFest.gsgapp.com.ar:443"), "/juegos/unboxingfest/index.html");
  assert.equal(vidrieraDelHost("unboxingfest.gsgapp.com.ar.evil.test"), null);
});

test("proxy: la raíz de Unboxing Fest se reescribe a la portada estática, sin portón ni redirect", async () => {
  const res = await proxy(new NextRequest("https://unboxingfest.gsgapp.com.ar/"));
  assert.equal(res.headers.get("location"), null);
  assert.equal(new URL(res.headers.get("x-middleware-rewrite")!).pathname, "/juegos/unboxingfest/index.html");
  // un juego, con su modo y origen, pasa directo (es un archivo estático público)
  const juego = await proxy(new NextRequest("https://unboxingfest.gsgapp.com.ar/juegos/unboxingfest/farmaonline-abrilo-vos.html?o=redes#qr"));
  assert.equal(juego.headers.get("location"), null);
});

test("proxy: la raíz del host de Facturita sirve la vidriera sin redirigir", async () => {
  const res = await proxy(new NextRequest("https://facturita-gsg.vercel.app/"));
  assert.equal(res.headers.get("location"), null);
  assert.equal(new URL(res.headers.get("x-middleware-rewrite")!).pathname, "/facturita");
});

test("proxy: en el host de Facturita, sólo la raíz se reescribe; la app sigue bajo el portón", async () => {
  const app = await proxy(new NextRequest("https://facturita-gsg.vercel.app/facturita/app"));
  assert.equal(new URL(app.headers.get("location")!).pathname, "/admin/login");
  const planes = await proxy(new NextRequest("https://facturita-gsg.vercel.app/facturita/planes"));
  assert.equal(planes.headers.get("x-middleware-rewrite"), null);
});

test("proxy: la raíz de otro host no se toca", async () => {
  const res = await proxy(new NextRequest("https://chestetica-erp.vercel.app/"));
  assert.equal(res.headers.get("x-middleware-rewrite"), null);
});
