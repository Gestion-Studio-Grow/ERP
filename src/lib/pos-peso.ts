// ============================================================================
// LEER LA CANTIDAD QUE SE TIPEA EN EL MOSTRADOR — peso en kilos o unidades.
// ============================================================================
//
// QUÉ PASABA. El campo de cantidad del POS era un `<input type="number" step="0.01">` leído
// con `Number(e.target.value)`. En Argentina el decimal se escribe con COMA, y un
// `type="number"` no la entiende. Lo que hace con ella depende de CÓMO llega al campo, y eso
// explica por qué este mismo comentario afirmó dos cosas distintas en dos versiones.
//
// MEDIDO el 2026-09-23 con Chromium 141.0.7390.37 (Playwright 1.61.1, /opt/pw-browsers),
// locale es-AR y en-US (los dos dan lo mismo), `<input type="number" step="0.001" min="0">`:
//
//     cómo llega "1,3"                     .value    validity.valid
//     tecleado (keyboard.type)             "13"      true    ← la coma se TRAGA
//     keyboard.insertText                  "13"      true
//     asignado por JS (`el.value = ...`)   ""        true    ← sanitización de HTML
//     page.fill                            —         Playwright se niega a escribir
//
// Tecleado, que es lo que hace una persona: "4,350" → "4350", "12,5" → "125", "1,234" →
// "1234". El navegador no protesta (`valid: true`), así que el formulario sale con el
// número multiplicado por diez, cien o mil según cuántos decimales tenía. La versión
// anterior de este comentario decía que `.value` quedaba vacío: eso es lo que da ASIGNAR el
// valor por JS, no tipearlo. No lo medí en Firefox, Safari ni con el teclado en pantalla de
// un teléfono (ahí ni siquiera sé si aparece la coma): lo único medido es lo de la tabla.
//
// Por eso el arreglo NO depende del navegador: el campo es `type="text"`, se lee con esta
// función, y el server vuelve a leer con la misma función.
//
// Y el `step` agrega lo suyo (misma medición): con `step="0.01"`, "6.543" tecleado queda
// con `stepMismatch` y el navegador frena el envío —tres decimales con punto, justo la forma
// del peso al gramo de un paquete al vacío—, mientras que "12.500" pasa como válido y
// `Number()` lo lee 12,5: doce mil quinientos pesos convertidos en doce con cincuenta.
//
// LA REGLA, Y POR QUÉ ES ESTA. Punto y coma valen lo MISMO como separador decimal. El que
// atiende no sabe (ni tiene por qué saber) qué espera el navegador: escribe `1,3` desde el
// teclado de la balanza y `1.3` desde el pad numérico del celular, y las dos veces quiere
// decir un kilo trescientos.
//
//   · Si hay UN solo separador, es el decimal:            "1,3" y "1.3"   → 1.3
//     Incluso con tres dígitos detrás:                    "1,234" y "1.234" → 1.234 kg
//     ⚠️ Esto es una APUESTA deliberada y sólo vale para CANTIDADES: un paquete de 1,234 kg
//     existe todos los días; un pedido de mil doscientos treinta y cuatro kilos en una línea
//     de mostrador, no. Para un campo de PLATA la apuesta se invierte ($1.234 son mil
//     doscientos treinta y cuatro pesos) — por eso esta función se llama `parsearCantidad` y
//     no `parsearNumero`: NO la reuses para importes sin cambiarle el desempate.
//   · Si hay DOS separadores DISTINTOS, el ÚLTIMO es el decimal: "1.234,5" → 1234.5
//   · Si hay DOS O MÁS separadores IGUALES, todos son de miles:  "1.234.567" → 1234567
//   · Precisión: GRAMOS (3 decimales). La balanza no da más y el ledger de stock redondea
//     igual (`round3` en stock/ledger.ts). Lo que sobra se redondea, no se rechaza: frenar
//     la venta por un cuarto decimal es una cola más larga, no más exactitud.
//   · Negativo: no existe. Vender −1 kg no es un caso de negocio, es un error de tipeo.
//
// Sin DB, sin React, sin Prisma: se importa igual desde el cliente (el POS) y desde la
// Server Action (que NO confía en lo que mandó el navegador y vuelve a parsear).

import { leerImporte } from "./dinero/leer";
import { redondearAlCentavo } from "./dinero/redondeo";

/** Decimales que se conservan: gramos. Más que esto es ruido de la balanza. */
export const DECIMALES_CANTIDAD = 3;

/**
 * Resultado de leer lo que hay tipeado en el campo.
 *
 * `vacio` e `invalida` son estados DISTINTOS a propósito: el campo recién abierto no es un
 * error (no se le grita a nadie por no haber empezado a escribir), pero "abc" o "-2" sí
 * tienen que verse en rojo antes de cobrar.
 */
export type LecturaCantidad =
  | { estado: "vacio" }
  | { estado: "invalida" }
  | { estado: "ok"; valor: number };

/** Redondeo a gramos. Espeja `round3` del ledger de stock: la misma cantidad, el mismo número. */
export function redondearCantidad(n: number): number {
  return Math.round(n * 10 ** DECIMALES_CANTIDAD) / 10 ** DECIMALES_CANTIDAD;
}

/**
 * Lee la cantidad tipeada. Devuelve el estado además del número para que la pantalla pueda
 * distinguir "todavía no escribió" de "escribió algo que no es una cantidad".
 */
export function leerCantidad(raw: string | null | undefined): LecturaCantidad {
  // Se limpian espacios (incluido el fino de miles, U+202F, que pega Excel al copiar) y el
  // "kg" que alguien arrastra desde la etiqueta de la balanza.
  const s = String(raw ?? "")
    .replace(/[\s  ]/g, "")
    .replace(/kgs?$/i, "")
    .trim();
  if (s === "") return { estado: "vacio" };
  // Sólo dígitos y separadores. El "-" cae acá: no hay venta de cantidad negativa, y dejarla
  // pasar como 0 escondería el error de tipeo en vez de mostrarlo.
  if (!/^[0-9.,]+$/.test(s)) return { estado: "invalida" };

  const ultimoPunto = s.lastIndexOf(".");
  const ultimaComa = s.lastIndexOf(",");
  const corte = Math.max(ultimoPunto, ultimaComa);

  // Sin separador: entero puro.
  if (corte === -1) {
    const n = Number(s);
    return Number.isFinite(n) ? { estado: "ok", valor: redondearCantidad(n) } : { estado: "invalida" };
  }

  const sep = s[corte];
  const cabeza = s.slice(0, corte);
  const cola = s.slice(corte + 1);

  // La parte ENTERA sólo puede ser dígitos sueltos ("1234") o grupos de miles bien formados
  // ("1.234", "12.345.678"). Sin esto, "1.3.4" —dos teclazos y un dedo torcido— se leía como
  // 13,4 kg en vez de rebotar: exactamente la clase de número que nadie revisa.
  const enteroBienFormado = (txt: string): boolean =>
    txt === "" || /^\d+$/.test(txt) || /^\d{1,3}([.,]\d{3})+$/.test(txt);

  // Separador colgando al final ("1," mientras todavía está escribiendo): vale el entero.
  // El campo no tiene que ponerse en rojo entre dos teclas.
  if (cola === "") {
    if (!enteroBienFormado(cabeza)) return { estado: "invalida" };
    const n = Number(cabeza.replace(/[.,]/g, ""));
    return Number.isFinite(n) ? { estado: "ok", valor: redondearCantidad(n) } : { estado: "invalida" };
  }
  if (!/^\d+$/.test(cola)) return { estado: "invalida" };

  // Dos o más separadores IGUALES ("1.234.567"): ninguno es decimal, todos son de miles.
  // Es el único caso donde tres dígitos al final NO son gramos.
  const esMiles = cabeza.includes(sep) && cola.length === 3 && /^\d{1,3}([.,]\d{3})*$/.test(cabeza);

  if (!esMiles && !enteroBienFormado(cabeza)) return { estado: "invalida" };

  const enteroTxt = (esMiles ? s : cabeza).replace(/[.,]/g, "");
  const decimalTxt = esMiles ? "" : cola;

  const n = Number(`${enteroTxt === "" ? "0" : enteroTxt}.${decimalTxt === "" ? "0" : decimalTxt}`);
  if (!Number.isFinite(n)) return { estado: "invalida" };
  return { estado: "ok", valor: redondearCantidad(n) };
}

/**
 * La cantidad como número, o 0 si no hay nada legible. Para el cálculo del total en pantalla,
 * donde "todavía no escribió" y "escribió cualquier cosa" valen lo mismo: no suma.
 */
export function cantidadOCero(raw: string | null | undefined): number {
  const l = leerCantidad(raw);
  return l.estado === "ok" ? l.valor : 0;
}

/**
 * La cantidad tal como tiene que viajar en el `<input type="hidden">` hacia la Server Action:
 * punto decimal, sin separador de miles. Es lo único que `Number()` lee bien del otro lado.
 */
export function cantidadParaFormulario(valor: number): string {
  return String(redondearCantidad(valor));
}

/**
 * Peso de una línea que, casi seguro, es un decimal mal tipeado.
 *
 * NO bloquea la venta: existe el mayorista que se lleva 40 kg y frenarlo sería inventar un
 * techo que el negocio no tiene. Avisa, que es lo que falta hoy — el caso real es la balanza
 * que dice 1,300 y la mano que teclea "1300": la venta se cobra $24 millones y nadie lo ve
 * hasta el arqueo. Un paquete al vacío pesa entre 0,2 y 5 kg; media res ronda los 100.
 */
/**
 * ¿El pedido lleva alguna línea POR PESO que se pueda ajustar? PURA. UN criterio para el texto
 * del botón (`textosDelAjuste`) y para el mensaje del resultado (`conPeso`, order-anulacion.ts):
 * una línea sin producto (precio a mano o envío) no se pesa ni se ajusta, así que no cuenta
 * aunque diga WEIGHT.
 */
export function hayLineaPorPeso(lineas: readonly { saleUnit: string; productId: string | null }[]): boolean {
  return lineas.some((l) => l.productId != null && l.saleUnit === "WEIGHT");
}

/**
 * Los textos de «ajustar un pedido» según lo que tiene. PURA.
 *
 * "Pesar y ajustar" es para el pedido que lleva algo POR PESO (se pesa al envasar). En una
 * tienda que vende sólo por unidad (Shine, A Dos Manos) el mismo botón corrige cantidades:
 * ofrecer "Pesar" ahí es pedir algo que no existe. El pedido con una sola línea por peso sigue
 * diciendo "Pesar y ajustar", como siempre.
 */
export function textosDelAjuste(lineas: readonly { saleUnit: string; productId: string | null }[]): {
  boton: string;
  titulo: string;
  guardar: string;
} {
  return hayLineaPorPeso(lineas)
    ? { boton: "Pesar y ajustar", titulo: "Peso real del pedido", guardar: "Guardar peso real" }
    : { boton: "Ajustar pedido", titulo: "Cantidades del pedido", guardar: "Guardar cantidades" };
}

export const KG_SOSPECHOSO = 30;

export function avisoDeCantidad(input: {
  valor: number;
  saleUnit: "UNIT" | "WEIGHT";
}): string | null {
  if (!(input.valor > 0)) return null;
  if (input.saleUnit !== "WEIGHT") return null;
  if (input.valor < KG_SOSPECHOSO) return null;
  return `¿Seguro ${formatearCantidad(input.valor)} kg? Si querías ${formatearCantidad(
    input.valor / 1000,
  )} kg, escribilo con coma.`;
}

/** La cantidad como la lee la persona: coma decimal, sin ceros de relleno. */
export function formatearCantidad(valor: number): string {
  return redondearCantidad(valor).toString().replace(".", ",");
}

// ============================================================================
// LEER UN IMPORTE — plata en pesos, NO cantidades.
// ============================================================================
//
// El lector vive en el módulo de plata (`src/lib/dinero/leer.ts`, ENG-109): el mismo para la
// pantalla y para las acciones de servidor. Acá se re-exporta para quienes ya lo importaban de
// este archivo. La regla (miles, centavos, tercer decimal que rebota) está documentada allá.
export { leerImporte, type LecturaImporte } from "./dinero/leer";

/** El importe como número, o 0 si no es legible. Sólo para totales en pantalla. */
export function importeOCero(raw: string | null | undefined): number {
  const l = leerImporte(raw);
  return l.estado === "ok" ? l.valor : 0;
}

/** El importe tal como viaja en un `<input type="hidden">`: punto decimal, sin miles. */
export function importeParaFormulario(valor: number): string {
  return String(redondearAlCentavo(valor));
}

// ============================================================================
// LO QUE LEE EL SERVER — la misma regla, pero lo ilegible se RECHAZA.
// ============================================================================
//
// En pantalla, lo ilegible se pinta de rojo y no deja enviar. Pero la Server Action no
// confía en la pantalla (un submit sin JS, un formulario viejo en caché, otro llamador): lee
// otra vez con la MISMA función. Lo que no puede pasar es lo que hacía el `parseNum` de
// antes —`Number(x.replace(",", "."))`—, que convertía "abc" en NaN y dejaba a cada
// llamador decidir qué hacer con eso: el recuento (`adjustment-insert.ts`) y la compra
// (`usableQty` en `purchase-core.ts`) descartaban la línea en silencio, y la persona veía
// "registrado" sin enterarse de que una línea no entró. Acá hay tres salidas y ninguna es
// un 0 inventado:
//
//   · vacío     → `null`: el llamador decide si el campo es opcional (costo) o no.
//   · ilegible  → lanza un Error con un mensaje que la persona entiende.
//   · legible   → el número.

const RECORTE_ECO = 24;

function ecoDe(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  return s.length > RECORTE_ECO ? `${s.slice(0, RECORTE_ECO - 1)}…` : s;
}

/** Cantidad del FormData. `null` si vino vacía; lanza si no es una cantidad. */
export function cantidadDelFormulario(raw: string | null | undefined, campo: string): number | null {
  const l = leerCantidad(raw);
  if (l.estado === "vacio") return null;
  if (l.estado === "invalida") {
    throw new Error(`${campo}: "${ecoDe(raw)}" no es una cantidad. Escribila con coma decimal (12,5).`);
  }
  return l.valor;
}

/** Importe del FormData. `null` si vino vacío; lanza si no es plata. */
export function importeDelFormulario(raw: string | null | undefined, campo: string): number | null {
  const l = leerImporte(raw);
  if (l.estado === "vacio") return null;
  if (l.estado === "invalida") {
    throw new Error(`${campo}: "${ecoDe(raw)}" no es un importe. Escribilo como $6.543 o $6.543,50.`);
  }
  return l.valor;
}
