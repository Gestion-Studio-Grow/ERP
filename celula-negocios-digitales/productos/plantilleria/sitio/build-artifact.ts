// Build del ARTIFACT: un ÚNICO archivo HTML navegable sin servidor (para publicar como
// Artifact de Claude y probar la demo YA, sin esperar el deploy). Reusa las MISMAS vistas
// (render.ts) y la MISMA lógica pura del carrito (checkout.ts vía artifact-client.ts).
//
// Salida = "body-content" (sin <!doctype>/<html>/<head>/<body>): el publicador de Artifacts
// envuelve el contenido en su propio esqueleto. Igual queda abrible en cualquier navegador.
//
// Uso: tsx build-artifact.ts [rutaSalida.html]   (default: ./artifact/plantilleria-demo.html)

import { buildSync } from "esbuild";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { landing, producto, carrito, checkout, gracias } from "./src/render";
import { PLANTILLAS } from "./data/catalogo";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || join(ROOT, "artifact", "plantilleria-demo.html");

/** Extrae el interior de <main>…</main> de un documento renderizado. */
function mainOf(html: string): string {
  const m = html.match(/<main>([\s\S]*?)<\/main>/);
  if (!m) throw new Error("no se encontró <main> en la página");
  return m[1];
}

/** Convierte los links de servidor (/plantilleria/…) en hash-routes del artifact. */
function toHash(s: string): string {
  return s
    .replace(/href="\/plantilleria\/producto\/([^"#]+)"/g, 'href="#/producto/$1"')
    .replace(/href="\/plantilleria\/carrito"/g, 'href="#/carrito"')
    .replace(/href="\/plantilleria\/checkout"/g, 'href="#/checkout"')
    .replace(/href="\/plantilleria\/gracias"/g, 'href="#/gracias"')
    .replace(/href="\/plantilleria#faq"/g, 'href="#faq"')
    .replace(/href="\/plantilleria#catalogo"/g, 'href="#/"')
    .replace(/href="\/plantilleria"/g, 'href="#/"');
}

// 1) Rutas pre-renderizadas (reusan render.ts) → objeto path → HTML.
const routes: Record<string, string> = {
  "/": toHash(mainOf(landing())),
  "/carrito": toHash(mainOf(carrito())),
  "/checkout": toHash(mainOf(checkout())),
  "/gracias": toHash(mainOf(gracias())),
};
for (const p of PLANTILLAS) routes[`/producto/${p.slug}`] = toHash(mainOf(producto(p)));

// 2) CSS inline (fuente de verdad del sitio).
const css = readFileSync(join(ROOT, "styles", "globals.css"), "utf8");

// 3) Cliente del artifact bundleado (reusa checkout.ts).
const bundle = buildSync({
  entryPoints: [join(ROOT, "src", "artifact-client.ts")],
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: true,
  write: false,
});
const appJs = bundle.outputFiles[0].text;

// 4) Chrome (barra demo + header con hash-links + #app + footer + toast).
const chrome = `
<style>${css}</style>
<div class="demo-bar" role="note">
  🧪 <strong>Demo</strong> · Es una tienda de demostración: el pago con Mercado Pago está en
  <strong>modo demo</strong>, no se cobra plata real ni se guardan tus datos.
</div>
<header class="header">
  <div class="contenedor header-in">
    <a href="#/" class="logo">Plantillería<span class="logo-ar">.ar</span></a>
    <nav class="nav">
      <a href="#/">Plantillas</a>
      <a href="#faq">Preguntas</a>
      <a class="cart-link" href="#/carrito" aria-label="Ver carrito">
        🛒 <span class="cart-count" data-cart-count hidden>0</span>
      </a>
      <a class="btn btn-primario btn-sm" href="#/">Ver catálogo</a>
    </nav>
  </div>
</header>
<main id="app"><!-- el router monta la vista según location.hash --></main>
<footer class="footer">
  <div class="contenedor">
    <p class="footer-brand">Plantillería.ar</p>
    <p>Plantillas de gestión localizadas a la normativa argentina. Producto digital de
      Gestión Studio Grow.</p>
    <p class="footer-fine">Herramientas de organización. No reemplazan el asesoramiento de un
      contador matriculado. Verificá siempre los valores vigentes en ARCA/AFIP.</p>
    <p class="footer-fine">© 2026 Plantillería.ar — Todos los derechos reservados.</p>
    <p class="footer-seal">Hecho con estándar de calidad — <strong>Gestión Studio Grow</strong></p>
  </div>
</footer>
<div class="toast" data-toast hidden></div>
<script>window.__ROUTES__ = ${JSON.stringify(routes)};</script>
<script>${appJs}</script>`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, chrome, "utf8");
console.log(`Artifact escrito → ${OUT} (${(chrome.length / 1024).toFixed(0)} KB, ${Object.keys(routes).length} rutas)`);
