// ============================================================================
// DETECTAR EL FORMATO CON UNA ETIQUETA — «pasá una etiqueta y decime cuánto marcó la balanza».
// ============================================================================
//
// No sabemos marca ni modelo de cada balanza, y aunque los supiéramos el formato lo deja el
// técnico que la programa. Lo que sí tiene el local es UNA etiqueta impresa y el peso (o el
// importe) que la balanza mostró al imprimirla. Con eso alcanza: se prueban TODAS las formas
// posibles de leer ese código (largo 12 o 13, prefijo de 1 o 2 dígitos, 4 a 6 dígitos de
// producto, con o sin control del precio, peso en gramos o decenas, importe con 0 a 2
// decimales) y quedan las que dan exactamente ese número.
//
// Puede quedar más de una (una etiqueta de 1,250 kg se lee igual con 5 o 6 dígitos de producto
// si los del medio son ceros). Por eso van ordenadas de la más común a la menos común, cada una
// con el producto que leería, y la pantalla pide una segunda etiqueta de otro producto para
// desempatar: `detectarConVariasEtiquetas` cruza las dos.
//
// PURO: sin base, sin React.

import { formatoDesdeAfuera, largoDelPrefijo, leerEtiquetaDeBalanza, type FormatoBalanza } from "./balanza";
import { PRESETS_BALANZA } from "./balanza-presets";
import { limpiarCodigoLeido } from "./ean";

/** Lo que la persona vio en la balanza al imprimir la etiqueta. Al menos uno de los dos. */
export interface LoQueMarco {
  /** Kilos (1,25 = 1 kg 250 g). */
  peso?: number | null;
  /** Pesos. */
  importe?: number | null;
  /** El número del producto en la balanza, si se sabe (desempata del todo). */
  plu?: string | null;
}

export interface FormatoDetectado {
  formato: FormatoBalanza;
  /** El código del producto (PLU) que leería este formato en esta etiqueta. */
  plu: string;
  /** Si coincide con el formato habitual de alguna marca, cuál. */
  marca: string | null;
}

export type ResultadoDeteccion =
  | { ok: true; candidatos: FormatoDetectado[] }
  | { ok: false; mensaje: string };

const DECIMALES = { peso: [3, 2], importe: [0, 2, 1] } as const;

/** Todas las formas de leer un código de ese largo, de la más común a la menos común. */
function formasPosibles(codigo: string): FormatoBalanza[] {
  const formas: FormatoBalanza[] = [];
  const largos: (12 | 13)[] = codigo.length === 12 ? [12] : codigo.startsWith("0") ? [13, 12] : [13];
  for (const largo of largos) {
    const c = largo === 12 && codigo.length === 13 ? codigo.slice(1) : codigo;
    for (const lp of [2, 1]) {
      const prefijo = c.slice(0, lp);
      for (const verificadorDePrecio of [false, true]) {
        for (const digitosProducto of [5, 4, 6] as const) {
          for (const contenido of ["peso", "importe"] as const) {
            for (const decimales of DECIMALES[contenido]) {
              const f = formatoDesdeAfuera({ prefijos: [prefijo], digitosProducto, contenido, decimales, largo, verificadorDePrecio });
              if (f) formas.push(f);
            }
          }
        }
      }
    }
  }
  return formas;
}

function mismoPlu(a: string, b: string): boolean {
  return a.replace(/^0+(?=\d)/, "") === b.replace(/^0+(?=\d)/, "");
}

function coincide(f: FormatoBalanza, lectura: ReturnType<typeof leerEtiquetaDeBalanza>, marco: LoQueMarco): boolean {
  if (!lectura.ok) return false;
  const plu = marco.plu?.trim();
  if (plu && /^\d+$/.test(plu) && !mismoPlu(lectura.plu, plu)) return false;
  if (lectura.contenido === "peso") {
    if (marco.peso == null) return false;
    // Medio paso de la última cifra: con decenas de gramos, 1,25 y 1,250 son lo mismo.
    return Math.abs(lectura.peso - marco.peso) < 0.5 * 10 ** -f.decimales + 1e-9;
  }
  if (marco.importe == null) return false;
  return Math.abs(lectura.importe - marco.importe) < 0.5 * 10 ** -f.decimales + 1e-9;
}

function marcaDelFormato(f: FormatoBalanza): string | null {
  const p = PRESETS_BALANZA.find(
    (x) =>
      x.formato.digitosProducto === f.digitosProducto &&
      x.formato.contenido === f.contenido &&
      x.formato.decimales === f.decimales &&
      (x.formato.largo ?? 13) === (f.largo ?? 13) &&
      Boolean(x.formato.verificadorDePrecio) === Boolean(f.verificadorDePrecio) &&
      largoDelPrefijo(x.formato) === largoDelPrefijo(f) &&
      f.prefijos.every((pr) => x.formato.prefijos.includes(pr)),
  );
  return p?.marca ?? null;
}

/**
 * Los formatos que leen ESTA etiqueta con el peso o el importe que marcó la balanza. Ordenados:
 * primero los que coinciden con la forma habitual de una marca, después los más comunes (prefijo
 * de 2, sin control del precio, 5 dígitos de producto). PURA.
 */
export function detectarFormato(texto: string, marco: LoQueMarco): ResultadoDeteccion {
  const codigo = limpiarCodigoLeido(texto);
  if (!codigo) return { ok: false, mensaje: "Pasá una etiqueta por el lector o escribí sus números." };
  if (!/^\d+$/.test(codigo)) return { ok: false, mensaje: "La etiqueta de la balanza son sólo números." };
  if (codigo.length !== 12 && codigo.length !== 13) {
    return { ok: false, mensaje: `Una etiqueta de balanza tiene 12 o 13 números y acá hay ${codigo.length}. Pasala de nuevo.` };
  }
  if (!(Number(marco.peso) > 0) && !(Number(marco.importe) > 0)) {
    return { ok: false, mensaje: "Escribí el peso o el importe que marcó la balanza cuando imprimió la etiqueta." };
  }
  const vistos = new Set<string>();
  const candidatos: FormatoDetectado[] = [];
  for (const f of formasPosibles(codigo)) {
    const lectura = leerEtiquetaDeBalanza(codigo, f);
    if (!lectura.ok || !coincide(f, lectura, marco)) continue;
    const clave = JSON.stringify(f);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    candidatos.push({ formato: f, plu: lectura.plu, marca: marcaDelFormato(f) });
  }
  if (candidatos.length === 0) {
    const empieza = codigo.startsWith("2") || codigo.startsWith("02");
    return {
      ok: false,
      mensaje: empieza
        ? "Con ese peso o importe no encontramos cómo se lee la etiqueta. Revisá el número que marcó la balanza, o probá con otra etiqueta."
        : "Esa etiqueta no parece de la balanza: las de la balanza empiezan con 2. Si es un código de un producto envasado, cargalo en el catálogo como código del producto.",
    };
  }
  candidatos.sort((a, b) => peso(a) - peso(b));
  return { ok: true, candidatos };
}

// El control del precio y el producto se pisan: una etiqueta CON control también se lee SIN él,
// con el control pegado al final del producto (21 0123 6 15500 → producto 01236). Con una sola
// etiqueta no se puede saber (el control cierra por azar 1 de cada 10 veces), así que va después.
// Con varias, que cierre en todas por azar es 1 en 100 o menos: ahí el control va primero.
function peso(c: FormatoDetectado, varias = false): number {
  return (
    (varias && c.formato.verificadorDePrecio ? -1000 : 0) +
    (c.marca ? 0 : 100) +
    (largoDelPrefijo(c.formato) === 2 ? 0 : 10) +
    (c.formato.verificadorDePrecio ? 5 : 0) +
    (c.formato.largo === 12 ? 3 : 0) +
    [5, 4, 6].indexOf(c.formato.digitosProducto)
  );
}

/**
 * Con dos o más etiquetas (de productos distintos, si se puede), los formatos que leen bien
 * TODAS. Los prefijos del resultado juntan los de cada etiqueta (una balanza puede imprimir 20 y
 * 21). PURA.
 */
export function detectarConVariasEtiquetas(etiquetas: { texto: string; marco: LoQueMarco }[]): ResultadoDeteccion {
  if (etiquetas.length === 0) return { ok: false, mensaje: "Pasá al menos una etiqueta." };
  let comunes: FormatoDetectado[] | null = null;
  for (const e of etiquetas) {
    const r = detectarFormato(e.texto, e.marco);
    if (!r.ok) return r;
    if (comunes === null) {
      comunes = r.candidatos;
      continue;
    }
    const previos: FormatoDetectado[] = comunes;
    comunes = previos.flatMap((c) => {
      const par = r.candidatos.find((d) => mismaLectura(c.formato, d.formato));
      if (!par) return [];
      const prefijos = [...new Set([...c.formato.prefijos, ...par.formato.prefijos])].sort();
      return [{ ...c, formato: { ...c.formato, prefijos } }];
    });
  }
  if (!comunes || comunes.length === 0) {
    return { ok: false, mensaje: "Las etiquetas no se leen con el mismo formato. ¿Son todas de la misma balanza?" };
  }
  const varias = etiquetas.length > 1;
  return { ok: true, candidatos: [...comunes].sort((a, b) => peso(a, varias) - peso(b, varias)) };
}

function mismaLectura(a: FormatoBalanza, b: FormatoBalanza): boolean {
  return (
    a.digitosProducto === b.digitosProducto &&
    a.contenido === b.contenido &&
    a.decimales === b.decimales &&
    (a.largo ?? 13) === (b.largo ?? 13) &&
    Boolean(a.verificadorDePrecio) === Boolean(b.verificadorDePrecio) &&
    largoDelPrefijo(a) === largoDelPrefijo(b)
  );
}
