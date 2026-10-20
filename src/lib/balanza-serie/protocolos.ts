// ============================================================================
// LA BALANZA POR CABLE — qué manda una balanza por el puerto serie y cómo se lee el peso.
// ============================================================================
//
// QUÉ ES. Las balanzas de mostrador SIN etiqueta (las que sólo pesan) suelen tener una salida
// serie: un cable RS-232 (con adaptador USB-serie) o un USB que en la computadora aparece como
// puerto serie. Por ahí la balanza manda el peso, todo el tiempo («continuo») o cuando se lo piden
// («a pedido»). Chrome y Edge de computadora leen ese puerto con Web Serial
// (usar-balanza-serie.ts); acá sólo se entiende lo que llega.
//
// De dónde sale cada formato: docs/producto/balanzas-relevamiento.md (§4). Ninguna trama de acá
// salió todavía de una balanza real enchufada; lo que no tiene un manual del fabricante detrás
// está marcado «sin confirmar con un manual».
//
// CUATRO FAMILIAS de lo que manda una balanza (`ProtocoloSerie`):
//   · "ascii": una línea de texto con un número y su unidad, repetida sin parar
//     («   1.250 kg», «W:+001.250kg», «+0001.250kg»), con o sin STX/ETX de envoltorio. También
//     el «Prt2» de las Toledo Prix (STX + 6 caracteres + CR, sin unidad).
//   · "cas": el formato continuo de 22 bytes de las CAS: «ST,GS,0 00001.25kg». La primera
//     palabra dice si el peso está quieto (ST), moviéndose (US) o pasado del máximo (OL); la
//     segunda, bruto (GS) o neto (NT).
//   · "toledo": el continuo de Toledo/Mettler (8142, 9091, P03): STX, tres palabras de estado
//     (A, B, C), seis dígitos de peso, seis de tara, CR y, si está activado, un byte de control.
//   · "a-pedido": la balanza calla hasta que le mandan un comando y contesta con el peso.
//     Systel (ENQ → STX « 1.250» ETX + XOR), Toledo Prix Prt1/Prt3 (ENQ → STX «01250» ETX, o
//     «IIIII» moviéndose, «NNNNN» negativo, «SSSSS» sobrecarga), Toledo 8217 (W → STX «01.250»
//     CR) y las parecidas. Cada una con su detalle: este lector es tolerante.
//
// LO QUE SE DEVUELVE (`LecturaSerie`): el peso SIEMPRE en kilos (aunque la balanza mande gramos
// o libras), si está quieto, la unidad que mandó la balanza y la trama cruda (para el
// diagnóstico). `bandera` dice si la balanza informa ella misma si el peso está quieto: si no lo
// informa, «quieto» es una suposición y quien toma el peso exige varias lecturas iguales
// seguidas (detector.ts → `estableParaTomar`).
//
// LOS BYTES COMO TEXTO: cada byte que llega es un carácter (código 0–255, «latin1»). Así se
// buscan los STX/ETX/CR con expresiones regulares y el crudo se puede mostrar tal cual.
//
// PURO: sin navegador, sin React. Lo usan el hook (navegador), el detector y los tests.

export type UnidadSerie = "kg" | "g" | "lb";
export type ProtocoloSerie = "ascii" | "cas" | "toledo" | "a-pedido";

export type LecturaSerie = {
  /** Siempre en kilos. */
  peso: number;
  estable: boolean;
  /** La unidad que mandó la balanza (el peso ya viene pasado a kilos). */
  unidad: UnidadSerie;
  /** La trama tal como llegó (sin el separador de fin). */
  crudo: string;
  /** ¿La balanza informa si el peso está quieto? Si no, `estable` es una suposición. */
  bandera: boolean;
  cero?: boolean;
  negativo?: boolean;
  sobrecarga?: boolean;
};

export const STX = "\u0002";
export const ETX = "\u0003";
export const ENQ = "\u0005";
export const CR = "\r";

/** Los comandos que se prueban con las balanzas «a pedido», en este orden. */
export type ComandoSerie = "ENQ" | "W" | "P" | "$";
export const COMANDOS_SERIE: readonly ComandoSerie[] = ["ENQ", "W", "P", "$"];

/**
 * Lo que se manda por el cable para cada comando:
 *   · ENQ (0x05): Systel, Toledo Prix Prt1/Prt3.
 *   · «W» sola, SIN CR: Toledo 8217 y CAS PD-II (la PD-II manda el peso hasta recibir un CR:
 *     con el CR pegado cortaría enseguida).
 *   · «P» + CR LF: Adam (sin confirmar con un manual: sale de una implementación abierta).
 *   · «$» sola: sin confirmar con un manual (lo piden algunos indicadores genéricos).
 */
export function bytesDelComando(c: ComandoSerie): Uint8Array {
  const texto = c === "ENQ" ? ENQ : c === "P" ? "P\r\n" : c;
  return Uint8Array.from(texto, (ch) => ch.charCodeAt(0));
}

const LIBRA_EN_KG = 0.45359237;
/** Más chico que esto (medio gramo) es cero. */
const CASI_CERO = 0.0005;
/** Lo que se guarda de un pedazo de trama que todavía no terminó. Más, es basura. */
const MAX_RESTO = 256;

/** Los bytes como texto, un carácter por byte (ver «LOS BYTES COMO TEXTO» arriba). */
export function bytesATexto(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

/** El crudo legible: lo imprimible tal cual y los caracteres de control como ‹STX›, ‹CR›… */
export function crudoLegible(texto: string): string {
  const nombres: Record<number, string> = { 2: "STX", 3: "ETX", 4: "EOT", 5: "ENQ", 6: "ACK", 10: "LF", 13: "CR", 21: "NAK" };
  let s = "";
  for (const ch of texto) {
    const c = ch.charCodeAt(0);
    if (c >= 0x20 && c < 0x7f) s += ch;
    else s += `‹${nombres[c] ?? c.toString(16).toUpperCase().padStart(2, "0")}›`;
  }
  return s;
}

/** El crudo en hexadecimal, byte por byte («02 20 31 2E …»). */
export function crudoHex(texto: string): string {
  return Array.from(texto, (ch) => ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

function aKilos(valor: number, unidad: UnidadSerie): number {
  const kg = unidad === "g" ? valor / 1000 : unidad === "lb" ? valor * LIBRA_EN_KG : valor;
  // Al gramo (y sin el -0 de JavaScript).
  return Math.round(kg * 1000) / 1000 + 0;
}

function unidadDe(texto: string | undefined): UnidadSerie | null {
  const u = (texto ?? "").toLowerCase();
  if (u === "kg") return "kg";
  if (u === "g" || u === "gr") return "g";
  if (u === "lb" || u === "lbs") return "lb";
  return null;
}

type Base = { valor: number; unidad: UnidadSerie; negativo: boolean; estable: boolean; bandera: boolean; crudo: string };

function armar(b: Base): LecturaSerie {
  const kg = aKilos(b.valor, b.unidad);
  const peso = b.negativo && kg !== 0 ? -kg : kg;
  const l: LecturaSerie = { peso, estable: b.estable, unidad: b.unidad, crudo: b.crudo, bandera: b.bandera };
  if (Math.abs(peso) < CASI_CERO) l.cero = true;
  else if (peso < 0) l.negativo = true;
  return l;
}

/** Pasado del máximo: sin peso. */
function sobrecarga(unidad: UnidadSerie, crudo: string): LecturaSerie {
  return { peso: 0, estable: false, unidad, crudo, bandera: true, sobrecarga: true };
}

/** Negativo sin el número (Toledo Prix «NNNNN»). */
function negativoSinPeso(crudo: string): LecturaSerie {
  return { peso: 0, estable: false, unidad: "kg", crudo, bandera: true, negativo: true };
}

/** «1.250», «1,250», «0001.250» → número; null si no es. */
function numeroDe(texto: string): number | null {
  const limpio = texto.replace(/\s+/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/** Los caracteres de control y los bytes de 8 bits, como espacios (para buscar el número). */
function soloTexto(trama: string): string {
  return trama.replace(/[\u0000-\u001f\u007f-ÿ]/g, " ");
}

/** Desde el ÚLTIMO STX (lo de antes es el byte de control de la respuesta anterior o basura). */
function desdeElUltimoStx(trama: string): string {
  const i = trama.lastIndexOf(STX);
  return i > 0 ? trama.slice(i) : trama;
}

/**
 * La marca de quietud que algunas balanzas ponen alrededor del número (heurística, sin confirmar
 * con un manual): «ST»/«S» = quieto; «US», «M» (motion) o «?» = moviéndose. Sin marca, la balanza
 * no informa.
 */
function marcaDeQuietud(alrededor: string): { estable: boolean; bandera: boolean } {
  const t = alrededor.toUpperCase();
  const inestable = /\bUS\b|\bM\b|\?/.test(t);
  const estable = /\bST\b|\bS\b/.test(t);
  return { estable: !inestable, bandera: inestable || estable };
}

/**
 * Un número SIN unidad entre STX y el fin (Toledo Prt2, Prt1/Prt3, 8217, Systel). Con punto o coma,
 * kilos; entero de 4 o más dígitos, gramos (las Prix mandan «01250» = 1,250 kg con 3 decimales;
 * sin confirmar con un manual para balanzas de más de 30 kg, que usan menos decimales).
 */
function numeroSuelto(trama: string): LecturaSerie | null {
  const texto = soloTexto(trama);
  const m = /([+-])?\s*(\d+(?:[.,]\d+)?)/.exec(texto);
  if (!m) return null;
  const decimal = /[.,]/.test(m[2]);
  if (!decimal && m[2].length < 4) return null;
  const valor = numeroDe(m[2]);
  if (valor === null) return null;
  // Systel, segunda variante (sin confirmar con un manual): «e» quieto / «i» moviéndose pegado al peso.
  const despues = texto.slice(m.index + m[0].length);
  const ei = /^\s*([ei])\b/.exec(despues);
  const marca = ei ? { estable: ei[1] === "e", bandera: true } : marcaDeQuietud(texto.slice(0, m.index) + " " + despues);
  return armar({ valor, unidad: decimal ? "kg" : "g", negativo: m[1] === "-", ...marca, crudo: trama });
}

// ----------------------------------------------------------------------------
// (a) ASCII continuo genérico
// ----------------------------------------------------------------------------

// Un número con signo opcional y una unidad pegada o separada. El signo puede venir separado del
// número por espacios de relleno («-   0.120 kg»).
const NUMERO_CON_UNIDAD = /([+-])?\s*(\d+(?:[.,]\d+)?|[.,]\d+)\s*(kg|lbs|lb|gr|g)(?![a-z])/i;
// Sobrecarga: «OL», «OVER», «O-L», «-OL-» o una fila de circunflejos en vez del número.
const SOBRECARGA_ASCII = /(^|[^a-z])(OL|OVER|O-L|OVERLOAD)([^a-z]|$)|\^{3,}/i;

/**
 * Una línea de texto con un número y su unidad (sin confirmar con un manual: es lo que hacen
 * muchos indicadores genéricos). Sin unidad, sólo si viene entre STX y el fin (Toledo Prt2).
 */
export function parsearAscii(trama: string): LecturaSerie | null {
  const texto = soloTexto(trama);
  if (SOBRECARGA_ASCII.test(texto)) {
    return sobrecarga(unidadDe(/(kg|lbs|lb|gr|g)(?![a-z])/i.exec(texto)?.[1]) ?? "kg", trama);
  }
  const m = NUMERO_CON_UNIDAD.exec(texto);
  if (!m) return trama.includes(STX) ? numeroSuelto(desdeElUltimoStx(trama)) : null;
  const valor = numeroDe(m[2]);
  const unidad = unidadDe(m[3]);
  if (valor === null || unidad === null) return null;
  const marca = marcaDeQuietud(texto.slice(0, m.index) + " " + texto.slice(m.index + m[0].length));
  return armar({ valor, unidad, negativo: m[1] === "-", ...marca, crudo: trama });
}

// ----------------------------------------------------------------------------
// (b) CAS continuo (22 bytes)
// ----------------------------------------------------------------------------
//
// Estado (ST/US/OL) , bruto-neto (GS/NT) , número de equipo, byte de lámparas, peso de 8
// caracteres con ceros a la izquierda y punto, unidad, CR LF: «ST,GS,0 00001.25kg». El orden
// exacto de los 22 bytes queda sin confirmar con una balanza real (relevamiento §4.6): por eso
// el peso se toma como el número PEGADO a la unidad, y lo que hay entre «GS,» y ese número
// (equipo, lámparas, una coma más) se ignora.

const ENCABEZADO_CAS = /(ST|US|OL)\s*,\s*(GS|NT|TR)\s*,/i;
const PESO_CAS = /([+-])?\s*(\d[\d.]*)\s*(kg|lbs|lb|gr|g)(?![a-z])/i;

export function parsearCas(trama: string): LecturaSerie | null {
  const texto = soloTexto(trama);
  const e = ENCABEZADO_CAS.exec(texto);
  if (!e) return null;
  const cola = texto.slice(e.index + e[0].length);
  const encabezado = e[1].toUpperCase();
  const p = PESO_CAS.exec(cola);
  const unidad = unidadDe(p?.[3] ?? /(kg|lbs|lb|gr|g)/i.exec(cola)?.[1]) ?? "kg";
  if (encabezado === "OL") return sobrecarga(unidad, trama);
  if (!p) return null;
  // `PESO_CAS` exige la unidad pegada (o tras espacios) al número: con «1 00001.25kg» el «1» del
  // equipo no sirve (después viene un dígito, no la unidad) y el número es «00001.25».
  const valor = numeroDe(p[2]);
  if (valor === null) return null;
  return armar({ valor, unidad, negativo: p[1] === "-", estable: encabezado === "ST", bandera: true, crudo: trama });
}

// ----------------------------------------------------------------------------
// (c) Toledo continuo (8142 / 9091 / P03)
// ----------------------------------------------------------------------------
//
// STX │ A │ B │ C │ peso (6 dígitos, sin coma) │ tara (6) │ CR │ [control]
//   · A, bits 0–2: dónde va la coma. 0 → ×100, 1 → ×10, 2 → ×1, 3 → 0,0, 4 → 0,00, 5 → 0,000,
//     6 → 0,0000, 7 → 0,00000. Bit 5 siempre 1.
//   · B, bit 1: negativo · bit 2: fuera de rango · bit 3: EN MOVIMIENTO. Bit 5 siempre 1.
//   · C: no hace falta para el peso.
//   · control (si está activado): complemento a dos de los 7 bits bajos de la suma de todo lo
//     anterior, STX y CR incluidos. Si viene, se verifica; si no viene, se acepta igual.
// La trama, la coma y el control: manual IND429 de Mettler Toledo (relevamiento §4.1). Los bits de
// B (negativo, fuera de rango, movimiento) los corrobora una implementación abierta; el bit 4 de
// B (kilos o libras) queda sin confirmar con un manual: se toma SIEMPRE kilos (en el mostrador
// argentino no se pesa en libras, y leer libras por error cobraría menos de la mitad).
// Los ceros a la izquierda pueden venir como espacios.

export const LARGO_TOLEDO = 16; // STX + 3 de estado + 6 + 6 (sin el CR)

export function parsearToledo(trama: string): LecturaSerie | null {
  const i = trama.indexOf(STX);
  if (i < 0) return null;
  const t = trama.slice(i, i + LARGO_TOLEDO);
  if (t.length < LARGO_TOLEDO) return null;
  const a = t.charCodeAt(1);
  const b = t.charCodeAt(2);
  const c = t.charCodeAt(3);
  // El bit 5 de las tres palabras de estado está siempre prendido (y el 7, la paridad, apagado
  // cuando el puerto se abre con 7 bits).
  if ([a, b, c].some((x) => (x & 0x20) === 0 || x > 0x7f)) return null;
  const digitosPeso = t.slice(4, 10);
  const digitosTara = t.slice(10, 16);
  if (!/^[ \d]{6}$/.test(digitosPeso) || !/^[ \d]{6}$/.test(digitosTara)) return null;
  const crudo = Number(digitosPeso.replace(/ /g, "0"));
  const valor = crudo * 10 ** (2 - (a & 0b111));
  const negativo = (b & 0b10) !== 0;
  const fueraDeRango = (b & 0b100) !== 0;
  const enMovimiento = (b & 0b1000) !== 0;
  // Fuera de rango con signo negativo es «por debajo de cero», no sobrecarga.
  if (fueraDeRango && !negativo) return sobrecarga("kg", trama);
  return armar({ valor, unidad: "kg", negativo, estable: !enMovimiento && !fueraDeRango, bandera: true, crudo: trama });
}

/** ¿El byte de control de una trama Toledo (STX…CR) da bien? */
export function controlToledoValido(tramaConCr: string, control: string): boolean {
  let suma = 0;
  for (const ch of tramaConCr) suma += ch.charCodeAt(0) & 0x7f;
  return ((suma + control.charCodeAt(0)) & 0x7f) === 0;
}

// ----------------------------------------------------------------------------
// (d) A pedido
// ----------------------------------------------------------------------------
//
// Se lee desde el ÚLTIMO STX (lo de antes puede ser el XOR de Systel de la respuesta anterior,
// que no se exige: no está claro sobre qué bytes se calcula, relevamiento §4.4).
//   · Toledo Prix Prt1/Prt3: «IIIII» moviéndose, «NNNNN» negativo, «SSSSS» sobrecarga.
//   · número con unidad → como el ASCII;
//   · número sin unidad → `numeroSuelto` (con coma: kilos; entero de 4+ dígitos: gramos);
//   · Systel avisa «moviéndose» con UN byte de error en vez de la trama (el valor no está
//     documentado): no da lectura; el hook deja de considerar quieto el peso cuando las
//     respuestas dejan de llegar.

export function parsearAPedido(trama: string): LecturaSerie | null {
  const t = desdeElUltimoStx(trama);
  const letras = soloTexto(t).trim();
  if (/^I{5,6}$/.test(letras)) return { peso: 0, estable: false, unidad: "kg", crudo: trama, bandera: true };
  if (/^N{5,6}$/.test(letras)) return negativoSinPeso(trama);
  if (/^S{5,6}$/.test(letras)) return sobrecarga("kg", trama);
  const conUnidad = NUMERO_CON_UNIDAD.test(soloTexto(t)) ? parsearAscii(t) : null;
  if (conUnidad) return { ...conUnidad, crudo: trama };
  const suelto = numeroSuelto(t);
  return suelto ? { ...suelto, crudo: trama } : null;
}

// ----------------------------------------------------------------------------
// De bytes sueltos a lecturas
// ----------------------------------------------------------------------------

export function parsearTrama(protocolo: ProtocoloSerie, trama: string): LecturaSerie | null {
  switch (protocolo) {
    case "ascii":
      return parsearAscii(trama);
    case "cas":
      return parsearCas(trama);
    case "toledo":
      return parsearToledo(trama);
    case "a-pedido":
      return parsearAPedido(trama);
  }
}

export type ResultadoDeTramas = {
  lecturas: LecturaSerie[];
  /** El pedazo del final que todavía no terminó: se le suma lo próximo que llegue. */
  resto: string;
  /** Tramas completas que no se pudieron leer (basura, velocidad equivocada). */
  descartadas: number;
  /** Cuántos caracteres terminaron en una lectura buena (para puntuar). */
  aprovechados: number;
};

/**
 * Corta lo que llegó en tramas y las lee. El serie llega en pedazos de cualquier largo: lo que no
 * terminó queda en `resto` para la próxima vez. Toledo se corta por su largo fijo después del STX;
 * las demás, en CR, LF o ETX (y, a pedido, también después de la «e»/«i» de Systel).
 */
export function leerTramas(protocolo: ProtocoloSerie, recibido: string): ResultadoDeTramas {
  return protocolo === "toledo" ? leerTramasToledo(recibido) : leerTramasDeLinea(protocolo, recibido);
}

function recortarResto(resto: string): string {
  return resto.length > MAX_RESTO ? resto.slice(-MAX_RESTO) : resto;
}

function leerTramasDeLinea(protocolo: ProtocoloSerie, recibido: string): ResultadoDeTramas {
  const corte = protocolo === "a-pedido" ? /[\r\n\u0003]|(?<=\d\s?[ei])/ : /[\r\n\u0003]/;
  const partes = recibido.split(corte);
  const resto = partes.pop() ?? "";
  const lecturas: LecturaSerie[] = [];
  let descartadas = 0;
  let aprovechados = 0;
  for (const p of partes) {
    if (soloTexto(p).trim() === "") continue;
    const l = parsearTrama(protocolo, p);
    if (l) {
      lecturas.push(l);
      aprovechados += p.length + 1;
    } else descartadas++;
  }
  return { lecturas, resto: recortarResto(resto), descartadas, aprovechados };
}

function leerTramasToledo(recibido: string): ResultadoDeTramas {
  const lecturas: LecturaSerie[] = [];
  let descartadas = 0;
  let aprovechados = 0;
  let i = 0;
  for (;;) {
    const inicio = recibido.indexOf(STX, i);
    if (inicio < 0) {
      i = recibido.length;
      break;
    }
    // Falta la trama entera más el CR: se espera lo que sigue.
    if (recibido.length < inicio + LARGO_TOLEDO + 1) {
      i = inicio;
      break;
    }
    const trama = recibido.slice(inicio, inicio + LARGO_TOLEDO);
    if (recibido[inicio + LARGO_TOLEDO] !== CR) {
      // Una trama cortada o un STX que era basura: se busca el próximo.
      descartadas++;
      i = inicio + 1;
      continue;
    }
    let fin = inicio + LARGO_TOLEDO + 1;
    const siguiente = recibido[fin];
    let valida = true;
    if (siguiente !== undefined && siguiente !== STX && siguiente !== "\n") {
      // Hay un byte de control: si da bien, es parte de la trama; si da mal, la trama no vale.
      if (controlToledoValido(trama + CR, siguiente)) fin++;
      else valida = false;
    }
    const l = valida ? parsearToledo(trama) : null;
    if (l) {
      lecturas.push(l);
      aprovechados += fin - inicio;
    } else descartadas++;
    i = l ? fin : inicio + 1;
  }
  return { lecturas, resto: recortarResto(recibido.slice(i)), descartadas, aprovechados };
}
