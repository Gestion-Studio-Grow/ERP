// ============================================================================
// EL MOTOR DEL TORNEO WPE, EN EL SERVIDOR — el MISMO que corre el sitio del cliente, sin copiarlo.
// ============================================================================
//
// El motor vive adentro de `src/tenants/circuito-wpe/sitio/index.html` (freeze circuito-wpe: ese archivo no se
// toca). Es JS puro, UMD y sin dependencias: en Node publica `module.exports`. Acá se lee el archivo, se toma el
// texto del `<script id="wpeEngine">` y se ejecuta en un contexto de `vm` propio, sin `require`, `process` ni red.
// Así el servidor aplica exactamente las mismas reglas que la demo que vio el cliente: no hay una segunda copia que
// pueda divergir. El resultado se cachea por proceso.
//
// Vercel: el archivo viaja con la función por `outputFileTracingIncludes` (next.config.ts, ruta /admin/torneo).
//
// — Elaborado por GSG

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import type { MotorTorneo } from "./tipos";

export const ARCHIVO_DEL_SITIO = join("src", "tenants", "circuito-wpe", "sitio", "index.html");
const APERTURA = '<script id="wpeEngine">';

/** El texto del motor dentro del HTML del sitio (sin las etiquetas). Tira si el sitio cambió de forma. */
export function extraerMotor(html: string): string {
  const desde = html.indexOf(APERTURA);
  if (desde < 0) throw new Error("No se encontró el motor del torneo en el sitio (falta <script id=\"wpeEngine\">).");
  const hasta = html.indexOf("</script>", desde);
  if (hasta < 0) throw new Error("El motor del torneo no cierra su <script>.");
  return html.slice(desde + APERTURA.length, hasta);
}

/** Ejecuta el texto del motor en un contexto aislado y devuelve su API. */
export function evaluarMotor(codigo: string): MotorTorneo {
  const modulo: { exports: Record<string, unknown> } = { exports: {} };
  runInNewContext(codigo, { module: modulo, exports: modulo.exports }, { filename: "wpe-torneo-engine.js", timeout: 5_000 });
  const api = modulo.exports as unknown as MotorTorneo;
  for (const f of ["generarTorneoEnCurso", "cargarResultado", "marcarWO", "borrarResultado", "reprogramarPartido", "serializar", "deserializar"] as const) {
    if (typeof api[f] !== "function") throw new Error(`El motor del torneo no publica ${f}.`);
  }
  return api;
}

let enCache: MotorTorneo | null = null;

/** El motor del sitio (cacheado por proceso). */
export function motorDelTorneo(raiz: string = process.cwd()): MotorTorneo {
  if (!enCache) enCache = evaluarMotor(extraerMotor(readFileSync(join(raiz, ARCHIVO_DEL_SITIO), "utf8")));
  return enCache;
}
