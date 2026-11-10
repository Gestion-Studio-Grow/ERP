#!/usr/bin/env node
// Trinquete del kit de interfaz (src/components/ui).
//
// Cuenta, en las pantallas (todo `src/**/*.tsx` fuera del kit), los elementos «crudos» que el kit ya
// reemplaza: <button>, <input>, <table>, colores en hex y `style={`. Compara contra el piso guardado
// en scripts/trinquete-kit.json y FALLA si alguno SUBE. Bajar siempre está permitido: el piso sólo se
// mueve hacia abajo (de ahí «trinquete»). No pide dependencias ni build: lee archivos y cuenta.
//
//   node scripts/trinquete-kit.mjs               → compara contra el piso (lo que corre CI)
//   node scripts/trinquete-kit.mjs --actualizar  → guarda los números de hoy como piso nuevo
//
// Cuándo actualizar: cuando un cambio BAJA un número (para que no vuelva a subir). Subir el piso a
// mano es una decisión que se explica en el PR, no un arreglo para que pase el control.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(RAIZ, "src");
const PISO = join(RAIZ, "scripts", "trinquete-kit.json");

/** Carpetas que no son pantallas: el kit mismo (ahí viven los crudos legítimos) y código generado. */
const EXCLUIDAS = ["components/ui", "generated"];

export const PATRONES = {
  "<button>": /<button\b/g,
  "<input>": /<input\b/g,
  "<table>": /<table\b/g,
  hex: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g,
  "style={": /\bstyle=\{/g,
};

/** Cuenta cada patrón en un texto. Pura: la usa el recorrido y se puede probar sola. */
export function contar(texto) {
  const r = {};
  for (const [nombre, re] of Object.entries(PATRONES)) r[nombre] = (texto.match(re) ?? []).length;
  return r;
}

function* archivosTsx(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    const rel = relative(SRC, ruta).split(sep).join("/");
    if (e.isDirectory()) {
      if (e.name === "node_modules" || EXCLUIDAS.some((x) => rel === x || rel.startsWith(x + "/"))) continue;
      yield* archivosTsx(ruta);
    } else if (e.name.endsWith(".tsx") && !e.name.endsWith(".test.tsx")) {
      yield ruta;
    }
  }
}

export function medir() {
  const total = Object.fromEntries(Object.keys(PATRONES).map((k) => [k, 0]));
  const porArchivo = [];
  for (const ruta of archivosTsx(SRC)) {
    const c = contar(readFileSync(ruta, "utf8"));
    for (const k of Object.keys(total)) total[k] += c[k];
    porArchivo.push({ archivo: relative(RAIZ, ruta).split(sep).join("/"), ...c });
  }
  return { total, porArchivo };
}

function main() {
  const { total, porArchivo } = medir();
  if (process.argv.includes("--actualizar")) {
    writeFileSync(PISO, JSON.stringify(total, null, 2) + "\n");
    console.log("Piso nuevo guardado en scripts/trinquete-kit.json:", total);
    return;
  }
  const piso = JSON.parse(readFileSync(PISO, "utf8"));
  let subio = false;
  let bajo = false;
  console.log("Trinquete del kit — crudos en pantallas (hoy / piso):");
  for (const k of Object.keys(PATRONES)) {
    const hoy = total[k];
    const tope = piso[k] ?? 0;
    const marca = hoy > tope ? "✗ SUBIÓ" : hoy < tope ? "↓ bajó" : "=";
    if (hoy > tope) subio = true;
    if (hoy < tope) bajo = true;
    console.log(`  ${k.padEnd(9)} ${String(hoy).padStart(5)} / ${String(tope).padStart(5)}  ${marca}`);
  }
  if (subio) {
    console.error(
      "\nSubió la cuenta de elementos crudos. Usá el kit (Button, Field, Tabla/DataTable, tokens de color)\n" +
        "en vez de <button>/<input>/<table>/hex/style={ sueltos. Los archivos con más crudos:",
    );
    for (const k of Object.keys(PATRONES)) {
      if (total[k] <= (piso[k] ?? 0)) continue;
      const top = [...porArchivo].sort((a, b) => b[k] - a[k]).slice(0, 5);
      console.error(`  ${k}: ` + top.map((a) => `${a.archivo} (${a[k]})`).join(", "));
    }
    process.exit(1);
  }
  if (bajo) console.log("\nBajó: corré `npm run gate:trinquete -- --actualizar` y subí el piso nuevo en este mismo PR.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
