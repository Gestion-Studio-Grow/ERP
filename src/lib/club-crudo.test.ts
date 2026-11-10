// SEGURIDAD (GSG-SEG-002, 08/11/2026): el club crudo de Break Point (public/previews/breakpoint/club) se abría con
// un token válido de CUALQUIER negocio. Ahora el proxy lo reescribe a su manejador, que exige un usuario activo de
// breakpoint con el permiso del club (mismo criterio que /club). Estos tests fallan con el proxy anterior.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy, rutaDelClubCrudo } from "@/proxy";
import { createSessionToken, getSessionCookieName } from "./auth";
import { ARCHIVOS_DEL_CLUB_CRUDO, CARPETA_CLUB_CRUDO, PREFIJO_CLUB_CRUDO, responderClubCrudo } from "./club-crudo";
import { esUsuarioDelClubCrudo, type LecturasDelClubCrudo } from "./club-crudo.server";
import type { UsuarioConPermisos } from "./capabilities";
import { existsSync, readdirSync } from "node:fs";

const BREAKPOINT = "tenant-breakpoint";
const OTRO = "tenant-ch";
/** Usuarios por negocio: el dueño de breakpoint, el dueño de CH (otro negocio) y una recepcionista de breakpoint sin el permiso. */
const USUARIOS: Record<string, { tenantId: string; user: UsuarioConPermisos & { mustChangePassword: boolean } }> = {
  "duenio-bp": { tenantId: BREAKPOINT, user: { role: "OWNER", overrides: [], mustChangePassword: false } },
  "duenio-ch": { tenantId: OTRO, user: { role: "OWNER", overrides: [], mustChangePassword: false } },
  "recep-bp-sin-club": {
    tenantId: BREAKPOINT,
    user: { role: "RECEPTION", overrides: [{ capability: "agenda:manage", allowed: false }], mustChangePassword: false },
  },
};
const lecturas: LecturasDelClubCrudo = {
  negocioPorSlug: async (slug) => (slug === "breakpoint" ? BREAKPOINT : slug === "ch" ? OTRO : null),
  usuarioDelNegocio: async (userId, tenantId) => (USUARIOS[userId]?.tenantId === tenantId ? USUARIOS[userId].user : null),
};

test("ATAQUE: con un token válido de OTRO negocio, el proxy ya no deja pasar el archivo público del club", async () => {
  const req = new NextRequest("https://ch.gsgapp.com.ar/previews/breakpoint/club/app.mjs");
  req.cookies.set(getSessionCookieName(), await createSessionToken("duenio-ch"));
  const res = await proxy(req);
  // Antes: 200 «seguí» y Next servía el archivo de public/. Ahora: reescritura al manejador, que decide por negocio.
  const destino = res.headers.get("x-middleware-rewrite");
  assert.ok(destino, "el proxy tiene que reescribir al manejador, no dejar servir public/");
  assert.equal(new URL(destino).pathname, `${PREFIJO_CLUB_CRUDO}/app.mjs`);
  assert.equal(res.headers.get("x-middleware-next"), null);
});

test("ATAQUE: el manejador no sirve el club a un usuario de otro negocio (404); al dueño de breakpoint, sí", async () => {
  const leer = async () => new Uint8Array([65]);
  const para = (uid: string) => () => esUsuarioDelClubCrudo(uid, lecturas);
  assert.equal((await responderClubCrudo(["app.mjs"], leer, para("duenio-ch"))).status, 404);
  assert.equal((await responderClubCrudo(["index.html"], leer, para("recep-bp-sin-club"))).status, 404);
  assert.equal((await responderClubCrudo(["app.mjs"], leer, para("nadie"))).status, 404);
  const ok = await responderClubCrudo(["index.html"], leer, para("duenio-bp"));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "private, no-store");
  assert.match(ok.headers.get("content-type")!, /^text\/html/);
});

// GSG-SEG-013 vuelta 2 (refutador): con la contraseña provisoria pendiente de cambio, para el club crudo NO HAY
// SESIÓN, igual que `getCurrentUser()`. Antes la lectura ni siquiera traía `mustChangePassword` y el dueño pasaba.
test("ATAQUE: un OWNER de breakpoint con el cambio de contraseña pendiente no entra al club crudo", async () => {
  const conFlag: LecturasDelClubCrudo = {
    ...lecturas,
    usuarioDelNegocio: async () => ({ role: "OWNER", overrides: [], mustChangePassword: true }),
  };
  assert.equal(await esUsuarioDelClubCrudo("u1", conFlag), false);
  const leer = async () => new Uint8Array([65]);
  assert.equal((await responderClubCrudo(["index.html"], leer, () => esUsuarioDelClubCrudo("u1", conFlag))).status, 404);
  // Control: el mismo usuario con el cambio hecho, pasa.
  const sinFlag: LecturasDelClubCrudo = {
    ...lecturas,
    usuarioDelNegocio: async () => ({ role: "OWNER", overrides: [], mustChangePassword: false }),
  };
  assert.equal(await esUsuarioDelClubCrudo("u1", sinFlag), true);
});

test("esUsuarioDelClubCrudo: sin sesión, sin negocio breakpoint o si la lectura falla, cerrado", async () => {
  assert.equal(await esUsuarioDelClubCrudo(null, lecturas), false);
  assert.equal(await esUsuarioDelClubCrudo("duenio-bp", { ...lecturas, negocioPorSlug: async () => null }), false);
  const leer = async () => new Uint8Array([65]);
  const roto = () => Promise.reject(new Error("base caída"));
  assert.equal((await responderClubCrudo(["app.mjs"], leer, roto)).status, 404);
});

test("el manejador sólo sirve archivos del registro (nada de la URL llega al disco)", async () => {
  let leido = "";
  const leer = async (r: string) => ((leido = r), new Uint8Array([65]));
  const siempre = async () => true;
  for (const segs of [[], ["motor.mjs"], ["..", "turnero", "index.html"], ["sub", "app.mjs"], ["APP.mjs"], ["app.mjs/"]]) {
    assert.equal((await responderClubCrudo(segs, leer, siempre)).status, 404, JSON.stringify(segs));
  }
  assert.equal(leido, "");
  await responderClubCrudo(["studio.mjs"], leer, siempre);
  assert.equal(leido, `${CARPETA_CLUB_CRUDO}/studio.mjs`);
});

test("el registro cubre todos los archivos de la carpeta salvo el motor público", () => {
  assert.ok(existsSync(CARPETA_CLUB_CRUDO));
  const enDisco = readdirSync(CARPETA_CLUB_CRUDO).filter((f) => f !== "motor.mjs").sort();
  assert.deepEqual(Object.keys(ARCHIVOS_DEL_CLUB_CRUDO).sort(), enDisco);
});

test("rutaDelClubCrudo: devuelve lo que queda debajo de la carpeta, normalizado", () => {
  assert.equal(rutaDelClubCrudo("/Previews/BreakPoint/Club/App.mjs"), "app.mjs");
  assert.equal(rutaDelClubCrudo("/previews/breakpoint/turnero/..%2fclub/index.html"), "index.html");
  assert.equal(rutaDelClubCrudo("/previews/breakpoint/club"), "");
  assert.equal(rutaDelClubCrudo("/previews/breakpoint/club/motor.mjs"), null);
  assert.equal(rutaDelClubCrudo("/previews/breakpoint/turnero/index.html"), null);
});
