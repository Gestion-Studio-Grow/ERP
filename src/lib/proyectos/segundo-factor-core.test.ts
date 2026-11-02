import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { aBase32, cifrarSecreto, codigoDelPaso, crearPase, deBase32, descifrarSecreto, direccionParaLaApp, hashDeRespaldo, leerPase, nuevosCodigosDeRespaldo, pasoDe, verificarCodigo, VIGENCIA_PASE_MS } from "./segundo-factor-core";

// Vector de prueba del RFC 6238, apéndice B (SHA-1, 8 dígitos).
const SECRETO_RFC = Buffer.from("12345678901234567890");

test("los códigos coinciden con los vectores del RFC 6238", () => {
  for (const [segundos, codigo] of [[59, "94287082"], [1111111109, "07081804"], [1234567890, "89005924"], [2000000000, "69279037"]] as const) {
    assert.equal(codigoDelPaso(SECRETO_RFC, pasoDe(segundos * 1000), 8), codigo);
  }
});

test("base32 ida y vuelta, con el valor conocido del RFC 4648", () => {
  assert.equal(aBase32(Buffer.from("foobar")), "MZXW6YTBOI");
  assert.equal(deBase32("MZXW6YTBOI").toString(), "foobar");
  const azar = randomBytes(20);
  assert.deepEqual(deBase32(aBase32(azar)), azar);
});

test("acepta un paso de diferencia con el reloj, no dos", () => {
  const ahora = 1_800_000_000_000;
  const paso = pasoDe(ahora);
  for (const delta of [-1, 0, 1]) assert.equal(verificarCodigo(SECRETO_RFC, codigoDelPaso(SECRETO_RFC, paso + delta), ahora, null), paso + delta);
  for (const delta of [-2, 2]) assert.equal(verificarCodigo(SECRETO_RFC, codigoDelPaso(SECRETO_RFC, paso + delta), ahora, null), null);
});

test("un código ya usado no sirve otra vez", () => {
  const ahora = 1_800_000_000_000;
  const paso = pasoDe(ahora);
  const codigo = codigoDelPaso(SECRETO_RFC, paso);
  assert.equal(verificarCodigo(SECRETO_RFC, codigo, ahora, paso), null);
  assert.equal(verificarCodigo(SECRETO_RFC, codigo, ahora, paso + 1), null);
});

test("rechaza lo que no son 6 dígitos y acepta espacios", () => {
  const ahora = 1_800_000_000_000;
  const codigo = codigoDelPaso(SECRETO_RFC, pasoDe(ahora));
  assert.equal(verificarCodigo(SECRETO_RFC, "", ahora, null), null);
  assert.equal(verificarCodigo(SECRETO_RFC, "abcdef", ahora, null), null);
  assert.equal(verificarCodigo(SECRETO_RFC, `${codigo.slice(0, 3)} ${codigo.slice(3)}`, ahora, null), pasoDe(ahora));
});

test("la dirección para la app lleva emisor, cuenta y secreto", () => {
  const uri = direccionParaLaApp({ emisor: "MIA Producciones", cuenta: "ana@mia.com", secreto: Buffer.from("foobar") });
  assert.ok(uri.startsWith("otpauth://totp/MIA%20Producciones:ana%40mia.com?secret=MZXW6YTBOI&issuer=MIA%20Producciones"));
});

test("el secreto cifrado se recupera sólo con su clave", () => {
  const clave = randomBytes(32);
  const guardado = cifrarSecreto(SECRETO_RFC, clave);
  assert.ok(!guardado.includes(SECRETO_RFC.toString("base64url")));
  assert.deepEqual(descifrarSecreto(guardado, clave), SECRETO_RFC);
  assert.throws(() => descifrarSecreto(guardado, randomBytes(32)));
});

test("los códigos de respaldo: diez, distintos, y el hash no depende de guiones ni mayúsculas", () => {
  const { visibles, hashes } = nuevosCodigosDeRespaldo();
  assert.equal(new Set(visibles).size, 10);
  assert.equal(hashDeRespaldo(visibles[0].toLowerCase().replaceAll("-", " ")), hashes[0]);
  assert.ok(!hashes.includes(visibles[0]));
});

test("el pase vence, y no se puede falsificar ni cambiar de usuario", () => {
  const clave = randomBytes(32);
  const ahora = 1_800_000_000_000;
  const pase = crearPase("u1", ahora, clave);
  assert.equal(leerPase(pase, ahora, clave), "u1");
  assert.equal(leerPase(pase, ahora + VIGENCIA_PASE_MS, clave), null);
  assert.equal(leerPase(pase, ahora, randomBytes(32)), null);
  assert.equal(leerPase(pase.replace("u1", "u2"), ahora, clave), null);
  assert.equal(leerPase(undefined, ahora, clave), null);
  assert.equal(leerPase("u1.abc", ahora, clave), null);
});
