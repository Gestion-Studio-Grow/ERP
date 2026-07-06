import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter, loginKey } from "./rate-limit";

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
