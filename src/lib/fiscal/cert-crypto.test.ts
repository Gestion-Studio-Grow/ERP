import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  masterKeyDesdeEnv,
  sealCredential,
  openCredential,
  sealSecret,
  openSecret,
  elSobreAbre,
  comoAbreElSobre,
  KEK_ID_POR_DEFECTO,
  type MasterKey,
} from "./cert-crypto";

const master = (): MasterKey => ({ key: Buffer.alloc(32, 7), id: "test:v1" });
const otra = (): MasterKey => ({ key: Buffer.alloc(32, 9), id: "test:v2" });

const plano = { certPem: "-----CERT-----abc", keyPem: "-----KEY-----xyz" };

test("masterKeyDesdeEnv: sin FISCAL_MASTER_KEY → falla fuerte (fail-closed)", () => {
  assert.throws(() => masterKeyDesdeEnv({}), /FISCAL_MASTER_KEY/);
});

test("masterKeyDesdeEnv: cadena vacía o solo espacios → tratada como ausente (fail-closed)", () => {
  assert.throws(() => masterKeyDesdeEnv({ FISCAL_MASTER_KEY: "" }), /no está seteada/);
  assert.throws(() => masterKeyDesdeEnv({ FISCAL_MASTER_KEY: "   \n" }), /no está seteada/);
});

test("masterKeyDesdeEnv: el error de ausencia trae diagnóstico de runtime SIN exponer valores", () => {
  // El diagnóstico distingue "el runtime no ve NADA" de "falta esta var puntual".
  let msg = "";
  try {
    masterKeyDesdeEnv({ DATABASE_URL: "postgres://secreto", VERCEL_ENV: "production" });
  } catch (e) {
    msg = e instanceof Error ? e.message : String(e);
  }
  assert.match(msg, /diagnóstico runtime/);
  assert.match(msg, /entorno=production/);
  assert.match(msg, /DATABASE_URL=sí/);
  // NUNCA debe filtrar el valor de ninguna variable (ni siquiera el de una var vecina).
  assert.ok(!msg.includes("postgres://secreto"), "el error no debe contener el valor de ninguna var");
});

test("masterKeyDesdeEnv: el diagnóstico reporta la master key como ausente cuando falta", () => {
  let msg = "";
  try {
    masterKeyDesdeEnv({ OTRA: "x" });
  } catch (e) {
    msg = e instanceof Error ? e.message : String(e);
  }
  assert.match(msg, /alguna clave FISCAL\/MASTER=no/);
});

test("masterKeyDesdeEnv: longitud incorrecta → error explícito", () => {
  const corta = Buffer.alloc(16, 1).toString("base64");
  assert.throws(() => masterKeyDesdeEnv({ FISCAL_MASTER_KEY: corta }), /32 bytes/);
});

test("masterKeyDesdeEnv: 32 bytes base64 → ok, con id por default", () => {
  const key = randomBytes(32).toString("base64");
  const mk = masterKeyDesdeEnv({ FISCAL_MASTER_KEY: key });
  assert.equal(mk.key.length, 32);
  assert.match(mk.id, /FISCAL_MASTER_KEY/);
});

test("masterKeyDesdeEnv: valor con newline/espacios finales (pegado) → trim y ok", () => {
  const key = randomBytes(32).toString("base64");
  const mk = masterKeyDesdeEnv({ FISCAL_MASTER_KEY: `  ${key}\n` });
  assert.equal(mk.key.length, 32);
});

test("seal → open: round-trip devuelve el mismo material", () => {
  const sobre = sealCredential(plano, master());
  const abierto = openCredential(sobre, master());
  assert.deepEqual(abierto, plano);
});

test("el sobre no contiene el material en claro (cifrado en reposo)", () => {
  const sobre = sealCredential(plano, master());
  const serial = JSON.stringify(sobre);
  assert.ok(!serial.includes("abc"), "el certPem no debe aparecer en claro");
  assert.ok(!serial.includes("xyz"), "el keyPem no debe aparecer en claro");
  assert.equal(sobre.kekId, "test:v1");
});

test("dos sellados del mismo material dan ciphertext distinto (DEK/IV aleatorios)", () => {
  const a = sealCredential(plano, master());
  const b = sealCredential(plano, master());
  assert.notEqual(a.sealed, b.sealed);
  assert.notEqual(a.wrappedDek, b.wrappedDek);
});

test("open con master key equivocada → lanza (no devuelve material)", () => {
  const sobre = sealCredential(plano, master());
  assert.throws(() => openCredential(sobre, otra()));
});

test("open sobre tampereado → lanza (GCM detecta el cambio)", () => {
  const sobre = sealCredential(plano, master());
  // Flipear un byte del ciphertext del payload.
  const [iv, tag, ct] = sobre.sealed.split(".");
  const buf = Buffer.from(ct, "base64");
  buf[0] ^= 0xff;
  const tampereado = { ...sobre, sealed: `${iv}.${tag}.${buf.toString("base64")}` };
  assert.throws(() => openCredential(tampereado, master()));
});

// ── Envelope genérico (sealSecret/openSecret) — usado para el TA de ARCA ──────

test("sealSecret → openSecret: round-trip de un string arbitrario", () => {
  const secreto = JSON.stringify({ token: "VE9LRU4=", sign: "U0lHTg==" });
  const sobre = sealSecret(secreto, master());
  assert.equal(openSecret(sobre, master()), secreto);
});

test("sealSecret: el sobre no contiene el secreto en claro", () => {
  const sobre = sealSecret("token-super-secreto-123", master());
  const serial = JSON.stringify(sobre);
  assert.ok(!serial.includes("token-super-secreto-123"), "el secreto no debe aparecer en claro");
});

test("openSecret con master key equivocada → lanza (no devuelve el secreto)", () => {
  const sobre = sealSecret("x", master());
  assert.throws(() => openSecret(sobre, otra()));
});

test("sealCredential sigue funcionando (delega en sealSecret)", () => {
  const sobre = sealCredential(plano, master());
  assert.deepEqual(openCredential(sobre, master()), plano);
});

// ── La etiqueta de la clave maestra (FISCAL_MASTER_KEY_ID): sin valor por defecto silencioso ──
const CLAVE_32 = Buffer.alloc(32, 3).toString("base64");

test("masterKeyDesdeEnv: sin FISCAL_MASTER_KEY_ID → etiqueta por defecto MARCADA y avisada una vez", () => {
  const avisos: string[] = [];
  const mk = masterKeyDesdeEnv({ FISCAL_MASTER_KEY: CLAVE_32 }, { avisar: (m) => avisos.push(m) });
  assert.equal(mk.id, KEK_ID_POR_DEFECTO);
  assert.equal(mk.idPorDefecto, true);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /FISCAL_MASTER_KEY_ID/);
  assert.ok(!avisos[0].includes(CLAVE_32), "el aviso no lleva el valor de la clave");
});

test("masterKeyDesdeEnv: FISCAL_MASTER_KEY_ID vacía o en blanco → como ausente (nunca una etiqueta vacía)", () => {
  for (const vacia of ["", "   ", "\n"]) {
    const avisos: string[] = [];
    const mk = masterKeyDesdeEnv({ FISCAL_MASTER_KEY: CLAVE_32, FISCAL_MASTER_KEY_ID: vacia }, { avisar: (m) => avisos.push(m) });
    assert.equal(mk.id, KEK_ID_POR_DEFECTO, JSON.stringify(vacia));
    assert.equal(mk.idPorDefecto, true);
    assert.equal(avisos.length, 1);
  }
});

test("masterKeyDesdeEnv: FISCAL_MASTER_KEY_ID seteada → esa (recortada), sin aviso ni marca", () => {
  const avisos: string[] = [];
  const mk = masterKeyDesdeEnv({ FISCAL_MASTER_KEY: CLAVE_32, FISCAL_MASTER_KEY_ID: " kek:v2\n" }, { avisar: (m) => avisos.push(m) });
  assert.equal(mk.id, "kek:v2");
  assert.equal(mk.idPorDefecto, false);
  assert.deepEqual(avisos, []);
});

test("elSobreAbre: dice si abre sin devolver el material (con la clave correcta, otra o un sobre roto)", () => {
  const sobre = sealSecret("material-de-prueba", master());
  assert.equal(elSobreAbre(sobre, master()), true);
  assert.equal(elSobreAbre(sobre, otra()), false);
  // Misma clave, otra etiqueta: abre (la etiqueta no decide).
  assert.equal(elSobreAbre({ ...sobre, kekId: "otra-etiqueta" }, master()), true);
  const [iv, tag, ct] = sobre.sealed.split(".");
  const roto = { ...sobre, sealed: `${iv}.${tag}.${Buffer.from("x" + ct).toString("base64")}` };
  assert.equal(elSobreAbre(roto, master()), false);
  assert.equal(elSobreAbre({ ...sobre, wrappedDek: "no.es.valido" }, master()), false);
});

test("comoAbreElSobre: distingue «no abre con esta clave» (aunque la etiqueta sea la misma) de «contenido dañado»", () => {
  const sobre = sealSecret("material-de-prueba", master());
  assert.equal(comoAbreElSobre(sobre, master()), "abre");
  // Clave rotada SIN cambiar la etiqueta: la etiqueta coincide pero la clave no → recuperable, no dañado.
  const rotadaMismaEtiqueta: MasterKey = { key: otra().key, id: master().id };
  assert.equal(comoAbreElSobre(sobre, rotadaMismaEtiqueta), "no-abre-con-esta-clave");
  assert.equal(comoAbreElSobre(sobre, otra()), "no-abre-con-esta-clave");
  assert.equal(comoAbreElSobre({ ...sobre, wrappedDek: "no.es.valido" }, master()), "no-abre-con-esta-clave");
  // La DEK se desenvuelve con esta clave pero el contenido está alterado → dañado de verdad.
  const [iv, tag, ct] = sobre.sealed.split(".");
  const ctRoto = Buffer.from(ct, "base64");
  ctRoto[0] ^= 1;
  assert.equal(comoAbreElSobre({ ...sobre, sealed: `${iv}.${tag}.${ctRoto.toString("base64")}` }, master()), "contenido-dañado");
  assert.equal(comoAbreElSobre({ ...sobre, sealed: "roto" }, master()), "contenido-dañado");
  // elSobreAbre sigue siendo «las dos capas abren».
  assert.equal(elSobreAbre(sobre, rotadaMismaEtiqueta), false);
});
