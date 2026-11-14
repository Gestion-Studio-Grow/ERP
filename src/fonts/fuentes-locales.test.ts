// Guarda de D11 (10/11/2026): el build no depende de la red para las letras.
//   · ningún archivo de src importa el cargador de Google de next/font (el build lo bajaba en cada corrida y,
//     sin red hacia Google Fonts, `next build` caía con «Can't resolve .../font/google/font»);
//   · cada `.woff2` que nombra un `localFont` existe en src/fonts/ y cada familia trae su licencia (OFL.txt).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
const SRC = path.join(RAIZ, "src");
const FUENTES = path.join(SRC, "fonts");
// Armado por partes para que este mismo archivo no se delate.
const GOOGLE = ["next", "font", "google"].join("/");

function archivos(dir: string): string[] {
  const out: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const p = path.join(dir, nombre);
    if (statSync(p).isDirectory()) out.push(...archivos(p));
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(nombre)) out.push(p);
  }
  return out;
}

const rel = (p: string) => path.relative(RAIZ, p).split(path.sep).join("/");

test("ningún archivo de src importa las letras de Google: van con next/font/local desde src/fonts/", () => {
  const importa = new RegExp(`(from|import|require\\()\\s*\\(?\\s*["'\`]${GOOGLE.replace(/\//g, "\\/")}["'\`]`);
  const culpables = archivos(SRC).filter((f) => importa.test(readFileSync(f, "utf8"))).map(rel);
  assert.deepEqual(culpables, [], `importan ${GOOGLE}: pasalas a next/font/local (src/fonts/<familia>/)`);
});

test("cada .woff2 que nombra un localFont existe, y cada familia de src/fonts trae su licencia", () => {
  const usados = new Set<string>();
  for (const f of archivos(SRC)) {
    const texto = readFileSync(f, "utf8");
    if (!texto.includes('from "next/font/local"')) continue;
    for (const [, ruta] of texto.matchAll(/["']([^"']+\.woff2)["']/g)) {
      const absoluta = path.resolve(path.dirname(f), ruta);
      assert.ok(existsSync(absoluta), `${rel(f)} nombra ${ruta} y no existe`);
      usados.add(absoluta);
    }
  }
  assert.ok(usados.size > 0, "no se encontró ningún localFont");
  for (const familia of readdirSync(FUENTES).filter((d) => statSync(path.join(FUENTES, d)).isDirectory())) {
    const dir = path.join(FUENTES, familia);
    assert.ok(existsSync(path.join(dir, "OFL.txt")), `src/fonts/${familia} sin OFL.txt`);
    for (const w of readdirSync(dir).filter((n) => n.endsWith(".woff2"))) {
      assert.ok(usados.has(path.join(dir, w)), `src/fonts/${familia}/${w} no lo usa nadie: sacalo`);
    }
  }
});
