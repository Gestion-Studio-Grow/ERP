// Tests del sitio estático por negocio (Circuito WPE en wpe.gsgapp.com.ar). Cubren las dos llaves:
// la reescritura por host de next.config (sólo el host del negocio) y el manejador, que sirve sólo al
// negocio dueño del sitio y falla cerrado para cualquier otro (aislamiento por negocio, estándar §3).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  SITIOS_ESTATICOS,
  PREFIJO_SITIO_ESTATICO,
  carpetasParaTrazar,
  patronDeHost,
  reescriturasDeSitiosEstaticos,
  responderSitioEstatico,
  sitioDelNegocio,
  redireccionesDeSitiosEstaticos,
} from "./sitio-estatico";
import { extractSubdomain } from "./tenant";

const RAIZ = process.cwd();
const WPE = sitioDelNegocio("circuito-wpe")!;
const htmlDeWpe = () => readFileSync(path.join(RAIZ, WPE.carpeta, "index.html"), "utf8");
// Lector de mentira: registra lo pedido y devuelve bytes fijos.
function lectorEspia() {
  const pedidos: string[] = [];
  const leer = async (ruta: string) => {
    pedidos.push(ruta);
    return new Uint8Array(new TextEncoder().encode(`contenido de ${ruta}`));
  };
  return { pedidos, leer };
}
// Como aplica Next el `has` de tipo host: expresión anclada contra el hostname sin puerto.
const reescribe = (host: string) =>
  reescriturasDeSitiosEstaticos().filter((r) => r.has.some((h) => new RegExp(`^${h.value}$`).test(host)));

test("el negocio circuito-wpe tiene su sitio en el subdominio wpe", () => {
  assert.ok(WPE, "circuito-wpe debe estar registrado");
  assert.equal(WPE.subdominio, "wpe");
});

test("la raíz y los adjuntos de wpe.gsgapp.com.ar van al manejador del sitio", () => {
  const reglas = reescribe("wpe.gsgapp.com.ar");
  const porOrigen = Object.fromEntries(reglas.map((r) => [r.source, r.destination]));
  assert.deepEqual(porOrigen, {
    "/": PREFIJO_SITIO_ESTATICO,
    "/manual.pdf": `${PREFIJO_SITIO_ESTATICO}/manual.pdf`,
    "/og.png": `${PREFIJO_SITIO_ESTATICO}/og.png`,
    "/apple-touch-icon.png": `${PREFIJO_SITIO_ESTATICO}/apple-touch-icon.png`,
  });
  assert.equal(reescribe("wpe.localhost").length, reglas.length, "el laboratorio usa wpe.localhost");
});

test("ningún otro host se reescribe: CH, Magra, Qué Bien Olés y los parecidos siguen en su página", () => {
  for (const host of [
    "chestetica.gsgapp.com.ar",
    "magra.gsgapp.com.ar",
    "quebienoles.gsgapp.com.ar",
    "adosmanos.gsgapp.com.ar",
    "wpex.gsgapp.com.ar",
    "xwpe.gsgapp.com.ar",
    "gsgapp.com.ar",
    "wpe",
    "erp-ch.vercel.app",
  ]) {
    assert.equal(reescribe(host).length, 0, `${host} no debe reescribirse`);
  }
});

test("el host que reescribe next.config es el mismo que tenant.ts resuelve al subdominio del sitio", () => {
  const antes = process.env.APP_BASE_DOMAIN;
  process.env.APP_BASE_DOMAIN = "gsgapp.com.ar";
  try {
    assert.equal(extractSubdomain("wpe.gsgapp.com.ar"), WPE.subdominio);
  } finally {
    if (antes === undefined) delete process.env.APP_BASE_DOMAIN;
    else process.env.APP_BASE_DOMAIN = antes;
  }
});

test("el patrón de host escapa el subdominio y exige un dominio detrás", () => {
  assert.equal(patronDeHost("wpe"), "wpe\\..+");
  assert.equal(patronDeHost("a.b"), "a\\.b\\..+");
});

test("el negocio dueño recibe su página con tipo, caché privada y cabeceras de seguridad", async () => {
  const { pedidos, leer } = lectorEspia();
  const r = await responderSitioEstatico("circuito-wpe", undefined, leer);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "text/html; charset=utf-8");
  assert.match(r.headers.get("cache-control") ?? "", /^private/);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(pedidos, ["src/tenants/circuito-wpe/sitio/index.html"]);
  const pdf = await responderSitioEstatico("circuito-wpe", ["manual.pdf"], leer);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
});

test("aislamiento: otro negocio, o un host sin negocio, no ve el sitio ni se lee nada del disco", async () => {
  for (const slug of [null, "beauty-spa", "magra", "adosmanos", "quebienoles", ""]) {
    const { pedidos, leer } = lectorEspia();
    const r = await responderSitioEstatico(slug, undefined, leer);
    assert.equal(r.status, 404, `slug ${String(slug)}`);
    assert.equal(await r.text(), "No encontrado");
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.deepEqual(pedidos, []);
  }
});

test("sólo se sirven los archivos registrados: nada de rutas armadas desde la URL", async () => {
  for (const segmentos of [
    ["..", "..", ".env"],
    ["..%2F..%2F.env"],
    ["manual.pdf", "x"],
    ["MANUAL.PDF"],
    ["index.html"],
    ["__proto__"],
    ["constructor"],
  ]) {
    const { pedidos, leer } = lectorEspia();
    const r = await responderSitioEstatico("circuito-wpe", segmentos, leer);
    assert.equal(r.status, 404, segmentos.join("/"));
    assert.deepEqual(pedidos, []);
  }
});

test("el registro no repite negocios ni subdominios y los subdominios son válidos", () => {
  const slugs = SITIOS_ESTATICOS.map((s) => s.slug);
  const subs = SITIOS_ESTATICOS.map((s) => s.subdominio);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(new Set(subs).size, subs.length);
  for (const sub of subs) assert.match(sub, /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
});

test("cada archivo registrado existe y su carpeta entra en el trazado de la función", () => {
  for (const sitio of SITIOS_ESTATICOS) {
    for (const { archivo } of Object.values(sitio.archivos)) {
      assert.ok(existsSync(path.join(RAIZ, sitio.carpeta, archivo)), `${sitio.carpeta}/${archivo}`);
    }
  }
  assert.deepEqual(carpetasParaTrazar(), ["./src/tenants/circuito-wpe/sitio/**/*"]);
});

test("el cuerpo del sitio es el que vio el cliente: el pulido sólo tocó el <head>", () => {
  const html = htmlDeWpe();
  const cuerpo = html.slice(html.indexOf("</head>"));
  const hash = createHash("sha256").update(cuerpo).digest("hex");
  // sha256 del <body> de /home/user/circuito-wpe/deploy/index.html, la demo publicada (26/09/2026).
  assert.equal(hash, "e34cd7f9d9b727c2cd95b949dd8f6254662dca584ed5c7f1a6e8ec4bf735dc09");
  assert.match(html, /<h1>Etapa 4<br><span class="lm">Major 2026<\/span><\/h1>/);
  assert.match(html, /<script id="wpeEngine">/);
});

test("metadatos: canónica y tarjeta con la dirección propia, sello GSG sólo en metadatos", () => {
  const html = htmlDeWpe();
  assert.match(html, /<html lang="es-AR">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/wpe\.gsgapp\.com\.ar\/">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/wpe\.gsgapp\.com\.ar\/og\.png">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/wpe\.gsgapp\.com\.ar\/">/);
  assert.match(html, /<meta name="generator" content="Gestión Studio Grow">/);
  assert.match(html, /<meta name="description" content="[^"]+">/);
});

test("la tipografía es propia: sin Google Fonts y con la fuente precargada que existe en public/", () => {
  const html = htmlDeWpe();
  assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/);
  const precarga = html.match(/<link rel="preload" href="([^"]+\.woff2)" as="font" type="font\/woff2" crossorigin>/);
  assert.ok(precarga, "falta la precarga de la fuente");
  assert.ok(existsSync(path.join(RAIZ, "public", precarga[1])), precarga[1]);
  assert.ok(existsSync(path.join(RAIZ, "public/tenants/circuito-wpe/fuentes/LICENCIAS.txt")));
  assert.match(html, /font-family:'Inter','Inter Fallback',/);
});

test("el respaldo de la fuente carga también en Android y Linux, donde no hay Arial", () => {
  const cara = htmlDeWpe().match(/@font-face\{font-family:'Inter Fallback';src:([^;]+);/);
  assert.ok(cara, "falta la cara de respaldo");
  for (const local of ["Arial", "Helvetica", "Liberation Sans", "Roboto"]) {
    assert.ok(cara[1].includes(`local('${local}')`), local);
  }
});

test("toques de 44 px con el dedo en menú, logo, botones, pie y modales", () => {
  const html = htmlDeWpe();
  const inicio = html.indexOf("@media (pointer:coarse){");
  assert.ok(inicio > 0, "falta el bloque de punteros gruesos");
  const bloque = html.slice(inicio, html.indexOf("\n  }\n", inicio));
  for (const regla of [
    ".btn{min-height:44px}",
    ".wm{min-height:44px}",
    ".m-nav a{min-height:44px",
    ".f-col a{min-height:44px",
    ".f-orglink{min-height:44px}",
    ".m-x{width:44px;height:44px}",
    ".mtabs button{min-height:44px}",
    ".m-links button{min-height:44px}",
    ".fcheck{min-height:44px}",
  ]) {
    assert.ok(bloque.includes(regla), regla);
  }
  // Los selectores existen en la página: una regla que no alcanza a nada no achica ningún blanco.
  for (const clase of ["f-col", "f-orglink", "m-x", "mtabs", "m-links", "fcheck", "m-nav"]) {
    assert.match(html, new RegExp(`<[a-z]+ [^>]*class="${clase}[" ]`), clase);
  }
});

test("todo foco con teclado se ve: la búsqueda rápida recupera su anillo", () => {
  const html = htmlDeWpe();
  assert.match(html, /\.pal-in input\{[^}]*outline:none/);
  assert.ok(html.includes(".pal-in:focus-within{outline:2px solid var(--lime)"));
});

test("sello GSG sólo en metadatos (ADR-043): el pie no lo muestra", () => {
  const html = htmlDeWpe();
  const head = html.slice(0, html.indexOf("</head>"));
  assert.ok(head.includes(".foot-base-in .gsg{display:none}"));
  assert.match(html, /<span class="gsg">Powered by <b>Gestión Studio Grow<\/b><\/span>/);
});

test("el ingreso al panel de WPE lleva su nombre, no el \"Mi negocio\" de un negocio sin ficha", async () => {
  const { brandForSlug } = await import("./branding");
  const marca = brandForSlug("circuito-wpe");
  assert.equal(marca.name, "Circuito WPE");
  assert.equal(marca.monogram, "WPE");
  assert.equal(brandForSlug("beauty-spa").name, "CH Estética");
});

test("en wpe, la tienda y la reserva genéricas llevan a la portada del sitio; el panel no se toca", () => {
  const redirige = (host: string) =>
    redireccionesDeSitiosEstaticos().filter((r) => r.has.some((h) => new RegExp(`^${h.value}$`).test(host)));
  const deWpe = redirige("wpe.gsgapp.com.ar");
  assert.deepEqual(deWpe.map((r) => r.source).sort(), ["/reserva", "/reserva/:resto*", "/tienda", "/tienda/:resto*"]);
  assert.ok(deWpe.every((r) => r.destination === "/" && r.permanent === false), "temporal y a la portada");
  assert.ok(!deWpe.some((r) => r.source.startsWith("/admin")), "el panel del negocio sigue accesible");
  for (const host of ["chestetica.gsgapp.com.ar", "magra.gsgapp.com.ar", "quebienoles-erp.vercel.app", "wpex.gsgapp.com.ar"]) {
    assert.deepEqual(redirige(host), [], `${host} conserva su tienda y su reserva`);
  }
});
