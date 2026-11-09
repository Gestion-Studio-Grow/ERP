// CERTIFICACIÓN GSG-SEG-004 (09/11/2026), hallazgo ALTO: el chip de pedidos nuevos y la bandeja consultan al servidor
// solos cada 45 s con la pestaña visible, y el proxy tomaba esas consultas como «uso» y reemitía la cookie. Una PC de
// caja abandonada con el panel abierto NUNCA llegaba a los 15 min sin uso: el PIN no se pedía nunca. Ahora el
// navegador mide el uso REAL (teclado, mouse, toque) y, a los 15 min sin uso, el servidor deja la cookie bloqueada.

import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createSessionToken, getSessionCookieName, INACTIVIDAD_BLOQUEO_MS, INACTIVIDAD_VENCE_MS, leerSesion, tokenBloqueadoDe } from "./auth";
import { debeBloquearPorInactividad, ultimoUsoMasReciente } from "./sesion-vigia";
import { POST as bloquear } from "@/app/admin/login/bloquear/route";
import { proxy } from "@/proxy";

const UID = "cmf1cajera0000000000001";
const MIN = 60 * 1000;

test("tokenBloqueadoDe: una sesión activa (recién renovada por un sondeo) queda BLOQUEADA, mismo usuario, ingreso no mayor", async () => {
  const ahora = Date.now();
  const token = await createSessionToken(UID, ahora - 1000, ahora - 2 * MIN);
  const nuevo = await tokenBloqueadoDe(token, ahora);
  assert.ok(nuevo);
  const s = await leerSesion(nuevo, { ahora });
  assert.equal(s?.estado, "bloqueada");
  assert.equal(s?.userId, UID);
  assert.ok(s!.ingreso <= s!.actividad);
  // El ingreso queda viejo: con la sesión destrabada por PIN no se puede plantar otro PIN.
  assert.ok(ahora - s!.ingreso >= INACTIVIDAD_BLOQUEO_MS);
});

test("tokenBloqueadoDe: bloqueada sigue bloqueada (no rejuvenece); vencida, ajena o basura → null", async () => {
  const ahora = Date.now();
  const bloq = await createSessionToken(UID, ahora - 3 * 60 * MIN, ahora - 4 * 60 * MIN);
  const s = await leerSesion(await tokenBloqueadoDe(bloq, ahora), { ahora });
  assert.equal(s?.estado, "bloqueada");
  assert.equal(s?.actividad, ahora - 3 * 60 * MIN, "no le estira la vida");
  assert.equal(await tokenBloqueadoDe(await createSessionToken(UID, ahora - INACTIVIDAD_VENCE_MS - MIN), ahora), null);
  assert.equal(await tokenBloqueadoDe("v3|x|0|0.firma", ahora), null);
  assert.equal(await tokenBloqueadoDe(undefined, ahora), null);
});

test("debeBloquearPorInactividad: 15 min sin teclado/mouse/toque, aunque haya sondeos", () => {
  const ahora = 1_800_000_000_000;
  assert.equal(debeBloquearPorInactividad(ahora - INACTIVIDAD_BLOQUEO_MS + 1000, ahora), false);
  assert.equal(debeBloquearPorInactividad(ahora - INACTIVIDAD_BLOQUEO_MS, ahora), true);
  assert.equal(debeBloquearPorInactividad(Number.NaN, ahora), true, "falla cerrada");
  // El uso en otra pestaña del mismo navegador cuenta (si no, una pestaña quieta bloquea a la que se usa).
  assert.equal(ultimoUsoMasReciente(ahora - 20 * MIN, "" + (ahora - MIN), ahora), ahora - MIN);
  assert.equal(ultimoUsoMasReciente(ahora - 20 * MIN, null, ahora), ahora - 20 * MIN);
  assert.equal(ultimoUsoMasReciente(ahora - 20 * MIN, "basura", ahora), ahora - 20 * MIN);
  // Una fecha futura en el almacenamiento (manipulada) no extiende la sesión.
  assert.equal(ultimoUsoMasReciente(ahora - 20 * MIN, "" + (ahora + 60 * MIN), ahora), ahora - 20 * MIN);
});

test("POST /admin/login/bloquear: la cookie queda bloqueada y el proxy manda al PIN aunque el sondeo la haya renovado", async () => {
  const ahora = Date.now();
  const req = new NextRequest("https://app.test/admin/login/bloquear", { method: "POST" });
  req.cookies.set(getSessionCookieName(), await createSessionToken(UID, ahora - 10_000, ahora - 20 * MIN));
  const res = await bloquear(req);
  assert.equal(res.status, 204);
  const cookie = res.cookies.get(getSessionCookieName());
  assert.ok(cookie, "reemite la cookie");
  assert.equal(cookie!.httpOnly, true);
  assert.equal((await leerSesion(cookie!.value))?.estado, "bloqueada");

  const sig = new NextRequest("https://app.test/admin/caja", { method: "POST" });
  sig.cookies.set(getSessionCookieName(), cookie!.value);
  const r = await proxy(sig);
  assert.equal(r.status, 307);
  assert.match(r.headers.get("location") ?? "", /\/admin\/login\/desbloquear/);
});

test("POST /admin/login/bloquear sin sesión válida: no escribe cookie", async () => {
  const req = new NextRequest("https://app.test/admin/login/bloquear", { method: "POST" });
  req.cookies.set(getSessionCookieName(), "cualquier.cosa");
  const res = await bloquear(req);
  assert.equal(res.status, 204);
  assert.equal(res.cookies.get(getSessionCookieName()), undefined);
});
