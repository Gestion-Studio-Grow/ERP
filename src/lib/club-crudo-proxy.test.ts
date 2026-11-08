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

test("PROXY: la reescritura del club crudo sólo acepta la forma canónica de un archivo de la lista (cert 2)", async () => {
  const token = await createSessionToken("u1");
  const pedir = async (ruta: string) => {
    const req = new NextRequest(`https://breakpointpadel.gsgapp.com.ar${ruta}`);
    req.cookies.set(getSessionCookieName(), token);
    return proxy(req);
  };
  const malas = [
    "/previews/breakpoint/club/%252e%252e/%252e%252e/admin/configuracion",
    "/previews/breakpoint/club/%25252e%25252e/admin",
    "/previews/breakpoint/club/..%5c..%5cadmin",
    "/previews/breakpoint/club//app.mjs",
    "/previews/breakpoint/club/app.mjs;x",
    "/previews/breakpoint/club/%61pp.mjs",
    "/previews/breakpoint/club/App.mjs",
    "/previews/breakpoint/club/sub/app.mjs",
    "/previews/breakpoint/club/__proto__",
    "/previews/breakpoint/club",
    "/previews/breakpoint/%63lub/app.mjs",
  ];
  for (const ruta of malas) {
    const r = await pedir(ruta);
    assert.equal(r.status, 404, ruta);
    assert.equal(r.headers.get("x-middleware-rewrite"), null, ruta);
  }
  // `%2e%2e` lo resuelve el propio parser de URL antes del proxy: ya no es del club y no hay reescritura.
  const punto = await pedir("/previews/breakpoint/club/%2e%2e/%2e%2e/admin/configuracion");
  assert.equal(punto.headers.get("x-middleware-rewrite"), null);
  for (const archivo of ["index.html", "app.mjs", "studio.mjs"]) {
    const r = await pedir(`/previews/breakpoint/club/${archivo}`);
    assert.equal(new URL(r.headers.get("x-middleware-rewrite")!).pathname, `/club-crudo/${archivo}`, archivo);
  }
});

test("archivoDelClubCrudo / rutaDelClubCrudo: nunca devuelven texto de la URL fuera de la lista", async () => {
  const { archivoDelClubCrudo, rutaDelClubCrudo } = await import("@/proxy");
  for (const p of ["/previews/breakpoint/club/%252e%252e/%252e%252e/admin/configuracion", "/previews/breakpoint/club/%2e%2e", "/previews/breakpoint/club/a\\b", "/previews/breakpoint/club//x", "/previews/breakpoint/club/x;y"]) {
    assert.equal(archivoDelClubCrudo(p), null, p);
    const r = rutaDelClubCrudo(p);
    assert.ok(r === "" || (r === null && p.includes("%2e")), p);
    assert.ok(new URL(`/club-crudo/${r ?? ""}`, "https://x.test/").pathname.startsWith("/club-crudo/"), p);
  }
});
