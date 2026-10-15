// Tests del ingreso (contraseñas, límites, sesiones, Google OIDC) y del webhook de WhatsApp del turnero.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import * as authMod from "./back/auth.mjs";
import * as waMod from "./back/whatsapp.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any -- módulos JS planos (Node los carga sin build); se usan sin tipar */
const A: any = authMod;
const W: any = waMod;

test("la contraseña se guarda con scrypt y sal: nunca en texto plano, y dos hashes de la misma clave difieren", async () => {
  const h1 = await A.hashClave("canchaazul9");
  const h2 = await A.hashClave("canchaazul9");
  assert.match(h1, /^scrypt\$16384\$8\$5\$/);
  assert.ok(!h1.includes("canchaazul9"));
  assert.notEqual(h1, h2);
  assert.equal(await A.verificarClave("canchaazul9", h1), true);
  assert.equal(await A.verificarClave("canchaazul8", h1), false);
  assert.equal(await A.verificarClave("lo-que-sea", null), false); // usuario inexistente: igual se verifica (tiempo parejo)
});

test("reglas de la contraseña en criollo", () => {
  assert.match(A.problemaDeClave("corta"), /8 caracteres/);
  assert.match(A.problemaDeClave("12345678"), /fácil/);
  assert.equal(A.problemaDeClave("canchaazul9"), null);
});

test("límite de intentos: bloquea al 5.º fallo y se libera al pasar la ventana", () => {
  let t = 0;
  const l = A.crearLimitador({ maximo: 5, ventanaMs: 1000, ahora: () => t });
  for (let i = 0; i < 4; i++) l.golpe("ana");
  assert.equal(l.bloqueado("ana"), false);
  l.golpe("ana");
  assert.equal(l.bloqueado("ana"), true);
  assert.ok(l.espera("ana") > 0);
  t = 1500;
  assert.equal(l.bloqueado("ana"), false);
});

test("sesiones: id aleatorio largo, deslizante y que vence", () => {
  let t = 0;
  const s = A.crearSesiones({ duracionMs: 1000, ahora: () => t });
  const id = s.crear("w1");
  assert.ok(id.length >= 43);
  t = 900; assert.equal(s.leer(id).usuarioId, "w1");
  t = 1800; assert.equal(s.leer(id).usuarioId, "w1"); // se renovó al leer
  t = 5000; assert.equal(s.leer(id), null);
  assert.equal(s.leer("inventado"), null);
});

test("cookie de sesión HttpOnly + SameSite=Lax (+ Secure detrás de HTTPS)", () => {
  const c = A.cookieSesion("bp_sesion", "abc", { maxAge: 10, seguro: true });
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Lax/);
  assert.match(c, /Secure/);
});

test("celulares argentinos: con 54 9, con 0 y 15, o pelado → el mismo número", () => {
  for (const t of ["+54 9 11 6187-0066", "11 6187 0066", "011 15 6187-0066", "5491161870066"]) assert.equal(A.normalizarCelular(t), "5491161870066", t);
  assert.equal(A.normalizarCelular("1115234567"), "5491115234567"); // un 15 dentro del número no se toca
  assert.equal(A.normalizarCelular("123"), null);
  assert.equal(A.normalizarEmail(" Ana@Example.com "), "ana@example.com");
  assert.equal(A.normalizarEmail("sin-arroba"), null);
});

// ───── Google: ID tokens firmados con una clave RSA generada para el test ─────
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
function token(datos: Record<string, unknown>, { kid = "k1", alg = "RS256", firmarCon = privateKey } = {}) {
  const cuerpo = `${b64({ alg, kid, typ: "JWT" })}.${b64(datos)}`;
  const s = createSign("RSA-SHA256");
  s.update(cuerpo);
  return `${cuerpo}.${s.sign(firmarCon).toString("base64url")}`;
}
const AHORA = 1_800_000_000;
const valido = { iss: "https://accounts.google.com", aud: "cliente-demo.apps.googleusercontent.com", sub: "123", email: "ana@example.com", email_verified: true, name: "Ana", exp: AHORA + 600, iat: AHORA };
const opciones = { clientId: valido.aud, obtenerJwks: async () => ({ keys: [jwk] }), ahoraSeg: () => AHORA };

test("Google: un ID token válido se acepta y trae el perfil", async () => {
  const r = await A.verificarIdTokenGoogle(token(valido), opciones);
  assert.equal(r.ok, true);
  assert.deepEqual(r.perfil, { sub: "123", email: "ana@example.com", nombre: "Ana" });
});

test("Google: audiencia ajena, vencido, emisor falso, mail sin verificar, firma de otra clave, alg none → rechazo", async () => {
  const otra = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  const casos = [
    token({ ...valido, aud: "otra-app" }),
    token({ ...valido, exp: AHORA - 3600 }),
    token({ ...valido, iss: "https://evil.example" }),
    token({ ...valido, email_verified: false }),
    token(valido, { firmarCon: otra }),
    token(valido, { kid: "desconocida" }),
    `${b64({ alg: "none" })}.${b64(valido)}.`,
    "basura",
  ];
  for (const t of casos) assert.equal((await A.verificarIdTokenGoogle(t, opciones)).ok, false, t.slice(0, 30));
});

// ───── WhatsApp ─────
test("webhook: la firma X-Hub-Signature-256 se verifica sobre el cuerpo crudo", () => {
  const cuerpo = Buffer.from(JSON.stringify({ hola: 1 }));
  const f = W.firmar(cuerpo, "secreto");
  assert.equal(W.verificarFirma(cuerpo, f, "secreto"), true);
  assert.equal(W.verificarFirma(Buffer.from(JSON.stringify({ hola: 2 })), f, "secreto"), false); // cuerpo alterado
  assert.equal(W.verificarFirma(cuerpo, f, "otro"), false);
  assert.equal(W.verificarFirma(cuerpo, undefined, "secreto"), false);
  assert.equal(W.verificarFirma(cuerpo, f, ""), false); // sin secreto configurado no se acepta nada
});

test("webhook: la verificación de la suscripción devuelve el challenge sólo con el token correcto", () => {
  const p = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "tk", "hub.challenge": "42" });
  assert.deepEqual(W.verificarSuscripcion(p, "tk"), { ok: true, challenge: "42" });
  assert.equal(W.verificarSuscripcion(p, "otro").ok, false);
  assert.equal(W.verificarSuscripcion(p, null).ok, false);
});

test("webhook: extrae texto, imagen y documento con la forma de WhatsApp Cloud; ignora el resto", () => {
  const t = W.extraerMensajes(W.payloadCloud({ de: "549111", id: "m1", texto: "hola" }));
  assert.deepEqual(t.map((m: any) => [m.id, m.de, m.tipo, m.texto]), [["m1", "549111", "text", "hola"]]);
  const i = W.extraerMensajes(W.payloadCloud({ de: "549111", id: "m2", mediaId: "md1", texto: "seña" }));
  assert.equal(i[0].mediaId, "md1");
  const audio = { entry: [{ changes: [{ value: { messages: [{ id: "m3", from: "1", type: "audio" }] } }] }] };
  assert.equal(W.extraerMensajes(audio)[0].ignorado, true);
  assert.deepEqual(W.extraerMensajes({ entry: [{ changes: [{ value: { statuses: [] } }] }] }), []);
});

test("canal de demo: no manda nada y enmascara el número", async () => {
  const c = W.crearCanalDemo();
  await c.enviar("5491161870066", "hola");
  assert.equal(c.buzon()[0].a, "••• 0066");
});

test("lector de demo: la imagen se lee una sola vez y no queda guardada", async () => {
  const l = W.crearLectorDemo();
  l.guardarMedio("md1", "Monto $ 1.000", 0.9);
  assert.match((await l.leer({ mediaId: "md1" })).texto, /1\.000/);
  assert.equal((await l.leer({ mediaId: "md1" })).confianzaOcr, 0.3); // ya no está
});
