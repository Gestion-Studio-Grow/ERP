// SEGURIDAD (08/11/2026): el club de antes del ERP, en crudo (public/previews/breakpoint/club), se servía a
// cualquiera en cualquier host. Sin sesión vigente del panel, el proxy responde 404.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy, esClubCrudo } from "@/proxy";
import { createSessionToken, getSessionCookieName, VIGENCIA_SESION_MS } from "./auth";

test("esClubCrudo: atrapa variantes de mayúsculas, %xx y barras dobles; no toca el turnero", () => {
  for (const p of ["/previews/breakpoint/club/index.html", "/previews/breakpoint/club", "/Previews/BreakPoint/Club/app.mjs", "/previews/breakpoint/%63lub/app.mjs", "/previews//breakpoint//club/x", "/previews/breakpoint/turnero/..%2fclub/app.mjs", "/previews/breakpoint/./club/studio.mjs", "/previews\\breakpoint\\club\\index.html"]) {
    assert.equal(esClubCrudo(p), true, p);
  }
  for (const p of ["/previews/breakpoint/turnero/index.html", "/previews/breakpoint/clubes", "/club", "/tienda/%E0", "/previews/breakpoint/club/motor.mjs"]) {
    assert.equal(esClubCrudo(p), false, p);
  }
});

test("PROXY: el club crudo sin sesión (o con sesión vencida) da 404; con sesión vigente pasa", async () => {
  const sin = await proxy(new NextRequest("https://breakpointpadel.gsgapp.com.ar/previews/breakpoint/club/index.html"));
  assert.equal(sin.status, 404);
  const vencida = new NextRequest("https://breakpointpadel.gsgapp.com.ar/previews/breakpoint/club/app.mjs");
  vencida.cookies.set(getSessionCookieName(), await createSessionToken("u1", Date.now() - VIGENCIA_SESION_MS - 1000));
  assert.equal((await proxy(vencida)).status, 404);
  const con = new NextRequest("https://breakpointpadel.gsgapp.com.ar/previews/breakpoint/club/index.html");
  con.cookies.set(getSessionCookieName(), await createSessionToken("u1"));
  assert.equal((await proxy(con)).status, 200);
  // El turnero crudo (público, para los jugadores) no cambia.
  assert.equal((await proxy(new NextRequest("https://x.test/previews/breakpoint/turnero/index.html"))).status, 200);
});
