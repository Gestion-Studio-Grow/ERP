// Empaqueta el sitio de Break Point Pádel que sirve el ERP en breakpointpadel.gsgapp.com.ar (mismo mecanismo que
// Circuito WPE: src/lib/sitio-estatico.ts). Tres páginas de UN solo archivo cada una:
//   sitio/index.html    portada con la marca: «Reservá tu cancha» (/turnero) y «Gestión del club» (/club)
//   sitio/club.html     la gestión del club (backoffice demo) + el modo conectado, el bus entre pestañas y el Studio, inline
//   sitio/turnero.html  el turnero en modo demo (corre en el navegador: local.mjs), con su CSS y su JS inline
// Con /turnero y /club abiertos en pestañas del mismo navegador, se sincronizan en vivo (turnero/bus.mjs).
//
// Fuente (la que se edita): public/previews/breakpoint/{club,turnero}/. Salida: src/tenants/breakpoint/sitio/ —
// no se edita a mano.
//
//   node src/tenants/breakpoint/empaquetar.mjs
//
// Un test (motor-club.test.ts) compara la salida con la fuente: si alguien toca la demo y no re-empaqueta,
// falla. Así el subdominio nunca sirve una versión vieja sin que nadie se entere.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { buildSync } from "esbuild";
import { portada } from "./portada.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../../..");
export const FUENTE = "public/previews/breakpoint/club";
export const CARPETA_SITIO = "src/tenants/breakpoint/sitio";
/** Compatibilidad: la gestión del club empaquetada (antes era la raíz del sitio). */
export const SALIDA = `${CARPETA_SITIO}/club.html`;

/**
 * Arma el HTML de un solo archivo: el motor queda como `const M = {…}` y la app lo usa igual. PURA.
 * @param {{ html: string, app: string, motor: string, morph?: string | null }} fuente
 */
export function empaquetar({ html, app, motor, morph = null }) {
  const nombres = [...motor.matchAll(/^export (?:const|function) (\w+)/gm)].map((m) => m[1]);
  const cuerpoMotor = motor.replace(/^export (const|function) /gm, "$1 ");
  if (/^export /m.test(cuerpoMotor)) throw new Error("motor.mjs tiene un export que el empaquetador no conoce");
  const importe = 'import * as M from "./motor.mjs";\n';
  if (!app.includes(importe)) throw new Error("app.mjs ya no importa el motor como espera el empaquetador");
  // morph.mjs (actualización del DOM sin re-pintar todo) va adentro como funciones sueltas.
  const importeMorph = 'import { morph } from "./morph.mjs";\n';
  let cuerpoMorph = "";
  if (app.includes(importeMorph)) {
    if (morph == null) throw new Error("app.mjs importa morph.mjs pero no llegó su código");
    cuerpoMorph = morph.replace(/^export (function) /gm, "$1 ");
    if (/^export /m.test(cuerpoMorph)) throw new Error("morph.mjs tiene un export que el empaquetador no conoce");
  }
  const script = `const M = (() => {\n${cuerpoMotor}\nreturn { ${nombres.join(", ")} };\n})();\n${cuerpoMorph}\n${app.replace(importe, "").replace(importeMorph, "")}`;
  const etiqueta = '<script type="module" src="./app.mjs"></script>';
  if (!html.includes(etiqueta)) throw new Error("index.html ya no carga app.mjs como espera el empaquetador");
  const aviso = "<!-- GENERADO por src/tenants/breakpoint/empaquetar.mjs desde public/previews/breakpoint/club/ — no editar a mano -->\n";
  // El aviso va DESPUÉS del doctype: un comentario antes lo deja en modo quirks.
  const conScript = html.replace(etiqueta, () => `<script type="module">\n${script.replaceAll("</script", "<\\/script")}\n</script>`);
  return conScript.replace(/^(<!doctype html>\n)/i, `$1${aviso}`);
}

/** Empaqueta un módulo y todo lo que importa (también los import() dinámicos) en un solo JS. Determinístico. */
function bundle(entrada, opciones = {}) {
  const r = buildSync({ entryPoints: [entrada], bundle: true, write: false, minify: true, target: "es2022", legalComments: "none", charset: "utf8", logLevel: "silent", ...opciones });
  return r.outputFiles[0].text.replaceAll("</script", "<\\/script");
}

/**
 * El sitio completo: { "index.html", "club.html", "turnero.html" } → contenido. El club lleva la marca del bus
 * (bp-demo-bus) y el modo conectado inline: su `import("./conectado.mjs")` pasa a ser el módulo ya cargado.
 */
export function armarSitio(raiz = RAIZ) {
  const base = path.join(raiz, "public/previews/breakpoint");
  // Ambiente REAL del club: el front público (portada + turnero) usa lo que el club publicó en publico.json; la
  // gestión (club.html) es el back, sin link desde el front y fuera de los buscadores. La demo, con ?demo=1.
  const publico = JSON.parse(readFileSync(path.join(raiz, "src/tenants/breakpoint/publico.json"), "utf8"));
  const enAtributo = (x) => String(x).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const metaPublico = `<meta name="bp-ambiente" content="real">\n<meta name="bp-publico" content="${enAtributo(JSON.stringify({ whatsapp: publico.whatsapp ?? "", tarifas: publico.tarifas ?? "", catalogo: publico.catalogo ?? "" }))}">`;
  // Gestión del club: el empaquetado de siempre + conectado.mjs (con el bus y el núcleo) como global inline.
  const club = empaquetar(leerFuente(raiz));
  const llamada = 'import("./conectado.mjs")';
  if (!club.includes(llamada)) throw new Error("app.mjs ya no carga conectado.mjs como espera el empaquetador");
  const conectado = bundle(path.join(base, "club/conectado.mjs"), { format: "iife", globalName: "__BP_CONECTADO" });
  let clubHtml = club
    .replace(llamada, "Promise.resolve(__BP_CONECTADO)")
    .replace(/<meta charset="utf-8">/i, (m) => `${m}\n<meta name="bp-demo-bus" content="1">\n<meta name="bp-ambiente" content="real">\n<meta name="robots" content="noindex, nofollow">`)
    .replace('<script type="module">', () => `<script>\n${conectado}\n</script>\n<script type="module">`);
  // Studio de contenido (studio.mjs): si app.mjs lo carga con import("./studio.mjs"), va inline como global, igual
  // que el modo conectado. Si todavía no lo carga, no se inyecta (no es un error).
  const llamadaStudio = 'import("./studio.mjs")';
  if (clubHtml.includes(llamadaStudio)) {
    const studio = bundle(path.join(base, "club/studio.mjs"), { format: "iife", globalName: "__BP_STUDIO" });
    clubHtml = clubHtml
      .split(llamadaStudio).join("Promise.resolve(__BP_STUDIO)")
      .replace('<script type="module">', () => `<script>\n${studio}\n</script>\n<script type="module">`);
  }
  // Turnero: CSS y JS inline (en modo demo: <meta name="turnero-modo" content="demo">).
  const t = path.join(base, "turnero");
  let turnero = readFileSync(path.join(t, "index.html"), "utf8");
  const css = '<link rel="stylesheet" href="./turnero.css">', js = '<script type="module" src="./app.mjs"></script>';
  if (!turnero.includes(css) || !turnero.includes(js)) throw new Error("turnero/index.html ya no carga turnero.css y app.mjs como espera el empaquetador");
  if (!/<meta name="turnero-modo" content="demo">/.test(turnero)) throw new Error("el turnero publicado tiene que estar en modo demo");
  turnero = turnero
    .replace(css, () => `<style>\n${readFileSync(path.join(t, "turnero.css"), "utf8")}</style>`)
    .replace(js, () => `<script type="module">\n${bundle(path.join(t, "app.mjs"), { format: "esm" })}</script>`)
    .replace(/^(<!doctype html>\n)/i, "$1<!-- GENERADO por src/tenants/breakpoint/empaquetar.mjs desde public/previews/breakpoint/turnero/ — no editar a mano -->\n")
    .replace(/<meta charset="utf-8">/i, (m) => `${m}\n${metaPublico}`);
  return { "index.html": portada(publico), "club.html": clubHtml, "turnero.html": turnero };
}

export function leerFuente(raiz = RAIZ) {
  const leer = (f) => readFileSync(path.join(raiz, FUENTE, f), "utf8");
  let morph = null;
  try { morph = leer("morph.mjs"); } catch { /* versión sin morph */ }
  return { html: leer("index.html"), app: leer("app.mjs"), motor: leer("motor.mjs"), morph };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const carpeta = path.join(RAIZ, CARPETA_SITIO);
  mkdirSync(carpeta, { recursive: true });
  for (const [nombre, contenido] of Object.entries(armarSitio())) writeFileSync(path.join(carpeta, nombre), contenido);
  console.log(`Listo: ${CARPETA_SITIO}/{index,club,turnero}.html`);
}
