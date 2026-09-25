// ============================================================================
// RESOLVER — evalúa un valor de color de la piel como lo haría el navegador.
// ============================================================================
//
// Los tokens de «Renglón» son texto CSS: `oklch(…)`, `#hex`, `var(--x)`,
// `color-mix(in oklch, A p%, B)` y `oklch(from <color> L C h)` (color relativo). Para medir el contraste de un par hay que llegar al color final
// de cada lado con el acento REAL de cada negocio (las variables `--tenant-accent-*` que inyecta el
// layout desde src/lib/branding.ts). Este resolver hace eso, sin DOM: sigue los `var()` (con su
// respaldo), resuelve `color-mix` en OKLCH y corta los ciclos.
//
// Sólo entiende lo que la piel usa. Cualquier otra cosa tira un error con el valor: mejor un test
// rojo que un contraste medido sobre un color inventado.

import { leerColor, mezclarOklch, type Oklch, type ParteMezcla } from "./color";

/** Nombre de variable (`--surface`) → su valor CSS tal como está declarado. */
export type Entorno = Readonly<Record<string, string>>;

/** Parte `s` por las comas de primer nivel (las de adentro de un paréntesis no cuentan). */
export function partirPorComas(s: string): string[] {
  const partes: string[] = [];
  let nivel = 0;
  let actual = "";
  for (const ch of s) {
    if (ch === "(") nivel++;
    if (ch === ")") nivel--;
    if (ch === "," && nivel === 0) {
      partes.push(actual.trim());
      actual = "";
    } else actual += ch;
  }
  if (actual.trim() !== "") partes.push(actual.trim());
  return partes;
}

/** Si `s` es `nombre( … )` completo, devuelve el interior; si no, null. */
function interiorDe(s: string, nombre: string): string | null {
  const t = s.trim();
  if (!t.toLowerCase().startsWith(`${nombre}(`) || !t.endsWith(")")) return null;
  // El paréntesis que abre tiene que cerrar al final, no antes (p. ej. `var(--a) var(--b)`).
  let nivel = 0;
  for (let i = nombre.length; i < t.length; i++) {
    if (t[i] === "(") nivel++;
    if (t[i] === ")") {
      nivel--;
      if (nivel === 0 && i !== t.length - 1) return null;
    }
  }
  return t.slice(nombre.length + 1, -1);
}

/** Separa "<color> 12%" o "12% <color>" en color y porcentaje (sólo en el primer nivel). */
function leerParte(s: string): { color: string; porcentaje: number | null } {
  const t = s.trim();
  // Un porcentaje de adentro de un paréntesis nunca queda al final (lo sigue el `)`).
  const alFinal = /\s(-?\d+(?:\.\d+)?)%$/.exec(t);
  if (alFinal) return { color: t.slice(0, alFinal.index).trim(), porcentaje: parseFloat(alFinal[1]) };
  const alPrincipio = /^(-?\d+(?:\.\d+)?)%\s/.exec(t);
  if (alPrincipio) return { color: t.slice(alPrincipio[0].length).trim(), porcentaje: parseFloat(alPrincipio[1]) };
  return { color: t, porcentaje: null };
}

/** Parte `s` por los espacios de primer nivel (los de adentro de un paréntesis no cuentan). */
function partirPorEspacios(s: string): string[] {
  const partes: string[] = [];
  let nivel = 0;
  let actual = "";
  for (const ch of s.trim()) {
    if (ch === "(") nivel++;
    if (ch === ")") nivel--;
    if (/\s/.test(ch) && nivel === 0) {
      if (actual) partes.push(actual);
      actual = "";
    } else actual += ch;
  }
  if (actual) partes.push(actual);
  return partes;
}

/** Un canal de `oklch(from …)`: la palabra del canal de origen (`l`, `c`, `h`) o un número/porcentaje. */
function canalRelativo(token: string, origen: Oklch, canal: "l" | "c" | "h"): number | null {
  const t = token.trim().toLowerCase();
  if (t === "l") return origen.l;
  if (t === "c") return origen.c;
  if (t === "h") return origen.h;
  if (t === "none") return canal === "h" ? null : 0;
  const pct = /^(-?\d+(?:\.\d+)?)%$/.exec(t);
  // En oklch, L al 100 % es 1 y C al 100 % es 0,4 (CSS Color 4 §"oklch()").
  if (pct) return canal === "l" ? parseFloat(pct[1]) / 100 : canal === "c" ? (parseFloat(pct[1]) / 100) * 0.4 : parseFloat(pct[1]);
  if (/^-?\d+(?:\.\d+)?(deg)?$/.test(t)) return parseFloat(t);
  throw new Error(`canal de oklch(from …) que no sé leer: "${token}"`);
}

/**
 * `oklch(from <color> L C H [/ A])` (CSS Color 5, color relativo): el color de origen pasado a OKLCH
 * y cada canal tomado de él (`l`, `c`, `h`) o fijado. Lo usan los neutros teñidos con el matiz del
 * negocio («el gris del negocio»). Sólo lo que la piel usa: canales sueltos, sin `calc()`.
 */
function resolverRelativo(interior: string, entorno: Entorno, pila: readonly string[]): Oklch {
  const partes = partirPorEspacios(interior);
  if (partes[0]?.toLowerCase() !== "from" || partes.length < 5) throw new Error(`oklch(from …) mal formado: "${interior}"`);
  const origen = resolverColor(partes[1], entorno, pila);
  const l = canalRelativo(partes[2], origen, "l") ?? 0;
  const c = canalRelativo(partes[3], origen, "c") ?? 0;
  const h = canalRelativo(partes[4], origen, "h");
  let a = origen.a;
  if (partes[5] === "/" && partes[6] !== undefined) {
    const alfa = /^(-?\d+(?:\.\d+)?)(%?)$/.exec(partes[6].trim());
    if (!alfa) throw new Error(`alfa de oklch(from …) que no sé leer: "${partes[6]}"`);
    a = alfa[2] ? parseFloat(alfa[1]) / 100 : parseFloat(alfa[1]);
  } else if (partes.length > 5) throw new Error(`oklch(from …) con partes de más: "${interior}"`);
  return { l, c, h, a };
}

/** Resuelve un valor de color con las variables del entorno. */
export function resolverColor(valor: string, entorno: Entorno, pila: readonly string[] = []): Oklch {
  const t = valor.trim();

  const ok = interiorDe(t, "oklch");
  if (ok !== null && /^\s*from\s/i.test(ok)) return resolverRelativo(ok, entorno, pila);

  const v = interiorDe(t, "var");
  if (v !== null) {
    const [nombre, ...resto] = partirPorComas(v);
    if (pila.includes(nombre)) throw new Error(`ciclo de variables: ${[...pila, nombre].join(" → ")}`);
    const declarado = entorno[nombre];
    if (declarado !== undefined) return resolverColor(declarado, entorno, [...pila, nombre]);
    if (resto.length > 0) return resolverColor(resto.join(","), entorno, pila);
    throw new Error(`variable sin valor ni respaldo: ${nombre}`);
  }

  const mezcla = interiorDe(t, "color-mix");
  if (mezcla !== null) {
    const [espacio, a, b, ...sobra] = partirPorComas(mezcla);
    if (espacio.replace(/\s+/g, " ").toLowerCase() !== "in oklch") {
      throw new Error(`la piel sólo mezcla en oklch: "${t}"`);
    }
    if (!a || !b || sobra.length > 0) throw new Error(`color-mix mal formado: "${t}"`);
    const pa = leerParte(a);
    const pb = leerParte(b);
    const parte = (p: { color: string; porcentaje: number | null }): ParteMezcla => ({
      color: resolverColor(p.color, entorno, pila),
      porcentaje: p.porcentaje,
    });
    return mezclarOklch(parte(pa), parte(pb));
  }

  return leerColor(t);
}
