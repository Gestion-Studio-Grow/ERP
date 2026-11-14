// ============================================================================
// EQUIPO DE AGENTES · filtro de lo que redacta el modelo (03 §2, §13). PURO.
// ============================================================================
// Saca del texto del modelo lo que nunca tiene que inventar ni repetir: enlaces, CBU/CVU (22 dígitos,
// con o sin separadores), alias bancarios, mails y teléfonos. Deja pasar los importes normales
// ("$ 1.234.567,89"). La forma exacta de un alias no se leyó en la norma del BCRA (05 S16): se frena
// por palabra ("alias") y por forma (palabras unidas por puntos).

export type Quitado = "enlace" | "cbu" | "alias" | "mail" | "telefono";

export interface TextoFiltrado {
  texto: string;
  quitados: Quitado[];
}

const REEMPLAZO = "[dato quitado]";

const MAIL = /[\p{L}0-9._%+-]+@[\p{L}0-9.-]+\.[\p{L}]{2,}/gu;
const ENLACE = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
// Un dominio suelto ("pagos.ejemplo.com.ar", "bit.ly/x"): palabra.tld con un tld conocido.
const DOMINIO = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|ar|io|ly|me|app|info|biz|co)(?:\.[a-z]{2})?(?:\/[^\s]*)?\b/gi;
// 22 dígitos con separadores opcionales (espacio, guion, punto) entre grupos.
const CBU = /(?<!\d)(?:\d[\s.-]?){21}\d(?!\d)/g;
// "alias: casa.perro.azul" o "alias casa.perro.azul" o "alias CASAPERRO".
const ALIAS_CON_PALABRA = /\balias\b\s*(?:es|:)?\s*[A-Za-z0-9.-]{6,20}\b/gi;
// Forma de alias: 3 o más palabras unidas por puntos, sin ser un número.
const ALIAS_FORMA = /\b(?=[A-Za-z0-9.-]{6,20}\b)(?=[^\s]*[A-Za-z])[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+){2,}\b/g;
// Teléfono: +54 opcional, 8 a 13 dígitos agrupados con espacio o guion (los importes usan puntos).
const TELEFONO = /(?<![\d$.,])(?:\+?54[\s-]?)?(?:9[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]\d{4}(?![\d,])/g;

function quitar(texto: string, re: RegExp, tipo: Quitado, quitados: Set<Quitado>): string {
  return texto.replace(re, () => {
    quitados.add(tipo);
    return REEMPLAZO;
  });
}

export function filtrarTexto(entrada: string): TextoFiltrado {
  const quitados = new Set<Quitado>();
  let t = entrada;
  // Orden: mail antes que dominio y alias (un mail contiene puntos); enlace antes que dominio.
  t = quitar(t, MAIL, "mail", quitados);
  t = quitar(t, ENLACE, "enlace", quitados);
  t = quitar(t, CBU, "cbu", quitados);
  t = quitar(t, ALIAS_CON_PALABRA, "alias", quitados);
  t = quitar(t, DOMINIO, "enlace", quitados);
  t = quitar(t, ALIAS_FORMA, "alias", quitados);
  t = quitar(t, TELEFONO, "telefono", quitados);
  return { texto: t, quitados: [...quitados] };
}

/**
 * Lo que va al modelo como datos, nunca como texto libre: un bloque delimitado que el modelo no
 * puede «cerrar» desde adentro (se neutraliza cualquier etiqueta <datos> que venga en los datos:
 * un nombre de cliente o un concepto de cuota con instrucciones no sale del bloque, 03 §13).
 */
export function bloqueDeDatos(id: string, contenido: string): string {
  const limpio = contenido.replace(/<\/?\s*datos[^>]*>/gi, "[etiqueta quitada]");
  return `<datos id="${id.replace(/[^A-Za-z0-9_-]/g, "")}">\n${limpio}\n</datos>`;
}
