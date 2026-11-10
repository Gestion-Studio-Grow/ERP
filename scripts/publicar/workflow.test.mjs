// node --test scripts/publicar/
// El workflow de publicar: dónde corre y qué secretos ve (certificación adversarial sobre 02ac61dc).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const YML = readFileSync(new URL("../../.github/workflows/publicar.yml", import.meta.url), "utf8");
const sinComentarios = YML.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
/** Bloque de un job (desde `  nombre:` hasta el próximo job de igual sangría). */
const job = (nombre) => {
  const m = new RegExp(String.raw`\n  ${nombre}:\n([\s\S]*?)(?=\n  [A-Za-z][\w-]*:\n|$)`).exec(sinComentarios);
  assert.ok(m, `no está el job ${nombre}`);
  return m[1];
};

test("pull_request_target sólo para PR contra main", () => {
  const on = /\non:\n([\s\S]*?)\n\S/.exec(sinComentarios)[1];
  assert.match(on, /pull_request_target:/);
  assert.match(on, /\n\s+branches:\s*\[\s*main\s*\]/);
  assert.doesNotMatch(on, /branches-ignore/);
});

test("el job que publica usa el environment produccion; el resto no toca secretos", () => {
  assert.match(job("publicar"), /\n    environment:\s*produccion\s*(\n|$)/);
  const enCola = job("en-cola");
  const secretos = [...enCola.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(secretos)], ["GITHUB_TOKEN"]);
  // Fuera del job publicar, ningún secreto de cuentas.
  const fuera = sinComentarios.replace(job("publicar"), "");
  assert.doesNotMatch(fuera, /secrets\.(?:NEON|VERCEL|PUBLICAR)_/);
});
