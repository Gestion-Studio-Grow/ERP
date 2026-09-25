// ============================================================================
// LA HOJA DE «RENGLÓN» — el bloque de tokens y la versión, generados desde tokens.ts.
// ============================================================================
//
// La piel vive en `public/diseno/renglon.css`: un archivo estático que el navegador pide SÓLO
// cuando la raíz del layout lleva `data-diseno="renglon"` (ConDiseno lo agrega con
// `<link rel="stylesheet" precedence>` de React 19). Un negocio con el diseño de siempre (CH) no lo
// pide nunca: por eso no es un `import "./x.css"`, que Next metería en el CSS de toda la ruta.
//
// El archivo se escribe a mano, salvo el bloque entre las marcas de abajo, que sale de tokens.ts
// (las variables: la misma fuente que mide el test de contraste) y de fuentes.ts (el `@font-face`
// de Archivo y su respaldo ajustado). Así lo que se mide es lo que se sirve:
//
//     node --import tsx src/design/hoja.ts          # reescribe el bloque y la versión
//
// hoja.test.ts falla si el bloque o la versión quedaron viejos, si algo se escapa del alcance
// `[data-diseno="renglon"]`, si aparece una `@layer` (la hoja va SIN capa: así le gana a
// `@layer utilities` de Tailwind y viste elementos con clases sueltas sin tocarlas), un degradé, un
// `backdrop-filter` o una sombra de dos capas.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { COMUNES, COLORES, SOMBRAS, neutrosTenidos, type Modo } from "./tokens";
import { fontFaces } from "./fuentes";

export const RUTA_HOJA = "public/diseno/renglon.css";
export const RUTA_VERSION = "src/design/hoja-version.ts";
export const MARCA_INICIO = "/* ─── TOKENS · generado por src/design/hoja.ts desde tokens.ts (no editar a mano) ─── */";
export const MARCA_FIN = "/* ─── FIN TOKENS ─── */";

/** El valor de `data-diseno` y el prefijo de TODO lo que la hoja viste. */
export const PIEL = "renglon";
export const ALCANCE = `[data-diseno="${PIEL}"]`;

const SELECTOR: Record<Modo, string> = {
  // La raíz clara, y una isla clara adentro de una raíz oscura (la galería muestra los dos).
  claro: `${ALCANCE},\n${ALCANCE} [data-theme="light"]`,
  // La raíz oscura (el tema lo cambia AdminThemeScript en la MISMA raíz) y una isla oscura.
  oscuro: `${ALCANCE}[data-theme="dark"],\n${ALCANCE} [data-theme="dark"]`,
};

function declaraciones(vars: Record<string, string>, sangria = "  "): string {
  return Object.entries(vars)
    .map(([k, v]) => `${sangria}${k}: ${v};`)
    .join("\n");
}

/** El bloque de variables tal como va en la hoja, entre las marcas. */
export function bloqueDeTokens(): string {
  const comunes = `${ALCANCE} {\n${declaraciones(COMUNES)}\n}`;
  const modo = (m: Modo) =>
    `${SELECTOR[m]} {\n  color-scheme: ${m === "claro" ? "light" : "dark"};\n${declaraciones({ ...COLORES[m], ...SOMBRAS[m] })}\n}`;
  // El gris del negocio: donde hay color relativo, los neutros toman el matiz del acento.
  const tenidos = [
    "@supports (color: oklch(from red l c h)) {",
    ...(["claro", "oscuro"] as const).map(
      (m) => `  ${SELECTOR[m].replace(/\n/g, "\n  ")} {\n${declaraciones(neutrosTenidos(m), "    ")}\n  }`,
    ),
    "}",
  ].join("\n");
  return [MARCA_INICIO, fontFaces(), comunes, modo("claro"), modo("oscuro"), tenidos, MARCA_FIN].join("\n");
}

/** Reemplaza el bloque entre las marcas (inclusive) por el recién generado. */
export function conBloqueNuevo(css: string): string {
  const i = css.indexOf(MARCA_INICIO);
  const f = css.indexOf(MARCA_FIN);
  if (i < 0 || f < i) throw new Error(`la hoja no tiene las marcas del bloque de tokens (${RUTA_HOJA})`);
  return css.slice(0, i) + bloqueDeTokens() + css.slice(f + MARCA_FIN.length);
}

/** Versión corta del contenido (va en la URL: `?v=…`), para que un cambio nunca sirva la vieja. */
export function versionDe(css: string): string {
  return createHash("sha256").update(css).digest("hex").slice(0, 10);
}

export function textoDelModuloVersion(version: string): string {
  return [
    "// GENERADO por src/design/hoja.ts: la versión de public/diseno/renglon.css (no editar a mano).",
    "// La usa src/lib/diseno/diseno.ts para pedir la hoja con `?v=`: un cambio de la hoja cambia la URL.",
    `export const VERSION_HOJA = "${version}";`,
    "",
  ].join("\n");
}

/** Reescribe el bloque de tokens de la hoja y el módulo de la versión. Devuelve la versión. */
export function escribirHoja(raiz: string): string {
  const ruta = join(raiz, RUTA_HOJA);
  const css = conBloqueNuevo(readFileSync(ruta, "utf8"));
  writeFileSync(ruta, css);
  const version = versionDe(css);
  writeFileSync(join(raiz, RUTA_VERSION), textoDelModuloVersion(version));
  return version;
}

if (process.argv[1] && /hoja\.ts$/.test(process.argv[1])) {
  const v = escribirHoja(process.cwd());
  console.log(`hoja escrita: ${RUTA_HOJA} · versión ${v}`);
}
