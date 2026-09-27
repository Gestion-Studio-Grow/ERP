// ============================================================================
// PRECIO POR UNIDAD DE MEDIDA — el "$1.443,33 el litro" del cartel de góndola.
// ============================================================================
//
// POR QUÉ. En la góndola, además del precio del envase, el cliente tiene que ver cuánto sale
// el kilo o el litro, para comparar un paquete de 900 g con uno de 1 kg. Lo pide la normativa
// de exhibición de precios (Res. SC 7/2002 y sus modificatorias: A VALIDAR con el asesor legal
// del negocio cuál rige hoy y para qué productos). El cartel, la vidriera y la caja lo calculan
// con esta función.
//
// DE DÓNDE SALE EL CONTENIDO. Del campo "presentación" del producto (`Product.unit`): "900 ml",
// "1,5 L", "500 g", "1 kg", "x 12 u", "6 x 354 ml". El catálogo semilla del supermercado lo trae
// cargado; el negocio lo edita como cualquier dato del producto. Si no se entiende, no se inventa
// un precio por litro: el cartel sale sin ese renglón y la pantalla dice qué cargar.
//
// LA CUENTA: precio × 1000 ÷ gramos (o mililitros), al centavo, en enteros
// (`proporcionAlCentavo`, la regla única de redondeo). Por unidad: precio ÷ unidades.
//
// PURO: sin base, sin React.

import { proporcionAlCentavo } from "@/lib/dinero/redondeo";

/** A qué se lleva el precio: kilo, litro o unidad. */
export type UnidadBase = "kg" | "l" | "u";

/** El contenido del envase en la unidad chica (gramos, mililitros o unidades), ENTERO. */
export interface Contenido {
  base: UnidadBase;
  /** Gramos si `base` es kg, mililitros si es l, unidades si es u. */
  cantidad: number;
}

const UNIDADES: { re: RegExp; base: UnidadBase; factor: number }[] = [
  { re: /^(kg|kgs|kilo|kilos|kilogramo|kilogramos)$/, base: "kg", factor: 1000 },
  { re: /^(g|gr|grs|gramo|gramos)$/, base: "kg", factor: 1 },
  { re: /^(l|lt|lts|litro|litros)$/, base: "l", factor: 1000 },
  { re: /^(ml|cc|cm3|mililitro|mililitros)$/, base: "l", factor: 1 },
  { re: /^(u|un|und|unid|unidad|unidades)$/, base: "u", factor: 1 },
];

/**
 * "1,5" → 1500 milésimos; "354" → 354000. Sólo dígitos con una coma o un punto decimal. null si
 * no es un número así. En enteros: "2,25" × 1000 no pasa por el binario.
 */
function milesimosDe(txt: string): number | null {
  const m = /^(\d{1,6})(?:[.,](\d{1,3}))?$/.exec(txt);
  if (!m) return null;
  const entero = Number(m[1]);
  const dec = (m[2] ?? "").padEnd(3, "0");
  return entero * 1000 + Number(dec);
}

/**
 * Lee la presentación: "900 ml", "1,5 L", "x 12 u", "6 x 354 ml" (un pack: 6 latas). Devuelve
 * null si no se entiende. PURA.
 */
export function leerContenido(presentacion: string | null | undefined): Contenido | null {
  const s = String(presentacion ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^x\s*/, "");
  if (!s) return null;
  // Pack: "6 x 354 ml" / "6x354ml" / "pack 6 x 354 ml".
  const pack = /^(?:pack\s*)?(\d{1,3})\s*x\s*(.+)$/.exec(s);
  if (pack) {
    const una = leerContenido(pack[2]);
    const n = Number(pack[1]);
    if (!una || !(n > 0)) return null;
    return { base: una.base, cantidad: una.cantidad * n };
  }
  const m = /^(\d{1,6}(?:[.,]\d{1,3})?)\s*([a-z0-9]+)\.?$/.exec(s);
  if (!m) return null;
  const milesimos = milesimosDe(m[1]);
  if (milesimos == null || milesimos <= 0) return null;
  const u = UNIDADES.find((x) => x.re.test(m[2]));
  if (!u) return null;
  // cantidad en la unidad chica = número × factor. En milésimos para no perder "1,5 L".
  const total = milesimos * u.factor;
  if (total % 1000 !== 0) return null; // "1,5 g" no es un contenido de góndola (medio gramo)
  const cantidad = total / 1000;
  if (u.base === "u" && !Number.isInteger(cantidad)) return null;
  return { base: u.base, cantidad };
}

export interface PrecioPorUnidad {
  base: UnidadBase;
  /** El precio del kilo, del litro o de la unidad, al centavo. */
  importe: number;
  /** "el kg", "el litro", "c/u". */
  rotulo: string;
}

export const ROTULO_BASE: Record<UnidadBase, string> = { kg: "el kg", l: "el litro", u: "c/u" };

/**
 * El precio por kilo, litro o unidad de un producto. Por peso: su precio por kilo tal cual.
 * Por unidad: con el contenido de su presentación. null si no hay precio o la presentación
 * no dice cuánto trae. PURA.
 */
export function precioPorUnidadDeMedida(p: {
  saleUnit: string;
  price: number | null;
  pricePerKg: number | null;
  presentacion: string | null | undefined;
}): PrecioPorUnidad | null {
  if (p.saleUnit === "WEIGHT") {
    return p.pricePerKg != null && p.pricePerKg > 0 ? { base: "kg", importe: p.pricePerKg, rotulo: ROTULO_BASE.kg } : null;
  }
  if (p.price == null || !(p.price > 0)) return null;
  const c = leerContenido(p.presentacion);
  if (!c) return null;
  // Una unidad sola ("1 u") no agrega nada al cartel: su precio por unidad es el precio.
  if (c.base === "u" && c.cantidad === 1) return null;
  const importe = c.base === "u" ? proporcionAlCentavo(p.price, 1, c.cantidad) : proporcionAlCentavo(p.price, 1000, c.cantidad);
  return { base: c.base, importe, rotulo: ROTULO_BASE[c.base] };
}

/** El contenido en palabras para el cartel: "900 ml", "1,5 L", "12 u". */
export function textoDelContenido(c: Contenido): string {
  const coma = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 3 });
  if (c.base === "u") return `${c.cantidad} u`;
  if (c.cantidad >= 1000) return `${coma(c.cantidad / 1000)} ${c.base === "kg" ? "kg" : "L"}`;
  return `${c.cantidad} ${c.base === "kg" ? "g" : "ml"}`;
}
