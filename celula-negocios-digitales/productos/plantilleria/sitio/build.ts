// Build estático: renderiza todas las páginas a /out. Sin framework.
// El JS del cliente lo bundlea esbuild aparte (script build:client de package.json).
//
// Uso: tsx build.ts   (genera ./out con HTML + CSS listos para cualquier hosting de estáticos)

import { mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PLANTILLAS } from "./data/catalogo";
import { landing, producto, carrito, checkout, gracias } from "./src/render";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "out");

function escribir(rel: string, html: string): void {
  const full = join(OUT, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, html, "utf8");
  console.log("  ✓", rel);
}

function main(): void {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  console.log("Generando sitio estático → out/");

  // Páginas raíz
  escribir("index.html", landing());
  escribir("carrito/index.html", carrito());
  escribir("checkout/index.html", checkout());
  escribir("gracias/index.html", gracias());

  // Una ficha por plantilla (SSG)
  for (const p of PLANTILLAS) {
    escribir(`producto/${p.slug}/index.html`, producto(p));
  }

  // CSS (assets sin transformación)
  copyFileSync(join(ROOT, "styles", "globals.css"), join(OUT, "globals.css"));
  console.log("  ✓ globals.css");

  // 404 amigable (algunos hosts lo sirven; si no, no molesta)
  escribir("404.html", landing());

  const total = 5 + PLANTILLAS.length;
  console.log(`Listo: ${total} páginas + CSS en out/. Falta out/app.js (build:client).`);
}

main();
