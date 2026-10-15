// Empaqueta la gestión de TESVO que sirve el ERP en tesvo.gsgapp.com.ar/gestion (mismo mecanismo que Circuito WPE y
// Break Point: src/lib/sitio-estatico.ts). Una página de UN solo archivo: el HTML con el motor y la app adentro.
//
// Fuente (la que se edita): public/previews/tesvo/gestion/{index.html, app.mjs, motor.mjs}.
// Salida: src/tenants/tesvo/sitio/gestion.html — no se edita a mano.
//
//   node src/tenants/tesvo/empaquetar.mjs
//
// Un test (motor-gestion.test.ts) compara la salida con la fuente: si alguien toca la demo y no re-empaqueta,
// falla. Así el subdominio nunca sirve una versión vieja sin que nadie se entere.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../../..");
export const FUENTE = "public/previews/tesvo/gestion";
export const SALIDA = "src/tenants/tesvo/sitio/gestion.html";

/** Arma el HTML de un solo archivo: el motor queda como `const M = {…}` y la app lo usa igual. PURA. */
export function empaquetar({ html, app, motor }) {
  const nombres = [...motor.matchAll(/^export (?:const|function) (\w+)/gm)].map((m) => m[1]);
  const cuerpoMotor = motor.replace(/^export (const|function) /gm, "$1 ");
  if (/^export /m.test(cuerpoMotor)) throw new Error("motor.mjs tiene un export que el empaquetador no conoce");
  const importe = 'import * as M from "./motor.mjs";\n';
  if (!app.includes(importe)) throw new Error("app.mjs ya no importa el motor como espera el empaquetador");
  const script = `const M = (() => {\n${cuerpoMotor}\nreturn { ${nombres.join(", ")} };\n})();\n${app.replace(importe, "")}`;
  const etiqueta = '<script type="module" src="./app.mjs"></script>';
  if (!html.includes(etiqueta)) throw new Error("index.html ya no carga app.mjs como espera el empaquetador");
  const aviso = `<!-- GENERADO por src/tenants/tesvo/empaquetar.mjs desde ${FUENTE}/ — no editar a mano -->\n`;
  // El aviso va DESPUÉS del doctype: un comentario antes lo deja en modo quirks.
  const conScript = html.replace(etiqueta, () => `<script type="module">\n${script.replaceAll("</script", "<\\/script")}\n</script>`);
  return conScript.replace(/^(<!doctype html>\n)/i, `$1${aviso}`);
}

export function leerFuente(raiz = RAIZ) {
  const leer = (f) => readFileSync(path.join(raiz, FUENTE, f), "utf8");
  return { html: leer("index.html"), app: leer("app.mjs"), motor: leer("motor.mjs") };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const salida = path.join(RAIZ, SALIDA);
  mkdirSync(path.dirname(salida), { recursive: true });
  writeFileSync(salida, empaquetar(leerFuente()));
  console.log(`Escrito ${SALIDA}`);
}
