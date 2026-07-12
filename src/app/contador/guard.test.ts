import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { getSessionCookieName, createSessionToken } from "@/lib/auth";

// Regresión de SEGURIDAD (auditoría fiscal): el panel del contador (/contador)
// muestra cartera CROSS-TENANT. Vive FUERA de `/admin` pero es una superficie de
// TENANT del producto CONTADOR (módulo CARTERA). Antes NO estaba en el matcher del
// proxy → respondía 200 SIN SESIÓN en prod (públicamente accesible). Ahora `/contador`
// está en el matcher (`/contador/:path*`) y lo gatea el portón grueso de tenant.
// El chequeo fino (capability `cartera:manage` + módulo `cartera` asignado) sigue
// server-side en la página y en cada Server Action (cartera-actions.ts). Si alguien
// vuelve a sacar `/contador` del matcher, estos tests rompen.

const CONTADOR_URL = "https://app.test/contador";

test("guard /contador: sin sesión → redirect a /admin/login", async () => {
  const req = new NextRequest(CONTADOR_URL);
  const res = await proxy(req);

  assert.equal(res.status, 307, "debe redirigir (no 200/next)");
  const location = res.headers.get("location");
  assert.ok(location, "debe traer header Location");
  const loc = new URL(location!);
  assert.equal(loc.pathname, "/admin/login");
  assert.equal(loc.searchParams.get("next"), "/contador");
});

test("guard /contador: cookie de sesión tampereada → redirect a login", async () => {
  const req = new NextRequest(CONTADOR_URL);
  req.cookies.set(getSessionCookieName(), "session.deadbeef");
  const res = await proxy(req);

  assert.equal(res.status, 307);
  assert.equal(new URL(res.headers.get("location")!).pathname, "/admin/login");
});

test("guard /contador: con sesión de tenant válida → pasa (NextResponse.next)", async () => {
  const token = await createSessionToken("user-test");
  const req = new NextRequest(CONTADOR_URL);
  req.cookies.set(getSessionCookieName(), token);
  const res = await proxy(req);

  // NextResponse.next() no redirige: sin Location y status 200. El chequeo fino
  // (capability + módulo) lo hace la página/action, no el portón grueso.
  assert.equal(res.status, 200, "sesión de tenant válida debe pasar el portón");
  assert.equal(res.headers.get("location"), null);
});

test("el matcher del proxy cubre /contador (regresión de configuración)", async () => {
  const { config } = await import("@/proxy");
  assert.ok(
    config.matcher.includes("/contador/:path*"),
    "el matcher debe gatear /contador — si no, el panel cross-tenant queda expuesto",
  );
});
