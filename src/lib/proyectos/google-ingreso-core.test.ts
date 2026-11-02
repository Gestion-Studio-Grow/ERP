import assert from "node:assert/strict";
import { test } from "node:test";
import { direccionDeGoogle, mailDelToken, nextSeguro, nuevoEstadoGoogle } from "./google-ingreso-core";

const AHORA = 1_800_000_000_000;
const BASE = { iss: "https://accounts.google.com", aud: "cliente", nonce: "n1", exp: AHORA / 1000 + 60, email: "Ana@Mia.com", email_verified: true };
const token = (c: object) => `x.${Buffer.from(JSON.stringify(c)).toString("base64url")}.y`;
const leer = (c: object) => mailDelToken(token(c), { clienteId: "cliente", nonce: "n1", ahoraMs: AHORA });

test("un token bueno devuelve el mail en minúsculas", () => {
  assert.equal(leer(BASE), "ana@mia.com");
});

test("rechaza emisor, destinatario, nonce, vencimiento y mail sin verificar", () => {
  assert.equal(leer({ ...BASE, iss: "https://otro.com" }), null);
  assert.equal(leer({ ...BASE, aud: "otro" }), null);
  assert.equal(leer({ ...BASE, nonce: "otro" }), null);
  assert.equal(leer({ ...BASE, exp: AHORA / 1000 - 1 }), null);
  assert.equal(leer({ ...BASE, email_verified: false }), null);
  assert.equal(leer({ ...BASE, email: undefined }), null);
  assert.equal(mailDelToken("basura", { clienteId: "cliente", nonce: "n1", ahoraMs: AHORA }), null);
});

test("la dirección de Google lleva estado, nonce y PKCE, nunca el verificador", () => {
  const estado = nuevoEstadoGoogle("/admin");
  const url = new URL(direccionDeGoogle({ clienteId: "cliente", vuelta: "https://mia.ejemplo/vuelta", estado }));
  assert.equal(url.searchParams.get("state"), estado.estado);
  assert.equal(url.searchParams.get("nonce"), estado.nonce);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(!url.toString().includes(estado.verificador));
});

test("el destino nunca sale del sitio", () => {
  assert.equal(nextSeguro("/admin/proyectos"), "/admin/proyectos");
  for (const malo of ["https://malo.com", "//malo.com", "/\\malo.com", null, ""]) assert.equal(nextSeguro(malo), "/admin");
});
