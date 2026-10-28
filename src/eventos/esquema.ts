// ============================================================================
// Esquemas de `datos` de los eventos de dominio (P2 · catálogo v1) — mini-validador tipado
// ============================================================================
//
// Sin dependencias (no hay zod en el repo y no se suman sin preguntar). Cada esquema sabe
// VALIDAR un valor, INFERIR su tipo de TypeScript (así `emitirEvento` no compila con un `datos`
// que no cumple) y DESCRIBIRSE (para generar docs/integrations/eventos.md).
//
// Objetos ESTRICTOS: un campo que el catálogo no conoce es un error. Es la primera muralla de
// la regla de datos personales (§7.3): nadie «agrega el teléfono por las dudas» sin pasar por
// el catálogo, y el test de redacción revisa los nombres del catálogo.
//
// Dos tipos de texto con trato especial:
//   · `textoLibre`: lo escribe una persona (motivo de anulación, nombre de un renglón a mano,
//     motivo del rechazo de ARCA). Se REDACTA al emitir: emails y tiradas de 6+ dígitos
//     (teléfono, DNI, CUIT) quedan enmascarados (`redactarTextoLibre`).
//   · `enmascarado`: un dato personal YA enmascarado (`telefonoEnmascarado`). Sólo pasa si tiene
//     la forma de la máscara (`enmascararTelefono`): `******1234`.
// ============================================================================

import { redondearAlCentavo } from "@/lib/dinero/redondeo";

export type Ruta = string;

export interface Esquema<T> {
  readonly clase: string;
  /** Agrega a `errores` lo que no cumple. */
  validar(valor: unknown, ruta: Ruta, errores: string[]): void;
  /** Devuelve el valor con los textos libres redactados (se llama después de validar). */
  redactar(valor: T): T;
  /** Una línea legible para la documentación. */
  describir(): string;
  /** Marca de tipo (no existe en tiempo de ejecución). */
  readonly __tipo?: T;
}

export interface EsquemaOpcional<T> extends Esquema<T | undefined> {
  readonly opcional: true;
}

export type TipoDe<E> = E extends Esquema<infer T> ? T : never;

type ClavesOpcionales<S> = { [K in keyof S]: S[K] extends EsquemaOpcional<unknown> ? K : never }[keyof S];
type Aplanar<T> = { [K in keyof T]: T[K] } & {};
export type InferirObjeto<S extends Record<string, Esquema<unknown>>> = Aplanar<
  { [K in Exclude<keyof S, ClavesOpcionales<S>>]: TipoDe<S[K]> } & {
    [K in ClavesOpcionales<S>]?: Exclude<TipoDe<S[K]>, undefined>;
  }
>;

// ── Redacción de texto libre ──────────────────────────────────────────────────

/**
 * Un texto con un sustituto suelto (la mitad de un emoji: lo deja un copiar/pegar cortado o un
 * teclado viejo) no entra en un jsonb: Postgres rechaza `"\ud83d"` con 22P02 y la transacción del
 * hecho —la venta, la anulación— vuelve atrás entera (O-v4-3, CERT-P2). Se cambia por U+FFFD
 * (el «carácter de reemplazo»), como hace un navegador al mostrarlo. La redacción NUNCA tira.
 */
export function bienFormado(texto: string): string {
  return texto.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "�");
}

// Emails. Tres formas, todas a «[email]»:
//   · la de siempre, `local@dominio`, CON o SIN TLD («juan@hotmail»), también con la arroba de
//     ancho completo «＠» (copiado de un PDF o de un teclado asiático);
//   · el espacio que mete el autocorrector después del punto: «juan@gmail. com» (se lleva el TLD);
//   · espacios alrededor de la arroba o «(at)»: «juan @ gmail.com», «juan(at)gmail.com». Para no
//     tapar «nos vemos @ las 5», esta forma exige un dominio con punto y un TLD de letras.
// Una arroba sin parte local pegada («@magra», «@ las 5») queda como está.
const NO_LOCAL = String.raw`\s@＠<>()\[\]"',;:`;
const LOCAL = `[^${NO_LOCAL}]{1,64}`;
const DOMINIO = `[^${NO_LOCAL}]{1,255}`;
const ARROBA = String.raw`[@＠]`;
const TLD_SUELTO = String.raw`(?:com|net|org|ar|edu|gob|gov|info|io|co|es|uy|cl|br|mx)(?![\p{L}\p{N}])`;
const RE_EMAIL = new RegExp(String.raw`${LOCAL}${ARROBA}(?:${DOMINIO}?\.\s{1,2}${TLD_SUELTO}|${DOMINIO})`, "giu");
const RE_EMAIL_COLGADO = new RegExp(String.raw`\[email\](?:${ARROBA}[^${NO_LOCAL}]*)+`, "gu");
const DOMINIO_CON_PUNTO =String.raw`[\p{L}\p{N}-]{1,63}(?:\s?\.\s?[\p{L}\p{N}-]{1,63})*\s?\.\s?\p{L}{2,24}(?![\p{L}\p{N}])`;
const RE_EMAIL_ESPACIADO = new RegExp(
  String.raw`${LOCAL}(?:\s{1,2}${ARROBA}\s{0,2}|${ARROBA}\s{1,2}|\s?[(\[]\s?at\s?[)\]]\s?)${DOMINIO_CON_PUNTO}`,
  "giu",
);
// Email escrito con palabras (O-v5-2, CERT-P2 vuelta 5): «juan.perez arroba gmail punto com»,
// «juan.perez [at] gmail [dot] com», «juan (arroba) gmail (punto) com». Exige la arroba en
// palabra («arroba», «[at]», «(at)», «(arroba)») y un dominio con al menos un «punto»/«dot»/«.»
// y un TLD de letras: «la arroba de la planilla» queda como está. Repeticiones con tope: lineal.
const PALABRA_SUELTA = String.raw`(?<![\p{L}\p{N}])`;
const ARROBA_EN_PALABRA = String.raw`\s{1,2}(?:${PALABRA_SUELTA}arroba(?![\p{L}\p{N}])|[(\[]\s?(?:at|arroba)\s?[)\]])\s{1,2}`;
const PUNTO_EN_PALABRA = String.raw`(?:\s{0,2}\.\s{0,2}|\s{1,2}(?:${PALABRA_SUELTA}(?:punto|dot)(?![\p{L}\p{N}])|[(\[]\s?(?:dot|punto)\s?[)\]])\s{1,2})`;
const RE_EMAIL_EN_PALABRAS = new RegExp(
  String.raw`${LOCAL}${ARROBA_EN_PALABRA}[\p{L}\p{N}-]{1,63}(?:${PUNTO_EN_PALABRA}[\p{L}\p{N}-]{1,63}){0,4}${PUNTO_EN_PALABRA}\p{L}{2,24}(?![\p{L}\p{N}])`,
  "giu",
);

// Lo que puede ir ENTRE los dígitos de un teléfono, DNI o CUIT sin cortar la tirada, en
// cualquier cantidad: espacios de todo tipo (también el salto de línea, NBSP, el espacio fino),
// punto, coma («30,123,456»), barra, paréntesis, cualquier raya Unicode (el guion, «–» y «—» del
// autocorrector, el U+2011 de WhatsApp…), el signo menos, los caracteres invisibles de formato
// (\p{Cf}: el guion blando U+00AD que pega Word, el espacio de ancho cero, las marcas de
// dirección U+202A…U+202E), el guion bajo («11_5566_7788») y los apóstrofos de miles
// («30'123'456», «30’123’456», «´») y separadores raros que no aparecen entre números en un texto
// normal: «~», «|», «\», la viñeta «•» y el punto de ancho completo «．». No entran letras ni otros
// símbolos que sí separan números en un texto común («$», «#», «·», «x», «:», «*», «;»): «pedido
// #1042 – $12500», «a las 18:30» y «2*1500» quedan como están. Sin tope de
// largo: «11  -  5566  -  7788» es la misma tirada. La clase no comparte nada con \p{Nd}, así
// que la búsqueda es lineal (no hay retroceso explosivo).
// Dígitos: \p{Nd}, cualquier sistema decimal (ancho completo «１１５５…», arábigos orientales,
// matemáticos «𝟏𝟏…»), no sólo 0-9.
// Tiradas de 6 o más dígitos con un «+» adelante opcional: teléfonos («11 5566-7788»,
// «+54 9 11…»), DNI («30.123.456»), CUIT («20-30123456-7»). Las de 5 o menos (un código de
// pedido, un precio) quedan como están.
const SEPARADOR = String.raw`[\s.,\/()\p{Pd}−\p{Cf}_'‘’´~|\\•．]`;
const RE_DIGITOS = new RegExp(String.raw`\+?\p{Nd}(?:${SEPARADOR}*\p{Nd}){5,}`, "gu");

// Un IMPORTE no es un dato personal (O-v4-2, CERT-P2): la coma que entró con F4 para el DNI
// «30,123,456» se llevaba los centavos y tapaba precios («1.250,50», «125.000,50»). Una tirada
// con forma de plata queda como está:
//   · con centavos: miles con punto o coma y dos decimales al final («125.000,50»,
//     «1,250,000.00»), o sin miles («12500.00», «125000,50»);
//   · después de un «$» («$ 125.000», «$12500000»), con o sin miles y decimales.
// Un DNI («30.123.456», «30,123,456») no termina en dos decimales y no va después de «$»: se
// tapa. Un teléfono tiene grupos de 4 o espacios y tampoco calza. Sólo dígitos 0-9: con otro
// sistema de dígitos no hay forma de plata y se tapa.
// Sin separador de miles, la parte entera tiene 7 dígitos como máximo (hasta $ 9.999.999,99):
// una tirada más larga pegada a «,NN» o «.NN» es un teléfono, un DNI o un CUIT con algo atrás
// («llamar al 1155667788,15hs», «DNI 30123456,12 cuotas», «CUIT 20301234567,50») y se tapa
// (O-v5-1, CERT-P2 vuelta 5). Después de un «$» vale cualquier largo (RE_IMPORTE).
// Residual escrito: un DNI con puntos de miles y «,NN» pegado («DNI 30.123.456,50») tiene la
// forma exacta de un importe de treinta millones y queda en claro (redaccion-v5.test.ts).
const RE_IMPORTE_CON_CENTAVOS = /^(?:\d{1,3}(?:[.,]\d{3})+|\d{1,7})[.,]\d{2}$/;
const RE_IMPORTE = /^(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{1,2})?$/;
const RE_PESOS_ANTES = /\$\s{0,2}$/;
// Una fecha («28/10/2026», «28-10-26», «1.11.2026») tampoco es un teléfono ni un documento.
const RE_FECHA_EN_TEXTO = /^\d{1,2}([/.-])\d{1,2}\1(?:\d{2}|\d{4})$/;

/** ¿La tirada es un importe (o una fecha)? `antes` = los caracteres que la preceden. PURA. */
function esImporte(tirada: string, antes: string): boolean {
  if (RE_IMPORTE_CON_CENTAVOS.test(tirada) || RE_FECHA_EN_TEXTO.test(tirada)) return true;
  return RE_IMPORTE.test(tirada) && RE_PESOS_ANTES.test(antes);
}

/** Largo máximo de un texto libre en el sobre. */
export const LARGO_TEXTO_LIBRE = 500;
/**
 * Hasta dónde se mira un texto libre larguísimo (un motivo de ARCA con 30 observaciones). Se
 * redacta ANTES de recortar a 500: recortar primero puede partir un DNI y dejar «…30123» en
 * claro, y una máscara («******7788») es más corta o más larga que el dato, así que el largo
 * final sólo se sabe después de redactar.
 */
const LARGO_A_REDACTAR = 4000;

/** Enmascara un dato personal dejando los últimos 4 dígitos: «11 5566-7788» → «******7788». */
export function enmascararTelefono(valor: string | null | undefined): string | null {
  // NFKC pasa a 0-9 los dígitos de ancho completo y los matemáticos; los de otros sistemas
  // (arábigos orientales) se cuentan pero no se muestran.
  const digitos = [...String(valor ?? "").normalize("NFKC").replace(/[^\p{Nd}]/gu, "")];
  if (digitos.length < 6) return digitos.length ? "******" : null;
  const ultimos = digitos.slice(-4).join("");
  return /^\d{4}$/.test(ultimos) ? `******${ultimos}` : "******";
}

/** Corta en `largo` sin partir un emoji (un par sustituto suelto no entra en un jsonb). */
function cortarSinPartir(texto: string, largo: number): string {
  if (texto.length <= largo) return texto;
  const c = texto.charCodeAt(largo - 1);
  return texto.slice(0, c >= 0xd800 && c <= 0xdbff ? largo - 1 : largo);
}

const ES_ESPACIO = /\s/u;
/** Un carácter que puede ser parte de una tirada: dígito, «+» o separador (la clase de RE_DIGITOS). */
const ES_DE_TIRADA = new RegExp(String.raw`^(?:[+\p{Nd}]|${SEPARADOR})$`, "u");

/**
 * Un texto de más de LARGO_A_REDACTAR se mira hasta ahí, y la cola cortada se descarta: la
 * última palabra (un email a medias) y la tirada de dígitos que quedó al final (un teléfono a
 * medias). Así ningún dato partido por el corte llega sin redactar. Se recorre de atrás para
 * adelante, sin expresiones con `$` (que sobre 4000 caracteres sin espacio serían cuadráticas).
 */
function aRedactar(texto: string): string {
  if (texto.length <= LARGO_A_REDACTAR) return texto;
  const t = cortarSinPartir(texto, LARGO_A_REDACTAR);
  let fin = t.length;
  while (fin > 0 && !ES_ESPACIO.test(t[fin - 1])) fin--;
  while (fin > 0 && ES_DE_TIRADA.test(t[fin - 1])) fin--;
  return t.slice(0, fin);
}

// Una máscara o un «[email]» que el corte a 500 dejó por la mitad («… ****», «… [em»): no filtra
// nada, pero se lee como basura (O-v4-4, CERT-P2). Se saca.
const RE_MASCARA_PARTIDA = /(?:\*{1,6}\d{0,3}|\[(?:e(?:m(?:a(?:il?)?)?)?)?)$/;

/** Recorta a LARGO_TEXTO_LIBRE sin partir un emoji, una máscara ni un «[email]». */
function recortar(redactado: string): string {
  if (redactado.length <= LARGO_TEXTO_LIBRE) return redactado;
  const t = cortarSinPartir(redactado, LARGO_TEXTO_LIBRE);
  const partida = RE_MASCARA_PARTIDA.exec(t);
  return partida ? t.slice(0, partida.index) : t;
}

/**
 * Lo que una persona escribió, sin emails ni números de teléfono/documento, de hasta 500
 * caracteres. Primero se redacta y DESPUÉS se recorta (F5, CERT-P2 vuelta 2). Nunca tira: un
 * sustituto suelto se cambia por U+FFFD antes que nada (O-v4-3).
 */
export function redactarTextoLibre(texto: string): string {
  const redactado = aRedactar(bienFormado(texto))
    .replace(RE_EMAIL_EN_PALABRAS, "[email]")
    .replace(RE_EMAIL_ESPACIADO, "[email]")
    // El punto final de la oración («escribime a juan@mail.com.») no es del email: queda.
    .replace(RE_EMAIL, (m: string) => `[email]${/\.+$/.exec(m)?.[0] ?? ""}`)
    // Dos emails pegados sin espacio («juan@hotmailana@gmail.com»): el segundo dominio queda
    // colgado del primer «[email]»; se lo lleva.
    .replace(RE_EMAIL_COLGADO, "[email]")
    .replace(RE_DIGITOS, (m: string, desde: number, todo: string) =>
      esImporte(m, todo.slice(Math.max(0, desde - 3), desde)) ? m : (enmascararTelefono(m) ?? "******"),
    );
  return recortar(redactado);
}

const RE_MASCARA = /^\*{6}\d{0,4}$/;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
const RE_FECHA_AFIP = /^\d{8}$/;

function primitivo<T>(
  clase: string,
  ok: (v: unknown) => boolean,
  esperado: string,
  redactar: (v: T) => T = (v) => v,
): Esquema<T> {
  return {
    clase,
    validar(v, ruta, errores) {
      if (!ok(v)) errores.push(`${ruta}: se esperaba ${esperado} (llegó ${JSON.stringify(v) ?? "undefined"})`);
    },
    redactar,
    describir: () => clase,
  };
}

const esTexto = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 2000;
const esNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export const e = {
  /** Identificador (cuid, id externo). Texto no vacío. */
  id: () => primitivo<string>("id", esTexto, "un id (texto no vacío)"),
  /** Texto corto de sistema (no lo escribe una persona: códigos, referencias). */
  texto: () => primitivo<string>("texto", esTexto, "un texto no vacío"),
  /**
   * Texto que escribe una persona (o que manda ARCA): se redacta y se recorta a 500 al emitir.
   * Cualquier largo pasa la validación: un motivo de rechazo de ARCA con 25 observaciones no
   * puede tumbar la transacción que registra el rechazo (se recorta, no se rechaza).
   */
  textoLibre: () => primitivo<string>("texto libre (se redacta)", (v) => typeof v === "string", "un texto", redactarTextoLibre),
  /** Pesos argentinos, número finito con hasta 2 decimales. */
  monto: () =>
    primitivo<number>(
      "monto (ARS)",
      (v) => esNumero(v) && Math.abs(redondearAlCentavo(v) - v) < 1e-9,
      "un monto en pesos con hasta 2 decimales",
    ),
  numero: () => primitivo<number>("número", esNumero, "un número finito"),
  entero: () => primitivo<number>("entero", (v) => Number.isInteger(v), "un entero"),
  bool: () => primitivo<boolean>("sí/no", (v) => typeof v === "boolean", "true o false"),
  /** Fecha ISO 8601 (AAAA-MM-DD o con hora y zona). */
  fecha: () => primitivo<string>("fecha ISO 8601", (v) => typeof v === "string" && RE_FECHA.test(v), "una fecha ISO 8601"),
  /** Fecha AFIP/ARCA AAAAMMDD. */
  fechaArca: () => primitivo<string>("fecha AAAAMMDD", (v) => typeof v === "string" && RE_FECHA_AFIP.test(v), "una fecha AAAAMMDD"),
  /** Dato personal enmascarado (`enmascararTelefono`). */
  enmascarado: () =>
    primitivo<string>("enmascarado (******1234)", (v) => typeof v === "string" && RE_MASCARA.test(v), "un dato enmascarado (******1234)"),

  uno<const V extends readonly string[]>(valores: V): Esquema<V[number]> {
    return primitivo<V[number]>(valores.join(" | "), (v) => typeof v === "string" && valores.includes(v), `uno de ${valores.join(", ")}`);
  },

  lista<T>(item: Esquema<T>): Esquema<T[]> & { readonly item: Esquema<T> } {
    return {
      clase: `lista de ${item.clase}`,
      item,
      validar(v, ruta, errores) {
        if (!Array.isArray(v)) {
          errores.push(`${ruta}: se esperaba una lista`);
          return;
        }
        if (v.length > 1000) errores.push(`${ruta}: más de 1000 elementos`);
        v.forEach((x, i) => item.validar(x, `${ruta}[${i}]`, errores));
      },
      redactar: (v) => v.map((x) => item.redactar(x)),
      describir: () => `[${item.describir()}]`,
    };
  },

  objeto<S extends Record<string, Esquema<unknown>>>(campos: S): Esquema<InferirObjeto<S>> & { readonly campos: S } {
    return {
      clase: "objeto",
      campos,
      validar(v, ruta, errores) {
        if (typeof v !== "object" || v === null || Array.isArray(v)) {
          errores.push(`${ruta}: se esperaba un objeto`);
          return;
        }
        const o = v as Record<string, unknown>;
        for (const k of Object.keys(o)) {
          if (!(k in campos)) errores.push(`${ruta}.${k}: campo que el catálogo no conoce`);
        }
        for (const [k, esq] of Object.entries(campos)) {
          const valor = o[k];
          if (valor === undefined && (esq as Partial<EsquemaOpcional<unknown>>).opcional) continue;
          esq.validar(valor, `${ruta}.${k}`, errores);
        }
      },
      redactar(v) {
        const o = v as Record<string, unknown>;
        const r: Record<string, unknown> = {};
        for (const [k, esq] of Object.entries(campos)) {
          if (o[k] === undefined) continue;
          r[k] = esq.redactar(o[k]);
        }
        return r as InferirObjeto<S>;
      },
      describir: () =>
        `{ ${Object.entries(campos)
          .map(([k, esq]) => `${k}${(esq as Partial<EsquemaOpcional<unknown>>).opcional ? "?" : ""}: ${esq.describir()}`)
          .join(", ")} }`,
    };
  },

  opcional<T>(base: Esquema<T>): EsquemaOpcional<T> & { readonly base: Esquema<T> } {
    return {
      clase: base.clase,
      opcional: true,
      base,
      validar(v, ruta, errores) {
        if (v !== undefined) base.validar(v, ruta, errores);
      },
      redactar: (v) => (v === undefined ? v : base.redactar(v)),
      describir: () => base.describir(),
    };
  },

  nulo<T>(base: Esquema<T>): Esquema<T | null> & { readonly base: Esquema<T> } {
    return {
      clase: `${base.clase} | null`,
      base,
      validar(v, ruta, errores) {
        if (v !== null) base.validar(v, ruta, errores);
      },
      redactar: (v) => (v === null ? v : base.redactar(v)),
      describir: () => `${base.describir()} | null`,
    };
  },
};

/** Valida y devuelve la lista de errores (vacía = cumple). */
export function erroresDe<T>(esquema: Esquema<T>, valor: unknown): string[] {
  const errores: string[] = [];
  esquema.validar(valor, "datos", errores);
  return errores;
}

/** Los nombres de campo de un esquema, recorriendo objetos y listas (para el test de redacción). */
export function nombresDeCampos(esquema: Esquema<unknown>, prefijo = ""): { ruta: string; esquema: Esquema<unknown> }[] {
  const salida: { ruta: string; esquema: Esquema<unknown> }[] = [];
  const envuelto = esquema as { campos?: Record<string, Esquema<unknown>>; item?: Esquema<unknown>; base?: Esquema<unknown> };
  if (envuelto.item) return nombresDeCampos(envuelto.item, `${prefijo}[]`);
  if (envuelto.base) return nombresDeCampos(envuelto.base, prefijo);
  const campos = envuelto.campos;
  if (campos) {
    for (const [k, sub] of Object.entries(campos)) {
      const ruta = prefijo ? `${prefijo}.${k}` : k;
      salida.push({ ruta, esquema: sub });
      salida.push(...nombresDeCampos(sub, ruta));
    }
  }
  return salida;
}
