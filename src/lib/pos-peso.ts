// ============================================================================
// LEER LA CANTIDAD QUE SE TIPEA EN EL MOSTRADOR — peso en kilos o unidades.
// ============================================================================
//
// QUÉ PASABA Y POR QUÉ SE REGALABA LA MERCADERÍA. El campo de cantidad del POS era un
// `<input type="number" step="0.01">` leído con `Number(e.target.value)`. En Argentina el
// decimal se escribe con COMA, y un `type="number"` NO acepta la coma: por el algoritmo de
// saneamiento de valor de HTML, `.value` devuelve la cadena VACÍA cuando lo tipeado no es un
// número de punto flotante válido.
//
// MEDIDO con Chromium, en locale es-AR y en en-US, tecla por tecla (los dos dan lo mismo):
//
//     tipeado    .value      Number(.value)   validity.valid
//     "1,3"      ""          0                true   ← el kilo trescientos se volvió CERO
//     "1,234"    ""          0                true   ← y el paquete al vacío también
//     "1.3"      "1.3"       1.3              true
//
// O sea: el vacío de 1,3 kg a $18.900/kg no se cobraba de más, **se cobraba $0**. La línea
// entraba con cantidad cero, el total no la sumaba, el botón "Cobrar" quedaba habilitado y
// el stock ni se movía. Se entregaba la carne y no se cobraba nada, sin una sola validación
// en contra. `validity.valid` devuelve `true`, así que ni el navegador protesta.
//
// (Una versión anterior de este comentario decía que se cobraba diez veces de más, $245.700
// en vez de $24.570. Era falso: `Number("1,3")` es `NaN`, no `13`, y el input nunca deja
// llegar la coma. Se midió porque este árbol ya pagó caro las afirmaciones que se repiten
// hasta que dejan de parecer afirmaciones.)
//
// Y el `step="0.01"` agrega lo suyo: RECHAZA `1,234` incluso escrito con punto — el peso
// típico de un paquete al vacío, que se pesa al gramo.
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
