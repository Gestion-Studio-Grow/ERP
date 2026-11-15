// ============================================================================
// PADEL-CLASES — «Aparecer en el buscador de profes» (directorio público de ProfeTurnos). PURO.
// ============================================================================
//
// Dos caminos conviven: el link propio del profe (su turnero, /clases) y el directorio público
// (/profeturnos/profes), donde la gente busca profes y ve sus horarios libres. Para salir en el
// directorio el profe lo PIDE (opt-in, por defecto NO).
//
// Sin migración (Gate 2): vive en `PadelConfig.plantillas` (Json) bajo la clave reservada
// `_directorio` (empieza con «_»: ningún texto de WhatsApp la usa y los que reescriben el JSON la
// conservan, ver `reservadasDe` en config-campos.ts). TODO(migración): columnas propias
// (`directorioVisible Boolean`, `zona String?`) y se llenan desde acá.
//
// Quién le habla al alumno NO es un ajuste (decisión del dueño, 13/11): depende de por dónde entró
// la clase (`PadelClase.origen`, src/lib/padel/canal.ts).
//
// Validación a mano, con la misma forma que `validarCampoConfig`: el pedido decía zod, pero zod no
// es dependencia del repo y no se suman dependencias sin preguntar (anotado en el informe).

import { MARCA_BIENVENIDA, reservadasDe } from "./config-campos";
import { CLAVES_PLANTILLA } from "./core";

export const CLAVE_DIRECTORIO = "_directorio";

export interface Directorio {
  /** Aparece en /profeturnos/profes. Por defecto NO. */
  visible: boolean;
  /** Zona en texto corto (ej. «Canning»). */
  zona: string;
}

export const DIRECTORIO_DEFAULT: Directorio = { visible: false, zona: "" };

export const ZONA_MAX = 40;

const esObjeto = (x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x);

/** Espacios colapsados, sin caracteres de control ni signos raros; tope ZONA_MAX. */
export function limpiarZona(x: unknown): string {
  if (typeof x !== "string") return "";
  return x
    .replace(/[^\p{L}\p{N} .,'()-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ZONA_MAX)
    .trim();
}

export type ValidacionDirectorio = { ok: true; v: Directorio } | { ok: false; error: string };

/** Lo que llega de la pantalla: sólo las dos claves, con su tipo. Nada más entra. */
export function validarDirectorio(valor: unknown): ValidacionDirectorio {
  if (!esObjeto(valor)) return { ok: false, error: "No entendimos el ajuste. Actualizá la pantalla." };
  const extra = Object.keys(valor).filter((k) => k !== "visible" && k !== "zona");
  if (extra.length) return { ok: false, error: "No entendimos el ajuste. Actualizá la pantalla." };
  if (typeof valor.visible !== "boolean") return { ok: false, error: "Elegí si querés aparecer o no." };
  if (valor.zona !== undefined && typeof valor.zona !== "string") return { ok: false, error: "La zona tiene que ser un texto." };
  if (typeof valor.zona === "string" && valor.zona.trim().length > ZONA_MAX) return { ok: false, error: `La zona, en ${ZONA_MAX} letras como mucho (ej. «Canning»).` };
  const zona = limpiarZona(valor.zona);
  // Para salir en el buscador hace falta la zona: la gente filtra por ahí.
  if (valor.visible && !zona) return { ok: false, error: "Poné tu zona (ej. «Canning») para aparecer en el buscador." };
  return { ok: true, v: { visible: valor.visible, zona } };
}

/**
 * El ajuste guardado en el JSON de plantillas. Cualquier cosa rara (falta, tipo equivocado, JSON
 * roto) → el de fábrica: NO visible (fail-closed: el directorio nunca muestra a alguien por error).
 */
export function leerDirectorio(plantillas: unknown): Directorio {
  if (!esObjeto(plantillas)) return { ...DIRECTORIO_DEFAULT };
  const r = validarDirectorio(plantillas[CLAVE_DIRECTORIO]);
  return r.ok ? r.v : { ...DIRECTORIO_DEFAULT };
}

/** El JSON de plantillas con el directorio nuevo: los textos y las demás claves reservadas, intactos. */
export function plantillasConDirectorio(guardadas: unknown, d: Directorio): Record<string, unknown> {
  const base = esObjeto(guardadas) ? guardadas : {};
  const out: Record<string, unknown> = { ...reservadasDe(base) };
  for (const k of CLAVES_PLANTILLA) {
    const v = base[k];
    if (typeof v === "string" && v.trim()) out[k] = v;
  }
  out[CLAVE_DIRECTORIO] = { visible: d.visible, zona: d.zona };
  return out;
}

/** Para los tests y la documentación: las claves reservadas que hoy existen. */
export const CLAVES_RESERVADAS = [MARCA_BIENVENIDA, CLAVE_DIRECTORIO] as const;
