#!/usr/bin/env node
// ============================================================================
// SELLO GSG EN METADATA — `npm run gate:sello` (bloque 2 del Gate de Excelencia, la parte automática)
// ============================================================================
//
// Regla (docs/metodologia/estandar-marca-gsg.md): toda pantalla del BACKOFFICE lleva
// `metadata.generator = "Gestión Studio Grow"`, en la página o en un layout ancestro. La vidriera
// del negocio NO (el negocio conserva su marca visible), por eso se revisan sólo estas raíces —las
// de la suite de facturación y la consola de GSG—, no todo `src/app`.
//
// Exit 0 = ninguna pantalla nueva sin sello (la deuda conocida se informa). Exit 1 = alguna nueva sin sello. Sin dependencias, sin red.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { paginasSinSello } from "./lib.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Raíces de backoffice que tienen que llevar el sello. Sumar acá cada superficie nueva. */
export const RAICES_CON_SELLO = [
  "src/app/contador",
  "src/app/facturita",
  "src/app/operador/(console)",
  "src/app/admin/(dashboard)/facturacion",
];

/**
 * TRINQUETE: pantallas que YA estaban sin sello cuando nació este chequeo (2026-10-22). No frenan,
 * se informan como deuda; cualquier pantalla NUEVA sin sello sí frena. Al sellar una, se la saca de
 * acá (el chequeo avisa si sobra alguna, para que la lista sólo achique).
 */
export const DEUDA_CONOCIDA = [
  "src/app/admin/(dashboard)/facturacion/comprobante/[id]/page.tsx",
  "src/app/admin/(dashboard)/facturacion/page.tsx",
];

const aPosix = (p) => p.split(sep).join("/");

function recorrer(dir, salida) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) recorrer(ruta, salida);
    else salida.push(ruta);
  }
  return salida;
}

export function revisarSello(raiz = RAIZ, raices = RAICES_CON_SELLO) {
  const archivos = new Map();
  const paginas = [];
  // Se cargan los layouts de toda la cadena (de src/app hacia abajo) para poder subir por ancestros.
  for (const r of raices) {
    const abs = join(raiz, r);
    if (!existsSync(abs)) continue;
    for (const f of recorrer(abs, [])) {
      const rel = aPosix(relative(raiz, f));
      if (/\/page\.(tsx|ts|jsx|js)$/.test(rel)) paginas.push(rel);
      if (/\/(page|layout)\.(tsx|ts|jsx|js)$/.test(rel)) archivos.set(rel, readFileSync(f, "utf8"));
    }
    // Layouts ancestros fuera de la raíz (ej. src/app/admin/(dashboard)/layout.tsx).
    let d = dirname(abs);
    while (aPosix(relative(raiz, d)).startsWith("src/app")) {
      for (const n of ["layout.tsx", "layout.ts", "layout.jsx", "layout.js"]) {
        const l = join(d, n);
        if (existsSync(l)) archivos.set(aPosix(relative(raiz, l)), readFileSync(l, "utf8"));
      }
      if (aPosix(relative(raiz, d)) === "src/app") break;
      d = dirname(d);
    }
  }
  return { paginas: paginas.length, sinSello: paginasSinSello(archivos, paginas.sort()) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { paginas, sinSello } = revisarSello();
  const nuevas = sinSello.filter((p) => !DEUDA_CONOCIDA.includes(p));
  const deuda = sinSello.filter((p) => DEUDA_CONOCIDA.includes(p));
  const sobran = DEUDA_CONOCIDA.filter((p) => !sinSello.includes(p));
  if (deuda.length) {
    console.log(`⚠ Sello GSG — deuda conocida (no frena, sellar cuando se toque la pantalla):`);
    for (const p of deuda) console.log(`  · ${p}`);
  }
  if (sobran.length) {
    console.log(`ℹ Ya están selladas (o no existen): sacarlas de DEUDA_CONOCIDA en scripts/release/sello-gsg.mjs:`);
    for (const p of sobran) console.log(`  · ${p}`);
  }
  if (nuevas.length === 0) {
    console.log(`✔ Sello GSG: ${paginas - deuda.length} de ${paginas} pantallas de backoffice llevan metadata.generator; ninguna nueva sin sello.`);
    process.exit(0);
  }
  console.log(`✖ Sello GSG: ${nuevas.length} pantalla(s) NUEVA(S) sin metadata.generator = "Gestión Studio Grow":`);
  for (const p of nuevas) console.log(`  · ${p}`);
  console.log(`\nCómo se arregla: en la página o en su layout,\n  export const metadata = { generator: "Gestión Studio Grow" };`);
  process.exit(1);
}
