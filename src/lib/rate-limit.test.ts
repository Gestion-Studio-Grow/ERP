import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRateLimiter,
  loginKey,
  publicApiKey,
  clientIpFromRequest,
  checkPublicApiRate,
  PUBLIC_API_RULE,
} from "./rate-limit";

test("no bloquea por debajo del máximo", () => {
  const rl = createRateLimiter({ max: 3, windowMs: 1000 }, () => 0);
  rl.fail("k");
  rl.fail("k");
  assert.equal(rl.blocked("k"), false);
});

test("bloquea al alcanzar el máximo de fallos en la ventana", () => {
  const rl = createRateLimiter({ max: 3, windowMs: 1000 }, () => 0);
  rl.fail("k");
  rl.fail("k");
  rl.fail("k");
  assert.equal(rl.blocked("k"), true);
});

test("la ventana deslizante libera los intentos viejos", () => {
  let t = 0;
  const rl = createRateLimiter({ max: 2, windowMs: 1000 }, () => t);
  rl.fail("k"); // t=0
  t = 500;
  rl.fail("k"); // t=500 → 2 en ventana → bloqueado
  assert.equal(rl.blocked("k"), true);
  t = 1001; // el primero (t=0) sale de la ventana
  assert.equal(rl.blocked("k"), false);
});

test("reset limpia los fallos (login exitoso)", () => {
  const rl = createRateLimiter({ max: 2, windowMs: 1000 }, () => 0);
  rl.fail("k");
  rl.fail("k");
  assert.equal(rl.blocked("k"), true);
  rl.reset("k");
  assert.equal(rl.blocked("k"), false);
});

test("las claves son independientes entre sí", () => {
  const rl = createRateLimiter({ max: 1, windowMs: 1000 }, () => 0);
  rl.fail("a");
  assert.equal(rl.blocked("a"), true);
  assert.equal(rl.blocked("b"), false);
});

test("retryAfterMs cuenta desde el fallo más viejo de la ventana", () => {
  let t = 0;
  const rl = createRateLimiter({ max: 2, windowMs: 1000 }, () => t);
  rl.fail("k"); // t=0
  t = 300;
  rl.fail("k"); // t=300 → bloqueado; el más viejo es t=0
  assert.equal(rl.retryAfterMs("k"), 700); // 1000 - (300 - 0)
  assert.equal(rl.retryAfterMs("libre"), 0);
});

test("loginKey separa plano y usa la IP", () => {
  assert.equal(loginKey("admin", "1.2.3.4"), "admin-login:1.2.3.4");
  assert.equal(loginKey("operator", "1.2.3.4"), "operator-login:1.2.3.4");
});

test("publicApiKey prefija la IP", () => {
  assert.equal(publicApiKey("1.2.3.4"), "public-api:1.2.3.4");
});

test("clientIpFromRequest toma la primera IP de x-forwarded-for", () => {
  const req = new Request("https://x/api", {
    headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" },
  });
  assert.equal(clientIpFromRequest(req), "9.9.9.9");
});

test("clientIpFromRequest cae a x-real-ip y luego a 'unknown'", () => {
  const withReal = new Request("https://x/api", { headers: { "x-real-ip": "8.8.8.8" } });
  assert.equal(clientIpFromRequest(withReal), "8.8.8.8");
  const withNone = new Request("https://x/api");
  assert.equal(clientIpFromRequest(withNone), "unknown");
});

test("checkPublicApiRate deja pasar hasta el límite y luego devuelve Retry-After", () => {
  // IP única por test: el limitador es un singleton por proceso.
  const ip = "203.0.113.1";
  for (let i = 0; i < PUBLIC_API_RULE.max; i++) {
    assert.equal(checkPublicApiRate(ip), null, `hit ${i + 1} debería pasar`);
  }
  const retry = checkPublicApiRate(ip);
  assert.notEqual(retry, null);
  assert.ok((retry as number) > 0 && (retry as number) <= 60);
});

test("checkPublicApiRate aísla por IP", () => {
  const ip = "203.0.113.2";
  for (let i = 0; i < PUBLIC_API_RULE.max; i++) checkPublicApiRate(ip);
  assert.notEqual(checkPublicApiRate(ip), null); // bloqueada
  assert.equal(checkPublicApiRate("203.0.113.3"), null); // otra IP libre
});
