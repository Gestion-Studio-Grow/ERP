// Certificación GSG-SEG-002, cert 3: x-pathname del cliente, matcher con extensiones y `next` de /acceso.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getMiddlewareMatchers } = require("next/dist/build/analysis/get-page-static-info");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getMiddlewareRouteMatcher } = require("next/dist/shared/lib/router/utils/middleware-route-matcher");
import { proxy, config } from "./proxy";
import { createSessionToken, getSessionCookieName } from "@/lib/auth";
import { createOperatorToken, getOperatorCookieName } from "@/lib/operator-auth";
import { destinoInterno } from "@/lib/destino-interno";

test("x-pathname: el del cliente nunca llega al server, en ninguna rama que deja pasar", async () => {
  const tok = await createSessionToken("u1");
  const op = await createOperatorToken();
  const rutas = ["/", "/admin", "/admin/caja", "/admin/login", "/admin/login/pin", "/operador/login",
    "/operador/login/ingresar", "/operador/clave", "/operador/x", "/contador", "/facturita/app", "/tienda", "/api/x"];
  let pasaron = 0;
  for (const ruta of rutas) {
    const req = new NextRequest(`https://x.test${ruta}`, { headers: { "x-pathname": "/EVIL" } });
    req.cookies.set(getSessionCookieName(), tok);
    req.cookies.set(getOperatorCookieName(), op);
    const r = await proxy(req);
    if (r.status >= 300) continue;
    pasaron++;
    assert.equal(r.headers.get("x-middleware-request-x-pathname"), ruta, ruta);
    assert.ok(r.headers.get("x-middleware-override-headers")?.includes("x-pathname"), ruta);
  }
  assert.equal(pasaron, rutas.length);
});

test("matcher: las superficies sensibles pasan por el proxy aunque terminen en extensión", () => {
  const coincide = getMiddlewareRouteMatcher(getMiddlewareMatchers(config.matcher, {}));
  const corre = (p: string) => coincide(p, { headers: {}, cookies: {}, query: {} } as never, {});
  for (const base of ["/admin", "/operador", "/contador", "/facturita/app", "/api", "/club-crudo", "/previews/breakpoint/club"])
    for (const ext of ["png", "txt", "xml", "svg", "ico", "woff2", "jpg"]) {
      assert.ok(corre(`${base}/x.${ext}`), `${base}/x.${ext}`);
      assert.ok(corre(`${base}/a/b/x.${ext}`), `${base}/a/b/x.${ext}`);
    }
  for (const p of ["/admin", "/operador", "/api/health", "/", "/tienda"]) assert.ok(corre(p), p);
  // Los estáticos de afuera siguen sin pasar (latencia).
  for (const p of ["/logo.png", "/robots.txt", "/_next/static/x.js", "/favicon.ico", "/img/a.webp"]) assert.ok(!corre(p), p);
});

test("acceso: `next` sólo acepta rutas internas", () => {
  for (const malo of ["/\\evil.com", "\\\\evil.com", "//evil.com", "https://evil.com", "/\t/evil.com", "/\n/evil.com",
    "/%0a/x\u0000", "evil.com", "", "/\\/evil.com", "/.//evil.com", "/x/..//evil.com", "javascript:alert(1)", "/\u007f"])
    assert.equal(destinoInterno(malo), "/", JSON.stringify(malo));
  assert.equal(destinoInterno("/tienda"), "/tienda");
  assert.equal(destinoInterno("/tienda/x?a=1#b"), "/tienda/x?a=1#b");
  assert.equal(destinoInterno("/a/../b"), "/b");
});
