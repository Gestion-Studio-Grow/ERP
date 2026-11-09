// ============================================================================
// CONSOLA DE SOPORTE GSG — la entrada de tickets por canal (GSG-MANT-001, T-A).
// ============================================================================
//
// WhatsApp, mail y el botón «Pedir ayuda» del sistema abren un ticket. Acá están las reglas PURAS
// (sin base ni red): qué mensaje dispara un ticket, con qué origen (idempotencia: un mensaje, un
// ticket) y cómo se tapan los secretos ANTES de que nada se guarde. Lo prueba canales-core.test.ts;
// lo usa entrada.server.ts.
//
// Lado seguro: ante la duda se tapa. Un «[tapado]» de más no rompe nada; una contraseña guardada en
// el detalle de un ticket la ve todo el equipo de soporte y queda en los respaldos.

import { TIPO, type Canal } from "./config";
import { venceElPara, type DatosTicketNuevo, type Validacion } from "./tickets-core";

/** Los canales por los que entra un mensaje del cliente (los otros nacen adentro del sistema). */
export const CANALES_DE_ENTRADA = ["whatsapp", "mail", "erp"] as const satisfies readonly Canal[];
export type CanalDeEntrada = (typeof CANALES_DE_ENTRADA)[number];
export const esCanalDeEntrada = (x: unknown): x is CanalDeEntrada =>
  typeof x === "string" && (CANALES_DE_ENTRADA as readonly string[]).includes(x);

/** La etiqueta de Gmail que, puesta a mano por el equipo, convierte un mail en ticket. */
export const ETIQUETA_MAIL_SOPORTE = "GSG/soporte";
export const ID_EXTERNO_MAX = 200;
export const ASUNTO_MAX = 120;
export const DETALLE_MAX = 4000;
export const REMITENTE_MAX = 200;
export const TAPADO = "[tapado]";

/** Minúsculas, sin tildes ni diéresis (la «ñ» queda «n»). PURA. */
export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

// ── Disparador ──────────────────────────────────────────────────────────────────────────────────

/** «AYUDA» o «#ayuda» al principio, como palabra entera («ayudante» no dispara). */
const RE_DISPARADOR_WA = /^\s*#?ayuda(?![\p{L}\p{N}_])/u;
// PENDIENTE (no se resuelve acá): la respuesta «Re: [AYUDA] …» de un mail que ya abrió ticket trae
// otro Message-ID y abriría otro ticket. Lo resuelve el receptor de mail agrupando por In-Reply-To /
// References contra el origen del ticket abierto.
const RE_DISPARADOR_MAIL = /\[\s*ayuda\s*\]/;

/**
 * ¿Este mensaje abre un ticket? WhatsApp: el texto empieza con «AYUDA» o «#ayuda» (sin importar
 * mayúsculas, tildes ni espacios al principio). Mail: el asunto trae «[AYUDA]» o el mail tiene la
 * etiqueta «GSG/soporte». Botón del sistema: siempre. Un canal que no es de entrada: nunca. PURA.
 */
export function esDisparador(canal: string, texto: string, asunto?: string | null, etiquetas?: readonly string[] | null): boolean {
  if (canal === "erp") return true;
  if (canal === "whatsapp") return RE_DISPARADOR_WA.test(normalizar(texto ?? ""));
  if (canal === "mail") {
    if (RE_DISPARADOR_MAIL.test(normalizar(asunto ?? ""))) return true;
    const buscada = normalizar(ETIQUETA_MAIL_SOPORTE);
    return (etiquetas ?? []).some((e) => typeof e === "string" && normalizar(e.trim()) === buscada);
  }
  return false;
}

/** El texto sin el disparador («AYUDA: no me factura» → «no me factura»). PURA. */
function sinDisparadorWa(texto: string): string {
  const original = texto.normalize("NFC");
  const m = RE_DISPARADOR_WA.exec(normalizarConLargo(original));
  const resto = m ? original.slice(m[0].length) : original;
  // Un solo guion o raya («AYUDA - no anda»), no una tirada: «AYUDA -----BEGIN …» conserva el bloque.
  return resto.replace(/^[\s:;,.!]*(?:[-–—](?![-–—]))?[\s:;,.!]*/u, "");
}

const sinDisparadorMail = (asunto: string) => asunto.replace(/\[\s*[aá]yuda\s*\]/giu, "").trim();

// ── Origen (idempotencia) ───────────────────────────────────────────────────────────────────────

/** `${canal}:${idExterno}`: el id del mensaje en su canal (wamid, Message-ID, id del pedido). PURA. */
export function origenDeCanal(canal: string, idExterno: unknown): Validacion<string> {
  if (!esCanalDeEntrada(canal)) return { ok: false, error: "Ese canal no recibe mensajes de clientes." };
  if (typeof idExterno !== "string" || idExterno.length === 0) return { ok: false, error: "Falta el id del mensaje." };
  // NFC: el mismo id escrito con «é» compuesta o con «e» + tilde suelta es el mismo mensaje.
  const id = idExterno.normalize("NFC");
  if (id.length > ID_EXTERNO_MAX) return { ok: false, error: `El id del mensaje pasa de ${ID_EXTERNO_MAX} caracteres.` };
  // Sin espacios ni caracteres de control: un id con espacios viene mal armado (y no sería estable).
  if (/[\s\p{Cc}\p{Cf}]/u.test(id)) return { ok: false, error: "El id del mensaje no puede tener espacios." };
  return { ok: true, valor: `${canal}:${id}` };
}

// ── Secretos ────────────────────────────────────────────────────────────────────────────────────
//
// Toda regex de esta sección es lineal: cada repetición está acotada o la separa un carácter que no
// puede repetir (sin `+` seguido de algo que el mismo `+` también acepta). Lo prueba el test de
// ReDoS con 100 KB de entradas patológicas. Igual, ticketDesdeMensaje recorta antes de tapar.

/**
 * Clave privada PEM o bloque PGP: de BEGIN hasta END o, si no cierra, hasta el final del texto. Los
 * guiones de la apertura son opcionales: un recorte o un copiado a medias puede comerse algunos.
 */
const RE_PEM = /-{0,5}BEGIN [A-Z0-9 ]{0,40}PRIVATE KEY(?: BLOCK)?-{2,5}[\s\S]*?(?:-{2,5}END [A-Z0-9 ]{0,40}PRIVATE KEY(?: BLOCK)?-{0,5}|$)/gi;

/** Tokens con forma reconocible: se tapan enteros, aunque nadie diga «token». */
const TOKENS: readonly RegExp[] = [
  /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{6,}/gi, // encabezado de autorización (se deja la palabra)
  /\b(?:sk|rk|pk)[-_][A-Za-z0-9_-]{8,}/g, // sk-..., sk_live_..., sk-ant-..., rk_...
  /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{8,}/g,
  /\bxox[a-z]-[A-Za-z0-9-]{10,}/g, // Slack (xoxb, xoxp, xoxe…)
  /\b(?:npg|whsec|glpat|shpat|shpss)[_-][A-Za-z0-9_-]{8,}/g, // Neon, webhooks (Stripe/Svix), GitLab, Shopify
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\b(?:APP_USR|TEST)-[A-Za-z0-9-]{16,}/g, // access token de Mercado Pago
  // JWT. El lookbehind (y no `\b`) evita arrancar de nuevo en cada «-eyJ» de una tirada: sin él, cada
  // arranque recorre hasta el final buscando el punto (cuadrático).
  /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g, // clave de Google
];

/**
 * Usuario y clave dentro de una URL (postgres://u:clave@host): se tapa sólo la clave. El lookbehind
 * hace que el esquema arranque sólo al principio de una palabra: sin él, 100 KB de «a» probaban cada
 * posición como esquema (6 s).
 */
// La clave puede tener «/» (postgres://u:ab/cd@host): se acota a 200 para que cada arranque sea corto.
const RE_URL_CON_CLAVE = /(?<![a-z0-9+.-])([a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)[^\s@]{1,200}@/gi;

/**
 * Palabras que anuncian un secreto, en singular o plural. Se comparan sobre el texto sin tildes. Una
 * etiqueta con dígitos pegados cuenta sólo si después viene «:» o «=» («password1: X»).
 */
const RE_ETIQUETA =
  /(?<![\p{L}\p{N}])(contrasenas?|contrasenias?|claves?|passwords?|passwd|pass|pwd|pins?|tokens?|api[ _-]?keys?|apikeys?|secrets?|secretos?|cvv|cvc|codigos? de seguridad|codigos?|otp)(?:(?![\p{L}\p{N}])|(?=\p{N}{1,4}["'`]?[ \t]{0,3}[:=]))/giu;
/** «código» a secas es secreto sólo si la línea habla de cómo llegó o para qué es (SMS, acceso…). */
const RE_CONTEXTO_CODIGO =
  /(?<![\p{L}\p{N}])(?:sms|whatsapp|wsp|wpp|mail|correo|mensaje|verificacion|acceso|ingreso|autenticacion|2fa|otp|token|banco|homebanking|llego|mandaron|enviaron)(?![\p{L}\p{N}])/u;

/** Lo que puede ir entre la etiqueta y el secreto («mi clave FISCAL NUEVA ES abc»). */
const RELLENO = new Set([
  "es", "era", "seria", "sera", "quedo", "puse", "de", "del", "la", "el", "mi", "tu", "su", "fiscal", "afip", "arca",
  "nueva", "nuevo", "actual", "vieja", "viejo", "sistema", "acceso", "usuario", "provisoria", "provisorio", "temporal",
  "ahora", "banco", "mail", "correo", "email", "wifi", "tarjeta", "app", "erp", "numero", "nro", "son", "eran", "mis", "tus",
  "sus", "las", "los",
]);
/** Sin «:» ni «=» explícito, estas palabras no son un secreto («olvidé la clave y no entro»). */
const NO_ES_VALOR = new Set([
  "y", "o", "u", "e", "que", "no", "ni", "pero", "porque", "para", "por", "con", "sin", "en", "a", "se", "me", "te", "lo",
  "le", "nos", "si", "ya", "cuando", "tampoco", "tambien", "anda", "funciona", "olvide", "olvido", "perdi", "cambie",
  "cambiar", "cambio", "recuperar", "resetear", "blanquear", "incorrecta", "incorrecto", "vencida", "vencio", "bloqueada",
  "bloqueado", "mal", "equivocada", "gracias", "saludos", "porfa", "favor", "pad",
]);
/**
 * Después de un «:» explícito, el comienzo de una frase de charla no es un valor («la clave: no puedo
 * entrar»). Se miran las dos primeras palabras; «¿» o «¡» también es charla.
 */
const CHARLA = new Set([
  "no puedo", "no me", "no anda", "no funciona", "no funca", "no entra", "no entro", "no se", "no sale", "no tengo", "no deja",
  "no la", "no lo", "no carga", "no abre", "me dice", "me sale", "me da", "me pide", "me tira", "se me", "se bloqueo",
  "se vencio", "la olvide", "la perdi", "la cambie", "ya no",
]);
/** «la clave que me dieron ES abc»: el verbo que, unas palabras más adelante, anuncia el valor. */
const COPULA = new Set(["es", "era", "son", "fue", "seria", "sera", "quedo"]);
/** Comilla que abre → comilla que cierra (una contraseña entre comillas puede tener espacios). */
const COMILLAS: Readonly<Record<string, string>> = { '"': '"', "'": "'", "«": "»", "“": "”", "`": "`" };
const ES_COMILLA = new Set(['"', "'", "«", "»", "“", "”", "`"]);
const COMILLADO_MAX = 256;

const esEspacio = (c: string | undefined) => c !== undefined && /\s/.test(c);
/** Puntuación o símbolo que no es comilla: separa la etiqueta del valor («clave - X», «clave, X»). */
const esPuntuacion = (c: string | undefined) => c !== undefined && !ES_COMILLA.has(c) && /[\p{P}\p{S}]/u.test(c);
const RE_PALABRA = /\p{L}+/uy;
const RE_NO_ESPACIO = /\S+/y;
const RE_SIGUIENTE = /[ \t]+(\S+)/y;

/** Sin la puntuación del final («abc123,» → «abc123»). Lineal: sin regex con `+$`. */
function sinPuntuacionFinal(w: string): string {
  let k = w.length;
  while (k > 0 && ".,;:!?)".includes(w[k - 1])) k--;
  return w.slice(0, k);
}

/**
 * Desde una palabra que no es valor, ¿aparece una cópula («es») en las próximas 12 palabras de la
 * misma oración? La coma no corta la oración; el punto, «?», «!» y el salto de línea sí.
 */
function despuesDeCopula(n: string, desde: number): number | null {
  let i = desde;
  for (let k = 0; k < 12; k++) {
    while (n[i] === " " || n[i] === "\t" || n[i] === ",") i++;
    RE_PALABRA.lastIndex = i;
    const w = RE_PALABRA.exec(n)?.[0];
    if (!w) return null;
    i += w.length;
    if (COPULA.has(w)) return i;
  }
  return null;
}

/**
 * Lo que va DESPUÉS de una etiqueta. Devuelve [desde, hasta) del valor a tapar, o null. Trabaja
 * sobre `n` (sin tildes, mismo largo que el original: se normaliza letra por letra). Lado seguro:
 * - La puntuación seguida de espacio separa («clave - X», «contraseña, X», «clave... X»); pegada al
 *   valor, es parte del valor («clave ,X» tapa «,X»).
 * - Con «:», «=», «->» o «-» explícito se tapa hasta el fin de la línea («usuario y clave: juan / X»).
 * - Sin separador explícito se tapa el valor y las palabras que siguen hasta una palabra de charla
 *   («mi contraseña es Hola Mundo99 y no entro» → tapa «Hola Mundo99»).
 * - JSON: la comilla que cierra la clave («"pass": "X"») se salta; el valor entre comillas se tapa.
 */
function valorDespuesDeEtiqueta(n: string, desde: number): [number, number] | null {
  let i = desde;
  let explicito = false;
  // Lo pegado a la etiqueta que termina en «:» o «=» es parte de la etiqueta y el «:» es el separador
  // («clave_fiscal: X», «secret_key=X», «password1: X», «{"api_key":"X"}»). Acotado a 40.
  if (n[i] !== undefined && !/[\s:=]/.test(n[i])) {
    let j = i;
    while (j - i < 40 && n[j] !== undefined && !/[\s:=]/.test(n[j]) && !ES_COMILLA.has(n[j])) j++;
    if (ES_COMILLA.has(n[j])) j++;
    while (j - i < 44 && (n[j] === " " || n[j] === "\t")) j++;
    if (n[j] === ":" || n[j] === "=") i = j;
  }
  // Cada vuelta avanza al menos un carácter: el total queda acotado por el texto.
  for (;;) {
    while (esEspacio(n[i])) i++;
    if (i >= n.length) return null;
    // Tras un «:», una frase de charla no es el valor; si más adelante dice «es X», X sí lo es.
    if (explicito && esCharla(n, i)) {
      const j = despuesDeCopula(n, i);
      if (j === null) return null;
      i = j;
      explicito = false;
      continue;
    }
    const c = n[i];
    if (c === ":" || c === "=") {
      explicito = true;
      i++;
      continue;
    }
    if (n.startsWith("->", i) || c === "→" || c === "⇒") {
      explicito = true;
      i += c === "-" ? 2 : 1;
      continue;
    }
    // La comilla que cierra la clave de un JSON: «"password":"X"».
    if (ES_COMILLA.has(c)) {
      let j = i + 1;
      while (n[j] === " ") j++;
      if (n[j] === ":" || n[j] === "=") {
        i = j;
        continue;
      }
    }
    if (esPuntuacion(c)) {
      let j = i;
      while (j - i < 8 && esPuntuacion(n[j])) j++;
      if (j >= n.length || esEspacio(n[j])) {
        if (/[:=>→\-–—]/.test(n.slice(i, j))) explicito = true;
        i = j;
        continue;
      }
      break; // pegada al valor: es parte del valor
    }
    RE_PALABRA.lastIndex = i;
    const palabra = RE_PALABRA.exec(n)?.[0];
    const sigue = palabra ? n[i + palabra.length] : undefined;
    if (palabra && RELLENO.has(palabra) && (sigue === undefined || /[\s:=]/.test(sigue))) {
      i += palabra.length;
      continue;
    }
    if (!explicito && palabra && NO_ES_VALOR.has(palabra) && (sigue === undefined || /\s/.test(sigue))) {
      const j = despuesDeCopula(n, i);
      if (j !== null) {
        i = j;
        continue;
      }
    }
    break;
  }
  // Entre comillas: hasta la comilla que cierra, si cierra cerca.
  const cierre = COMILLAS[n[i]];
  if (cierre) {
    const fin = n.slice(i + 1, i + 1 + COMILLADO_MAX).indexOf(cierre);
    if (fin > 0) return [i, i + 1 + fin + 1];
  }
  RE_NO_ESPACIO.lastIndex = i;
  const valor = RE_NO_ESPACIO.exec(n)?.[0];
  if (!valor || valor.startsWith(TAPADO)) return null;
  if (!explicito && NO_ES_VALOR.has(sinPuntuacionFinal(valor))) return null;
  if (explicito) {
    let fin = n.indexOf("\n", i);
    if (fin < 0) fin = n.length;
    while (fin > i && esEspacio(n[fin - 1])) fin--;
    return [i, fin];
  }
  // Sin separador explícito: el valor y lo que sigue en la línea, hasta una palabra de charla.
  let fin = i + valor.length;
  if (sinPuntuacionFinal(valor) === valor) {
    for (let k = 0; k < 6; k++) {
      RE_SIGUIENTE.lastIndex = fin;
      const m = RE_SIGUIENTE.exec(n);
      if (!m) break;
      const limpio = sinPuntuacionFinal(m[1]);
      if (!limpio || NO_ES_VALOR.has(limpio) || m[1].startsWith(TAPADO)) break;
      fin += m[0].length;
      if (limpio !== m[1]) break; // la palabra cierra la oración
    }
  }
  return [i, fin];
}

/** ¿Empieza en `i` una frase de charla («no puedo…», «¿cuál…»)? Lee dos palabras como mucho. */
function esCharla(n: string, i: number): boolean {
  if (n[i] === "¿" || n[i] === "¡") return true;
  RE_PALABRA.lastIndex = i;
  const w1 = RE_PALABRA.exec(n)?.[0];
  if (!w1) return false;
  let j = i + w1.length;
  if (n[j] !== " " && n[j] !== "\t") return false;
  for (let k = 0; k < 4 && (n[j] === " " || n[j] === "\t"); k++) j++;
  RE_PALABRA.lastIndex = j;
  const w2 = RE_PALABRA.exec(n)?.[0];
  return !!w2 && CHARLA.has(`${w1} ${w2}`);
}

/** Sin tildes pero conservando el largo (para usar los índices sobre el original). */
function normalizarConLargo(s: string): string {
  return [...s].map((c) => {
    const x = normalizar(c);
    return x.length === c.length ? x : c;
  }).join("");
}

function luhn(digitos: string): boolean {
  let suma = 0;
  for (let k = 0; k < digitos.length; k++) {
    let d = digitos.charCodeAt(digitos.length - 1 - k) - 48;
    if (k % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    suma += d;
  }
  return suma % 10 === 0;
}

/** ¿Un número de tarjeta (13 a 19 dígitos que pasan Luhn) o un CBU/CVU (22 dígitos)? */
const esNumeroSensible = (digitos: string) => digitos.length === 22 || (digitos.length >= 13 && digitos.length <= 19 && luhn(digitos));

/**
 * Tiradas de dígitos separadas por hasta 3 espacios, NBSP, puntos, barras, guiones, rayas, guiones
 * bajos o saltos de línea («4111.1111.1111.1111», «4111  1111», «4111\n1111», «4111_1111»). La coma
 * separa sólo pegada a dígitos («4111,1111»): una lista «4111, 1111» no se junta. Lineal: el separador
 * no acepta dígitos y está acotado a 3.
 */
const RE_TIRADA = /(?<!\d)\d+(?:(?:[ \t\u00a0\u2007\u202f./_\-–—]|,(?=\d)|\r?\n){1,3}\d+)*(?!\d)/g;

/**
 * Una tirada de dígitos con separadores («4111 1111 1111 1111», «20 12345678 9 4111…»): desde cada
 * grupo se busca el tramo sensible más largo y se tapa la UNIÓN de todos. Así una fecha pegada que por
 * azar arma un Luhn con el primer grupo («01/07/2026 4111 …») no deja a la vista el resto de la
 * tarjeta. Grupos tapados seguidos son un solo «[tapado]» y un solo conteo.
 */
function taparTirada(tirada: string, contar: () => void): string {
  const partes = tirada.split(/(\D+)/); // [grupo, sep, grupo, sep, …]
  const nums = partes.filter((_, k) => k % 2 === 0);
  const tapado = new Array<boolean>(nums.length).fill(false);
  for (let a = 0; a < nums.length; a++) {
    let hasta = -1;
    let acum = "";
    for (let b = a; b < nums.length && acum.length <= 22; b++) {
      acum += nums[b];
      if (esNumeroSensible(acum)) hasta = b;
    }
    for (let k = a; k <= hasta; k++) tapado[k] = true;
  }
  let salida = "";
  for (let k = 0; k < nums.length; k++) {
    const sigue = k > 0 && tapado[k] && tapado[k - 1];
    if (k > 0 && !sigue) salida += partes[2 * k - 1];
    if (!tapado[k]) salida += nums[k];
    else if (!sigue) {
      salida += TAPADO;
      contar();
    }
  }
  return salida;
}

/**
 * Invisibles que parten una palabra («contra\u200eseña», «cla\u034fve»): todo formato (\p{Cf}), el
 * CGJ y los selectores de variante. Se conservan la unión (ZWJ) y el VS16 pegados a un emoji
 * («🤦‍♀️»): ahí no parten ninguna palabra.
 */
const RE_INVISIBLES =
  /(?!(?<=\p{Extended_Pictographic}[\u{1F3FB}-\u{1F3FF}\ufe0f]?)[\u200d\ufe0f])[\p{Cf}\u034f\ufe00-\ufe0f]/gu;
/** Marcas que quedan sueltas tras una letra latina después de NFC («cla\u0336ve»): no son tildes del idioma. */
const RE_MARCAS_SUELTAS = /(?<=\p{Script=Latin})\p{M}+/gu;
/** Ancho completo y alfanuméricos matemáticos («ｃｌａｖｅ», «４１１１», «𝐜𝐥𝐚𝐯𝐞») → ASCII. */
const RE_ANCHO_COMPLETO = /[\uff01-\uff5e\u{1d400}-\u{1d7ff}]/gu;

/**
 * Tapa claves privadas, contraseñas, claves, PIN, tokens, números de tarjeta (Luhn) y CBU/CVU (22
 * dígitos). La etiqueta queda («contraseña: [tapado]») para que soporte entienda el mensaje; el valor
 * no. `numeros: false` no busca tarjetas (para un remitente: un celular de 13 dígitos puede pasar
 * Luhn y soporte necesita contestarle). PURA.
 */
export function taparSecretos(texto: string, opciones: { numeros?: boolean } = {}): { texto: string; tapados: number } {
  let tapados = 0;
  const contar = () => void tapados++;
  let s = (texto ?? "")
    .normalize("NFC")
    .replace(RE_ANCHO_COMPLETO, (c) => c.normalize("NFKC"))
    .replace(RE_INVISIBLES, "")
    .normalize("NFC")
    .replace(RE_MARCAS_SUELTAS, "");

  s = s.replace(RE_PEM, () => {
    contar();
    return TAPADO;
  });
  for (const re of TOKENS) {
    s = s.replace(re, (_m: string, palabra?: string) => {
      contar();
      return typeof palabra === "string" && /^(bearer|basic)$/i.test(palabra) ? `${palabra} ${TAPADO}` : TAPADO;
    });
  }
  s = s.replace(RE_URL_CON_CLAVE, (_m: string, antes: string) => {
    contar();
    return `${antes}${TAPADO}@`;
  });

  // Etiquetas: se recorre el texto y se arma la salida por tramos.
  const n = normalizarConLargo(s);
  const re = new RegExp(RE_ETIQUETA.source, RE_ETIQUETA.flags);
  let salida = "";
  let ultimo = 0;
  for (let m = re.exec(n); m; m = re.exec(n)) {
    if (m[1] === "codigo" || m[1] === "codigos") {
      const ini = Math.max(n.lastIndexOf("\n", m.index) + 1, m.index - 60);
      let fin = n.indexOf("\n", m.index);
      if (fin < 0 || fin > m.index + 80) fin = Math.min(n.length, m.index + 80);
      if (!RE_CONTEXTO_CODIGO.test(n.slice(ini, fin))) continue;
    }
    const v = valorDespuesDeEtiqueta(n, m.index + m[0].length);
    if (!v) continue;
    salida += s.slice(ultimo, v[0]) + TAPADO;
    ultimo = v[1];
    re.lastIndex = v[1];
    contar();
  }
  s = salida + s.slice(ultimo);

  // Tarjetas y CBU/CVU.
  if (opciones.numeros !== false) {
    s = s.replace(RE_TIRADA, (tirada) => (tirada.replace(/\D/g, "").length >= 13 ? taparTirada(tirada, contar) : tirada));
  }

  return { texto: s, tapados };
}

/**
 * Lo que entra se recorta ANTES de tapar: el detalle termina en DETALLE_MAX, así que leer más no
 * aporta y sólo abre la puerta a un mensaje gigante que traba el proceso. Se descarta la palabra (y
 * la tirada de dígitos) que quedó partida en el corte: medio secreto ya no se reconoce para taparlo.
 */
export const ENTRADA_MAX = 4 * DETALLE_MAX;
export function recortarEntrada(s: string): string {
  if (s.length <= ENTRADA_MAX) return s;
  let k = ENTRADA_MAX;
  while (k > 0 && !/\s/.test(s[k - 1])) k--; // la palabra partida
  while (k > 0 && /[\d\s.,_\u00a0\u2007\u202f/\-–—]/.test(s[k - 1])) k--; // una tirada de dígitos partida
  return `${s.slice(0, k)}…`;
}

// ── Del mensaje al ticket ───────────────────────────────────────────────────────────────────────

export interface MensajeEntrante {
  canal: string;
  /** El id del mensaje en su canal: wamid de WhatsApp, Message-ID del mail, id del pedido del botón. */
  idExterno: string;
  texto: string;
  asunto?: string | null;
  /** Etiquetas del mail (Gmail). */
  etiquetas?: readonly string[] | null;
  /** Teléfono, mail o usuario que escribió: va al detalle, para poder contestarle. */
  remitente: string;
}

export type ResultadoMensaje = { ok: true; datos: DatosTicketNuevo; tapados: number } | { ok: false; motivo: string };

const PALABRAS_DE_PROBLEMA = [
  "no anda", "no funciona", "no me deja", "no puedo", "no carga", "no abre", "no entra", "no sale", "no factura",
  "no imprime", "no guarda", "no aparece", "no llega", "error", "falla", "fallo", "se cayo", "caido", "se rompio", "roto",
  "rechaz", "trabad", "colgad", "bug", "se borro", "desaparec",
];

/** «problema» si el texto suena a algo que no anda; si no, «consulta». PURA. */
export function tipoDeMensaje(texto: string): "problema" | "consulta" {
  const n = ` ${normalizar(texto).replace(/\s+/g, " ")} `;
  return PALABRAS_DE_PROBLEMA.some((p) => n.includes(p)) ? "problema" : "consulta";
}

/** Una línea, sin espacios de más, cortada sin partir un emoji. */
function unaLinea(s: string, max: number): string {
  const limpio = s.replace(/\s+/g, " ").trim();
  const letras = [...limpio];
  return letras.length <= max ? limpio : `${letras.slice(0, max - 1).join("").trimEnd()}…`;
}

const ASUNTO_POR_DEFECTO: Readonly<Record<CanalDeEntrada, string>> = {
  whatsapp: "Pedido de ayuda por WhatsApp",
  mail: "Pedido de ayuda por mail",
  erp: "Pedido de ayuda desde el sistema",
};

/**
 * El ticket que nace de un mensaje, o el motivo por el que no nace. Los secretos se tapan ANTES de
 * recortar (un número cortado a la mitad ya no se reconoce). El tipo sale de palabras simples del
 * texto crudo y la prioridad, del tipo. PURA.
 */
export function ticketDesdeMensaje(m: MensajeEntrante, ahora: Date): ResultadoMensaje {
  if (!esCanalDeEntrada(m.canal)) return { ok: false, motivo: "Ese canal no recibe mensajes de clientes." };
  const canal = m.canal;
  const origen = origenDeCanal(canal, m.idExterno);
  if (!origen.ok) return { ok: false, motivo: origen.error };
  // Recortados ANTES de cualquier regex o tapado: un mensaje gigante no traba el proceso.
  const texto = recortarEntrada(typeof m.texto === "string" ? m.texto : "");
  const asuntoCrudo = recortarEntrada(typeof m.asunto === "string" ? m.asunto : "");
  if (!esDisparador(canal, texto, asuntoCrudo, m.etiquetas)) {
    return { ok: false, motivo: canal === "whatsapp" ? "El mensaje no empieza con «AYUDA»." : "El mail no trae «[AYUDA]» en el asunto ni la etiqueta «GSG/soporte»." };
  }
  const remitenteCrudo = typeof m.remitente === "string" ? m.remitente.replace(/\s+/g, " ").trim() : "";
  if (!remitenteCrudo) return { ok: false, motivo: "Falta quién escribió." };
  if (remitenteCrudo.length > REMITENTE_MAX) return { ok: false, motivo: `El remitente pasa de ${REMITENTE_MAX} caracteres.` };
  // El remitente va al detalle: se tapan claves y tokens, no números (el celular hace falta para contestar).
  const remitenteTapado = taparSecretos(remitenteCrudo, { numeros: false });
  const remitente = remitenteTapado.texto;

  const cuerpo = (canal === "whatsapp" ? sinDisparadorWa(texto) : texto).trim();
  const asuntoBase = canal === "mail" ? sinDisparadorMail(asuntoCrudo) : "";
  if (canal === "erp" && !cuerpo && !asuntoCrudo.trim()) return { ok: false, motivo: "Contanos qué pasó antes de pedir ayuda." };

  const detalleTapado = taparSecretos(cuerpo);
  const asuntoPropio = asuntoBase || asuntoCrudo.trim();
  // Sin asunto propio, el asunto es la primera línea del cuerpo: sus secretos ya se contaron.
  const asuntoTapado = taparSecretos(asuntoPropio || cuerpo.split("\n").find((l) => l.trim()) || "");
  const asunto = unaLinea(asuntoTapado.texto, ASUNTO_MAX) || ASUNTO_POR_DEFECTO[canal];
  // El tipo se lee del texto CRUDO: tapar «clave: no puedo entrar» no puede borrar el «no puedo».
  // Lo que se guarda (asunto y detalle) sale siempre de lo tapado.
  const tipo = tipoDeMensaje(`${asuntoPropio}\n${cuerpo}`);
  const prioridad = TIPO[tipo].prioridad;
  const cuerpoFinal = [...detalleTapado.texto].length > DETALLE_MAX ? `${[...detalleTapado.texto].slice(0, DETALLE_MAX - 1).join("")}…` : detalleTapado.texto;
  const detalle = [`Escribió: ${remitente}`, cuerpoFinal ? `\n${cuerpoFinal}` : null].filter((x): x is string => x !== null).join("\n");

  return {
    ok: true,
    tapados: remitenteTapado.tapados + detalleTapado.tapados + (asuntoPropio ? asuntoTapado.tapados : 0),
    datos: {
      tipo,
      prioridad,
      asunto,
      detalle,
      canal,
      origenId: origen.valor,
      clienteTenantId: null,
      creadoPor: `cliente:${canal}`,
      venceEl: venceElPara(prioridad, ahora),
    },
  };
}
