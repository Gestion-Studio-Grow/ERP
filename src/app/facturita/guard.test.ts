import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { getSessionCookieName, createSessionToken } from "@/lib/auth";

// La app de Facturita pasa por el portón grueso de tenant, como /admin y /contador. La vidriera,
// el alta, los planes, el manifiesto y el service worker NO: el navegador los baja sin cookies.

for (const ruta of ["/facturita/app", "/facturita/app/facturas", "/facturita/app/cuenta"]) {
  test(`guard ${ruta}: sin sesión → redirect a /admin/login`, async () => {
    const res = await proxy(new NextRequest(`https://app.test${ruta}`));
    assert.equal(res.status, 307);
    const loc = new URL(res.headers.get("location")!);
    assert.equal(loc.pathname, "/admin/login");
    assert.equal(loc.searchParams.get("next"), ruta);
  });
}

test("guard /facturita/app: con sesión válida → pasa", async () => {
  const req = new NextRequest("https://app.test/facturita/app");
  req.cookies.set(getSessionCookieName(), await createSessionToken("user-test"));
  const res = await proxy(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("location"), null);
});

for (const ruta of ["/facturita", "/facturita/alta", "/facturita/planes", "/facturita/manifest.webmanifest", "/facturita/sw.js", "/facturita/sin-conexion.html", "/facturita/aplicacion"]) {
  test(`${ruta} sigue público sin sesión`, async () => {
    const res = await proxy(new NextRequest(`https://app.test${ruta}`));
    assert.equal(res.headers.get("location"), null, `${ruta} no debe redirigir al login`);
  });
}
