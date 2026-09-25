// Tests del sobre de secretos de integraciones: AAD por fila, KEK propia, tag completo y
// errores que no filtran nada. node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  ClaveMaestraError,
  ID_CLAVE_MAESTRA_POR_DEFECTO,
  SobreInvalidoError,
  aadDe,
  abrirBytes,
  abrirSecreto,
  cerrarBytes,
  cerrarSecreto,
  claveMaestraDesdeEntorno,
  reenvolver,
  ultimos4,
  type ClaveMaestra,
  type ContextoSecreto,
  type SobreSecreto,
} from "./secretos";

const KEK: ClaveMaestra = { clave: randomBytes(32), id: "test:kek:v1" };
const OTRA_KEK: ClaveMaestra = { clave: randomBytes(32), id: "test:kek:v1" };
const KEK_NUEVA: ClaveMaestra = { clave: randomBytes(32), id: "test:kek:v2" };

const CTX: ContextoSecreto = { tenantId: "tenant_magra", conexionId: "cnx_1", campo: "access_token" };
const SECRETO = "EAAG-token-de-sistema-de-meta-0123456789abcdef";

const esSobreInvalido = (e: unknown) => e instanceof SobreInvalidoError && e.codigo === "credencial_ilegible";

test("ida y vuelta: texto y bytes", () => {
  const s = cerrarSecreto(SECRETO, CTX, KEK);
  assert.equal(abrirSecreto(s, CTX, KEK), SECRETO);
  const archivo = randomBytes(5000);
  const sb = cerrarBytes(archivo, { ...CTX, campo: "archivo:ext_1" }, KEK);
  assert.deepEqual(abrirBytes(sb, { ...CTX, campo: "archivo:ext_1" }, KEK), archivo);
  const vacio = cerrarBytes(new Uint8Array(), CTX, KEK);
  assert.equal(abrirBytes(vacio, CTX, KEK).length, 0);
});

test("el sobre no deja nada legible y cada cierre es distinto", () => {
  const a = cerrarSecreto(SECRETO, CTX, KEK);
  const b = cerrarSecreto(SECRETO, CTX, KEK);
  assert.notEqual(a.sealed, b.sealed);
  assert.notEqual(a.wrappedDek, b.wrappedDek);
  assert.equal(a.kekId, KEK.id);
  const crudo = JSON.stringify(a);
  assert.ok(!crudo.includes(SECRETO));
  assert.ok(!crudo.includes(Buffer.from(SECRETO).toString("base64")));
  assert.ok(!crudo.includes(KEK.clave.toString("base64")));
  assert.match(a.sealed, /^gi1\.[^.]+\.[^.]+\.[^.]*$/);
});

// ── Criterio: un sobre copiado a otra conexión no abre ───────────────────────

test("un sobre copiado a otra conexión, a otro negocio o a otro campo NO abre", () => {
  const sobre = cerrarSecreto(SECRETO, CTX, KEK);
  const ajenos: ContextoSecreto[] = [
    { ...CTX, conexionId: "cnx_2" },
    { ...CTX, tenantId: "beauty-spa" },
    { ...CTX, campo: "refresh_token" },
    { tenantId: "cnx_1", conexionId: "tenant_magra", campo: "access_token" },
  ];
  for (const ctx of ajenos) {
    assert.throws(() => abrirSecreto({ ...sobre }, ctx, KEK), esSobreInvalido, JSON.stringify(ctx));
  }
  // Y en su fila sigue abriendo.
  assert.equal(abrirSecreto(sobre, CTX, KEK), SECRETO);
});

test("tampoco se puede trasplantar sólo la DEK ni sólo el dato entre filas", () => {
  const deA = cerrarSecreto("secreto-de-A-123456", CTX, KEK);
  const ctxB = { ...CTX, conexionId: "cnx_2" };
  const deB = cerrarSecreto("secreto-de-B-654321", ctxB, KEK);
  // La DEK de A con el dato de B, leído como B.
  assert.throws(() => abrirSecreto({ ...deB, wrappedDek: deA.wrappedDek }, ctxB, KEK), esSobreInvalido);
  // El dato de A con la DEK de B, leído como A.
  assert.throws(() => abrirSecreto({ ...deA, wrappedDek: deB.wrappedDek }, CTX, KEK), esSobreInvalido);
});

test("el AAD no se puede ambiguar con '|' ni con componentes vacíos", () => {
  assert.throws(() => cerrarSecreto(SECRETO, { tenantId: "a|b", conexionId: "c", campo: "d" }, KEK));
  assert.throws(() => cerrarSecreto(SECRETO, { tenantId: "a", conexionId: "", campo: "d" }, KEK));
  assert.throws(() => cerrarSecreto(SECRETO, { tenantId: "a", conexionId: "b", campo: "c\n" }, KEK));
  assert.throws(() => aadDe({ tenantId: "a", conexionId: "b" } as ContextoSecreto, "dato"));
  assert.equal(
    aadDe(CTX, "dato").toString("utf8"),
    "gsg-integraciones/gi1/dato|tenant_magra|cnx_1|access_token",
  );
  assert.notDeepEqual(aadDe(CTX, "dato"), aadDe(CTX, "dek"));
});

test("alterar cualquier parte del sobre lo rompe", () => {
  const s = cerrarSecreto(SECRETO, CTX, KEK);
  const flip = (texto: string, idx: number) => {
    const partes = texto.split(".");
    const b = Buffer.from(partes[idx], "base64");
    b[0] ^= 0x01;
    partes[idx] = b.toString("base64");
    return partes.join(".");
  };
  for (const idx of [1, 2, 3]) {
    assert.throws(() => abrirSecreto({ ...s, sealed: flip(s.sealed, idx) }, CTX, KEK), esSobreInvalido, `sealed ${idx}`);
    assert.throws(() => abrirSecreto({ ...s, wrappedDek: flip(s.wrappedDek, idx) }, CTX, KEK), esSobreInvalido, `dek ${idx}`);
  }
});

test("un tag GCM recortado no se acepta (Node lo aceptaría sin authTagLength)", () => {
  const s = cerrarSecreto(SECRETO, CTX, KEK);
  const recortar = (texto: string) => {
    const [v, iv, tag, ct] = texto.split(".");
    return [v, iv, Buffer.from(tag, "base64").subarray(0, 4).toString("base64"), ct].join(".");
  };
  assert.throws(() => abrirSecreto({ ...s, sealed: recortar(s.sealed) }, CTX, KEK), esSobreInvalido);
  assert.throws(() => abrirSecreto({ ...s, wrappedDek: recortar(s.wrappedDek) }, CTX, KEK), esSobreInvalido);
});

test("forma inválida del sobre → SobreInvalidoError, nunca otra cosa", () => {
  const s = cerrarSecreto(SECRETO, CTX, KEK);
  const malos: unknown[] = [
    null,
    {},
    { ...s, sealed: 1 },
    { ...s, sealed: "v1.a.b.c" },
    { ...s, sealed: s.sealed.replace(/^gi1/, "gi2") },
    { ...s, sealed: `${s.sealed}.extra` },
    { ...s, sealed: s.sealed.split(".").slice(0, 3).join(".") },
    { ...s, sealed: "gi1.!!!.???.***" },
  ];
  for (const m of malos) {
    assert.throws(() => abrirSecreto(m as SobreSecreto, CTX, KEK), esSobreInvalido, JSON.stringify(m));
  }
});

test("con otra KEK no abre; con otro kekId avisa que hay que reenvolver", () => {
  const s = cerrarSecreto(SECRETO, CTX, KEK);
  assert.throws(() => abrirSecreto(s, CTX, OTRA_KEK), esSobreInvalido);
  assert.throws(
    () => abrirSecreto(s, CTX, KEK_NUEVA),
    (e: unknown) => esSobreInvalido(e) && /reenvolver/.test((e as Error).message),
  );
});

test("los errores nunca traen el secreto ni la llave", () => {
  const s = cerrarSecreto(SECRETO, CTX, KEK);
  const intentos: Array<() => unknown> = [
    () => abrirSecreto(s, { ...CTX, conexionId: "cnx_2" }, KEK),
    () => abrirSecreto(s, CTX, OTRA_KEK),
    () => abrirSecreto({ ...s, sealed: "gi1.x" }, CTX, KEK),
  ];
  for (const f of intentos) {
    try {
      f();
      assert.fail("tenía que lanzar");
    } catch (e) {
      const texto = `${String(e)} ${(e as Error).stack ?? ""} ${JSON.stringify(e)}`;
      assert.ok(!texto.includes(SECRETO));
      assert.ok(!texto.includes(KEK.clave.toString("base64")));
      assert.ok(!texto.includes(OTRA_KEK.clave.toString("base64")));
    }
  }
});

test("rotación: reenvolver con la KEK nueva mantiene el dato y respeta la fila", () => {
  const s = cerrarSecreto(SECRETO, CTX, KEK);
  const rotado = reenvolver(s, CTX, KEK, KEK_NUEVA);
  assert.equal(rotado.kekId, KEK_NUEVA.id);
  assert.equal(rotado.sealed, s.sealed, "el dato cifrado no se toca");
  assert.equal(abrirSecreto(rotado, CTX, KEK_NUEVA), SECRETO);
  assert.throws(() => abrirSecreto(rotado, CTX, KEK), esSobreInvalido);
  assert.throws(() => reenvolver(s, { ...CTX, conexionId: "cnx_2" }, KEK, KEK_NUEVA), esSobreInvalido);
  assert.throws(() => reenvolver(s, CTX, KEK, { ...KEK_NUEVA, id: KEK.id }), ClaveMaestraError);
});

test("no se guarda un secreto vacío ni con una llave inválida", () => {
  assert.throws(() => cerrarSecreto("", CTX, KEK), TypeError);
  assert.throws(() => cerrarSecreto(SECRETO, CTX, { clave: randomBytes(16), id: "x" }), ClaveMaestraError);
  assert.throws(() => cerrarSecreto(SECRETO, CTX, { clave: randomBytes(32), id: "con espacio" }), ClaveMaestraError);
});

// ── La KEK del entorno ───────────────────────────────────────────────────────

const b64 = (b: Buffer) => b.toString("base64");

test("KEK: sale de INTEGRACIONES_MASTER_KEY y nunca de la fiscal", () => {
  const propia = randomBytes(32);
  const k = claveMaestraDesdeEntorno({ INTEGRACIONES_MASTER_KEY: b64(propia) });
  assert.deepEqual(k.clave, propia);
  assert.equal(k.id, ID_CLAVE_MAESTRA_POR_DEFECTO);
  assert.equal(
    claveMaestraDesdeEntorno({ INTEGRACIONES_MASTER_KEY: ` ${b64(propia)}\n`, INTEGRACIONES_MASTER_KEY_ID: "env:v7" }).id,
    "env:v7",
  );
  // Sólo con la fiscal cargada: no hay caída, falla.
  assert.throws(
    () => claveMaestraDesdeEntorno({ FISCAL_MASTER_KEY: b64(randomBytes(32)) }),
    (e: unknown) => e instanceof ClaveMaestraError && /INTEGRACIONES_MASTER_KEY/.test((e as Error).message),
  );
});

test("KEK: igual a la fiscal, mal largo o base64 inválido → no arranca", () => {
  const misma = b64(randomBytes(32));
  assert.throws(
    () => claveMaestraDesdeEntorno({ INTEGRACIONES_MASTER_KEY: misma, FISCAL_MASTER_KEY: misma }),
    (e: unknown) => e instanceof ClaveMaestraError && /distintas/.test((e as Error).message),
  );
  for (const mala of ["", "   ", b64(randomBytes(16)), b64(randomBytes(33)), "no-es-base64!!", "YWJj"]) {
    assert.throws(() => claveMaestraDesdeEntorno({ INTEGRACIONES_MASTER_KEY: mala }), ClaveMaestraError, mala);
  }
  assert.throws(
    () => claveMaestraDesdeEntorno({ INTEGRACIONES_MASTER_KEY: b64(randomBytes(32)), INTEGRACIONES_MASTER_KEY_ID: "a b" }),
    ClaveMaestraError,
  );
});

test("KEK: el error no imprime el valor de la variable", () => {
  const casi = b64(randomBytes(31));
  try {
    claveMaestraDesdeEntorno({ INTEGRACIONES_MASTER_KEY: casi });
    assert.fail("tenía que lanzar");
  } catch (e) {
    assert.ok(!String(e).includes(casi));
  }
});

test("últimos 4 sólo para secretos largos", () => {
  assert.equal(ultimos4("ck_0123456789abcdef1234"), "1234");
  assert.equal(ultimos4("  abcdefghijklmnop  "), "mnop");
  assert.equal(ultimos4("corto-123"), null);
  assert.equal(ultimos4(""), null);
});

test("secretos.ts no escribe nada en la consola", () => {
  const originales = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  const escrito: unknown[] = [];
  const capturar = (...a: unknown[]) => escrito.push(a);
  Object.assign(console, { log: capturar, error: capturar, warn: capturar, info: capturar });
  try {
    const s = cerrarSecreto(SECRETO, CTX, KEK);
    abrirSecreto(s, CTX, KEK);
    try {
      abrirSecreto(s, { ...CTX, campo: "otro" }, KEK);
    } catch {
      /* esperado */
    }
    try {
      claveMaestraDesdeEntorno({});
    } catch {
      /* esperado */
    }
  } finally {
    Object.assign(console, originales);
  }
  assert.deepEqual(escrito, []);
});
