// ============================================================================
// PEDIDO DESDE WHATSAPP — leer el chat pegado y PROPONER el pedido. LÓGICA PURA.
// ============================================================================
//
// Magra (reingeniería, tanda 2 · 2B · E08). El pedido llega por WhatsApp como texto («hola, soy
// Ana 11 5555-1234, para mañana a la tarde 2 kg de vacío y 6 chorizos») y hoy se retipea entero.
// Acá se lee ese texto y se arma una PROPUESTA: el teléfono, el nombre, la franja, si es retiro o
// envío, y los renglones (corte + cantidad). La propuesta no graba nada: la pantalla
// (vender/PedidoDesdeWhatsApp.tsx) muestra cada renglón para que quien atiende lo confirme o lo
// corrija, y recién con todo confirmado se registra con `createOrder` (que vuelve a leer los
// precios de la base: acá los precios son sólo para MOSTRAR el total estimado).
//
// SIN IA, A PROPÓSITO. Es un lector determinístico en criollo: un diccionario de cortes con sus
// sinónimos y errores de tipeo, números con letra («medio», «kilo y medio», «media docena»), por
// importe («$15.000 de picada» → kilos estimados), por pieza («3 bifes de chorizo de 300 gr») y
// por paquete («6 chorizos» con «Chorizo de cerdo x6» → 1 paquete). Lo que no entiende no lo
// inventa: queda en «No lo reconocí» para cargarlo a mano.
//
// EL DICCIONARIO SE COMPARTE. `DICCIONARIO_DE_CORTES`, `claveDeCorte` y `reconocerCorte` están
// exportados para que la lectura de las listas del frigorífico (compras) reconozca los mismos
// cortes con las mismas reglas («bife angosto» = «bife de chorizo», «vacio novillo» = «vacío»).
//
// Datos del negocio marcados PROVISIONAL A CONFIRMAR: el peso típico de cada pieza
// (`pieza.kg`), las horas de las franjas por defecto y el área 11 para un número sin área.
//
// Sin Prisma, sin red, sin fecha del sistema (el «hoy» entra por parámetro): lo usan el
// navegador y los tests.

import { normalizarTelefono } from "@/lib/clientes/telefono";
import { redondearAlCentavo } from "@/lib/dinero/redondeo";

// ── Texto ────────────────────────────────────────────────────────────────────────────────────

/**
 * Minúsculas, sin tildes ni diéresis, «ñ» → «n». MISMO LARGO que el texto en NFC (cada letra
 * con tilde precompuesta pasa a una sola letra): así una posición en el texto normalizado es
 * la misma en el original, y el renglón puede citar lo que escribió la clienta tal cual.
 */
export function normalizarTexto(s: string): string {
  return String(s ?? "")
    .normalize("NFC")
    .split("")
    .map((c) => c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().charAt(0) || c)
    .join("");
}

/** Saca plural y diminutivo: «chorizos» → chorizo, «mollejitas» → molleja, «kilito» → kilo. */
function formas(w: string): string[] {
  const out = new Set([w]);
  if (w.length > 3 && w.endsWith("es")) out.add(w.slice(0, -2));
  if (w.length > 3 && w.endsWith("s")) out.add(w.slice(0, -1));
  const dim = /^(.{2,}?)c?it(o|a)s?$/.exec(w);
  if (dim && w.length > 5) for (const fin of ["o", "a", "e", ""]) out.add(dim[1] + fin);
  return [...out];
}

/** Cómo suena en el Río de la Plata: v=b, z=s=c(e,i), sin h, sin letras repetidas. */
function fonetica(w: string): string {
  return w
    .replace(/(.)\1+/g, "$1")
    .replace(/ch/g, "X")
    .replace(/qu/g, "k")
    .replace(/c([ei])/g, "s$1")
    .replace(/c/g, "k")
    .replace(/z/g, "s")
    .replace(/v/g, "b")
    .replace(/h/g, "")
    .replace(/y$/g, "i");
}

/** Distancia de edición con transposición (Damerau, alineación óptima). */
function distancia(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

/**
 * Palabras de todos los días que se parecen a un corte y NO lo son («pasado» ≈ «asado», «paso»,
 * «kilo»): con éstas sólo vale la coincidencia exacta, nunca la aproximada.
 */
const NUNCA_APROXIMADA = new Set(
  "pasado paso pasa para pase kilo kilos medio media gracias hola buenas manana tarde noche hoy quiero queria quisiera porfa favor dejame mandame separame anotame necesito unos unas cuarto cuartos docena gramos pesos lucas retiro envio buscar despues tambien sabado domingo lunes martes miercoles jueves viernes llevar llevo mismo misma lista listo cuanto cuantos precio total entrega horario direccion casa calle numero tiene tenes hay salen sale queda quedan".split(" "),
);

/** Las unidades, los números con letra y las palabras de todos los días: nunca son un corte. */
function esPalabraComun(a: string): boolean {
  return NUNCA_APROXIMADA.has(a) || KG.has(a) || GR.has(a) || UNIDADES.has(a) || PAQUETES.has(a) || PLATA.has(a) || NUMEROS[a] !== undefined || RELLENO.has(a);
}

/**
 * ¿La palabra escrita `a` es la palabra del diccionario `b`? 1 = igual · 0,98 = plural o
 * diminutivo · 0,9 = suena igual («bacio») · 0,8 = un error de tipeo («moleja») · 0 = no.
 */
function parecido(a: string, b: string): number {
  if (a === b) return 1;
  const fa = formas(a);
  const fb = formas(b);
  if (fa.some((x) => fb.includes(x))) return 0.98;
  if (b.length <= 3 || esPalabraComun(a)) return 0;
  const pa = fa.map(fonetica);
  const pb = fb.map(fonetica);
  if (pa.some((x) => pb.includes(x))) return 0.9;
  if (a.length < 4 || b.length < 5) return 0;
  for (const x of pa) {
    for (const y of pb) {
      if (x[0] !== y[0]) continue;
      const dd = distancia(x, y);
      if (dd <= 1) return 0.8;
      if (dd <= 2 && y.length >= 8) return 0.7;
    }
  }
  return 0;
}

// ── El diccionario de cortes (compartido con la lectura de listas del frigorífico) ──────────────

export interface CorteDelDiccionario {
  /** Clave estable («bife-de-chorizo»). */
  clave: string;
  /** Cómo se dice en el mostrador. */
  nombre: string;
  /** Cómo lo escriben (sin tildes, en minúscula; el plural y el diminutivo salen solos). */
  sinonimos: readonly string[];
  /**
   * Si se pide por pieza («3 bifes», «6 milanesas», «1 pollo»): la palabra de la pieza y cuánto
   * pesa una, para estimar los kilos. PROVISIONAL A CONFIRMAR con Magra.
   */
  pieza?: { palabra: string; kg: number };
}

export const DICCIONARIO_DE_CORTES: readonly CorteDelDiccionario[] = [
  // Vaca: los de la parrilla
  { clave: "vacio", nombre: "Vacío", sinonimos: ["vacio", "vacio novillo", "vacio de novillo", "bacio", "basio", "vasio", "vaciito"] },
  { clave: "asado", nombre: "Asado", sinonimos: ["asado", "asado de tira", "tira de asado", "tira", "costilla", "costillar", "asado banderita", "banderita", "asadito"] },
  { clave: "entrana", nombre: "Entraña", sinonimos: ["entrana", "entranha", "entrana fina", "entrania"] },
  { clave: "matambre", nombre: "Matambre", sinonimos: ["matambre", "matambre vacuno", "matanbre"] },
  { clave: "bife-de-chorizo", nombre: "Bife de chorizo", sinonimos: ["bife de chorizo", "bife angosto", "bife chorizo", "bife de choriso"], pieza: { palabra: "bife", kg: 0.35 } },
  { clave: "ojo-de-bife", nombre: "Ojo de bife", sinonimos: ["ojo de bife", "bife ancho", "entrecot", "rib eye", "ribeye"], pieza: { palabra: "bife", kg: 0.35 } },
  { clave: "bife", nombre: "Bife", sinonimos: ["bife", "bifecito"], pieza: { palabra: "bife", kg: 0.3 } },
  { clave: "tapa-de-asado", nombre: "Tapa de asado", sinonimos: ["tapa de asado"] },
  { clave: "colita-de-cuadril", nombre: "Colita de cuadril", sinonimos: ["colita de cuadril", "colita", "colita cuadril"] },
  { clave: "tapa-de-cuadril", nombre: "Tapa de cuadril", sinonimos: ["tapa de cuadril", "picana", "picanha"] },
  { clave: "cuadril", nombre: "Cuadril", sinonimos: ["cuadril"] },
  { clave: "lomo", nombre: "Lomo", sinonimos: ["lomo", "lomito", "solomillo de vaca"] },
  { clave: "bola-de-lomo", nombre: "Bola de lomo", sinonimos: ["bola de lomo", "bola"] },
  { clave: "peceto", nombre: "Peceto", sinonimos: ["peceto", "pesceto", "peseto"] },
  { clave: "nalga", nombre: "Nalga", sinonimos: ["nalga", "nalga de adentro", "nalga de afuera"] },
  { clave: "tapa-de-nalga", nombre: "Tapa de nalga", sinonimos: ["tapa de nalga"] },
  { clave: "cuadrada", nombre: "Cuadrada", sinonimos: ["cuadrada", "carnaza cuadrada"] },
  { clave: "palomita", nombre: "Palomita", sinonimos: ["palomita"] },
  { clave: "tortuguita", nombre: "Tortuguita", sinonimos: ["tortuguita", "tortuga"] },
  { clave: "roast-beef", nombre: "Roast beef", sinonimos: ["roast beef", "rosbif", "rostbif", "roasbeef"] },
  { clave: "aguja", nombre: "Aguja", sinonimos: ["aguja"] },
  { clave: "paleta", nombre: "Paleta", sinonimos: ["paleta", "carnaza de paleta"] },
  { clave: "falda", nombre: "Falda", sinonimos: ["falda"] },
  { clave: "osobuco", nombre: "Osobuco", sinonimos: ["osobuco", "ossobuco", "ozobuco"] },
  { clave: "carnaza", nombre: "Carnaza", sinonimos: ["carnaza"] },
  { clave: "churrasco", nombre: "Churrasco", sinonimos: ["churrasco", "churrasquito"], pieza: { palabra: "churrasco", kg: 0.25 } },
  { clave: "picada", nombre: "Carne picada", sinonimos: ["picada", "carne picada", "picada especial", "picada comun", "molida", "carne molida", "pikada"] },
  { clave: "milanesa", nombre: "Milanesas", sinonimos: ["milanesa", "milanga", "mila", "milas"], pieza: { palabra: "milanesa", kg: 0.15 } },
  { clave: "hamburguesa", nombre: "Hamburguesas", sinonimos: ["hamburguesa", "burger", "hamburguesas caseras"], pieza: { palabra: "hamburguesa", kg: 0.12 } },
  // Achuras y embutidos
  { clave: "molleja", nombre: "Molleja", sinonimos: ["molleja", "moleja", "moyeja"] },
  { clave: "chinchulin", nombre: "Chinchulín", sinonimos: ["chinchulin", "chinchu", "chinchulines"] },
  { clave: "rinon", nombre: "Riñón", sinonimos: ["rinon", "rinones"] },
  { clave: "higado", nombre: "Hígado", sinonimos: ["higado"] },
  { clave: "lengua", nombre: "Lengua", sinonimos: ["lengua"] },
  { clave: "mondongo", nombre: "Mondongo", sinonimos: ["mondongo"] },
  { clave: "chorizo", nombre: "Chorizo", sinonimos: ["chorizo", "chori", "choris", "chorizo parrillero", "chorizo de cerdo", "choriso"], pieza: { palabra: "chorizo", kg: 0.1 } },
  { clave: "morcilla", nombre: "Morcilla", sinonimos: ["morcilla", "morci", "morsilla"], pieza: { palabra: "morcilla", kg: 0.12 } },
  { clave: "salchicha-parrillera", nombre: "Salchicha parrillera", sinonimos: ["salchicha parrillera", "parrillera", "salchicha"] },
  // Cerdo
  { clave: "bondiola", nombre: "Bondiola", sinonimos: ["bondiola", "bondiolita", "bondiolla"] },
  { clave: "matambrito-de-cerdo", nombre: "Matambrito de cerdo", sinonimos: ["matambrito de cerdo", "matambrito", "matambre de cerdo"] },
  { clave: "pechito-de-cerdo", nombre: "Pechito de cerdo", sinonimos: ["pechito de cerdo", "pechito", "costilla de cerdo", "costillitas de cerdo"] },
  { clave: "carre-de-cerdo", nombre: "Carré de cerdo", sinonimos: ["carre de cerdo", "carre"] },
  { clave: "solomillo-de-cerdo", nombre: "Solomillo de cerdo", sinonimos: ["solomillo de cerdo", "solomillo"] },
  { clave: "cerdo", nombre: "Cerdo", sinonimos: ["cerdo", "chancho"] },
  // Pollo
  { clave: "pollo", nombre: "Pollo", sinonimos: ["pollo", "pollo entero", "poyo"], pieza: { palabra: "pollo", kg: 2.2 } },
  { clave: "suprema", nombre: "Suprema", sinonimos: ["suprema", "pechuga"], pieza: { palabra: "suprema", kg: 0.25 } },
  { clave: "pata-muslo", nombre: "Pata muslo", sinonimos: ["pata muslo", "patamuslo", "pata y muslo", "muslo"], pieza: { palabra: "pata", kg: 0.35 } },
  { clave: "alitas", nombre: "Alitas", sinonimos: ["alitas", "ala", "alas"] },
  // Otros
  { clave: "cordero", nombre: "Cordero", sinonimos: ["cordero"] },
  { clave: "chivito", nombre: "Chivito", sinonimos: ["chivito", "cabrito"] },
];

type Tok = { t: string; i: number; f: number };

const ARTICULOS = new Set(["de", "del", "la", "el", "los", "las", "y"]);

/** Las palabras y los números del texto, con su posición (para citar el original). */
function tokens(norm: string): Tok[] {
  const out: Tok[] = [];
  const re = /\$|\d+(?:[.,/]\d+)*|[a-z]+/g;
  for (let m = re.exec(norm); m; m = re.exec(norm)) out.push({ t: m[0], i: m.index, f: m.index + m[0].length });
  return out;
}

type Frase = { palabras: string[] };
const fraseDe = (s: string): Frase => ({ palabras: tokens(normalizarTexto(s)).map((x) => x.t).filter((t) => !ARTICULOS.has(t)) });

const FRASES_DEL_DICCIONARIO: readonly { corte: CorteDelDiccionario; frase: Frase }[] = DICCIONARIO_DE_CORTES.flatMap((corte) =>
  corte.sinonimos.map((s) => ({ corte, frase: fraseDe(s) })),
);

type Coincidencia = { desde: number; hasta: number; puntaje: number; largo: number };

/** Dónde aparece la frase en las palabras (sin artículos), con su puntaje. */
function buscarFrase(palabras: readonly Tok[], frase: Frase): Coincidencia[] {
  const k = frase.palabras.length;
  const out: Coincidencia[] = [];
  if (k === 0) return out;
  for (let i = 0; i + k <= palabras.length; i++) {
    let suma = 0;
    let ok = true;
    for (let j = 0; j < k; j++) {
      const p = parecido(palabras[i + j].t, frase.palabras[j]);
      if (p === 0) {
        ok = false;
        break;
      }
      suma += p;
    }
    if (ok) out.push({ desde: i, hasta: i + k, puntaje: suma / k, largo: k });
  }
  return out;
}

/**
 * La clave del diccionario de un texto («Bife de chorizo x kg» → «bife-de-chorizo»), o null.
 * Gana la coincidencia más larga y después la más exacta: «bife de chorizo» le gana a «chorizo».
 * Es lo que usa la lectura de listas del frigorífico para reconocer un renglón del remito.
 */
export function claveDeCorte(texto: string): string | null {
  const palabras = tokens(normalizarTexto(texto)).filter((x) => !ARTICULOS.has(x.t) && /[a-z]/.test(x.t));
  // A igual largo gana la que va primero: en castellano el núcleo va adelante («Milanesas DE
  // nalga» es una milanesa, «Chorizo DE cerdo» es un chorizo).
  let mejor: { clave: string; largo: number; desde: number; puntaje: number } | null = null;
  for (const { corte, frase } of FRASES_DEL_DICCIONARIO) {
    for (const c of buscarFrase(palabras, frase)) {
      const gana =
        !mejor ||
        c.largo > mejor.largo ||
        (c.largo === mejor.largo && (c.desde < mejor.desde || (c.desde === mejor.desde && c.puntaje > mejor.puntaje)));
      if (gana) mejor = { clave: corte.clave, largo: c.largo, desde: c.desde, puntaje: c.puntaje };
    }
  }
  return mejor?.clave ?? null;
}

export function corteDelDiccionario(clave: string | null): CorteDelDiccionario | null {
  return clave ? (DICCIONARIO_DE_CORTES.find((c) => c.clave === clave) ?? null) : null;
}

// ── El catálogo del negocio ──────────────────────────────────────────────────────────────────

/** Un producto del catálogo, como lo manda Vender (precios de la base, sólo para mostrar). */
export interface ProductoDelCatalogo {
  id: string;
  name: string;
  saleUnit: "UNIT" | "WEIGHT" | string;
  price: number | null;
  pricePerKg: number | null;
}

type ProductoPreparado = {
  p: ProductoDelCatalogo;
  clave: string | null;
  porPeso: boolean;
  precio: number | null;
  /** «Chorizo de cerdo x6» → 6: se vende por paquete. */
  paquete: number;
  palabras: string[];
};

function preparar(catalogo: readonly ProductoDelCatalogo[]): ProductoPreparado[] {
  return catalogo.map((p) => {
    const norm = normalizarTexto(p.name);
    const porPeso = p.saleUnit === "WEIGHT";
    const pack = /\bx\s?(\d{1,3})\b/.exec(norm);
    return {
      p,
      clave: claveDeCorte(p.name),
      porPeso,
      precio: porPeso ? p.pricePerKg : p.price,
      paquete: !porPeso && pack ? Math.max(1, Number(pack[1])) : 1,
      palabras: tokens(norm)
        .map((x) => x.t)
        .filter((t) => !ARTICULOS.has(t) && /^[a-z]+$/.test(t) && t !== "x"),
    };
  });
}

/**
 * El producto del catálogo para un texto suelto (un renglón del remito del frigorífico, lo que
 * escribió la clienta): por la clave del diccionario y, si hay varios con la misma clave, por las
 * palabras que comparten. `alternativas` = los otros con la misma clave. null si no hay ninguno.
 */
export function reconocerCorte(
  texto: string,
  catalogo: readonly ProductoDelCatalogo[],
): { productId: string; nombre: string; alternativas: { id: string; nombre: string }[]; seguro: boolean } | null {
  const prep = preparar(catalogo);
  const palabras = tokens(normalizarTexto(texto)).filter((x) => !ARTICULOS.has(x.t) && /[a-z]/.test(x.t));
  const m = mejorMencion(palabras, 0, palabras.length, prep);
  if (!m) return null;
  const elegido = elegirProducto(m.candidatos, palabras.map((x) => x.t));
  return elegido
    ? { productId: elegido.p.id, nombre: elegido.p.name, alternativas: m.candidatos.filter((c) => c !== elegido).map((c) => ({ id: c.p.id, nombre: c.p.name })), seguro: m.puntaje >= 0.98 && m.candidatos.length === 1 }
    : null;
}

type Mencion = { desde: number; hasta: number; puntaje: number; candidatos: ProductoPreparado[]; corte: CorteDelDiccionario | null };

/** Las menciones de cortes en palabras[desde, hasta), sin pisarse: la más larga primero. */
function menciones(palabras: readonly Tok[], prep: readonly ProductoPreparado[]): Mencion[] {
  const todas: (Mencion & { largo: number; prioridad: number })[] = [];
  const delCatalogo = prep.map((pp) => ({ pp, frase: { palabras: pp.palabras } })).filter((x) => x.frase.palabras.length > 0);
  for (const { corte, frase } of FRASES_DEL_DICCIONARIO) {
    for (const c of buscarFrase(palabras, frase)) {
      let candidatos = prep.filter((pp) => pp.clave === corte.clave);
      // Sin producto con esa clave («bife» a secas): los productos que llevan esas palabras.
      if (candidatos.length === 0) candidatos = prep.filter((pp) => frase.palabras.every((w) => pp.palabras.some((x) => parecido(x, w) >= 0.98)));
      todas.push({ ...c, candidatos, corte, prioridad: 0 });
    }
  }
  for (const { pp, frase } of delCatalogo) {
    // El nombre entero del producto («hamburguesas caseras»), o su primera palabra si es propia
    // («provoleta»): un producto que el diccionario no conoce también se reconoce.
    const frases = [frase];
    const primera = frase.palabras[0];
    if (frase.palabras.length > 1 && primera && primera.length >= 4 && !prep.some((o) => o !== pp && o.palabras.includes(primera))) frases.push({ palabras: [primera] });
    for (const f of frases) {
      for (const c of buscarFrase(palabras, f)) {
        if (c.puntaje < 0.8) continue;
        todas.push({ ...c, candidatos: [pp], corte: corteDelDiccionario(pp.clave), prioridad: 1 });
      }
    }
  }
  todas.sort((a, b) => b.largo - a.largo || b.puntaje - a.puntaje || b.prioridad - a.prioridad || a.desde - b.desde);
  const usadas = new Set<number>();
  const elegidas: Mencion[] = [];
  for (const m of todas) {
    let libre = true;
    for (let i = m.desde; i < m.hasta; i++) if (usadas.has(i)) libre = false;
    if (!libre) continue;
    for (let i = m.desde; i < m.hasta; i++) usadas.add(i);
    elegidas.push({ desde: m.desde, hasta: m.hasta, puntaje: m.puntaje, candidatos: m.candidatos, corte: m.corte });
  }
  return elegidas.sort((a, b) => a.desde - b.desde);
}

function mejorMencion(palabras: readonly Tok[], desde: number, hasta: number, prep: readonly ProductoPreparado[]): Mencion | null {
  const ms = menciones(palabras.slice(desde, hasta), prep).filter((m) => m.candidatos.length > 0);
  return ms.sort((a, b) => b.hasta - b.desde - (a.hasta - a.desde) || b.puntaje - a.puntaje)[0] ?? null;
}

/** Entre varios productos con la misma clave, el que comparte más palabras con lo escrito. */
function elegirProducto(candidatos: readonly ProductoPreparado[], contexto: readonly string[]): ProductoPreparado | null {
  let mejor: ProductoPreparado | null = null;
  let puntos = -1;
  for (const c of candidatos) {
    const p = c.palabras.filter((w) => contexto.some((x) => parecido(x, w) >= 0.9)).length;
    if (p > puntos) {
      mejor = c;
      puntos = p;
    }
  }
  return mejor;
}

// ── Cantidades ──────────────────────────────────────────────────────────────────────────────

const NUMEROS: Readonly<Record<string, number>> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100,
};
const KG = new Set(["kg", "kgs", "k", "kilo", "kilos", "kl", "klo", "kls", "kilogramo", "kilogramos", "kilito", "kilitos", "kgr", "kilogr"]);
const GR = new Set(["g", "gr", "grs", "gramo", "gramos", "grm", "grms", "gs", "grams"]);
const UNIDADES = new Set(["u", "un", "unid", "unidad", "unidades", "uni", "unids", "uds"]);
const PAQUETES = new Set(["paquete", "paquetes", "paq", "pack", "packs", "caja", "cajas", "bandeja", "bandejas"]);
const PLATA = new Set(["pesos", "peso", "mangos", "lucas", "luca", "luquitas", "mil"]);

/** Cómo lo pidió (antes de saber qué producto es). */
type Cantidad =
  | { tipo: "kg"; kg: number }
  | { tipo: "numero"; n: number; miles: boolean }
  | { tipo: "unidades"; n: number }
  | { tipo: "paquetes"; n: number }
  | { tipo: "importe"; pesos: number };

/** Un número escrito con cifras: «1,5», «1.5», «15.000», «1/2». */
function leerCifra(t: string): { valor: number; miles: number | null } | null {
  if (/^\d+\/\d+$/.test(t)) {
    const [a, b] = t.split("/").map(Number);
    return b > 0 ? { valor: a / b, miles: null } : null;
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    const miles = Number(t.replace(/\./g, ""));
    // «1.240» puede ser un kilo y cuarto (con «kg») o mil doscientos cuarenta (con «$» o «g»).
    return { valor: t.split(".").length === 2 ? Number(t) : miles, miles };
  }
  if (/^\d+([.,]\d+)?$/.test(t)) return { valor: Number(t.replace(",", ".")), miles: null };
  return null;
}

function esComienzoDeCantidad(x: string): boolean {
  return x === "$" || /^\d/.test(x) || NUMEROS[x] !== undefined || KG.has(x) || ["medio", "media", "cuarto", "docena", "par"].includes(x);
}

const RELLENO = new Set(
  "de del x por unos unas aprox aproximadamente como tipo mas menos o la el los las quiero queria quisiera necesito necesitaria dame dejame deja separame separa anotame anota mandame traeme me das podes podrias preparame prepara armame tenes hay y tambien ademas otro otra porfa favor pf plis please hola buenas buen dia soy para con bien les te ya ahi algo poneme pone agregame agrega sumame suma lleva llevo".split(" "),
);

/**
 * La cantidad de un trozo de texto (lo que va antes o después del corte): «2 kg», «medio»,
 * «kilo y medio», «1 kilo 200», «500 gr», «$15.000», «15 lucas», «media docena», «tres».
 */
function leerCantidad(trozo: readonly string[]): Cantidad | null {
  const t = trozo.filter((x) => !RELLENO.has(x) || x === "y");
  let i = 0;
  const sig = () => t[i];
  const quitarY = () => {
    while (t[i] === "y") i++;
  };
  // Lo que va antes de la cantidad («me separás», «te pido») no cuenta.
  while (i < t.length && !esComienzoDeCantidad(t[i])) i++;
  quitarY();
  if (i >= t.length) return null;

  // Plata: «$15.000», «$ 15000», «$15 mil», «15 lucas», «15 mil pesos», «15000 pesos».
  let conPeso = false;
  if (sig() === "$") {
    conPeso = true;
    i++;
  }

  let valor: number | null = null;
  let miles: number | null = null;
  let palabra = false;
  const c = sig() !== undefined ? leerCifra(sig()) : null;
  if (c) {
    valor = c.valor;
    miles = c.miles;
    i++;
    // «1 1/2»
    const frac = sig() && /^\d+\/\d+$/.test(sig()) ? leerCifra(sig()) : null;
    if (frac) {
      valor += frac.valor;
      i++;
    }
  } else if (sig() === "medio" || sig() === "media") {
    i++;
    if (sig() === "docena" || sig() === "docenas") {
      i++;
      return { tipo: "unidades", n: 6 };
    }
    valor = 0.5;
    palabra = true;
  } else if (sig() === "cuarto") {
    i++;
    valor = 0.25;
    palabra = true;
  } else if (sig() === "docena") {
    i++;
    return { tipo: "unidades", n: 12 };
  } else if (sig() === "par") {
    i++;
    return { tipo: "numero", n: 2, miles: false };
  } else if (sig() !== undefined && NUMEROS[sig()] !== undefined) {
    valor = NUMEROS[sig()];
    palabra = true;
    i++;
    if (sig() === "cuartos" || sig() === "cuarto") {
      i++;
      valor = valor * 0.25;
    } else if (sig() === "docena" || sig() === "docenas") {
      i++;
      return { tipo: "unidades", n: valor * 12 };
    } else if (sig() === "par") {
      i++;
      return { tipo: "numero", n: valor * 2, miles: false };
    }
  } else if (sig() !== undefined && KG.has(sig())) {
    // «kilo de vacío» a secas = un kilo.
    valor = 1;
  } else {
    return null;
  }

  // «dos y medio», «1 y medio»
  if (t[i] === "y" && (t[i + 1] === "medio" || t[i + 1] === "media")) {
    valor += 0.5;
    i += 2;
  } else if (t[i] === "y" && t[i + 1] === "cuarto") {
    valor += 0.25;
    i += 2;
  }

  const u = sig();
  if (conPeso || (u !== undefined && PLATA.has(u))) {
    let pesos = miles ?? valor;
    if (u === "mil" || u === "lucas" || u === "luca" || u === "luquitas") {
      pesos = valor * 1000;
      i++;
    }
    return pesos > 0 ? { tipo: "importe", pesos: redondearAlCentavo(pesos) } : null;
  }
  if (u !== undefined && KG.has(u)) {
    i++;
    // Con «kg» explícito, «1.240 kg» es un kilo y cuarto (no mil kilos).
    let kg = valor;
    if (t[i] === "y" && (t[i + 1] === "medio" || t[i + 1] === "media")) {
      kg += 0.5;
      i += 2;
    } else if (t[i] === "y" && t[i + 1] === "cuarto") {
      kg += 0.25;
      i += 2;
    } else if (t[i] && /^\d{2,3}$/.test(t[i]) && Number(t[i]) >= 50) {
      // «1 kilo 200» = 1,2 kg
      kg += Number(t[i]) / 1000;
      i++;
      if (t[i] && GR.has(t[i])) i++;
    }
    return kg > 0 ? { tipo: "kg", kg } : null;
  }
  if (u !== undefined && GR.has(u)) {
    const g = miles ?? valor;
    return g > 0 ? { tipo: "kg", kg: g / 1000 } : null;
  }
  if (u !== undefined && UNIDADES.has(u)) return valor > 0 ? { tipo: "unidades", n: valor } : null;
  if (u !== undefined && PAQUETES.has(u)) return valor > 0 ? { tipo: "paquetes", n: valor } : null;
  if (valor === null || !(valor > 0)) return null;
  // Número solo: lo decide el producto (kilos, gramos, unidades o plata).
  return { tipo: "numero", n: miles ?? valor, miles: miles !== null && !palabra };
}

/** «de 300 gr», «de medio kilo»: el peso de cada pieza, escrito después del corte. */
function pesoPorPieza(despues: readonly string[]): number | null {
  const k = despues.indexOf("de");
  if (k < 0) return null;
  const c = leerCantidad(despues.slice(k + 1));
  if (!c) return null;
  if (c.tipo === "kg") return c.kg;
  // «de 300» = 300 g
  if (c.tipo === "numero" && c.n >= 50 && c.n < 5000) return c.n / 1000;
  return null;
}

// ── El horario ──────────────────────────────────────────────────────────────────────────────

export type ParteDelDia = "manana" | "tarde" | "noche";

export interface FranjaPropuesta {
  /** Días desde hoy (0 = hoy, 1 = mañana). */
  enDias: number;
  /** YYYY-MM-DD del negocio. */
  dia: string;
  parte: ParteDelDia | null;
  /** HH:mm si dijo una hora («a las 18»), o null. */
  hora: string | null;
  /** «Mañana tarde», «Hoy 18:00», «Sábado mañana». */
  texto: string;
}

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const DIAS_SEMANA_LINDO = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const PARTE_LINDA: Record<ParteDelDia, string> = { manana: "mañana", tarde: "tarde", noche: "noche" };

/** YYYY-MM-DD + n días (fecha de calendario, sin zona). */
export function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function diaDeLaSemana(dia: string): number {
  return new Date(`${dia}T12:00:00.000Z`).getUTCDay();
}

/** «Hoy», «Mañana», «Sábado» o «sáb 24/10» (más de una semana). */
export function textoDelDia(hoy: string, enDias: number): string {
  if (enDias === 0) return "Hoy";
  if (enDias === 1) return "Mañana";
  const dia = sumarDias(hoy, enDias);
  if (enDias < 7) return DIAS_SEMANA_LINDO[diaDeLaSemana(dia)];
  return `${DIAS_SEMANA_LINDO[diaDeLaSemana(dia)]} ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

type Tramo = { i: number; f: number };

const hh = (h: number, m = 0) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

/**
 * El horario que dice el chat, y los tramos del texto que lo dicen (para sacarlos antes de leer
 * los cortes: «a las 18» no es una cantidad). Sin `hoy` válido no se propone franja.
 */
function leerFranja(norm: string, hoy: string | null): { franja: FranjaPropuesta | null; tramos: Tramo[] } {
  const tramos: Tramo[] = [];
  let enDias: number | null = null;
  let parte: ParteDelDia | null = null;
  let hora: string | null = null;
  const marcar = (m: RegExpExecArray) => tramos.push({ i: m.index, f: m.index + m[0].length });
  const todas = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    const g = new RegExp(re.source, "g");
    for (let m = g.exec(norm); m; m = g.exec(norm)) {
      if (tramos.some((t) => m.index < t.f && m.index + m[0].length > t.i)) continue;
      fn(m);
      marcar(m);
    }
  };
  // Saludos: «buenas tardes» no es una franja.
  todas(/\b(?:buen(?:as|os)?\s+(?:tardes|noches|dias|dia)|buenas)\b/, () => undefined);
  todas(/\b(?:para\s+)?(?:el\s+)?pasado\s+manana\b/, () => (enDias = 2));
  todas(/\b(?:a|por|de|en|esta)\s+la\s+manana\b|\besta\s+manana\b|\btemprano\b|\bal\s+mediodia\b/, () => (parte = "manana"));
  todas(/\b(?:a|por|de|en|esta)\s+la\s+(?:tarde|tardecita|siesta)\b|\besta\s+tarde\b|\btardecita\b/, () => (parte = "tarde"));
  todas(/\b(?:a|por|de|en|esta)\s+la\s+noche\b|\besta\s+noche\b/, () => (parte = "noche"));
  todas(/\b(?:para\s+)?(?:el\s+)?(?:dia\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/, (m) => {
    if (!hoy) return;
    const objetivo = DIAS_SEMANA.indexOf(m[1]);
    const d = (objetivo - diaDeLaSemana(hoy) + 7) % 7;
    enDias = d === 0 ? 7 : d;
  });
  todas(/\b(?:para\s+)?hoy\b/, () => (enDias = 0));
  todas(/\b(?:para\s+)?manana\b/, () => (enDias = 1));
  todas(/\b(?:a|por)\s+la\s+tarde\b|\btarde\b/, (m) => {
    // «tarde» suelto («mañana tarde», «hoy tarde»), salvo «más tarde».
    if (!/mas\s+tarde$/.test(norm.slice(Math.max(0, m.index - 4), m.index + m[0].length))) parte = "tarde";
  });
  const ponerHora = (h: number, mm: number) => {
    if (h < 7 || h > 23 || mm > 59) return false;
    hora = hh(h, mm);
    return true;
  };
  const NO_UNIDAD = "(?!\\s*(?:kg|kilo|kilos|k\\b|g\\b|gr|grs|gramos|u\\b|unid|de\\s))";
  todas(new RegExp(`\\b(?:de|entre)\\s+(?:las\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*(?:a|-|y|hasta)\\s*(?:las\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*(?:hs|h|horas)?\\b${NO_UNIDAD}`), (m) => {
    ponerHora(Number(m[1]), Number(m[2] ?? 0));
  });
  todas(/\b(?:a\s+las|a\s+eso\s+de\s+las|tipo(?:\s+las)?|desde\s+las|despues\s+de\s+las|antes\s+de\s+las|como\s+a\s+las)\s+(\d{1,2})(?:[:.](\d{2}))?(?:\s*(?:hs|h|horas)\b)?/, (m) => {
    ponerHora(Number(m[1]), Number(m[2] ?? 0));
  });
  todas(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(?:hs|horas)\b/, (m) => {
    ponerHora(Number(m[1]), Number(m[2] ?? 0));
  });

  if (hora && !parte) {
    const h = Number((hora as string).slice(0, 2));
    parte = h < 14 ? "manana" : h < 20 ? "tarde" : "noche";
  }
  if (enDias === null && (parte !== null || hora !== null)) enDias = 0;
  if (enDias === null || !hoy) return { franja: null, tramos };
  const dia = sumarDias(hoy, enDias);
  const quePartes = parte ? ` ${PARTE_LINDA[parte as ParteDelDia]}` : "";
  const texto = `${textoDelDia(hoy, enDias)}${hora ? ` ${hora}` : quePartes}`;
  return { franja: { enDias, dia, parte, hora, texto }, tramos };
}

// ── Teléfono, nombre, entrega ───────────────────────────────────────────────────────────────

export interface TelefonoPropuesto {
  /** Clave de 10 dígitos (área + número), la que usa la ficha y wa.me. */
  clave: string;
  /** Tal cual estaba escrito. */
  texto: string;
  /** Se le puso el área 11 porque vino sin área (PROVISIONAL: Canning está en el AMBA). */
  conAreaSupuesta: boolean;
}

/** Un número con un 15 adelante y sin área («15 5555-1234») o de 8 cifras: área 11. */
function claveDelTelefono(digitos: string): { clave: string; supuesta: boolean } | null {
  let d = normalizarTelefono(digitos);
  if (d.length === 10 && d.startsWith("15")) return { clave: `11${d.slice(2)}`, supuesta: true };
  if (d.length === 8 && /^[2-7]/.test(d)) return { clave: `11${d}`, supuesta: true };
  if (d.length === 10 && /^[1-3]/.test(d)) return { clave: d, supuesta: false };
  d = "";
  return null;
}

function leerTelefono(original: string): { telefono: TelefonoPropuesto | null; tramos: Tramo[] } {
  const re = /\+?\(?\d[\d\s().-]{6,}\d/g;
  for (let m = re.exec(original); m; m = re.exec(original)) {
    // Los grupos de cifras: se prueba del más largo al más corto, así «11 5555-1234 2 kg» no
    // se come el «2» de la cantidad.
    const grupos: { i: number; f: number }[] = [];
    const g = /\d+/g;
    for (let x = g.exec(m[0]); x; x = g.exec(m[0])) grupos.push({ i: x.index, f: x.index + x[0].length });
    for (let k = grupos.length; k >= 1; k--) {
      const trozo = m[0].slice(0, grupos[k - 1].f);
      const dig = trozo.replace(/\D/g, "");
      if (dig.length < 8 || dig.length > 13) continue;
      // Un precio o un peso con punto de miles no es un teléfono.
      if (/^\d{1,3}(\.\d{3})+$/.test(trozo.trim())) continue;
      const c = claveDelTelefono(dig);
      if (!c) continue;
      const i = m.index;
      return { telefono: { clave: c.clave, texto: trozo.trim(), conAreaSupuesta: c.supuesta }, tramos: [{ i, f: i + trozo.length }] };
    }
  }
  return { telefono: null, tramos: [] };
}

const NO_ES_NOMBRE = new Set(["la", "el", "yo", "de", "del", "una", "un", "quien", "cliente", "clienta", "vecina", "vecino", "nueva", "nuevo"]);

function capitalizar(s: string): string {
  return s.charAt(0).toLocaleUpperCase("es-AR") + s.slice(1);
}

function leerNombre(original: string, norm: string): { nombre: string | null; tramos: Tramo[] } {
  const re = /\b(?:soy|habla|te\s+escribe|les\s+escribe|mi\s+nombre\s+es|me\s+llamo)\s+([a-z]+)(\s+[a-z]+)?/;
  const m = re.exec(norm);
  if (!m || NO_ES_NOMBRE.has(m[1])) return { nombre: null, tramos: [] };
  const i1 = m.index + m[0].indexOf(m[1], m[0].length - m[1].length - (m[2]?.length ?? 0));
  const primero = original.slice(i1, i1 + m[1].length);
  let nombre = capitalizar(primero);
  let f = i1 + m[1].length;
  // El apellido sólo si está escrito con mayúscula («soy Ana Pérez»); «soy Ana para mañana» no.
  if (m[2]) {
    const i2 = m.index + m[0].length - m[2].length;
    const seg = original.slice(i2, m.index + m[0].length).trim();
    if (/^[A-ZÁÉÍÓÚÑ]/.test(seg) && !NO_ES_NOMBRE.has(normalizarTexto(seg))) {
      nombre = `${nombre} ${seg}`;
      f = m.index + m[0].length;
    }
  }
  return { nombre, tramos: [{ i: m.index, f }] };
}

function leerEntrega(norm: string): "retiro" | "envio" | null {
  const envio = /\b(envio|enviar|enviame|envien|enviamelo|mandar|mandamelo|mandenme|mandenmelo|me\s+lo\s+(?:traen|mandan|alcanzan)|me\s+los\s+(?:traen|mandan|alcanzan)|a\s+domicilio|delivery|traer|traigan)\b/.test(norm);
  const retiro = /\b(retiro|retirar|retiramos|paso\s+a\s+buscar|paso\s+a\s+retirar|paso\s+por\s+el\s+local|lo\s+busco|los\s+busco|voy\s+a\s+buscar|pasamos\s+a\s+buscar|lo\s+paso\s+a\s+buscar|lo\s+retiro)\b/.test(norm);
  if (envio && !retiro) return "envio";
  if (retiro && !envio) return "retiro";
  return null;
}

function leerDireccion(original: string): { direccion: string | null; tramos: Tramo[] } {
  const m = /\b(?:direcci[oó]n|dir|domicilio)\s*:?\s*([^\n]+)/i.exec(original);
  if (!m) return { direccion: null, tramos: [] };
  const d = m[1].trim().slice(0, 200);
  return d ? { direccion: d, tramos: [{ i: m.index, f: m.index + m[0].length }] } : { direccion: null, tramos: [] };
}

/**
 * Las líneas de encabezado de un chat exportado o copiado («[22/10/26, 10:15] Ana Pérez: …»,
 * «22/10/26 10:15 - Ana: …»): se saca el encabezado, se toma quién escribe y se descartan las
 * líneas del propio negocio (y «Yo»/«Tú»).
 */
function limpiarEncabezados(original: string, negocio: string | null): { texto: string; remitente: string | null } {
  const lineas = original.split("\n");
  const negocioNorm = negocio ? normalizarTexto(negocio).replace(/[^a-z0-9 ]/g, " ").trim() : "";
  let remitente: string | null = null;
  const out: string[] = [];
  const re = /^\s*\[?\s*\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?\s*m\.?)?\s*\]?\s*(?:-\s*)?([^:]{1,40}):\s?(.*)$/i;
  for (const linea of lineas) {
    const m = re.exec(linea);
    if (!m) {
      out.push(linea);
      continue;
    }
    const quien = m[1].trim();
    const quienNorm = normalizarTexto(quien);
    const esNegocio =
      /^(yo|tu|vos|you)$/.test(quienNorm) || (negocioNorm.length >= 3 && (quienNorm.includes(negocioNorm.split(" ")[0]) || negocioNorm.includes(quienNorm)));
    if (esNegocio) {
      out.push("");
      continue;
    }
    if (!remitente) remitente = quien;
    // Se mantiene el largo con espacios delante: las posiciones del texto no importan acá.
    out.push(m[2]);
  }
  return { texto: out.join("\n"), remitente };
}

// ── La propuesta ────────────────────────────────────────────────────────────────────────────

export interface RenglonPropuesto {
  /** Orden en el chat («r1», «r2»…). */
  id: string;
  /** Lo que escribió la clienta para este renglón, tal cual («2 kg de vacío»). */
  texto: string;
  productId: string | null;
  nombre: string | null;
  porPeso: boolean;
  /** Kilos (por peso) o unidades (paquetes, si el producto es «x6»). null = falta la cantidad. */
  cantidad: number | null;
  unidad: "kg" | "u";
  /** Es un peso ESTIMADO (pidió por importe o por pieza): se ajusta al pesar. */
  aAjustar: boolean;
  /** Cómo lo pidió, para el renglón y la nota: «$15.000», «3 bifes de 300 g», «6 chorizos». */
  pidio: string | null;
  /** Precio por kilo o por unidad del catálogo (sólo para mostrar). */
  precio: number | null;
  /** cantidad × precio al centavo, o null. ESTIMADO: el que vale lo calcula el servidor. */
  totalEstimado: number | null;
  /** Otros productos que también podrían ser. */
  alternativas: { id: string; nombre: string }[];
  /** Lo que hay que mirar antes de confirmar, en criollo. */
  dudas: string[];
  /** Lo que pidió aparte («sin grasa», «cortado en milanesas»). */
  detalle: string | null;
  /** Reconocido sin dudas (corte y cantidad escritos tal cual). */
  seguro: boolean;
}

export interface PropuestaDePedido {
  telefono: TelefonoPropuesto | null;
  nombre: string | null;
  franja: FranjaPropuesta | null;
  entrega: "retiro" | "envio" | null;
  direccion: string | null;
  renglones: RenglonPropuesto[];
  /** Trozos que parecen un pedido pero no se reconocieron («2 kg de lomo wagyu»). */
  sinReconocer: string[];
  /** Suma de los totales estimados que se pudieron calcular. */
  totalEstimado: number;
}

export interface OpcionesDeLectura {
  /** YYYY-MM-DD de hoy en el negocio: para «mañana», «el sábado». Sin él, no hay franja. */
  hoy?: string | null;
  /** Nombre del negocio: sus propios mensajes del chat no se leen como pedido. */
  negocio?: string | null;
}

const redondearKg = (n: number) => Math.round(n * 1000) / 1000;

/** «1,531 kg», «6 u», «1/2 kg» → texto del renglón. */
export function textoDeCantidad(cantidad: number, unidad: "kg" | "u"): string {
  if (unidad === "u") return `${cantidad.toLocaleString("es-AR")} u`;
  return `${cantidad.toLocaleString("es-AR", { maximumFractionDigits: 3 })} kg`;
}

export function pesos(n: number): string {
  const conCentavos = Math.round(n * 100) % 100 !== 0;
  return `$${n.toLocaleString("es-AR", { minimumFractionDigits: conCentavos ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** Lo que dice el renglón sobre el producto y la cantidad, ya decidido. */
function resolver(
  c: Cantidad | null,
  pp: ProductoPreparado,
  corte: CorteDelDiccionario | null,
  mencion: { primera: string; plural: boolean; conDe: boolean },
  porPieza: number | null,
): Pick<RenglonPropuesto, "cantidad" | "unidad" | "aAjustar" | "pidio" | "dudas"> & { seguro: boolean } {
  const unidad: "kg" | "u" = pp.porPeso ? "kg" : "u";
  const nombre = pp.p.name;
  const dudas: string[] = [];
  if (!c) return { cantidad: null, unidad, aAjustar: false, pidio: null, dudas: ["No dice cuánto: poné la cantidad."], seguro: false };

  // Pide por pieza el corte que tiene pieza («3 bifes», «6 milanesas», «1 pollo»).
  const pieza = corte?.pieza && parecido(mencion.primera, corte.pieza.palabra) >= 0.98 ? corte.pieza : null;

  if (pp.porPeso) {
    switch (c.tipo) {
      case "kg":
        return { cantidad: redondearKg(c.kg), unidad, aAjustar: false, pidio: null, dudas, seguro: true };
      case "importe": {
        if (!pp.precio) return { cantidad: null, unidad, aAjustar: true, pidio: pesos(c.pesos), dudas: [`${nombre} no tiene precio por kilo: poné los kilos.`], seguro: false };
        const kg = redondearKg(c.pesos / pp.precio);
        return { cantidad: kg, unidad, aAjustar: true, pidio: pesos(c.pesos), dudas, seguro: true };
      }
      case "unidades":
      case "paquetes":
      case "numero": {
        const n = c.n;
        // Por pieza: «3 bifes», «6 milanesas», «1 pollo» (el número pegado a la pieza, entero). Con
        // «de» en el medio es peso: «2 de chorizo», «medio de chorizo».
        const esPieza =
          c.tipo !== "numero" ||
          (Number.isInteger(n) && !mencion.conDe && (pieza !== null || (mencion.plural && n >= 2 && corte?.pieza !== undefined)));
        if (esPieza) {
          const kgPieza = porPieza ?? pieza?.kg ?? corte?.pieza?.kg ?? null;
          const palabra = pieza?.palabra ?? corte?.pieza?.palabra ?? "pieza";
          const pidio = `${n} ${n === 1 ? palabra : `${palabra}${/[aeiou]$/.test(palabra) ? "s" : "es"}`}${porPieza ? ` de ${Math.round(porPieza * 1000)} g` : ""}`;
          if (kgPieza === null) return { cantidad: null, unidad, aAjustar: true, pidio, dudas: [`Pidió ${pidio}: poné cuántos kilos son.`], seguro: false };
          if (!porPieza) dudas.push(`Calculé ${Math.round(kgPieza * 1000)} g cada ${palabra}: revisalo.`);
          return { cantidad: redondearKg(n * kgPieza), unidad, aAjustar: true, pidio, dudas, seguro: porPieza !== null };
        }
        // Un número solo: chico son kilos, de 50 a 4.999 son gramos («500 de picada»), de 5.000
        // para arriba es plata («15.000 de picada»).
        if (n >= 5000) {
          if (!pp.precio) return { cantidad: null, unidad, aAjustar: true, pidio: pesos(n), dudas: [`${nombre} no tiene precio por kilo: poné los kilos.`], seguro: false };
          return { cantidad: redondearKg(n / pp.precio), unidad, aAjustar: true, pidio: pesos(n), dudas: [`Leí ${pesos(n)} de ${nombre}: revisá que sea plata.`], seguro: false };
        }
        if (n >= 50) return { cantidad: redondearKg(n / 1000), unidad, aAjustar: false, pidio: `${n} g`, dudas, seguro: false };
        return { cantidad: redondearKg(n), unidad, aAjustar: false, pidio: null, dudas, seguro: c.miles === false && Number.isInteger(n * 4) };
      }
    }
  }

  // Por unidad (o por paquete «x6»).
  const p = pp.paquete;
  switch (c.tipo) {
    case "importe": {
      if (!pp.precio) return { cantidad: null, unidad, aAjustar: false, pidio: pesos(c.pesos), dudas: [`${nombre} no tiene precio: poné cuántos.`], seguro: false };
      const n = Math.max(1, Math.floor(c.pesos / pp.precio));
      return { cantidad: n, unidad, aAjustar: false, pidio: pesos(c.pesos), dudas: [`Con ${pesos(c.pesos)} entran ${n}: revisalo.`], seguro: false };
    }
    case "kg":
      return { cantidad: null, unidad, aAjustar: false, pidio: textoDeCantidad(redondearKg(c.kg), "kg"), dudas: [`${nombre} se vende por unidad: pidió ${textoDeCantidad(redondearKg(c.kg), "kg")}, poné cuántos.`], seguro: false };
    case "paquetes":
      return { cantidad: c.n, unidad, aAjustar: false, pidio: null, dudas, seguro: Number.isInteger(c.n) };
    case "unidades":
    case "numero": {
      const n = c.n;
      if (!Number.isInteger(n)) return { cantidad: null, unidad, aAjustar: false, pidio: String(n).replace(".", ","), dudas: [`${nombre} se vende por unidad: poné cuántos.`], seguro: false };
      if (c.tipo === "numero" && n >= 5000 && pp.precio) {
        const u = Math.max(1, Math.floor(n / pp.precio));
        return { cantidad: u, unidad, aAjustar: false, pidio: pesos(n), dudas: [`Leí ${pesos(n)}: entran ${u}. Revisalo.`], seguro: false };
      }
      if (p > 1 && (mencion.plural || n >= p || c.tipo === "unidades")) {
        const paquetes = Math.ceil(n / p);
        if (n % p !== 0) dudas.push(`Pidió ${n}: van ${paquetes} paquete${paquetes === 1 ? "" : "s"} de ${p} (${paquetes * p}).`);
        return { cantidad: paquetes, unidad, aAjustar: false, pidio: `${n} ${mencion.primera}`, dudas, seguro: n % p === 0 };
      }
      if (p > 1) dudas.push(`¿${n} paquete${n === 1 ? "" : "s"} de ${p}?`);
      return { cantidad: n, unidad, aAjustar: false, pidio: null, dudas, seguro: p === 1 };
    }
  }
}

/** Palabras que, delante de un segundo corte, dicen cómo preparar el anterior («nalga EN milanesas»). */
const PREPARACION = new Set(["en", "para", "tipo", "cortado", "cortada", "cortados", "cortadas", "como"]);
const SOBRA = new Set([...RELLENO, "gracias", "graciass", "mil", "saludos", "besos", "beso", "abrazo", "slds", "bss", "listo", "dale", "ok", "okey", "si", "no", "todo", "esto", "eso", "nada", "mas", "un", "una"]);

/**
 * Lee el chat pegado y propone el pedido. PURA. Nada de esto se graba: es lo que la pantalla
 * muestra para confirmar renglón por renglón.
 */
export function interpretarPedidoDeWhatsApp(
  texto: string,
  catalogo: readonly ProductoDelCatalogo[],
  opciones: OpcionesDeLectura = {},
): PropuestaDePedido {
  const hoy = opciones.hoy && /^\d{4}-\d{2}-\d{2}$/.test(opciones.hoy) ? opciones.hoy : null;
  const limpio = limpiarEncabezados(String(texto ?? "").normalize("NFC").slice(0, 5000), opciones.negocio ?? null);
  const original = limpio.texto;
  let norm = normalizarTexto(original);
  // Si por alguna letra rara el largo cambió, se cita el texto normalizado (no se rompe).
  const cita = norm.length === original.length ? original : norm;

  const tel = leerTelefono(original);
  const nom = leerNombre(original, norm);
  const dir = leerDireccion(original);
  const fr = leerFranja(norm, hoy);
  const entrega = leerEntrega(norm);

  // Se tapan con saltos de línea (mismo largo) el teléfono, el nombre, la dirección y el horario:
  // ya se leyeron y sus números no son cantidades.
  const tapar = (ts: readonly Tramo[]) => {
    const a = norm.split("");
    for (const t of ts) for (let i = t.i; i < t.f && i < a.length; i++) a[i] = "\n";
    norm = a.join("");
  };
  tapar([...tel.tramos, ...nom.tramos, ...dir.tramos, ...fr.tramos]);

  const prep = preparar(catalogo);

  // Trozos: por renglón, coma, punto y coma, «+», punto final y « y » (salvo «y medio» de una
  // cantidad que todavía no tiene corte: «kilo y medio de vacío»).
  const cortes: Tramo[] = [];
  const sep = /\n|[;+!?]|(?<!\d),|,(?!\d)|(?<!\d)\.|\.(?!\d)|\s(?:y|e)\s/g;
  let desde = 0;
  for (let m = sep.exec(norm); m; m = sep.exec(norm)) {
    cortes.push({ i: desde, f: m.index });
    desde = m.index + m[0].length;
  }
  cortes.push({ i: desde, f: norm.length });

  type Trozo = { i: number; f: number; toks: Tok[] };
  const trozos: Trozo[] = [];
  for (const c of cortes) {
    const toks = tokens(norm.slice(c.i, c.f)).map((x) => ({ t: x.t, i: x.i + c.i, f: x.f + c.i }));
    if (toks.length === 0) continue;
    const prev = trozos[trozos.length - 1];
    const empiezaConMedio = toks[0].t === "medio" || toks[0].t === "media" || toks[0].t === "cuarto";
    if (prev && empiezaConMedio && menciones(prev.toks.filter((x) => !ARTICULOS.has(x.t)), prep).every((m) => m.candidatos.length === 0)) {
      // «kilo» + «y medio de vacío»: es una sola cantidad.
      prev.toks.push({ t: "y", i: toks[0].i, f: toks[0].i }, ...toks);
      prev.f = c.f;
      continue;
    }
    trozos.push({ i: c.i, f: c.f, toks });
  }

  const renglones: RenglonPropuesto[] = [];
  const sinReconocer: string[] = [];

  for (const trozo of trozos) {
    const palabras = trozo.toks.filter((x) => !ARTICULOS.has(x.t));
    const ms = menciones(palabras, prep);
    if (ms.length === 0) {
      // Sin corte reconocido: si hay una cantidad, es un pedido que no se entendió.
      const sinRelleno = trozo.toks.map((x) => x.t).filter((t) => !SOBRA.has(t));
      // «soy la vecina del 5», «piso 3»: un número al final no es un pedido.
      const ultimo = trozo.toks[trozo.toks.length - 1].t;
      if (sinRelleno.length > 0 && !/^\d/.test(ultimo) && leerCantidad(trozo.toks.map((x) => x.t)) !== null) {
        sinReconocer.push(cita.slice(trozo.toks[0].i, trozo.toks[trozo.toks.length - 1].f).trim());
      }
      continue;
    }
    for (let k = 0; k < ms.length; k++) {
      const m = ms[k];
      const iMen = palabras[m.desde].i;
      const fMen = palabras[m.hasta - 1].f;
      const iAntes = k === 0 ? trozo.i : palabras[ms[k - 1].hasta - 1].f;
      const fDespues = k + 1 < ms.length ? palabras[ms[k + 1].desde].i : trozo.f;
      const antes = trozo.toks.filter((x) => x.i >= iAntes && x.f <= iMen).map((x) => x.t);
      const despues = trozo.toks.filter((x) => x.i >= fMen && x.f <= fDespues).map((x) => x.t);

      // «1 kg de nalga EN milanesas»: el segundo corte es cómo preparar el primero.
      if (k > 0 && renglones.length > 0 && leerCantidad(antes) === null && antes.some((t) => PREPARACION.has(t))) {
        const anterior = renglones[renglones.length - 1];
        const extra = cita.slice(trozo.toks.find((x) => x.i >= iAntes && x.t !== "y")?.i ?? iMen, fMen).trim();
        // El detalle del anterior ya tenía el principio («cortada en»): se completa, no se repite.
        anterior.detalle = anterior.detalle && !normalizarTexto(extra).startsWith(normalizarTexto(anterior.detalle)) ? `${anterior.detalle} · ${extra}` : extra;
        continue;
      }
      if (m.candidatos.length === 0) {
        const fin = trozo.toks.filter((x) => x.f <= fDespues).pop()?.f ?? fMen;
        sinReconocer.push(cita.slice(trozo.toks.find((x) => x.i >= iAntes)?.i ?? iMen, fin).trim());
        continue;
      }

      let cantidad = leerCantidad(antes);
      let usadoDespues = false;
      if (!cantidad) {
        // «vacío 2 kg», «vacío x 2», «chorizos: 6»
        const sinPeso = despues.slice(0, despues.indexOf("de") >= 0 ? despues.indexOf("de") : despues.length);
        cantidad = leerCantidad(sinPeso);
        usadoDespues = cantidad !== null;
      }
      const porPieza = pesoPorPieza(despues);
      const contexto = trozo.toks.map((x) => x.t);
      const elegido = elegirProducto(m.candidatos, contexto) ?? m.candidatos[0];
      const primera = palabras[m.desde].t;
      const mencionTexto = palabras.slice(m.desde, m.hasta).map((x) => x.t);
      const plural = mencionTexto.some((w) => w.length > 3 && w.endsWith("s") && formas(w).length > 1);
      const r = resolver(cantidad, elegido, m.corte ?? corteDelDiccionario(elegido.clave), { primera, plural, conDe: !usadoDespues && antes[antes.length - 1] === "de" }, porPieza);

      // Lo que sobra después del corte (sin la cantidad ni el peso por pieza) es el detalle.
      let detalle: string | null = null;
      if (!usadoDespues && porPieza === null) {
        const resto = trozo.toks.filter((x) => x.i >= fMen && x.f <= fDespues && !SOBRA.has(x.t) && /[a-z]/.test(x.t));
        if (resto.length > 0 && !resto.every((x) => KG.has(x.t) || GR.has(x.t))) detalle = cita.slice(resto[0].i, resto[resto.length - 1].f).trim();
      }

      const alternativas = m.candidatos.filter((c) => c !== elegido).map((c) => ({ id: c.p.id, nombre: c.p.name }));
      const dudas = [...r.dudas];
      if (alternativas.length > 0) dudas.unshift(`¿Es ${elegido.p.name}? También puede ser ${alternativas.map((a) => a.nombre).join(" o ")}.`);
      else if (m.puntaje < 0.9) dudas.unshift(`Leí «${cita.slice(iMen, fMen)}» como ${elegido.p.name}: revisalo.`);

      // El renglón se cita desde la cantidad («2 kg de vacío»), sin el «dejame» de adelante.
      const iTexto = usadoDespues ? iMen : (trozo.toks.find((x) => x.i >= iAntes && x.f <= iMen && esComienzoDeCantidad(x.t))?.i ?? iMen);
      const fTexto = Math.max(fMen, ...trozo.toks.filter((x) => x.i >= fMen && x.f <= fDespues && (usadoDespues || porPieza !== null || detalle !== null)).map((x) => x.f));
      const totalEstimado = r.cantidad !== null && elegido.precio ? redondearAlCentavo(r.cantidad * elegido.precio) : null;
      renglones.push({
        id: `r${renglones.length + 1}`,
        texto: cita.slice(iTexto, fTexto).replace(/^[\s\-–•*]+/, "").trim(),
        productId: elegido.p.id,
        nombre: elegido.p.name,
        porPeso: elegido.porPeso,
        cantidad: r.cantidad,
        unidad: r.unidad,
        aAjustar: r.aAjustar,
        pidio: r.pidio,
        precio: elegido.precio,
        totalEstimado,
        alternativas,
        dudas,
        detalle,
        seguro: r.seguro && alternativas.length === 0 && m.puntaje >= 0.9,
      });
    }
  }

  const totalEstimado = redondearAlCentavo(renglones.reduce((s, r) => s + (r.totalEstimado ?? 0), 0));
  return {
    telefono: tel.telefono,
    nombre: nom.nombre ?? limpio.remitente,
    franja: fr.franja,
    entrega,
    direccion: dir.direccion,
    renglones,
    sinReconocer,
    totalEstimado,
  };
}

// ── Lo que usa la pantalla al confirmar ─────────────────────────────────────────────────────

/** El total estimado de un renglón ya corregido. */
export function totalDelRenglon(cantidad: number | null, precio: number | null): number | null {
  return cantidad !== null && cantidad > 0 && precio ? redondearAlCentavo(cantidad * precio) : null;
}

export interface FranjaParaElegir {
  id: string;
  /** «Hoy tarde» */
  texto: string;
  /** «17 a 20 h» */
  horas: string;
  dia: string;
  enDias: number;
  parte: ParteDelDia;
  /** HH:mm de comienzo: lo que va a `scheduledFor`. */
  desde: string;
}

/**
 * Las horas de cada parte del día: las de las franjas de retiro del negocio si las cargó
 * (Envíos → «L-S 11-13; L-S 17-19»), o 10 a 13 y 17 a 20 (PROVISIONAL A CONFIRMAR con Magra).
 */
export function horasDeLasPartes(franjasRetiro: readonly string[] = []): Record<ParteDelDia, { desde: string; hasta: string }> {
  const out: Record<ParteDelDia, { desde: string; hasta: string }> = {
    manana: { desde: "10:00", hasta: "13:00" },
    tarde: { desde: "17:00", hasta: "20:00" },
    noche: { desde: "20:00", hasta: "22:00" },
  };
  for (const f of franjasRetiro) {
    const m = /(\d{1,2})(?:[:.](\d{2}))?\s*(?:hs?\.?)?\s*(?:-|–|—|a)\s*(\d{1,2})(?:[:.](\d{2}))?/.exec(f);
    if (!m) continue;
    const [h1, m1, h2, m2] = [Number(m[1]), Number(m[2] ?? 0), Number(m[3]), Number(m[4] ?? 0)];
    if (h1 > 23 || h2 > 24 || h2 * 60 + m2 <= h1 * 60 + m1) continue;
    const parte: ParteDelDia = h1 < 14 ? "manana" : h1 < 20 ? "tarde" : "noche";
    out[parte] = { desde: hh(h1, m1), hasta: h2 === 24 ? "23:59" : hh(h2, m2) };
  }
  return out;
}

const horasLindas = (d: string, h: string) => `${Number(d.slice(0, 2))}${d.slice(3) !== "00" ? `:${d.slice(3)}` : ""} a ${Number(h.slice(0, 2))}${h.slice(3) !== "00" ? `:${h.slice(3)}` : ""} h`;

/**
 * Los chips de franja: Hoy mañana · Hoy tarde · Mañana mañana · Mañana tarde, más la del chat si
 * es otro día («Sábado tarde»). Las de hoy que ya terminaron (`ahoraHHmm`) no se ofrecen. PURA.
 */
export function franjasParaElegir(p: {
  hoy: string;
  ahoraHHmm?: string | null;
  franjasRetiro?: readonly string[];
  propuesta?: FranjaPropuesta | null;
}): FranjaParaElegir[] {
  const horas = horasDeLasPartes(p.franjasRetiro);
  const out: FranjaParaElegir[] = [];
  const poner = (enDias: number, parte: ParteDelDia) => {
    const h = horas[parte];
    if (enDias === 0 && p.ahoraHHmm && h.hasta <= p.ahoraHHmm) return;
    const id = `${enDias}-${parte}`;
    if (out.some((x) => x.id === id)) return;
    out.push({ id, texto: `${textoDelDia(p.hoy, enDias)} ${PARTE_LINDA[parte]}`, horas: horasLindas(h.desde, h.hasta), dia: sumarDias(p.hoy, enDias), enDias, parte, desde: h.desde });
  };
  for (const d of [0, 1]) for (const parte of ["manana", "tarde"] as const) poner(d, parte);
  const pr = p.propuesta;
  if (pr?.hora) {
    // Dijo una hora («a las 11»): su propio chip, que empieza a esa hora.
    const id = `${pr.enDias}-h${pr.hora}`;
    if (!(pr.enDias === 0 && p.ahoraHHmm && pr.hora <= p.ahoraHHmm)) {
      out.push({ id, texto: pr.texto, horas: `${Number(pr.hora.slice(0, 2))}${pr.hora.slice(3) !== "00" ? `:${pr.hora.slice(3)}` : ""} h`, dia: pr.dia, enDias: pr.enDias, parte: pr.parte ?? "tarde", desde: pr.hora });
    }
  } else if (pr && pr.parte) poner(pr.enDias, pr.parte);
  return out.sort((a, b) => a.enDias - b.enDias || a.desde.localeCompare(b.desde));
}

/** La franja del chip que corresponde a lo que dijo el chat, o null. */
export function franjaElegidaDeLaPropuesta(franjas: readonly FranjaParaElegir[], propuesta: FranjaPropuesta | null): FranjaParaElegir | null {
  if (!propuesta) return null;
  if (propuesta.hora) return franjas.find((f) => f.id === `${propuesta.enDias}-h${propuesta.hora}`) ?? null;
  if (!propuesta.parte) return null;
  return franjas.find((f) => f.enDias === propuesta.enDias && f.parte === propuesta.parte) ?? null;
}

/** «2026-10-23T17:00», como lo lee `createOrder` (en la zona del negocio). */
export function horarioParaElFormulario(dia: string, desde: string): string {
  return `${dia}T${desde}`;
}

/** El renglón como lo lee la clienta: «2 kg de Vacío», «1 paquete de Chorizo de cerdo x6». */
function renglonParaElMensaje(r: { nombre: string; cantidad: number; unidad: "kg" | "u"; aAjustar: boolean; pidio?: string | null }): string {
  if (r.unidad === "u") return `${r.cantidad.toLocaleString("es-AR")} ${r.nombre}`;
  const kg = r.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 3 });
  if (r.aAjustar && r.pidio) return `${r.pidio} de ${r.nombre} (unos ${kg} kg)`;
  return `${kg} kg de ${r.nombre}`;
}

function enumerar(xs: readonly string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

/**
 * El WhatsApp de «te anotamos»: lo que se anotó, para cuándo, el total ESTIMADO y que se ajusta al
 * pesar. Criollo, de persona (ADR-046). Sale por el WhatsApp del que atiende (wa.me), 1 a 1.
 */
export function mensajeDeConfirmacion(p: {
  nombre: string | null;
  negocio: string;
  codigo: number | null;
  cuando: string | null;
  entrega: "retiro" | "envio";
  renglones: readonly { nombre: string; cantidad: number; unidad: "kg" | "u"; aAjustar: boolean; pidio?: string | null }[];
  total: number;
}): string {
  const hola = p.nombre ? `¡Hola ${p.nombre.split(" ")[0]}!` : "¡Hola!";
  const para = p.cuando ? ` para ${p.cuando.charAt(0).toLocaleLowerCase("es-AR")}${p.cuando.slice(1)}` : "";
  const como = p.entrega === "envio" ? " (te lo llevamos)" : " (para retirar en el local)";
  const lista = enumerar(p.renglones.map(renglonParaElMensaje));
  const algunoPesado = p.renglones.some((r) => r.unidad === "kg");
  const total = algunoPesado ? `Total estimado ${pesos(p.total)}: lo ajustamos cuando lo pesamos.` : `Total ${pesos(p.total)}.`;
  const num = p.codigo !== null ? ` Tu pedido es el #${p.codigo}.` : "";
  return `${hola} Te anotamos${para}${como}: ${lista}. ${total}${num} ¡Gracias! — ${p.negocio}`;
}

/**
 * La nota del pedido: que vino por WhatsApp, la franja, lo que hay que ajustar al pesar y lo que
 * pidió aparte. Hasta 500 letras (lo que guarda el alta).
 */
export function notaDelPedidoDeWhatsApp(p: {
  franja: string | null;
  renglones: readonly { nombre: string; aAjustar: boolean; pidio?: string | null; detalle?: string | null }[];
  extra?: string | null;
}): string {
  const partes = ["Pedido por WhatsApp"];
  if (p.franja) partes.push(`Franja: ${p.franja}`);
  const ajustar = p.renglones.filter((r) => r.aAjustar).map((r) => `${r.nombre}${r.pidio ? ` (pidió ${r.pidio})` : ""}`);
  if (ajustar.length) partes.push(`A ajustar al pesar: ${ajustar.join(", ")}`);
  const detalles = p.renglones.filter((r) => r.detalle).map((r) => `${r.nombre}: ${r.detalle}`);
  if (detalles.length) partes.push(detalles.join(" · "));
  if (p.extra?.trim()) partes.push(p.extra.trim());
  return partes.join(" · ").slice(0, 500);
}

// ── El faltante de stock en un pedido a futuro ──────────────────────────────────────────────

/**
 * DECISIÓN DEL DUEÑO, PROVISIONAL A CONFIRMAR: en el mostrador boutique, un pedido para OTRO día
 * con un corte por kilo sin stock suficiente AVISA y se anota igual (el viernes se envasa lo del
 * sábado). Hoy, sin esto, el pedido del backoffice se bloquea (`pos-stock-rules.ts`, contexto
 * ONLINE). En `false`, vuelve a bloquear como siempre en la pantalla y en el servidor.
 */
export const FALTANTE_A_FUTURO_AVISA = true;

/**
 * ¿El faltante de un pedido A FUTURO puede quedar en negativo? Sólo si: la regla está prendida
 * (`FALTANTE_A_FUTURO_AVISA`) y el negocio tiene el mostrador boutique (`prendido`), el pedido es
 * para un día POSTERIOR a hoy, y el producto se vende por peso. Lo que se vende por unidad se
 * cuenta: si dice cero es cero. PURA: la usa `createOrder` con la unidad leída de la base.
 */
export function productosQuePuedenFaltarAFuturo(
  productos: readonly { id: string; saleUnit: string }[],
  p: { channel: string; dia: string | null; hoy: string; prendido: boolean },
): string[] {
  if (!FALTANTE_A_FUTURO_AVISA || !p.prendido || p.channel !== "ONLINE" || !p.dia || !(p.dia > p.hoy)) return [];
  return productos.filter((x) => x.saleUnit === "WEIGHT").map((x) => x.id);
}

/** Lo que dice el renglón frente al stock: nada, un aviso que deja seguir, o un freno. PURA. */
export function faltanteDelRenglon(p: {
  stock: { stock: number; trackStock: boolean } | undefined;
  cantidad: number | null;
  porPeso: boolean;
  nombre: string;
  aFuturo: boolean;
  prendido: boolean;
}): null | { bloquea: boolean; texto: string } {
  if (!p.stock || !p.stock.trackStock || p.cantidad === null || !(p.cantidad > 0)) return null;
  if (p.stock.stock >= p.cantidad) return null;
  const queda = Math.max(0, p.stock.stock);
  const quedaTexto = p.porPeso ? textoDeCantidad(redondearKg(queda), "kg") : `${queda.toLocaleString("es-AR")} u`;
  const avisa = FALTANTE_A_FUTURO_AVISA && p.prendido && p.aFuturo && p.porPeso;
  if (avisa) return { bloquea: false, texto: `Hoy quedan ${quedaTexto} de ${p.nombre}. Como es para otro día, se anota igual: acordate de envasar.` };
  return {
    bloquea: true,
    texto: p.porPeso && !p.aFuturo
      ? `Quedan ${quedaTexto} de ${p.nombre}: no alcanza para hoy. Bajá la cantidad o pasalo para otro día.`
      : `Quedan ${quedaTexto} de ${p.nombre}: no alcanza. Bajá la cantidad.`,
  };
}
