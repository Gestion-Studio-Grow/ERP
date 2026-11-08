// SEGURIDAD (08/11/2026): la sesión del panel vence EN EL SERVIDOR.
//
// Antes el token era `userId.HMAC(userId)`, sin fecha: la cookie duraba 8 h en el navegador, pero el
// mismo token copiado seguía entrando para siempre (operación real de CH, paso 15: a las 23:30
// seguía abriendo /admin/turnos). Estos tests fallan con el formato viejo y pasan con el nuevo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import {
  authSecret,
  createSessionToken,
  getSessionCookieName,
  readSessionToken,
  VIGENCIA_SESION_MS,
} from "./auth";
import { proxy } from "@/proxy";

const UID = "cmf1recepcionista000001";
const HORA = 60 * 60 * 1000;

/** Un token del formato viejo, firmado como lo firmaba producción hasta hoy. */
const tokenViejo = (userId: string) => `${userId}.${createHmac("sha256", authSecret()).update(userId).digest("hex")}`;

test("un token recién emitido vale y devuelve el userId", async () => {
  assert.equal(await readSessionToken(await createSessionToken(UID)), UID);
});

test("el token lleva emisión y vencimiento: dos ingresos en momentos distintos dan tokens distintos", async () => {
  const a = await createSessionToken(UID, Date.now() - 1100);
  const b = await createSessionToken(UID);
  assert.notEqual(a, b);
  assert.match(b, /^v2\|cmf1recepcionista000001\|\d{13}\|\d{13}\.[0-9a-f]{64}$/);
});

test("ATAQUE: un token de hace 8 h + 1 s ya no entra (el servidor lo vence, no sólo el navegador)", async () => {
  const viejo = await createSessionToken(UID, Date.now() - VIGENCIA_SESION_MS - 1000);
  assert.equal(await readSessionToken(viejo), null);
});

test("un token de hace 7 h 59 min todavía vale (el turno de 8 h no se corta antes)", async () => {
  const casi = await createSessionToken(UID, Date.now() - VIGENCIA_SESION_MS + 60_000);
  assert.equal(await readSessionToken(casi), UID);
});

test("ATAQUE: estirar el vencimiento dentro del token rompe la firma", async () => {
  const t = await createSessionToken(UID, Date.now() - 7 * HORA);
  const [payload, firma] = [t.slice(0, t.lastIndexOf(".")), t.slice(t.lastIndexOf(".") + 1)];
  const partes = payload.split("|");
  partes[3] = String(Number(partes[3]) + 30 * 24 * HORA);
  assert.equal(await readSessionToken(`${partes.join("|")}.${firma}`), null);
  // Y cambiar el usuario, también.
  partes[1] = "otro_usuario";
  assert.equal(await readSessionToken(`${partes.join("|")}.${firma}`), null);
});

test("ATAQUE: un token emitido en el futuro (reloj adelantado a mano) no vale; 30 s de diferencia sí", async () => {
  assert.equal(await readSessionToken(await createSessionToken(UID, Date.now() + 10 * 60_000)), null);
  assert.equal(await readSessionToken(await createSessionToken(UID, Date.now() + 30_000)), UID);
});

test("ATAQUE: la firma del formato viejo no sirve para el nuevo (prefijo de dominio)", async () => {
  // Alguien con un token viejo válido de un payload con forma nueva no lo puede presentar como nuevo.
  const ahora = Date.now();
  const payload = `v2|${UID}|${ahora}|${ahora + VIGENCIA_SESION_MS}`;
  const forjado = `${payload}.${createHmac("sha256", authSecret()).update(payload).digest("hex")}`;
  assert.equal(await readSessionToken(forjado), null);
});

test("SIN TRANSICIÓN (orden del dueño, 08/11): el token viejo de cualquiera no abre nada, hoy y siempre", async () => {
  const viejo = tokenViejo(UID);
  assert.equal(await readSessionToken(viejo), null);
  assert.equal(await readSessionToken(viejo, { ahora: Date.UTC(2026, 10, 8, 12) }), null);
  assert.equal(await readSessionToken(viejo, { ahora: 0 }), null);
});

test("no se firma un id con separadores", async () => {
  await assert.rejects(createSessionToken("a|b"));
  await assert.rejects(createSessionToken("a.b"));
  await assert.rejects(createSessionToken(""));
});

test("PROXY: con un token vencido, /admin manda al login diciendo que la sesión venció", async () => {
  const req = new NextRequest("https://app.test/admin/caja");
  req.cookies.set(getSessionCookieName(), await createSessionToken(UID, Date.now() - VIGENCIA_SESION_MS - 1000));
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

test("ATAQUE: con `ahora` NaN la sesión falla cerrada (v1 y v2)", async () => {
  assert.equal(await readSessionToken(tokenViejo(UID), { ahora: NaN }), null);
  assert.equal(await readSessionToken(await createSessionToken(UID), { ahora: NaN }), null);
});
