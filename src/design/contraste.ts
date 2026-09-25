// ============================================================================
// CONTRASTE DE LA PIEL — cada par de tokens, en los dos modos, con el acento de cada negocio.
// ============================================================================
//
// `medirPiel()` arma el entorno de variables de un modo (tokens.ts) con el acento de un negocio
// (lo que el layout inyecta como `--tenant-accent-*`), resuelve los dos lados de cada par como el
// navegador (resolver.ts) y devuelve la razón WCAG. Sin acento de negocio mide el de GSG (consola).
// Cada par se mide dos veces: con los neutros de respaldo (matiz fijo) y con los neutros teñidos
// del matiz del negocio (`oklch(from var(--accent) …)`, el bloque `@supports` de la hoja).
//
// Lo ejecuta tokens.test.ts (que falla si un par no llega a su mínimo) y lo muestra la galería.

import { componer, oklchASrgb, razonContraste, aHex, dentroDeSrgb } from "./color";
import { resolverColor, type Entorno } from "./resolver";
import { PARES, variablesDe, type Modo, type Par } from "./tokens";

/** Los cuatro tonos del acento de un negocio, como los arma src/lib/branding.ts. */
export interface AcentoNegocio {
  light: string;
  dark: string;
  onLight: string;
  onDark: string;
}

export interface Medicion {
  par: Par;
  modo: Modo;
  /** Nombre del negocio (preset) o "gsg" sin negocio. */
  negocio: string;
  /** ¿Con los neutros teñidos del matiz del negocio (navegadores con color relativo)? */
  tenido: boolean;
  razon: number;
  frente: string;
  fondo: string;
  pasa: boolean;
}

/** Las variables de un modo con el acento de un negocio inyectado (o ninguno: el de GSG). */
export function entornoDe(modo: Modo, acento: AcentoNegocio | null, tenido = false): Entorno {
  const base = variablesDe(modo, tenido);
  if (!acento) return base;
  return {
    ...base,
    "--tenant-accent-light": acento.light,
    "--tenant-on-accent-light": acento.onLight,
    "--tenant-accent-dark": acento.dark,
    "--tenant-on-accent-dark": acento.onDark,
  };
}

/** Mide un par en un entorno. Lo translúcido se compone sobre su fondo (y el fondo, sobre `sobre`). */
export function medirPar(par: Par, entorno: Entorno): { razon: number; frente: string; fondo: string } {
  const base = oklchASrgb(resolverColor(`var(${par.sobre ?? "--hoja"})`, entorno));
  let fondo = oklchASrgb(resolverColor(`var(${par.fondo})`, entorno));
  if (fondo.a < 1) fondo = componer(fondo, base);
  let frente = oklchASrgb(resolverColor(`var(${par.frente})`, entorno));
  if (frente.a < 1) frente = componer(frente, fondo);
  return { razon: razonContraste(frente, fondo), frente: aHex(frente), fondo: aHex(fondo) };
}

/** Todos los pares, en los dos modos, para cada negocio (y para GSG sin negocio). */
export function medirPiel(negocios: Readonly<Record<string, AcentoNegocio>>): Medicion[] {
  const casos: Array<[string, AcentoNegocio | null]> = [["gsg", null], ...Object.entries(negocios)];
  const salida: Medicion[] = [];
  for (const modo of ["claro", "oscuro"] as const) {
    for (const tenido of [false, true]) {
      for (const [negocio, acento] of casos) {
        const entorno = entornoDe(modo, acento, tenido);
        for (const par of PARES) {
          const m = medirPar(par, entorno);
          salida.push({ par, modo, negocio, tenido, ...m, pasa: m.razon >= par.minimo });
        }
      }
    }
  }
  return salida;
}

/** Las variables de color literales (oklch/hex) de un modo que caen fuera de sRGB. */
export function fueraDeSrgb(modo: Modo): string[] {
  const entorno = entornoDe(modo, null);
  return Object.entries(entorno)
    .filter(([, v]) => /^(oklch\(|#)/.test(v.trim()))
    .filter(([nombre]) => !dentroDeSrgb(resolverColor(`var(${nombre})`, entorno)))
    .map(([nombre, v]) => `${nombre}: ${v}`);
}
