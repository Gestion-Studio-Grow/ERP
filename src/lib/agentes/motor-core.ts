// ============================================================================
// EQUIPO DE AGENTES · reglas puras del motor (03 §4.1, §4.2, §13). PURO: sin base ni reloj.
// ============================================================================
// Validación de argumentos contra el esquema (nunca `tenantId`), limpieza de lo que va al modelo y
// armado de la respuesta de texto libre: renglones por código, sin «Fuente:» del modelo, filtrada y
// con las cifras controladas.

import { renglonesDeFilas } from "./buzon-core";
import { controlarCifras, textoImporte, totalesPorMoneda } from "./cifras-core";
import { filtrarTexto } from "./texto-seguro-core";
import type { Cifra, EsquemaArgumentos, Fila } from "./tipos";

// ── Argumentos: los valida el código contra el esquema; nunca `tenantId` ─────────────────────────

export function validarArgumentos(esquema: EsquemaArgumentos, a: unknown): { ok: true; valor: Record<string, unknown> } | { ok: false; mensaje: string } {
  const valor = a === undefined || a === null ? {} : a;
  if (typeof valor !== "object" || Array.isArray(valor)) return { ok: false, mensaje: "Los argumentos tienen que ser un objeto." };
  const obj = valor as Record<string, unknown>;
  if ("tenantId" in obj || "tenantId" in esquema.properties) return { ok: false, mensaje: "Argumento no permitido: tenantId." };
  for (const k of Object.keys(obj)) if (!(k in esquema.properties)) return { ok: false, mensaje: `Argumento desconocido: ${k}.` };
  for (const r of esquema.required ?? []) if (obj[r] === undefined) return { ok: false, mensaje: `Falta el argumento ${r}.` };
  for (const [k, v] of Object.entries(obj)) {
    const def = esquema.properties[k];
    const tipoOk =
      def.type === "string" ? typeof v === "string" : def.type === "boolean" ? typeof v === "boolean" : def.type === "integer" ? Number.isInteger(v) : typeof v === "number" && Number.isFinite(v);
    if (!tipoOk) return { ok: false, mensaje: `El argumento ${k} no es del tipo esperado.` };
    if (def.enum && !def.enum.includes(String(v))) return { ok: false, mensaje: `El argumento ${k} no es un valor permitido.` };
    if (def.type === "string" && (v as string).length > (def.maxLength ?? 200)) return { ok: false, mensaje: `El argumento ${k} es demasiado largo.` };
  }
  return { ok: true, valor: obj };
}

/** Nada que vaya al modelo lleva `tenantId`, aunque una herramienta lo haya dejado en sus datos. */
export function sinTenant(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(sinTenant);
  if (x && typeof x === "object" && !(x instanceof Date)) {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x)) if (k !== "tenantId") o[k] = sinTenant(v);
    return o;
  }
  return x;
}

// ── La prosa del modelo: renglones por código, sin «Fuente:» propia, filtrada y controlada ───────

const MARCA_FILAS = /\[\[filas:([A-Za-z0-9_-]+)\]\]/g;

export function armarRespuesta(prosa: string, resultados: ReadonlyMap<string, Fila[]>, extras: readonly Cifra[]): { ok: true; texto: string; filas: Fila[] } | { ok: false; motivo: string } {
  // Una línea «Fuente:» escrita por el modelo se descarta: los orígenes los pone el código.
  const sinFuentes = prosa
    .split("\n")
    .filter((l) => !/^\s*(?:[-*]\s*)?fuente\s*:/i.test(l))
    .join("\n");
  const filtrado = filtrarTexto(sinFuentes);
  const todas = [...resultados.values()].flat();
  const control = controlarCifras(filtrado.texto.replace(MARCA_FILAS, ""), todas, extras);
  if (!control.ok) return { ok: false, motivo: "cifras" };
  const usadas: Fila[] = [];
  const texto = filtrado.texto.replace(MARCA_FILAS, (_m, id: string) => {
    const filas = resultados.get(id);
    if (!filas) return "";
    usadas.push(...filas);
    return `\n${renglonesDeFilas(filas)}\n`;
  });
  return { ok: true, texto: texto.trim(), filas: usadas };
}

export function cifrasExtra(filas: readonly Fila[]): Cifra[] {
  const extras: Cifra[] = [{ tipo: "cantidad", valor: filas.length, texto: String(filas.length) }];
  for (const [m, v] of totalesPorMoneda(filas)) extras.push({ tipo: "importe", valor: v, moneda: m, texto: textoImporte(v, m) });
  return extras;
}
