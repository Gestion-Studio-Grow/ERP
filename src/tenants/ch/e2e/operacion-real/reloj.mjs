// Reloj del recorrido (arnés, no producto): corre el Date del proceso por un desfase que se lee de
// RELOJ_ARCHIVO (ms, texto). Lo carga el servidor `next dev` con NODE_OPTIONS=--import.
import { readFileSync } from "node:fs";
const archivo = process.env.RELOJ_ARCHIVO;
let desfase = 0;
const leer = () => { try { desfase = Number(readFileSync(archivo, "utf8")) || 0; } catch {} };
if (archivo) { leer(); setInterval(leer, 150).unref(); }
const Real = Date;
function Falso(...a) {
  if (!new.target) return new Real(Real.now() + desfase).toString();
  return a.length === 0 ? new Real(Real.now() + desfase) : new Real(...a);
}
Falso.prototype = Real.prototype;
Falso.now = () => Real.now() + desfase;
Falso.UTC = Real.UTC;
Falso.parse = Real.parse;
globalThis.Date = Falso;
