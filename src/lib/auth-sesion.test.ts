// SEGURIDAD (08/11/2026): la sesión del panel se decide EN EL SERVIDOR con la última actividad firmada.
//
// Antes el token era `userId.HMAC(userId)`, sin fecha: el mismo token copiado entraba para siempre (operación real de
// CH, paso 15). Después (primera versión de #50) vencía a las 8 h fijas. Orden del dueño del 08/11: la cuenta no vence;
// el uso renueva la sesión; con 15 min sin uso se pide el PIN y con 7 días, la contraseña.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import {
  authSecret,
  createSessionToken,
  getSessionCookieName,
  INACTIVIDAD_BLOQUEO_MS,
  INACTIVIDAD_VENCE_MS,
  leerSesion,
  readSessionToken,
  RENOVAR_SESION_CADA_MS,
  sesionParaRenovar,
  VIDA_COOKIE_SESION_S,
} from "./auth";
import { proxy } from "@/proxy";

const UID = "cmf1recepcionista000001";
const MIN = 60 * 1000;
const DIA = 24 * 60 * MIN;

/** Un token del formato viejo, firmado como lo firmaba producción hasta hoy. */
const tokenViejo = (userId: string) => `${userId}.${createHmac("sha256", authSecret()).update(userId).digest("hex")}`;
const firmar = (payload: string, prefijo: string) => createHmac("sha256", authSecret()).update(prefijo + payload).digest("hex");

test("constantes del dueño: 15 min bloquea, 7 días vence, se reemite cada 5 min, la cookie dura 7 días", () => {
  assert.equal(INACTIVIDAD_BLOQUEO_MS, 15 * MIN);
  assert.equal(INACTIVIDAD_VENCE_MS, 7 * DIA);
  assert.equal(RENOVAR_SESION_CADA_MS, 5 * MIN);
  assert.equal(VIDA_COOKIE_SESION_S, 7 * 24 * 60 * 60);
});

test("un token recién emitido vale y devuelve el userId", async () => {
  assert.equal(await readSessionToken(await createSessionToken(UID)), UID);
});

test("estados por tiempo sin uso: activa < 15 min ≤ bloqueada < 7 días ≤ vencida", async () => {
  const ahora = Date.now();
  const t = await createSessionToken(UID, ahora);
  assert.equal((await leerSesion(t, { ahora: ahora + 15 * MIN - 1 }))?.estado, "activa");
  assert.equal((await leerSesion(t, { ahora: ahora + 15 * MIN }))?.estado, "bloqueada");
  assert.equal((await leerSesion(t, { ahora: ahora + 7 * DIA - 1 }))?.estado, "bloqueada");
  assert.equal((await leerSesion(t, { ahora: ahora + 7 * DIA }))?.estado, "vencida");
  // La cuenta no vence: un token de hace un año, si se usó hace 1 min, sigue activo.
  const viejoPeroUsado = await createSessionToken(UID, ahora - MIN, ahora - 365 * DIA);
  assert.equal(await readSessionToken(viejoPeroUsado, { ahora }), UID);
});

test("ATAQUE: una sesión bloqueada o vencida no abre nada (readSessionToken → null)", async () => {
  const ahora = Date.now();
  assert.equal(await readSessionToken(await createSessionToken(UID, ahora - 16 * MIN), { ahora }), null);
  assert.equal(await readSessionToken(await createSessionToken(UID, ahora - 8 * DIA), { ahora }), null);
});

test("ATAQUE: actividad estirada a mano rompe la firma; ingreso posterior a la actividad no vale", async () => {
  const ahora = Date.now();
  const t = await createSessionToken(UID, ahora - 20 * MIN);
  const [payload, firma] = t.split(".");
  const partes = payload.split("|");
  partes[3] = String(ahora).padStart(13, "0");
  assert.equal(await leerSesion(`${partes.join("|")}.${firma}`, { ahora }), null);
  const invertido = `v3|${UID}|${String(ahora).padStart(13, "0")}|${String(ahora - MIN).padStart(13, "0")}`;
  assert.equal(await leerSesion(`${invertido}.${firmar(invertido, "gsg-sesion-v3|")}`, { ahora }), null);
  await assert.rejects(createSessionToken(UID, ahora - MIN, ahora));
});

test("ATAQUE: actividad en el futuro no vale (más de 60 s); con 30 s de reloj corrido, sí", async () => {
  const ahora = Date.now();
  assert.equal(await readSessionToken(await createSessionToken(UID, ahora + 10 * MIN), { ahora }), null);
  assert.equal(await readSessionToken(await createSessionToken(UID, ahora + 30_000), { ahora }), UID);
});

test("ATAQUE: firmas de otro formato no sirven (v2 de la primera versión, firma sin prefijo de dominio)", async () => {
  const ahora = Date.now();
  const v2 = `v2|${UID}|${String(ahora).padStart(13, "0")}|${String(ahora + 8 * 60 * MIN).padStart(13, "0")}`;
  assert.equal(await readSessionToken(`${v2}.${firmar(v2, "gsg-sesion-v2|")}`, { ahora }), null);
  const v3 = `v3|${UID}|${String(ahora).padStart(13, "0")}|${String(ahora).padStart(13, "0")}`;
  assert.equal(await readSessionToken(`${v3}.${firmar(v3, "")}`, { ahora }), null);
  assert.equal(await readSessionToken(`${v3}.${firmar(v3, "gsg-sesion-v3|")}`, { ahora }), UID);
});

test("el formato viejo (sin fecha) no abre nada, de nadie", async () => {
  const viejo = tokenViejo(UID);
  assert.equal(await readSessionToken(viejo), null);
  assert.equal(await readSessionToken(viejo, { ahora: 0 }), null);
});

test("ids con separadores se rechazan al firmar", async () => {
  await assert.rejects(createSessionToken("a|b"));
  await assert.rejects(createSessionToken("a.b"));
  await assert.rejects(createSessionToken(""));
});

test("se renueva sólo una sesión activa con 5 min o más desde la última actividad firmada", async () => {
  const ahora = Date.now();
  const de = async (hace: number) => leerSesion(await createSessionToken(UID, ahora - hace), { ahora });
  assert.equal(sesionParaRenovar(await de(4 * MIN), ahora), false);
  assert.equal(sesionParaRenovar(await de(5 * MIN), ahora), true);
  assert.equal(sesionParaRenovar(await de(16 * MIN), ahora), false, "bloqueada: no se renueva, pide PIN");
  assert.equal(sesionParaRenovar(null, ahora), false);
});

test("PROXY: con 5 min o más sin reemitir, deja pasar y reemite la cookie con la actividad en ahora y el mismo ingreso", async () => {
  const ahora = Date.now();
  const ingreso = ahora - 3 * DIA;
  const req = new NextRequest("https://app.test/admin/caja");
  req.cookies.set(getSessionCookieName(), await createSessionToken(UID, ahora - 6 * MIN, ingreso));
  const res = await proxy(req);
  assert.equal(res.status, 200);
  const nuevo = res.cookies.get(getSessionCookieName());
  assert.ok(nuevo, "reemite la cookie");
  assert.equal(nuevo!.httpOnly, true);
  assert.equal(nuevo!.path, "/");
  assert.equal(nuevo!.maxAge, VIDA_COOKIE_SESION_S);
  const leida = await leerSesion(nuevo!.value);
  assert.equal(leida?.userId, UID);
  assert.equal(leida?.ingreso, ingreso);
  assert.ok(leida!.actividad >= ahora);
  // Con menos de 5 min no se toca la cookie.
  const req2 = new NextRequest("https://app.test/admin/caja");
  req2.cookies.set(getSessionCookieName(), await createSessionToken(UID, ahora - 2 * MIN));
  const res2 = await proxy(req2);
  assert.equal(res2.status, 200);
  assert.equal(res2.cookies.get(getSessionCookieName()), undefined);
});

test("PROXY: 15 min sin uso → a la pantalla del PIN, con a dónde iba; también en POST", async () => {
  for (const method of ["GET", "POST"]) {
    const req = new NextRequest("https://app.test/admin/caja", { method });
    req.cookies.set(getSessionCookieName(), await createSessionToken(UID, Date.now() - 20 * MIN));
    const res = await proxy(req);
    assert.equal(res.status, 307);
    const destino = new URL(res.headers.get("location")!);
    assert.equal(destino.pathname, "/admin/login/desbloquear");
    assert.equal(destino.searchParams.get("next"), "/admin/caja");
    assert.equal(res.cookies.get(getSessionCookieName()), undefined, "no reemite una sesión bloqueada");
  }
});

test("PROXY: con 7 días sin uso, /admin manda al login diciendo que la sesión venció", async () => {
  const req = new NextRequest("https://app.test/admin/caja");
  req.cookies.set(getSessionCookieName(), await createSessionToken(UID, Date.now() - 7 * DIA - 1000));
  const res = await proxy(req);
  assert.equal(res.status, 307);
  const destino = new URL(res.headers.get("location")!);
  assert.equal(destino.pathname, "/admin/login");
  assert.equal(destino.searchParams.get("error"), "vencida");
  assert.equal(destino.searchParams.get("next"), "/admin/caja");
});

test("PROXY: sin cookie, al login sin aviso de vencimiento; con token vigente, pasa", async () => {
  const sin = await proxy(new NextRequest("https://app.test/admin"));
  assert.equal(new URL(sin.headers.get("location")!).searchParams.get("error"), null);
  const req = new NextRequest("https://app.test/admin");
  req.cookies.set(getSessionCookieName(), await createSessionToken(UID));
  const ok = await proxy(req);
  assert.equal(ok.status, 200);
});

test("PROXY: el token viejo con firma válida no pasa: va a canjearse (GET) o al login (POST)", async () => {
  const get = new NextRequest("https://app.test/admin/caja");
  get.cookies.set(getSessionCookieName(), tokenViejo(UID));
  const res = await proxy(get);
  assert.equal(res.status, 307);
  const destino = new URL(res.headers.get("location")!);
  assert.equal(destino.pathname, "/admin/login/renovar");
  assert.equal(destino.searchParams.get("next"), "/admin/caja");
  const post = new NextRequest("https://app.test/admin/caja", { method: "POST" });
  post.cookies.set(getSessionCookieName(), tokenViejo(UID));
  const r2 = await proxy(post);
  assert.equal(new URL(r2.headers.get("location")!).pathname, "/admin/login");
  // Firma mala: directo al login, sin pasar por el canje.
  const mala = new NextRequest("https://app.test/admin");
  mala.cookies.set(getSessionCookieName(), `${UID}.${"0".repeat(64)}`);
  const r3 = await proxy(mala);
  assert.equal(new URL(r3.headers.get("location")!).pathname, "/admin/login");
  assert.equal(new URL(r3.headers.get("location")!).searchParams.get("error"), "vencida");
});

test("ATAQUE: con `ahora` NaN la sesión falla cerrada (viejo y v3)", async () => {
  assert.equal(await readSessionToken(tokenViejo(UID), { ahora: NaN }), null);
  assert.equal(await readSessionToken(await createSessionToken(UID), { ahora: NaN }), null);
});
