// «Ver todo» / «Volver al modo simple» (route.ts): la vuelta es RELATIVA, para que el navegador quede
// en el subdominio del negocio. Con un origen absoluto, `next start` mandaba a `localhost` y se perdía
// la sesión (QA clic por clic del modo simple, 06/11/2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { COOKIE_VER_TODO } from "@/lib/modo-simple";

const pedido = (q: string) =>
  new NextRequest(`http://localhost:3000/admin/modo-completo${q}`, { headers: { host: "chestetica.localhost:3000" } });

test("Ver todo: 303 a la ruta del panel, relativa (no cambia de host), y prende la cookie de sesión", () => {
  const res = GET(pedido("?volver=%2Fadmin%2Fturnos%3Fturno%3Dabc"));
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "/admin/turnos?turno=abc");
  const c = res.cookies.get(COOKIE_VER_TODO);
  assert.equal(c?.value, "1");
  assert.equal(c?.httpOnly, true);
  assert.equal(c?.maxAge, undefined);
});

test("Volver al modo simple: borra la cookie y vuelve relativo", () => {
  const res = GET(pedido("?simple=1&volver=%2Fadmin"));
  assert.equal(res.headers.get("location"), "/admin");
  assert.equal(res.cookies.get(COOKIE_VER_TODO)?.value, "");
});

test("destino ajeno (redirección abierta): siempre al Inicio del panel", () => {
  for (const malo of ["https://otro.com", "//otro.com/admin", "/admin//otro.com", "/\\otro.com"]) {
    assert.equal(GET(pedido(`?volver=${encodeURIComponent(malo)}`)).headers.get("location"), "/admin", malo);
  }
});
