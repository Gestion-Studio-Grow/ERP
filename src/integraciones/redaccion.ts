// ============================================================================
// REDACCIÓN de secretos y datos personales (E3 §2.6 y §6).
// ============================================================================
//
// Dos usos, una sola regla:
//   1. El payload de cada evento se guarda REDACTADO en `EventoIntegracion.payload`: sin
//      teléfonos, emails, documentos ni claves (Ley 25.326: no se retiene el dato personal
//      que no hace falta). El crudo sólo deja su sha256.
//   2. Ningún log de la suite recibe una clave: `crearLoggerSeguro` envuelve al logger y
//      pasa por acá el mensaje, el contexto y el error ANTES de que lleguen a la consola.
//      `src/integraciones/log.ts` expone el logger ya envuelto, y redaccion.test.ts falla si
//      un archivo de src/integraciones usa `console` o el logger del Core directo.
//
// Cómo decide:
//   - Por NOMBRE de campo (normalizado: minúsculas, sin tildes, sin guiones ni puntos). Un
//     campo secreto (token, secret, password, clave, authorization, ck, cs…) se reemplaza
//     entero por "[secreto]"; uno personal (email, phone, dni, cuit, domicilio…) por
//     "[dato personal]". El valor se reemplaza aunque sea un objeto: no se entra a mirar qué tiene.
//   - El MISMO nombre decide dentro de un texto: `nombre=valor`, `nombre: valor`,
//     `"nombre":"valor"` (también escapado, dentro de un JSON copiado a un mensaje) y
//     `Nombre: valor` de un encabezado. Una sola lista para estructuras y textos.
//   - Por FORMA del texto, en cualquier campo: emails, "Bearer …", llaves privadas PEM, JWT,
//     claves con prefijo conocido (Meta "EAA…", Mercado Pago "APP_USR-…", WooCommerce
//     "ck_…/cs_…"), parámetros `?code=` en URLs, teléfonos con "+" y CUIT con guiones.
//   - Listas (`rawHeaders` de Node, `[...headers]`, entradas de un Map, `[nombre, valor, …]`):
//     si un elemento nombra un secreto, el que lo sigue se tapa.
//   - Tiempo acotado: las expresiones están ancladas para ser lineales y un texto de más de
//     `LARGO_MAXIMO_TEXTO` caracteres se recorta ANTES de mirarlo (redaccion.test.ts mide
//     256 KB adversariales). Un texto así no sirve entero ni en un log ni en un payload guardado.
//   - Cada conector suma sus propios campos (`ClavesARedactar`) para SU payload y para su
//     logger (`crearLoggerSeguro(…, extra)`): WhatsApp, por ejemplo, marca `from` como
//     personal y `body` como texto libre. El logger genérico de la suite NO conoce esas
//     listas: por eso un campo de CREDENCIAL tiene que taparse sin ellas (`seTapaEnLosLogs`,
//     que validarConector exige).
//
// Lo que NO hace, a propósito: adivinar por entropía o por "parece un número de teléfono sin
// +". Eso borraría ids de pago, de pedido y hashes, que son lo que sirve para rastrear. Lo
// que no se puede decidir por forma lo decide la lista del conector. Tampoco tapa una clave
// sin forma conocida escrita en prosa sin "=" ni ":" ("el token abc venció"): taparía
// nuestros propios mensajes ("renovando el token vencido").
//
// PURO: sin dependencias, sin I/O. No muta la entrada.

export const MARCA_SECRETO = "[secreto]";
export const MARCA_DATO_PERSONAL = "[dato personal]";
export const MARCA_TEXTO = "[texto libre]";

/** Campos extra que un conector declara para su payload (nombres tal como vienen). */
export interface ClavesARedactar {
  secretas?: readonly string[];
  personales?: readonly string[];
  /** Texto libre escrito por una persona (el cuerpo de un mensaje): se guarda como "[texto libre]". */
  textos?: readonly string[];
}

/**
 * Para redactar un EVENTO CANÓNICO (contrato.ts) antes de guardarlo o loguearlo: el texto de
 * un mensaje es de una persona. `remitente` y `destinatario` ya son personales por la lista
 * general.
 */
export const CLAVES_EVENTO_CANONICO: ClavesARedactar = { textos: ["texto"] };

const PROFUNDIDAD_MAXIMA = 24;

/**
 * "X-Hub-Signature-256" → "xhubsignature256"; "access_token" → "accesstoken";
 * "Contraseña" → "contrasena" (sin la tilde la "ñ" se perdía y el nombre no se reconocía).
 */
export function normalizarClave(clave: string): string {
  const sinTildes = /[^\u0000-\u007f]/.test(clave) ? clave.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : clave;
  return sinTildes.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ── Campos secretos ──────────────────────────────────────────────────────────

/**
 * Si el nombre CONTIENE alguno de estos, es secreto. Castellano incluido: "clave", "llave",
 * "credencial" y "firma" tapan "clave_api", "claveFiscal", "llave_privada", "credenciales" o
 * "firma_webhook". Tapar de más sólo le quita detalle a un log; tapar de menos es una fuga.
 */
const SECRETO_CONTIENE = [
  "token",
  "secret",
  "password",
  "passwd",
  "contrasena",
  "contrasenia",
  "apikey",
  "authorization",
  "authcode",
  "cookie",
  "signature",
  "privatekey",
  "privkey",
  "consumerkey",
  "accesskey",
  "sessionid",
  "wrappeddek",
  "masterkey",
  "credential",
  "credencial",
  "clave",
  "llave",
  "firma",
  "pem",
] as const;

/** Si el nombre ES exactamente uno de estos, es secreto. */
const SECRETO_EXACTO = new Set([
  "ck",
  "cs",
  "key",
  "pass",
  "pwd",
  "pin",
  "otp",
  "auth",
  "sig",
  "hmac",
  "dek",
  "kek",
  "sealed",
  "cvv",
  "cvc",
  "securitycode",
  "cardnumber",
]);

export function esClaveSecreta(clave: string, extra?: ReadonlySet<string>): boolean {
  const n = normalizarClave(clave);
  if (!n) return false;
  if (extra?.has(n)) return true;
  if (SECRETO_EXACTO.has(n)) return true;
  // "X-Auth", "proxy_auth": el esquema de autenticación va al final del nombre.
  if (n.endsWith("auth")) return true;
  return SECRETO_CONTIENE.some((s) => n.includes(s));
}

/**
 * "code" es el código de autorización de OAuth (texto largo con dígitos, canjeable: Mercado
 * Pago "TG-…", Tiendanube 40 hex, Meta cientos de caracteres) pero también el código de un
 * error (190, "2034", "INVALID_ARGUMENT"). Se tapa sólo cuando parece lo primero.
 */
const LARGO_MINIMO_CODIGO_OAUTH = 12;
function esCodigoOAuth(clave: string, valor: unknown): boolean {
  return (
    normalizarClave(clave) === "code" &&
    typeof valor === "string" &&
    valor.length >= LARGO_MINIMO_CODIGO_OAUTH &&
    /\d/.test(valor)
  );
}

// ── Campos personales ────────────────────────────────────────────────────────

const PERSONAL_CONTIENE = [
  "email",
  "correo",
  "phone",
  "telefono",
  "celular",
  "movil",
  "mobile",
  "direccion",
  "domicilio",
  "address",
  "street",
  "zipcode",
  "codigopostal",
  "birth",
  "nacimiento",
  "identification",
  "docnumber",
  "documento",
  "firstname",
  "lastname",
  "fullname",
  "apellido",
  "ipaddress",
  // Vocabulario canónico (contrato.ts) y de los proveedores para quien manda o recibe.
  "remitente",
  "destinatario",
  "recipient",
] as const;

const PERSONAL_EXACTO = new Set([
  "mail",
  "tel",
  "dni",
  "cuit",
  "cuil",
  "cdi",
  "taxid",
  "nrodoc",
  "ip",
  "remoteaddr",
  "waid",
]);

/**
 * Ids de CUENTA del proveedor que contienen "phone" pero no son de una persona: el
 * phone_number_id de Meta es la cuenta externa que resuelve el negocio (E3 §2.4) y hace falta
 * para rastrear. El número visible (display_phone_number) sí se tapa.
 */
const NO_PERSONAL = new Set(["phonenumberid"]);

export function esClaveDatoPersonal(clave: string, extra?: ReadonlySet<string>): boolean {
  const n = normalizarClave(clave);
  if (!n) return false;
  if (extra?.has(n)) return true;
  if (NO_PERSONAL.has(n)) return false;
  if (PERSONAL_EXACTO.has(n)) return true;
  return PERSONAL_CONTIENE.some((s) => n.includes(s));
}


// ── Redacción de un texto ────────────────────────────────────────────────────
//
// Tiempo: cada expresión empieza en un punto que no puede repetirse dentro de una misma
// corrida de caracteres (un lookbehind `(?<![…])` con la misma clase, o un literal), así que
// cada corrida se recorre una vez: lineal. Sin eso, "a.a.a…" o "a@b.b.b…" de 64 KB tardaban
// segundos (cuadrático). El valor de una asignación lo mide `tramoDelValor`, un recorrido a
// mano que siempre avanza. Además el texto se recorta a `LARGO_MAXIMO_TEXTO` antes de mirarlo.

/** Más largo que esto no se mira entero: se recorta y se avisa cuánto se sacó. */
export const LARGO_MAXIMO_TEXTO = 8192;

/**
 * Parámetros de URL con credenciales. La mayoría ya los tapa el nombre (`taparAsignaciones`);
 * `code` (el código de OAuth canjeable) y `sig` no son nombres de secreto fuera de una URL.
 */
const RE_PARAMETRO_URL =
  /([?&#](?:access_token|refresh_token|token|api_key|apikey|key|client_secret|secret|password|signature|sig|code|hub\.verify_token)=)[^&#\s"']+/gi;
/** Usuario y contraseña en una URL ("postgres://usuario:clave@host"): se tapa la contraseña. */
const RE_CLAVE_EN_URL = /(\/\/[^\s/:@"'\\]{1,128}:)[^\s/@"'\\]{1,512}@/g;
/** "Bearer xxx" (en cualquier caja) copiado de un encabezado a un mensaje: queda el esquema. */
const RE_BEARER = /(?<![A-Za-z0-9_-])(bearer)\s+(?!\[secreto\])[A-Za-z0-9._~+/=-]{6,}/gi;
/** "Basic xxx": sólo con mayúscula, para no tapar "basic" en un texto en inglés. */
const RE_BASIC = /(?<![A-Za-z0-9_-])(Basic|BASIC)\s+(?!\[secreto\])[A-Za-z0-9._~+/=-]{6,}/g;
/** Llave privada PEM (RSA, EC, PKCS#8, cifrada, OpenSSH): hasta el END o hasta el final. */
const RE_PEM_PRIVADA =
  /-----BEGIN [A-Z0-9 ]{0,40}PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]{0,40}PRIVATE KEY-----|$)/g;

const PATRONES_SECRETO: readonly RegExp[] = [
  // JWT.
  /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g,
  // Token de Meta (WhatsApp Cloud): empiezan con EAA y son largos.
  /(?<![A-Za-z0-9])EAA[A-Za-z0-9]{20,}\b/g,
  // Token de Mercado Pago.
  /(?<![A-Za-z0-9_-])(?:APP_USR|TEST)-[A-Za-z0-9-]{16,}\b/g,
  // Claves REST de WooCommerce.
  /(?<![A-Za-z0-9])(?:ck|cs)_[A-Fa-f0-9]{20,}\b/g,
];

const PATRONES_PERSONAL: readonly RegExp[] = [
  // Email.
  /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
  // CUIT/CUIL con guiones.
  /\b(?:20|23|24|25|26|27|30|33|34)-\d{8}-\d\b/g,
  // Teléfono internacional con "+" (E.164, con espacios o guiones).
  /\+\d[\d\s-]{7,17}\d/g,
];

/**
 * Un NOMBRE seguido de "=" o ":", con o sin comillas (también escapadas): `token=…`,
 * `X-Api-Key: …`, `"clave_fiscal": …`, `\"access_token\":\"…\"`, `contraseña: …`. Sólo
 * reconoce el nombre y el separador: si el nombre es de secreto (`esClaveSecreta`, la MISMA
 * regla que para el campo de una estructura), `tramoDelValor` mide el valor y se tapa.
 */
const RE_NOMBRE_ASIGNADO = /(?<![A-Za-z0-9_.\u00C0-\u024F-])([A-Za-z0-9_.\u00C0-\u024F-]+)(?:\\*["'])?[ \t]*[=:][ \t]*/g;
/** Esquema de autorización al principio de un valor ("Bearer ", "Digest "): queda a la vista. */
const RE_ESQUEMA = /^(?:bearer|basic|token|digest|negotiate|ntlm|dpop|oauth|apikey|key|hmac[a-z0-9-]{0,20}|aws4-hmac-sha256)[ \t]+(?=\S)/i;
/** Caracteres que pueden ser parte de una clave. */
const CARACTER_DE_CLAVE = /[A-Za-z0-9._~+/=-]/;
/** Fin de un valor sin comillas. La coma también, salvo que la siga un carácter de clave ("ab,cd"). */
const FIN_DE_VALOR = /[\s&"'\\;}\])<>]/;
/**
 * Fin de un valor que ocupa la línea (Cookie, Authorization): el fin de línea o una barra (el
 * cierre de un JSON escapado). Las comillas no: `Digest username="u", response="…"` las trae.
 */
const FIN_DE_LINEA = /[\r\n\\]/;

/**
 * Encabezados cuyo valor es la línea entera: una cookie trae varios pares y cualquiera puede
 * ser la sesión; una autorización Digest trae varios parámetros.
 */
function esDeLineaEntera(nombre: string): boolean {
  const n = normalizarClave(nombre);
  return n.endsWith("authorization") || n.includes("cookie");
}

/**
 * Dónde está el valor de una asignación que empieza en `i`: [inicio, fin) de lo que se tapa.
 *  - Entre comillas: el contenido, sin las comillas (quedan). Escapadas: hasta la próxima barra.
 *  - Un objeto o lista JSON: entero, como el valor de un campo secreto en una estructura.
 *  - Sin comillas: hasta un espacio o separador; o hasta el fin de línea si `lineaEntera`.
 *  - Un esquema conocido adelante ("Bearer ") queda a la vista.
 * Recorre cada carácter a lo sumo una vez.
 */
function tramoDelValor(s: string, i: number, lineaEntera: boolean): [number, number] {
  if (s.startsWith(MARCA_SECRETO, i)) return [i, i + MARCA_SECRETO.length];
  let k = i;
  while (k < s.length && s[k] === "\\") k++;
  const comilla = s[k];
  if (comilla === '"' || comilla === "'") {
    let ini = k + 1;
    const esquema = RE_ESQUEMA.exec(s.slice(ini, ini + 64));
    if (esquema) ini += esquema[0].length;
    let j = ini;
    if (k === i) {
      // Comillas sin escapar (JSON): hasta la que cierra; "\x" es un escape.
      while (j < s.length && s[j] !== comilla && s[j] !== "\n" && s[j] !== "\r") j += s[j] === "\\" ? 2 : 1;
    } else {
      // Comillas escapadas (un JSON dentro de un texto): hasta la próxima barra.
      while (j < s.length && s[j] !== "\\" && s[j] !== "\n" && s[j] !== "\r") j++;
    }
    return [ini, Math.min(j, s.length)];
  }
  if (!lineaEntera && k === i && (s[i] === "{" || s[i] === "[")) {
    let profundidad = 0;
    let enTexto = false;
    let j = i;
    for (; j < s.length; j++) {
      const c = s[j];
      if (c === "\\") {
        j++;
        continue;
      }
      if (enTexto) {
        if (c === '"') enTexto = false;
        continue;
      }
      if (c === '"') enTexto = true;
      else if (c === "{" || c === "[") profundidad++;
      else if ((c === "}" || c === "]") && --profundidad === 0) {
        j++;
        break;
      }
    }
    return [i, Math.min(j, s.length)];
  }
  let ini = i;
  const esquema = RE_ESQUEMA.exec(s.slice(i, i + 64));
  if (esquema) ini += esquema[0].length;
  if (!lineaEntera && s.startsWith(MARCA_SECRETO, ini)) return [ini, ini + MARCA_SECRETO.length];
  let j = ini;
  if (lineaEntera) {
    while (j < s.length && !FIN_DE_LINEA.test(s[j])) j++;
  } else {
    while (j < s.length) {
      const c = s[j];
      if (c === "," ? !CARACTER_DE_CLAVE.test(s[j + 1] ?? "") : FIN_DE_VALOR.test(c)) break;
      j++;
    }
  }
  return [ini, j];
}

const LITERALES_VACIOS = new Set(["null", "undefined", "true", "false"]);

/**
 * Tapa el valor de cada `nombre=valor` / `nombre: valor` cuyo nombre es de secreto. Un nombre
 * que no lo es no consume su valor: adentro puede haber otra asignación (`detalle="token=x"`).
 */
function taparAsignaciones(s: string, secretasExtra?: ReadonlySet<string>): string {
  const re = RE_NOMBRE_ASIGNADO;
  re.lastIndex = 0;
  let salida = "";
  let cursor = 0;
  // Un texto repite nombres ("a=1&a=2…"): cada uno se clasifica una vez.
  const vistos = new Map<string, boolean>();
  for (let m = re.exec(s); m !== null; m = re.exec(s)) {
    const nombre = m[1];
    let secreto = vistos.get(nombre);
    if (secreto === undefined) vistos.set(nombre, (secreto = esClaveSecreta(nombre, secretasExtra)));
    const codigo = !secreto && normalizarClave(nombre) === "code";
    if (!secreto && !codigo) continue;
    const [ini, fin] = tramoDelValor(s, m.index + m[0].length, secreto && esDeLineaEntera(nombre));
    const valor = s.slice(ini, fin);
    // Un literal JSON vacío (`"token":null`) no es un valor: queda, como en una estructura.
    if (valor === "" || valor === MARCA_SECRETO || LITERALES_VACIOS.has(valor)) continue;
    if (codigo && !esCodigoOAuth("code", valor)) continue;
    salida += s.slice(cursor, ini) + MARCA_SECRETO;
    cursor = fin;
    re.lastIndex = fin;
  }
  re.lastIndex = 0;
  return salida + s.slice(cursor);
}

/**
 * Recorta un texto largo. Si el corte cae en medio de algo con forma de clave, se saca esa
 * corrida entera: un pedazo de token no se reconoce por su forma y quedaría en claro.
 */
function recortar(texto: string): string {
  if (texto.length <= LARGO_MAXIMO_TEXTO) return texto;
  let fin = LARGO_MAXIMO_TEXTO;
  if (CARACTER_DE_CLAVE.test(texto[fin])) {
    while (fin > 0 && CARACTER_DE_CLAVE.test(texto[fin - 1])) fin--;
  }
  return `${texto.slice(0, fin)}…[recortado: ${texto.length - fin} caracteres]`;
}

function textoRedactado(texto: string, secretasExtra?: ReadonlySet<string>): string {
  let s = recortar(texto).replace(RE_PEM_PRIVADA, MARCA_SECRETO);
  s = s.replace(RE_CLAVE_EN_URL, (_m, previo: string) => `${previo}${MARCA_SECRETO}@`);
  s = s.replace(RE_PARAMETRO_URL, (_m, nombre: string) => `${nombre}${MARCA_SECRETO}`);
  s = s.replace(RE_BEARER, (_m, esquema: string) => `${esquema} ${MARCA_SECRETO}`);
  s = s.replace(RE_BASIC, (_m, esquema: string) => `${esquema} ${MARCA_SECRETO}`);
  s = taparAsignaciones(s, secretasExtra);
  for (const re of PATRONES_SECRETO) s = s.replace(re, MARCA_SECRETO);
  for (const re of PATRONES_PERSONAL) s = s.replace(re, MARCA_DATO_PERSONAL);
  return s;
}

/**
 * Tapa en un texto libre lo que tiene forma de secreto o de dato personal, y el valor de toda
 * asignación cuyo nombre es de secreto (con las secretas extra de un conector, si vienen).
 */
export function redactarTexto(texto: string, extra?: ClavesARedactar): string {
  return textoRedactado(texto, extra ? reglasDe(extra).secretas : undefined);
}

// ── Redacción de estructuras ─────────────────────────────────────────────────

interface Reglas {
  secretas: ReadonlySet<string>;
  personales: ReadonlySet<string>;
  textos: ReadonlySet<string>;
}

function reglasDe(extra?: ClavesARedactar): Reglas {
  const set = (xs?: readonly string[]) =>
    new Set((Array.isArray(xs) ? xs : []).map((x) => normalizarClave(String(x))).filter(Boolean));
  return { secretas: set(extra?.secretas), personales: set(extra?.personales), textos: set(extra?.textos) };
}

/** El reemplazo de un campo por su nombre, o null si el nombre no dice nada. */
function marcaPorClave(clave: string, reglas: Reglas): string | null {
  if (esClaveSecreta(clave, reglas.secretas)) return MARCA_SECRETO;
  if (esClaveDatoPersonal(clave, reglas.personales)) return MARCA_DATO_PERSONAL;
  if (reglas.textos.has(normalizarClave(clave))) return MARCA_TEXTO;
  return null;
}

/**
 * Nombres (normalizados, así "Name" y "NAME" también) que acompañan a un par nombre/valor:
 * [{ name: "access_token", value: "…" }], { Name: "Authorization", Value: "…" }.
 */
const CLAVES_DE_NOMBRE = new Set(["name", "nombre", "key", "clave", "campo", "field", "header", "encabezado", "param", "parametro"]);
const CLAVES_DE_VALOR = new Set(["value", "valor", "val"]);
/** Un elemento de lista que puede ser el nombre del siguiente: sin espacios ni separadores. */
const RE_NOMBRE_EN_LISTA = /^[^\s=:]{1,128}$/;

function esPlano(v: object): boolean {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function redactarValor(v: unknown, reglas: Reglas, vistos: WeakSet<object>, prof: number): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === "string") return textoRedactado(v, reglas.secretas);
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "function" || typeof v === "symbol") return undefined;
  if (typeof v !== "object") return undefined;

  // Bytes: nunca se copian a un log ni a un payload guardado (pueden ser un archivo o una llave).
  if (v instanceof Uint8Array) return `[binario ${v.byteLength} bytes]`;
  if (v instanceof ArrayBuffer) return `[binario ${v.byteLength} bytes]`;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (v instanceof Error) return errorPlanoCon(v, reglas);

  if (prof >= PROFUNDIDAD_MAXIMA) return "[demasiado profundo]";
  if (vistos.has(v)) return "[ciclo]";
  vistos.add(v);
  try {
    if (Array.isArray(v)) return redactarLista(v, reglas, vistos, prof);
    if (v instanceof Map) {
      // Con claves que no son texto ni número no hay nombre que mirar: no se muestra el valor.
      if (!Array.from(v.keys()).every((k) => typeof k === "string" || typeof k === "number")) {
        return `[mapa con ${v.size} entradas]`;
      }
      return redactarObjeto(Object.fromEntries(Array.from(v.entries(), ([k, x]) => [String(k), x])), reglas, vistos, prof);
    }
    if (v instanceof Set) return Array.from(v, (x) => redactarValor(x, reglas, vistos, prof + 1));
    if (!esPlano(v)) {
      // Una URL, una clase propia: se representa por su texto (si lo tiene) ya redactado,
      // o por sus propiedades propias. Nunca se deja pasar el objeto tal cual.
      let texto: string;
      try {
        texto = String(v);
      } catch {
        return "[objeto sin representación]";
      }
      if (texto !== "[object Object]") return textoRedactado(texto, reglas.secretas);
    }
    return redactarObjeto(v as Record<string, unknown>, reglas, vistos, prof);
  } finally {
    vistos.delete(v);
  }
}

/**
 * Una lista. Si un elemento es un texto que nombra un secreto o un dato personal, el que lo
 * sigue se tapa: cubre el par [nombre, valor] (entradas de Headers, de un Map, de
 * URLSearchParams), la lista plana ["Nombre", "valor", …] (rawHeaders de Node) y
 * [nombre, valor, extra]. El resto se redacta elemento por elemento.
 */
function redactarLista(v: unknown[], reglas: Reglas, vistos: WeakSet<object>, prof: number): unknown[] {
  const salida: unknown[] = [];
  for (let i = 0; i < v.length; i++) {
    const x = v[i];
    salida.push(redactarValor(x, reglas, vistos, prof + 1));
    const marca = typeof x === "string" && RE_NOMBRE_EN_LISTA.test(x) ? marcaPorClave(x, reglas) : null;
    if (marca && i + 1 < v.length) {
      const siguiente = v[++i];
      salida.push(siguiente === null || siguiente === undefined ? siguiente : marca);
    }
  }
  return salida;
}

function redactarObjeto(
  o: Record<string, unknown>,
  reglas: Reglas,
  vistos: WeakSet<object>,
  prof: number,
): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  const entradas = Object.entries(o);
  // Par nombre/valor: si el "name" (en cualquier caja) dice que es un secreto, el "value" se tapa.
  let marcaDelPar: string | null = null;
  for (const [clave, nombre] of entradas) {
    if (typeof nombre === "string" && CLAVES_DE_NOMBRE.has(normalizarClave(clave))) {
      const m = marcaPorClave(nombre, reglas);
      if (m && (marcaDelPar === null || m === MARCA_SECRETO)) marcaDelPar = m;
    }
  }
  // defineProperty y no `salida[clave] =`: un payload con la clave "__proto__" (JSON.parse
  // la crea como propia) no puede cambiarle el prototipo a la copia.
  const poner = (clave: string, valor: unknown) =>
    Object.defineProperty(salida, clave, { value: valor, enumerable: true, writable: true, configurable: true });
  for (const [clave, valor] of entradas) {
    const marca = marcaPorClave(clave, reglas) ?? (esCodigoOAuth(clave, valor) ? MARCA_SECRETO : null);
    if (marca) {
      poner(clave, valor === null || valor === undefined ? valor : marca);
      continue;
    }
    if (marcaDelPar && CLAVES_DE_VALOR.has(normalizarClave(clave))) {
      poner(clave, valor === null || valor === undefined ? valor : marcaDelPar);
      continue;
    }
    const r = redactarValor(valor, reglas, vistos, prof + 1);
    if (r !== undefined) poner(clave, r);
  }
  return salida;
}

/**
 * Copia redactada de un valor cualquiera (payload de proveedor, contexto de log). No muta la
 * entrada. Los ciclos quedan como "[ciclo]" y lo muy anidado como "[demasiado profundo]".
 */
export function redactar(valor: unknown, extra?: ClavesARedactar): unknown {
  return redactarValor(valor, reglasDe(extra), new WeakSet(), 0);
}

// ── Errores y logger ─────────────────────────────────────────────────────────

/** Un nombre de error es un identificador ("TypeError", "SobreInvalidoError"); otra cosa no se muestra. */
const RE_NOMBRE_ERROR = /^[A-Za-z_$][A-Za-z0-9_$.]{0,63}$/;
/** Donde empiezan los marcos del stack de V8. */
const INICIO_MARCOS = "\n    at ";

function errorPlanoCon(err: unknown, reglas: Reglas): { name?: string; message: string; stack?: string } {
  if (err instanceof Error) {
    const name = RE_NOMBRE_ERROR.test(String(err.name)) ? String(err.name) : "Error";
    const message = textoRedactado(String(err.message), reglas.secretas);
    let stack: string | undefined;
    if (typeof err.stack === "string" && err.stack) {
      const i = err.stack.indexOf(INICIO_MARCOS);
      stack = `${name}: ${message}${i >= 0 ? textoRedactado(err.stack.slice(i), reglas.secretas) : ""}`;
    }
    return { name, message, ...(stack ? { stack } : {}) };
  }
  if (typeof err === "string") return { message: textoRedactado(err, reglas.secretas) };
  try {
    return { message: JSON.stringify(redactarValor(err, reglas, new WeakSet(), 0)) ?? String(err) };
  } catch {
    return { message: "[error sin representación]" };
  }
}

/**
 * Un error como objeto plano con el mensaje y el stack ya redactados. El nombre sólo pasa si
 * es un identificador, y la primera línea del stack (que repite nombre y mensaje) se rearma
 * con los ya redactados: un secreto sin forma reconocible en `name` no llega por ahí.
 */
export function errorPlano(err: unknown, extra?: ClavesARedactar): { name?: string; message: string; stack?: string } {
  return errorPlanoCon(err, reglasDe(extra));
}

/** Un Error nuevo con nombre, mensaje y stack redactados (así el logger lo serializa igual). */
function errorRedactado(err: unknown, reglas: Reglas): Error {
  const plano = errorPlanoCon(err, reglas);
  const e = new Error(plano.message);
  if (plano.name) e.name = plano.name;
  e.stack = plano.stack ?? `${e.name}: ${plano.message}`;
  return e;
}

/** La forma del logger del Core (src/lib/logger.ts), sin importarlo. */
export interface LoggerBase {
  error(scope: string, msg: string, err?: unknown, ctx?: Record<string, unknown>): void;
  warn(scope: string, msg: string, ctx?: Record<string, unknown>): void;
  info(scope: string, msg: string, ctx?: Record<string, unknown>): void;
}

function comoObjeto(r: unknown): Record<string, unknown> {
  return r && typeof r === "object" && !Array.isArray(r) ? (r as Record<string, unknown>) : { contexto: r };
}

/**
 * Envuelve un logger: el scope, el mensaje, el contexto y el error pasan por la redacción
 * antes de llegar al logger real.
 *
 * `contextoAmbiente`: lo que el logger real agrega por su cuenta DESPUÉS (el contexto del
 * request, src/lib/request-context.ts, que acepta cualquier clave). Se lee acá, se redacta y
 * se manda como contexto explícito: el logger del Core mezcla `{ ...ambiente, ...ctx }`, así
 * que la copia redactada pisa a la cruda clave por clave.
 *
 * `extra`: las claves propias de UN conector (su `redaccion`), para el logger de ese conector
 * (log.ts → `logDelConector`). Sin `extra` (logIntegraciones) sólo rige la lista general: por
 * eso validarConector exige que cada campo de credencial se tape sin listas extra.
 */
export function crearLoggerSeguro(
  base: LoggerBase,
  contextoAmbiente?: () => Record<string, unknown> | undefined,
  extra?: ClavesARedactar,
): LoggerBase {
  const reglas = reglasDe(extra);
  const texto = (t: unknown) => textoRedactado(String(t), reglas.secretas);
  const ctxSeguro = (ctx: Record<string, unknown> | undefined): Record<string, unknown> | undefined => {
    let ambiente: Record<string, unknown> | undefined;
    try {
      ambiente = contextoAmbiente?.();
    } catch {
      ambiente = undefined;
    }
    if (ctx === undefined && ambiente === undefined) return undefined;
    return {
      ...(ambiente === undefined ? {} : comoObjeto(redactarValor(ambiente, reglas, new WeakSet(), 0))),
      ...(ctx === undefined ? {} : comoObjeto(redactarValor(ctx, reglas, new WeakSet(), 0))),
    };
  };
  return {
    error(scope, msg, err, ctx) {
      base.error(texto(scope), texto(msg), err === undefined ? undefined : errorRedactado(err, reglas), ctxSeguro(ctx));
    },
    warn(scope, msg, ctx) {
      base.warn(texto(scope), texto(msg), ctxSeguro(ctx));
    },
    info(scope, msg, ctx) {
      base.info(texto(scope), texto(msg), ctxSeguro(ctx));
    },
  };
}

/** Un valor de prueba sin ninguna forma conocida: si aparece en la salida, no se tapó. */
const SONDA = "sonda-de-redaccion-Qz7x41";

/**
 * ¿Un campo con este nombre sale tapado por el logger de la suite SIN las listas de ningún
 * conector? Ejecuta la misma redacción que `crearLoggerSeguro`: como campo del contexto, como
 * par de una lista, escrito en un mensaje ("campo=…", "campo: …", JSON) y en el mensaje de un
 * error. validarConector lo exige a cada campo de credencial: `redaccion.secretas` tapa el
 * payload guardado y el logger del conector, pero no `logIntegraciones`.
 */
export function seTapaEnLosLogs(campo: string): boolean {
  if (typeof campo !== "string" || !campo) return false;
  const reglas = reglasDe();
  const salidas = [
    JSON.stringify(redactarValor({ [campo]: SONDA }, reglas, new WeakSet(), 0)),
    JSON.stringify(redactarValor([campo, SONDA], reglas, new WeakSet(), 0)),
    textoRedactado(`${campo}=${SONDA}`),
    textoRedactado(`${campo}: ${SONDA}`),
    textoRedactado(JSON.stringify({ [campo]: SONDA })),
    errorPlanoCon(new Error(`${campo}: ${SONDA}`), reglas).message,
  ];
  return salidas.every((s) => !s.includes(SONDA));
}
