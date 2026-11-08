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
  finDeLaTransicion,
  getSessionCookieName,
  readSessionToken,
  TOPE_DE_LA_TRANSICION,
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
  assert.equal(await readSessionToken(forjado, { legadoHasta: ahora + HORA }), null);
});

test("TRANSICIÓN: el token viejo vale sólo hasta el fin de la transición, y nunca sin marca de build", async () => {
  const viejo = tokenViejo(UID);
  const ahora = Date.now();
  // Durante la transición (quien estaba trabajando al publicar sigue).
  assert.equal(await readSessionToken(viejo, { ahora, legadoHasta: ahora + HORA }), UID);
  // Pasada la transición, el mismo token (vigente o copiado) ya no abre nada.
  assert.equal(await readSessionToken(viejo, { ahora, legadoHasta: ahora }), null);
  assert.equal(await readSessionToken(viejo, { ahora: ahora + 2 * HORA, legadoHasta: ahora + HORA }), null);
  // Sin marca de build (desarrollo, tests): falla cerrado.
  assert.equal(finDeLaTransicion(undefined), 0);
  assert.equal(await readSessionToken(viejo, { legadoHasta: finDeLaTransicion(undefined) }), null);
});

test("TRANSICIÓN: fin = build + 9 h, nunca después del tope fijo", () => {
  const build = Date.UTC(2026, 10, 9, 12, 0, 0);
  assert.equal(finDeLaTransicion(String(build)), build + 9 * HORA);
  assert.equal(finDeLaTransicion(String(TOPE_DE_LA_TRANSICION + HORA)), TOPE_DE_LA_TRANSICION);
  assert.equal(finDeLaTransicion("no-es-un-numero"), 0);
});

test("ATAQUE: en la transición, un payload viejo que no es un id (con | o vacío) no vale", async () => {
  const ahora = Date.now();
  for (const raro of ["op|d|duenio|1700000000000", "a b", "x/../y"]) {
    assert.equal(await readSessionToken(tokenViejo(raro), { ahora, legadoHasta: ahora + HORA }), null, raro);
  }
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

test("PROXY: el token viejo (sin vencimiento) ya no pasa fuera de la transición", async () => {
  const req = new NextRequest("https://app.test/admin");
  req.cookies.set(getSessionCookieName(), tokenViejo(UID));
  const res = await proxy(req);
  assert.equal(res.status, 307);
  assert.equal(new URL(res.headers.get("location")!).searchParams.get("error"), "vencida");
});
