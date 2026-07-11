import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { getOperatorCookieName, createOperatorToken } from "@/lib/operator-auth";

// Regresión de SEGURIDAD (auditoría fiscal): el panel del contador muestra cartera
// CROSS-TENANT. Antes vivía en `/contador` (top-level, sin guard) → públicamente
// accesible en prod. Ahora vive bajo `/operador/(console)/contador`, gateado por el
// portón del proxy (matcher `/operador/:path*`). Estos tests prueban ese portón
// SOBRE la ruta real del contador — si alguien vuelve a exponerla, rompe.

const CONTADOR_URL = "https://app.test/operador/contador";

test("guard /contador: sin sesión de operador → redirect a /operador/login", async () => {
  const req = new NextRequest(CONTADOR_URL);
  const res = await proxy(req);

  assert.equal(res.status, 307, "debe redirigir (no 200/next)");
  const location = res.headers.get("location");
  assert.ok(location, "debe traer header Location");
  const loc = new URL(location!);
  assert.equal(loc.pathname, "/operador/login");
  assert.equal(loc.searchParams.get("next"), "/operador/contador");
});

test("guard /contador: cookie de operador tampereada → redirect a login", async () => {
  const req = new NextRequest(CONTADOR_URL);
  req.cookies.set(getOperatorCookieName(), "operator.deadbeef");
  const res = await proxy(req);

  assert.equal(res.status, 307);
  assert.equal(new URL(res.headers.get("location")!).pathname, "/operador/login");
});

test("guard /contador: con sesión de operador válida → pasa (NextResponse.next)", async () => {
  const token = await createOperatorToken();
  const req = new NextRequest(CONTADOR_URL);
  req.cookies.set(getOperatorCookieName(), token);
  const res = await proxy(req);

  // NextResponse.next() no redirige: sin Location y status 200.
  assert.equal(res.status, 200, "operador autenticado debe pasar el portón");
  assert.equal(res.headers.get("location"), null);
});

test("el matcher del proxy cubre /operador/* (regresión de configuración)", async () => {
  const { config } = await import("@/proxy");
  assert.ok(
    config.matcher.includes("/operador/:path*"),
    "el matcher debe gatear todo /operador/* — incluido /operador/contador",
  );
});
