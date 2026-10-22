import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { vidrieraDelHost } from "./producto-host";
import { proxy } from "@/proxy";

test("el host de Facturita lleva su raíz a la vidriera; los demás no", () => {
  assert.equal(vidrieraDelHost("facturita-gsg.vercel.app"), "/facturita");
  assert.equal(vidrieraDelHost("Facturita-GSG.vercel.app:443"), "/facturita");
  assert.equal(vidrieraDelHost("facturita-gsg.vercel.app, proxy.interno"), "/facturita");
  assert.equal(vidrieraDelHost("chestetica-erp.vercel.app"), null);
  assert.equal(vidrieraDelHost("vercel.app"), null);
  assert.equal(vidrieraDelHost(null), null);
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
