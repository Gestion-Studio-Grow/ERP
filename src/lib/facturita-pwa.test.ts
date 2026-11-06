/** Tests de la app instalable de Facturita: manifiesto y el service worker mínimo. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  ICONOS_FACTURITA,
  OFFLINE_FACTURITA_URL,
  SCOPE_FACTURITA,
  START_URL_FACTURITA,
  SW_FACTURITA_URL,
  THEME_COLOR_FACTURITA,
  manifestFacturita,
} from "@/lib/facturita-pwa";
import { resolveAccent } from "@/lib/branding";
import { FACTOQUE_VERDE, dataUriFactoque, svgFactoque } from "@/lib/factoque-icono";

const PUBLIC = path.join(process.cwd(), "public");
const APP = path.join(process.cwd(), "src", "app");

test("manifiesto: standalone, arranca en /facturita/app y no se sale de /facturita/", () => {
  const m = manifestFacturita();
  assert.equal(m.display, "standalone");
  assert.equal(m.start_url, "/facturita/app");
  assert.equal(m.scope, SCOPE_FACTURITA);
  assert.ok(m.start_url.startsWith(m.scope.slice(0, -1)));
  for (const s of m.shortcuts) assert.ok(s.url.startsWith(SCOPE_FACTURITA), s.url);
  assert.equal(m.lang, "es-AR");
});

test("manifiesto: íconos 192 y 512 (uno maskable), y cada uno tiene su ruta generada", () => {
  const tamaños = ICONOS_FACTURITA.map((i) => i.sizes);
  assert.ok(tamaños.includes("192x192"));
  assert.ok(tamaños.includes("512x512"));
  assert.ok(ICONOS_FACTURITA.some((i) => i.purpose === "maskable"));
  // Sin binarios en Git: cada ícono es una ruta que lo genera en el build desde el SVG de marca.
  for (const i of ICONOS_FACTURITA) {
    assert.ok(existsSync(path.join(APP, i.src, "route.ts")), i.src);
    assert.ok(!existsSync(path.join(PUBLIC, i.src)), `${i.src} no debe quedar también en public/`);
  }
  assert.ok(existsSync(path.join(PUBLIC, OFFLINE_FACTURITA_URL)));
});

test("el color de la barra es el verde de Factoque (el mismo del ícono)", () => {
  assert.equal(THEME_COLOR_FACTURITA, FACTOQUE_VERDE);
  assert.equal(resolveAccent("monte", "light").accent.toLowerCase(), FACTOQUE_VERDE.toLowerCase());
  assert.match(svgFactoque(), new RegExp(`fill="${FACTOQUE_VERDE}"`));
});

test("ícono: el maskable achica el dibujo para la zona segura y ambos son SVG válidos", () => {
  const normal = svgFactoque();
  const seguro = svgFactoque({ zonaSegura: true });
  assert.match(normal, /^<svg [^>]*viewBox="0 0 1024 1024"/);
  assert.match(normal, /scale\(0\.8\)/);
  assert.match(normal, /translate\(60 110\)/); // el encuadre del SVG fuente
  assert.match(seguro, /scale\(0\.62\)/);
  assert.ok(dataUriFactoque().startsWith("data:image/svg+xml;base64,"));
});

test("service worker: alcance /facturita/, sólo precarga lo público y nunca guarda navegaciones", () => {
  assert.ok(SW_FACTURITA_URL.startsWith(SCOPE_FACTURITA));
  assert.equal(START_URL_FACTURITA.startsWith(SCOPE_FACTURITA.slice(0, -1)), true);
  const sw = readFileSync(path.join(PUBLIC, SW_FACTURITA_URL), "utf8");
  // Lo único que entra a la caché es la lista PRECACHE (addAll en install): ni put() ni respuestas de red.
  assert.doesNotMatch(sw, /\.put\(/);
  assert.match(sw, /addAll\(/);
  assert.match(sw, new RegExp(OFFLINE_FACTURITA_URL.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")));
  // Lo que no es GET (server actions, formularios) no se toca.
  assert.match(sw, /pedido\.method !== "GET"\) return/);
  // Nada de la app con sesión ni de /api en la precarga.
  const precarga = sw.slice(sw.indexOf("const PRECACHE"), sw.indexOf("];", sw.indexOf("const PRECACHE")));
  assert.doesNotMatch(precarga, /\/facturita\/app|\/api\//);
});
