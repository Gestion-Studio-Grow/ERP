// Empaqueta la demo del club de Break Point en UN solo archivo para servirla como sitio propio del negocio
// en breakpoint.gsgapp.com.ar (mismo mecanismo que Circuito WPE: src/lib/sitio-estatico.ts).
//
// Fuente (la que se edita): public/previews/breakpoint/club/{index.html, app.mjs, motor.mjs, morph.mjs}.
// Salida (la que sirve el ERP):  src/tenants/breakpoint/sitio/index.html — no se edita a mano.
//
//   node src/tenants/breakpoint/empaquetar.mjs
//
// Un test (motor-club.test.ts) compara la salida con la fuente: si alguien toca la demo y no re-empaqueta,
// falla. Así el subdominio nunca sirve una versión vieja sin que nadie se entere.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../../..");
export const FUENTE = "public/previews/breakpoint/club";
export const SALIDA = "src/tenants/breakpoint/sitio/index.html";

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

export function leerFuente(raiz = RAIZ) {
  const leer = (f) => readFileSync(path.join(raiz, FUENTE, f), "utf8");
  let morph = null;
  try { morph = leer("morph.mjs"); } catch { /* versión sin morph */ }
  return { html: leer("index.html"), app: leer("app.mjs"), motor: leer("motor.mjs"), morph };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const salida = path.join(RAIZ, SALIDA);
  mkdirSync(path.dirname(salida), { recursive: true });
  writeFileSync(salida, empaquetar(leerFuente()));
  console.log(`Listo: ${SALIDA}`);
}
