// El código con que la dueña autoriza anular un cobro: para qué vale, para qué no y cuánto dura.
// Puro, con el reloj en la mano. El recorrido por roles contra la base está en
// `anular-cobro-roles-postgres.test.ts`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  crearTopeDeIntentos,
  emitirCodigo,
  LARGO_CODIGO,
  normalizarCodigo,
  TOPE_POR_COBRO,
  TOPE_POR_USUARIO,
  VENTANA_CODIGO_MS,
  verificarCodigo,
} from "./codigo-anulacion";

const SECRETO = "secreto-de-prueba";
const BASE = { secreto: SECRETO, tenantId: "negocio-a", collectionId: "cobro-1", duenaId: "caro" };
const AHORA = 1_790_000_000_000;
const emitido = (o: Partial<typeof BASE> = {}, ms = AHORA) => emitirCodigo({ ...BASE, ...o }, ms).codigo;
const verificar = (codigo: string, ms = AHORA, o: { tenantId?: string; collectionId?: string; duenas?: string[] } = {}) =>
  verificarCodigo({ secreto: SECRETO, tenantId: "negocio-a", collectionId: "cobro-1", duenas: ["caro"], codigo, ...o }, ms);

test("es corto y se puede dictar: 6 caracteres, sin 0, O, 1, I ni L", () => {
  for (let i = 0; i < 300; i++) {
    const c = emitido({ collectionId: `cobro-${i}` });
    assert.equal(c.length, LARGO_CODIGO);
    assert.match(c, /^[2-9A-HJKMNP-Z]{6}$/);
  }
});

test("el bueno pasa, e identifica a la dueña que lo sacó", () => {
  assert.deepEqual(verificar(emitido()), { ok: true, duenaId: "caro" });
  assert.deepEqual(verificar(emitido({ duenaId: "ana" }), AHORA, { duenas: ["caro", "ana"] }), { ok: true, duenaId: "ana" });
});

test("se escribe como sea: minúsculas, espacios o guiones", () => {
  const c = emitido();
  assert.equal(normalizarCodigo(` ${c.slice(0, 3).toLowerCase()}-${c.slice(3)} `), c);
  assert.deepEqual(verificar(` ${c.slice(0, 3).toLowerCase()}-${c.slice(3)} `), { ok: true, duenaId: "caro" });
});

test("vale sólo para ese cobro y ese negocio", () => {
  assert.deepEqual(verificar(emitido({ collectionId: "cobro-2" })), { ok: false }, "de otro cobro");
  assert.deepEqual(verificar(emitido({ tenantId: "negocio-b" })), { ok: false }, "de otro negocio");
});

test("sólo vale el de una dueña activa: si a la dueña se le saca el acceso, deja de servir", () => {
  assert.deepEqual(verificar(emitido({ duenaId: "ex-duena" })), { ok: false });
  assert.deepEqual(verificar(emitido(), AHORA, { duenas: [] }), { ok: false });
});

test("otro secreto da otro código", () => {
  assert.deepEqual(verificar(emitido({ secreto: "otro" })), { ok: false });
});

test("vence: dura entre 5 y 10 minutos, y hasta donde promete", () => {
  const inicioDeVentana = Math.floor(AHORA / VENTANA_CODIGO_MS) * VENTANA_CODIGO_MS;
  for (const emitidoEn of [inicioDeVentana, inicioDeVentana + VENTANA_CODIGO_MS - 1]) {
    const { codigo, venceMs } = emitirCodigo(BASE, emitidoEn);
    const dura = venceMs - emitidoEn;
    assert.ok(dura >= VENTANA_CODIGO_MS && dura <= 2 * VENTANA_CODIGO_MS, `duró ${dura} ms`);
    assert.equal(verificar(codigo, emitidoEn).ok, true, "recién sacado");
    assert.equal(verificar(codigo, venceMs - 1).ok, true, "el último milisegundo que promete");
    assert.equal(verificar(codigo, venceMs).ok, false, "ya vencido");
  }
  assert.equal(verificar(emitido({}, AHORA + VENTANA_CODIGO_MS)).ok, false, "uno del futuro no vale");
});

test("basura, vacío o largo distinto: no pasa y no rompe", () => {
  for (const c of ["", "A", "ABCDEFG", "ÑÑÑÑÑÑ", "x".repeat(10_000)]) assert.deepEqual(verificar(c), { ok: false });
});

test("compara en tiempo constante y sin cortar en el primero que coincide", () => {
  const src = readFileSync(join(process.cwd(), "src", "lib", "turnos", "codigo-anulacion.ts"), "utf8");
  const cuerpo = src.slice(src.indexOf("export function verificarCodigo"), src.indexOf("// ── Tope de intentos"));
  assert.match(cuerpo, /timingSafeEqual\(huella\(esperado\), escrito\)/);
  assert.doesNotMatch(cuerpo, /return \{ ok: true[^}]*\};\s*\n\s*\}/, "no hay retorno adentro del recorrido");
  assert.doesNotMatch(cuerpo, /===\s*(esperado|escrito)|(esperado|escrito)\s*===/, "nunca una comparación común");
});

test("tope: al quinto fallo se frena ese cobro, y se libera solo", () => {
  let reloj = AHORA;
  const tope = crearTopeDeIntentos(() => reloj);
  const q = { tenantId: "a", userId: "recepcion", collectionId: "c1" };
  for (let i = 0; i < TOPE_POR_COBRO.max; i++) {
    assert.equal(tope.frenado(q), false, `intento ${i}`);
    tope.fallo(q);
  }
  assert.equal(tope.frenado(q), true);
  assert.equal(tope.frenado({ ...q, userId: "otra" }), false, "no traba a la compañera");
  assert.equal(tope.frenado({ ...q, tenantId: "b" }), false, "ni a otro negocio");
  reloj += TOPE_POR_COBRO.windowMs;
  assert.equal(tope.frenado(q), false, "pasada la ventana");
});

test("tope: tampoco se puede barrer probando de a poco en muchos cobros", () => {
  const tope = crearTopeDeIntentos(() => AHORA);
  for (let i = 0; i < TOPE_POR_USUARIO.max; i++) tope.fallo({ tenantId: "a", userId: "u", collectionId: `c${i}` });
  assert.equal(tope.frenado({ tenantId: "a", userId: "u", collectionId: "otro" }), true);
});

test("tope: acertar limpia ese cobro, no el total del usuario", () => {
  const tope = crearTopeDeIntentos(() => AHORA);
  const q = { tenantId: "a", userId: "u", collectionId: "c1" };
  for (let i = 0; i < TOPE_POR_COBRO.max; i++) tope.fallo(q);
  tope.acierto(q);
  assert.equal(tope.frenado(q), false);
  for (let i = 0; i < TOPE_POR_USUARIO.max - TOPE_POR_COBRO.max; i++) tope.fallo({ ...q, collectionId: `c${i + 2}` });
  assert.equal(tope.frenado(q), true, "los fallos anteriores siguen contando para el usuario");
});
