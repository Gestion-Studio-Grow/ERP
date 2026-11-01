// Copia el sitio público de MIA Producciones (WordPress) a archivos propios, para servirlo desde su
// subdominio con src/lib/sitio-estatico.ts. Con autorización de marca del dueño (01/11/2026). Sólo lee
// páginas públicas: no envía formularios ni entra al WordPress.
//
//   node scripts/proyectos/copiar-sitio-mia.mjs <carpeta de salida> [--har <recording.har>]
//
// Salida: <carpeta>/paginas/*.html y <carpeta>/activos/**. Lo descargado no se ejecuta acá. Qué cambia:
//   · Sin mediciones de terceros (Google, Meta, AddToAny, reCAPTCHA): en una copia ensuciarían sus datos.
//   · Sus scripts, estilos y su letra se sirven desde la copia, sin depender de su servidor ni de otros CDN.
//   · noindex: la que tiene que indexar Google es la original mientras exista.
//   · El formulario no puede publicar en su WordPress: lo atiende contacto.js.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";

const salida = process.argv[2];
if (!salida) throw new Error("Falta la carpeta de salida.");
const iHar = process.argv.indexOf("--har");
const rutaHar = iHar > 0 ? process.argv[iHar + 1] : null;

const ORIGEN = "https://miaproducciones.com.ar";
const PREFIJO = "/tenants/mia-producciones/sitio";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0 Safari/537.36";
const FUENTES = "https://fonts.googleapis.com/css2?family=Work+Sans:ital,wght@0,100..900;1,100..900&display=swap";
const CDN = {
  "https://cdnjs.cloudflare.com/ajax/libs/OwlCarousel2/2.3.4/": "vendor/owl/",
  "https://cdn.jsdelivr.net/npm/jquery.marquee@1.6.1/": "vendor/marquee/",
};

const paginas = new Map(); // ruta ("" = portada) → html original
const activos = new Map(); // url absoluta sin query → ruta dentro de activos/
let bytes = 0;

const traer = async (url, comoTexto = true) => {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "*/*" }, signal: AbortSignal.timeout(120_000) }).catch(() => null);
    if (r?.ok) return comoTexto ? r.text() : Buffer.from(await r.arrayBuffer());
    if (r && r.status === 404) return null;
    await new Promise((o) => setTimeout(o, 1500 * (i + 1)));
  }
  return null;
};

const sinQuery = (u) => u.split(/[?#]/, 1)[0];
// Su tema pide el marquee sin protocolo («//cdn.jsdelivr…»): se lo completa para reconocerlo como cualquier otro.
const conProtocolo = (t) => t.replace(/(["'])\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)\//g, "$1https://$2/");
const desescapar = (u) => u.replace(/\\\//g, "/");

function rutaDeActivo(url) {
  const limpia = sinQuery(url);
  for (const [base, destino] of Object.entries(CDN)) if (limpia.startsWith(base)) return destino + limpia.slice(base.length);
  if (limpia.startsWith(ORIGEN + "/wp-") || limpia.startsWith(ORIGEN + "/images/")) return decodeURI(limpia.slice(ORIGEN.length + 1));
  return null;
}

/** Las URLs de activos que nombra un HTML, CSS o JS. */
function urlsEn(textoCrudo) {
  const texto = conProtocolo(textoCrudo);
  const res = new Set();
  const propio = /https?:(?:\\?\/){2}miaproducciones\.com\.ar(?:\\?\/)wp-(?:content|includes)(?:\\?\/)[^"'\s)<>,\\]*(?:\\?\/[^"'\s)<>,\\]*)*/g;
  for (const m of texto.matchAll(propio)) res.add(desescapar(m[0]).replace(/^http:/, "https:"));
  const rel = /["'(]\/(wp-(?:content|includes)\/[^"'\s)<>]+)/g;
  for (const m of texto.matchAll(rel)) res.add(`${ORIGEN}/${m[1]}`);
  // Su portada nombra algunas imágenes relativas a la raíz («images/creamos2.svg»).
  for (const m of texto.matchAll(/["'(]\/?(images\/[^"'\s)<>]+)/g)) res.add(`${ORIGEN}/${m[1]}`);
  for (const base of Object.keys(CDN)) {
    const esc =base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const m of texto.matchAll(new RegExp(`${esc}[^"'\\s)<>]+`, "g"))) res.add(m[0]);
  }
  return res;
}

async function bajarActivo(url, cola) {
  const clave = sinQuery(url);
  if (activos.has(clave)) return;
  const ruta = rutaDeActivo(clave);
  // Una ruta sin archivo («…/uploads/») es un texto del tema, no un activo.
  if (!ruta || !/\.[a-z0-9]+$/i.test(ruta)) return;
  activos.set(clave, ruta);
  const destino = join(salida, "activos", ...ruta.split("/"));
  if (existsSync(destino)) {
    bytes += readFileSync(destino).length;
    if (/\.css$/i.test(ruta)) encolarDeCss(clave, readFileSync(destino, "utf8"), cola);
    return;
  }
  const cuerpo = await traer(url, false);
  if (!cuerpo) return void console.log("  sin bajar:", url);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, cuerpo);
  bytes += cuerpo.length;
  if (/\.css$/i.test(ruta)) encolarDeCss(clave, cuerpo.toString("utf8"), cola);
}

/** Lo que nombra un CSS, incluso con rutas relativas a él. */
function encolarDeCss(urlCss, css, cola) {
  for (const u of urlsEn(css)) cola.add(u);
  for (const m of css.matchAll(/url\(\s*["']?(?!data:|https?:|\/\/|#)([^"')]+)["']?\s*\)/g)) {
    const base = posix.dirname(new URL(urlCss).pathname);
    const u = new URL(urlCss);
    cola.add(`${u.origin}${posix.normalize(posix.join(base, sinQuery(m[1])))}`);
  }
}

const TERCEROS = /googletagmanager|google-analytics|gstatic\.com\/recaptcha|google\.com\/recaptcha|connect\.facebook|doubleclick|addtoany|wp-emoji|contact-form-7|wp-includes\/js\/dist\//i;
const INLINE_TERCEROS = /gtag\(|fbq\(|dataLayer|googletag|a2a_config|a2a\.|wpcf7|wp\.i18n|_wpemojiSettings|grecaptcha|wp-i18n/;

/** La página lista para servir desde la copia. */
function adaptar(html, ruta) {
  let t = conProtocolo(html);
  t = t.replace(/<!--[\s\S]*?-->/g, "");
  t = t.replace(/<noscript>[\s\S]*?<\/noscript>/gi, (b) => (/facebook\.com\/tr|googletagmanager|doubleclick/i.test(b) ? "" : b));
  t = t.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (b, attrs, cuerpo) => {
    const src = /\bsrc=["']([^"']+)/i.exec(attrs)?.[1] ?? "";
    if (src ? TERCEROS.test(src) : INLINE_TERCEROS.test(cuerpo)) return "";
    return b;
  });
  t = t.replace(/<link\b[^>]*rel=["'](?:dns-prefetch|preconnect|pingback|EditURI|alternate|shortlink|https:\/\/api\.w\.org\/|wlwmanifest)["'][^>]*>\s*/gi, "");
  t = t.replace(/<link\b[^>]*(?:addtoany|contact-form-7)[^>]*>\s*/gi, "");
  // Su tema la pide dos veces (un <link> y un @import con todos los pesos): queda una sola, la que los trae todos.
  t = t.replace(/<link\b[^>]*fonts\.googleapis\.com[^>]*>\s*/gi, "");
  t = t.replace(/@import url\(["']https:\/\/fonts\.googleapis\.com[^)]*\)/gi, `@import url('${PREFIJO}/vendor/fuentes/work-sans.css')`);
  t = t.replace(/<meta\b[^>]*name=["']generator["'][^>]*>\s*/gi, "");
  t = t.replace(/<meta\b[^>]*name=["']robots["'][^>]*>\s*/gi, "");
  t = t.replace(/<head([^>]*)>/i, `<head$1>\n<meta name="robots" content="noindex">`);
  t = t.replace(/<form\b[^>]*class=["'][^"']*wpcf7-form[^"']*["'][^>]*>/i, `<form class="wpcf7-form" data-mia-contacto novalidate="novalidate">`);
  t = t.replace(/<input\b[^>]*name=["'](?:_wpcf7[^"']*|_wpnonce)["'][^>]*>\s*/gi, "");
  if (/data-mia-contacto/.test(t)) t = t.replace(/<\/body>/i, `<script src="${PREFIJO}/contacto.js"></script>\n</body>`);
  for (const [base, destino] of Object.entries(CDN)) t = t.replaceAll(base, `${PREFIJO}/${destino}`);
  t = t.replace(/https?:\\\/\\\/miaproducciones\.com\.ar\\\/(wp-)/g, `${PREFIJO.replaceAll("/", "\\/")}\\/$1`);
  t = t.replace(/https?:\/\/miaproducciones\.com\.ar\/(wp-)/g, `${PREFIJO}/$1`);
  t = t.replace(/(["'(])\/(wp-(?:content|includes)\/)/g, `$1${PREFIJO}/$2`);
  t = t.replace(/(["'(`])\/?(images\/)/g, `$1${PREFIJO}/$2`);
  // Enlaces entre páginas de la copia: sin dominio y sin barra final. La canónica sigue siendo la original.
  t = t.replace(/href=["']https?:\/\/miaproducciones\.com\.ar\/?([a-z0-9-]*)\/?(#[^"']*)?["']/gi, (b, r, ancla) => {
    if (/rel=["']canonical/.test(b)) return b;
    return `href="/${r}${ancla ?? ""}"`;
  });
  t = t.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>\s*/gi, "") .replace(/<head([^>]*)>/i, `<head$1>\n<link rel="canonical" href="${ORIGEN}/${ruta ? ruta + "/" : ""}">`);
  return t;
}

// ── 1. Páginas: la portada y las que ella y las demás enlazan ─────────────────────────────────
const pendientes = [""];
while (pendientes.length) {
  const ruta = pendientes.shift();
  if (paginas.has(ruta)) continue;
  const html = await traer(`${ORIGEN}/${ruta ? ruta + "/" : ""}`);
  if (!html) {
    console.log("sin página:", ruta);
    continue;
  }
  paginas.set(ruta, html);
  for (const m of html.matchAll(/href=["']https:\/\/miaproducciones\.com\.ar\/([a-z0-9-]+)\/?["']/gi)) {
    if (!m[1].startsWith("wp-") && !paginas.has(m[1]) && !["feed", "comments"].includes(m[1])) pendientes.push(m[1]);
  }
}
console.log("páginas:", [...paginas.keys()].map((r) => r || "(portada)").join(", "));

// ── 2. Activos: lo que nombran las páginas, los CSS y lo que el navegador pidió (HAR de RAE) ───
const cola = new Set();
for (const html of paginas.values()) for (const u of urlsEn(adaptarSoloLectura(html))) cola.add(u);
function adaptarSoloLectura(html) {
  return html.replace(/<script\b[^>]*\bsrc=["'][^"']*(?:googletagmanager|addtoany)[^"']*["'][^>]*><\/script>/gi, "");
}
if (rutaHar && existsSync(rutaHar)) {
  const har = JSON.parse(readFileSync(rutaHar, "utf8"));
  const pedidas = har.log.entries.map((e) => e.request.url).filter((u) => rutaDeActivo(u));
  console.log("del HAR:", pedidas.length);
  for (const u of pedidas) cola.add(u);
}
// La animación de la portada elige al azar entre img1 e img9 («images/img${n}.jpg», armado por script).
for (let n = 1; n <= 9; n++) cola.add(`${ORIGEN}/images/img${n}.jpg`);
for (const u of [...cola]) if (/contact-form-7|addtoany|wp-emoji|wp-includes\/js\/dist\//i.test(u)) cola.delete(u);
while (cola.size) {
  const tanda = [...cola].slice(0, 6);
  tanda.forEach((u) => cola.delete(u));
  await Promise.all(tanda.map((u) => bajarActivo(u, cola)));
}

// La letra: la misma Work Sans que pide su tema, servida desde la copia.
const cssFuentes = await traer(FUENTES);
if (!cssFuentes) throw new Error("No pude bajar la letra.");
mkdirSync(join(salida, "activos", "vendor", "fuentes"), { recursive: true });
let cssPropio = cssFuentes;
for (const [i, url] of [...new Set(cssFuentes.match(/https:\/\/fonts\.gstatic\.com\/[^)\s]+/g) ?? [])].entries()) {
  const nombre = `work-sans-${i}.woff2`;
  const cuerpo = await traer(url, false);
  if (!cuerpo) throw new Error("No pude bajar la letra: " + url);
  writeFileSync(join(salida, "activos", "vendor", "fuentes", nombre), cuerpo);
  cssPropio = cssPropio.replaceAll(url, nombre);
}
writeFileSync(join(salida, "activos", "vendor", "fuentes", "work-sans.css"), cssPropio);

// ── 3. Escribir────────────────────────────────────────────────────────────────────────────────
mkdirSync(join(salida, "paginas"), { recursive: true });
for (const [ruta, html] of paginas) writeFileSync(join(salida, "paginas", `${ruta || "index"}.html`), adaptar(html, ruta));
writeFileSync(join(salida, "lista.json"), JSON.stringify({ paginas: [...paginas.keys()], activos: [...activos.values()] }, null, 1));
console.log(`activos: ${activos.size} · ${(bytes / 1048576).toFixed(1)} MB`);
