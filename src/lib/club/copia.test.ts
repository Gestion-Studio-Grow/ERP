// Fijación de la copia controlada del dominio del club (BP-1, docs/producto/PLAN-TERMINALES-MOSTRADOR.md §4.3).
//
// Cada archivo copiado tiene que coincidir con el sha256 que quedó registrado en ORIGEN.json. NO se compara con la
// fuente viva de public/previews/breakpoint/**: esa la sigue arreglando la sesión del club durante el piloto, y un
// test de equivalencia rompería su suite en cada arreglo. Para traer los cambios de la fuente:
// `node scripts/club-resync.mjs` (muestra la diferencia) y `--apply` (copia y actualiza ORIGEN.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = join(import.meta.dirname, "..", "..", "..");
const DIR = import.meta.dirname;
const ORIGEN = JSON.parse(readFileSync(join(DIR, "ORIGEN.json"), "utf8")) as {
  commit: string;
  archivos: Record<string, { fuente: string; sha256: string }>;
};

const sha256 = (ruta: string) => createHash("sha256").update(readFileSync(join(RAIZ, ruta))).digest("hex");

test("ORIGEN.json fija un commit completo y una fuente por archivo", () => {
  assert.match(ORIGEN.commit, /^[0-9a-f]{40}$/);
  for (const [copia, { fuente, sha256: hash }] of Object.entries(ORIGEN.archivos)) {
    assert.ok(copia.startsWith("src/lib/club/"), `${copia}: la copia vive en src/lib/club/`);
    assert.ok(fuente.startsWith("public/previews/breakpoint/"), `${copia}: la fuente es la del piloto`);
    assert.match(hash, /^[0-9a-f]{64}$/, `${copia}: sha256 inválido`);
  }
});

test("cada copia coincide con su sha256 de ORIGEN.json (la copia no se edita a mano)", () => {
  for (const [copia, { sha256: esperado }] of Object.entries(ORIGEN.archivos)) {
    assert.equal(sha256(copia), esperado, `${copia} cambió: no se edita a mano, se resincroniza con scripts/club-resync.mjs`);
  }
});

test("todo .mjs de src/lib/club/ está registrado en ORIGEN.json (no hay JS suelto sin origen)", () => {
  const mjs = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? mjs(join(dir, d.name)) : d.name.endsWith(".mjs") ? [relative(RAIZ, join(dir, d.name)).split("\\").join("/")] : [],
    );
  assert.deepEqual(mjs(DIR).sort(), Object.keys(ORIGEN.archivos).sort());
});

test("la copia no depende de public/ ni de src/tenants/ (sus imports se resuelven dentro de src/lib/club/)", () => {
  let imports = 0;
  for (const copia of Object.keys(ORIGEN.archivos)) {
    const texto = readFileSync(join(RAIZ, copia), "utf8");
    assert.doesNotMatch(texto, /\bimport\s*\(/, `${copia}: no usa import() dinámico`);
    assert.doesNotMatch(texto, /\brequire\s*\(/, `${copia}: no usa require()`);
    for (const [, ruta] of texto.matchAll(/^\s*(?:import|export)\s+(?:[\w$*{}\s,]+\s+from\s+)?["']([^"']+)["']/gm)) {
      assert.ok(ruta.startsWith("."), `${copia}: import no relativo «${ruta}»`);
      const destino = relative(RAIZ, join(RAIZ, copia, "..", ruta)).split("\\").join("/");
      assert.ok(destino in ORIGEN.archivos, `${copia}: «${ruta}» sale de la copia (${destino})`);
      imports++;
    }
  }
  assert.equal(imports, 3, "nucleo.mjs importa motor, conciliacion e identidad (si cambia, revisar esta guardia)");
});
