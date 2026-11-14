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
import type { ContextoDeReloj } from "./decisiones-core";

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
const RE_URL_CON_CLAVE = /(?<![a-z0-9+.-])([a-z][a-z0-9+.-]*:\/\/[^\s:@/]*:)[^\s@]{1,200}@/gi;

// ── Secretos anunciados por una etiqueta: criterio ESTRUCTURAL, que falla cerrado ───────────────
//
// No se reconoce la FORMA de «etiqueta + separador + valor» (cada redacción nueva se escapaba). La
// regla es de vocabulario: en la línea que nombra una etiqueta sensible, lo que viene después queda a
// la vista SÓLO si cada palabra es de una lista cerrada de palabras de charla (PALABRAS_SEGURAS).
// Cualquier otra cosa —una palabra desconocida, un número, un mail, un símbolo— es el secreto, y se
// tapa desde ahí hasta la última palabra desconocida de la línea. Encima:
// - tras «:», «=», «-» o una flecha, ni siquiera las palabras conocidas se salvan si no arrancan como
//   una frase de charla («clave: no puedo entrar» queda; «clave: caja lunes» se tapa);
// - tras «es», «era», «son»…, se salvan sólo si sigue un adjetivo de estado («es incorrecta»);
// - si la línea termina en la etiqueta o en un separador, el valor está en la línea siguiente;
// - «Hunter2x es la clave»: lo desconocido que está antes de «es la <etiqueta>» también se tapa.
// El tapado de más está aceptado: el tipo y la prioridad salen del texto crudo.

/**
 * Palabras que anuncian un secreto (sobre el texto en minúsculas y sin tildes). La segunda rama
 * encuentra la raíz pegada a cualquier cosa («DB_PASSWORD=», «mypassword1:», «contrasenita»).
 */
const RE_ETIQUETA =
  /(?<![\p{L}\p{N}])(?:contrasen(?:i)?as?|(?<!(?:^|[^\p{L}])en )contras?|claves?|clabes?|calves?|passwords?|passwd|pass|pwd|pswd?|pw|pins?|tokens?|api[ _-]?keys?|apikeys?|keys?|secrets?|secretos?|cvv2?|cvc2?|(codigos?|cod)|otp|2fa|mfa|credencial(?:es)?|logins?|log[ -]in|datos de (?:acceso|ingreso|la cuenta)|cbu|cvu)(?![\p{L}])|password|passwd|pwd|contrasen|apikey/gu;
/** Palabras candidatas a ser una etiqueta mal tipeada («contaseña», «pasword», «credensiales»). */
const RE_CANDIDATA = /(?<![\p{L}\p{N}])[cp]\p{L}{5,13}(?![\p{L}])/gu;
const MAL_TIPEADAS: readonly [string, number][] = [["contrasena", 2], ["password", 1], ["credencial", 2]];
/** Un «código» que no es un secreto: «código de barras», «código postal», «código de error 500». */
const RE_CODIGO_COMUN =
  /\.?[ \t]{1,3}(?:de(?:l| la| el)?[ \t]{1,3})?(?:barras?|productos?|articulos?|postal|area|clientes?|proveedor|proveedores|error|errores|item|sku|rubro|qr|fuente|pais|respuesta|estado)(?![\p{L}\p{N}])/uy;

/**
 * Lo ÚNICO que puede seguir a una etiqueta sin taparse: palabras de charla de un pedido de soporte.
 * Sin tildes, en minúsculas. Lo que no está acá se tapa. No se agregan nombres propios ni palabras
 * que alguien usaría de contraseña.
 */
const PALABRAS_SEGURAS = new Set(
  `a al algo alguien alguna alguno ante antes aqui aca ahi alla asi aun aunque ayer bien cada casi como con contra cual
  cuales cuando cuanto de del desde donde dos durante e el ella ellos en entonces entre era eran es esa ese eso esas esos
  esta este esto estas estos estaba estan estoy fue fueron ha habia hace hacia han hasta hay hoy la las le les lo los luego
  mas me mi mis mientras mismo misma mucho mucha muchas muchos muy nada nadie ni no nos nunca o otra otro otras otros para
  pero poco por porque pues que quien se sea segun ser seria sera si sido siempre sin sino sobre solo son soy su sus tal
  tambien tampoco tan tanto te tengo tiene tienen tenemos tenia tenes todo toda todos todas tu tus un una uno unas unos
  usted ustedes va van vez veces vos y ya yo nosotros
  anda andan andaba anduvo funciona funcionan funcionaba funca puedo puede pueden podemos podes pude pudo podria podrian
  entrar entra entro entre ingresar ingresa ingreso acceder accede acceso accesos sale salio salir carga cargar cargo
  abre abrir abrio deja dejan dejo dejaba pide piden pidio pedir dice dicen dijo decir tira tiro da dan dio dar llega
  llego llegan llegar acepta aceptan toma tomo reconoce sirve sirven vale valida valido aparece aparecen pasa paso pasar
  olvide olvido olvidamos olvidar acuerdo acuerda acordar recuerdo recuerda recordar perdi perdio perdimos perder cambie
  cambio cambiar cambiamos cambiaron recuperar recupero resetear reseteo reseteen blanquear blanqueo blanqueen restablecer
  restablezcan generar genero mandar manden mando mandaron mandame enviar envien envio enviaron pasen pasame pasaron pase
  dieron dio darme den necesito necesita necesitamos quiero quiere queremos queria se saber sabe sabemos hacer hago hace
  hacemos hice hizo usar uso usa usamos poner pongo puse pone tener pedi pido probar probe probamos intento intente
  intentar intentamos ayuda ayudar ayudan ayudenme ayudame ver veo vi fijarse fijan fijense revisar revisan revisen
  incorrecta incorrecto incorrectas invalida invalido correcta correcto vencida vencido vencio vence vencieron expiro
  expirada bloqueada bloqueado bloqueo bloquearon mal mala malo equivocada equivocado nueva nuevo nuevas nuevos vieja
  viejo anterior actual misma mismo igual distinta distinto provisoria provisorio temporal siguiente errada erronea
  lento lenta urgente necesaria necesario obligatoria obligatorio
  problema problemas error errores falla fallas sistema caja factura facturas facturar facturacion usuario usuarios
  cuenta cuentas mail correo email celular telefono mensaje mensajes sms whatsapp wsp banco homebanking tarjeta app erp
  arca afip fiscal empresa negocio local sucursal posnet pad wifi pantalla pagina sitio web portal seguridad
  verificacion autenticacion ingresos dato datos numero nro vez intentos intento
  lunes martes miercoles jueves viernes sabado domingo manana tarde noche semana mes dia dias ahora recien todavia
  gracias saludos porfa favor hola buenas buen buenos
  clave claves contrasena contrasenas password pass pin token codigo codigos`.split(/\s+/),
);
/** Tras un separador explícito, sólo estos comienzos (dos palabras) son charla y no un valor. */
const CHARLA = new Set([
  "no puedo", "no me", "no anda", "no funciona", "no funca", "no entra", "no entro", "no se", "no sale", "no tengo", "no deja",
  "no la", "no lo", "no carga", "no abre", "no recuerdo", "no llega", "no llego", "me dice", "me sale", "me da", "me pide",
  "me tira", "me olvide", "se me", "se bloqueo", "se vencio", "la olvide", "la perdi", "la cambie", "ya no", "muchas gracias",
]);
/** Una sola palabra que, sola en la línea que sigue a una etiqueta, es charla. */
const CHARLA_SOLA = new Set(["gracias", "saludos"]);
/** Tras «es», «era»…, lo único que no es un valor: un adjetivo de estado o un conector. */
const TRAS_COPULA = new Set([
  "incorrecta", "incorrecto", "invalida", "invalido", "correcta", "correcto", "nueva", "nuevo", "vieja", "viejo", "necesaria",
  "necesario", "obligatoria", "obligatorio", "urgente", "igual", "mala", "malo", "lento", "lenta", "que", "de", "del", "para",
  "muy", "no", "porque", "como", "provisoria", "provisorio", "temporal", "erronea", "errada", "equivocada",
]);
const COPULA = new Set(["es", "era", "son", "eran", "fue", "seria", "sera", "quedo"]);
/** Entre «es» y la etiqueta, al revés: «Hunter2x es LA NUEVA clave». */
const DETERMINANTES = new Set(["la", "el", "mi", "tu", "su", "las", "los", "mis", "una", "un", "nueva", "nuevo", "nuestra"]);
const SEPARADORES = new Set([":", "=", "->", "=>", "→", "⇒", "-", "–", "—"]);
/** Comilla que abre → comilla que cierra (una contraseña entre comillas puede tener espacios). */
const COMILLAS: Readonly<Record<string, string>> = { '"': '"', "'": "'", "«": "»", "“": "”", "`": "`" };
const COMILLADO_MAX = 256;
const ABRE = "¿¡(";
const CIERRA = ".,;:!?)…=";
/** Lo que puede quedar pegado a la etiqueta sin ser un valor («clave?», «"clave"», «clave.»). */
const PEGADO_A_ETIQUETA = ".,;!?)…\"'»”`";
const RE_SOLO_EMOJI = /^[\p{Extended_Pictographic}‍️\u{1F3FB}-\u{1F3FF}]+$/u;

/** Distancia de edición (con trasposición) entre dos palabras cortas, ¿≤ tope? */
function parecida(a: string, b: string, tope: number): boolean {
  if (Math.abs(a.length - b.length) > tope) return false;
  let pp: number[] = [];
  let p: number[] = [];
  for (let k = 0; k <= b.length; k++) p.push(k);
  for (let i = 1; i <= a.length; i++) {
    const f = [i];
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(p[j] + 1, f[j - 1] + 1, p[j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, pp[j - 2] + 1);
      f.push(v);
    }
    pp = p;
    p = f;
  }
  return p[b.length] <= tope;
}

interface Etiqueta {
  ini: number;
  fin: number;
}

/** Todas las etiquetas del texto `n` (minúsculas, sin tildes), en orden y sin solaparse. */
function etiquetasDe(n: string): Etiqueta[] {
  const lista: Etiqueta[] = [];
  const re = new RegExp(RE_ETIQUETA.source, RE_ETIQUETA.flags);
  for (let m = re.exec(n); m; m = re.exec(n)) {
    const fin = m.index + m[0].length;
    if (m[1]) {
      RE_CODIGO_COMUN.lastIndex = fin;
      if (RE_CODIGO_COMUN.test(n)) continue;
    }
    lista.push({ ini: m.index, fin });
  }
  const cand = new RegExp(RE_CANDIDATA.source, RE_CANDIDATA.flags);
  let hubo = false;
  const vistas = new Map<string, boolean>(); // la misma palabra repetida se mide una vez
  for (let m = cand.exec(n); m; m = cand.exec(n)) {
    let es = vistas.get(m[0]);
    if (es === undefined) {
      const w = m[0].endsWith("s") ? m[0].slice(0, -1) : m[0];
      es = !PALABRAS_SEGURAS.has(m[0]) && MAL_TIPEADAS.some(([t, d]) => w[0] === t[0] && w !== t && parecida(w, t, d));
      if (vistas.size < 2000) vistas.set(m[0], es);
    }
    if (!es) continue;
    lista.push({ ini: m.index, fin: m.index + m[0].length });
    hubo = true;
  }
  if (hubo) lista.sort((a, b) => a.ini - b.ini);
  return lista;
}

/** Las palabras de una línea, con lo que hace falta para decidir sin volver a leerla. */
interface Linea {
  ini: number;
  fin: number;
  /** Por palabra: dónde empieza y termina, su núcleo sin puntuación, y si separa (1 «:», 2 «es»). */
  a: number[];
  b: number[];
  nucleo: string[];
  sep: number[];
  /** Índice de la próxima palabra desconocida desde k (o -1) y del próximo separador desde k (o -1). */
  sigInsegura: number[];
  sigSep: number[];
  /** Último separador hasta k inclusive (o -1). */
  antSep: number[];
  ultimaInsegura: number;
}

const RE_FICHA = /\S+/g;

function leerLinea(n: string, ini: number, fin: number): Linea {
  const L: Linea = { ini, fin, a: [], b: [], nucleo: [], sep: [], sigInsegura: [], sigSep: [], antSep: [], ultimaInsegura: -1 };
  const insegura: boolean[] = [];
  const texto = n.slice(ini, fin);
  RE_FICHA.lastIndex = 0;
  for (let m = RE_FICHA.exec(texto); m; m = RE_FICHA.exec(texto)) {
    const w = m[0];
    let x = 0;
    let y = w.length;
    while (x < y && ABRE.includes(w[x])) x++;
    while (y > x && CIERRA.includes(w[y - 1])) y--;
    let nucleo = y - x <= 24 ? w.slice(x, y) : "";
    let sep = 0;
    let mala: boolean;
    if (SEPARADORES.has(w)) {
      sep = 1;
      mala = false;
      nucleo = "";
    } else {
      for (let k = y; k < w.length; k++) if (w[k] === ":" || w[k] === "=") sep = 1;
      if (y === x) mala = false; // sólo puntuación
      else if (y - x > 24) mala = true;
      else if (PALABRAS_SEGURAS.has(nucleo)) mala = false;
      else if (nucleo.includes(TAPADO)) mala = nucleo.split(TAPADO).join("") !== "";
      else mala = !RE_SOLO_EMOJI.test(nucleo);
      if (!mala && !sep && COPULA.has(nucleo)) sep = 2;
    }
    L.a.push(ini + m.index);
    L.b.push(ini + m.index + w.length);
    L.nucleo.push(nucleo);
    L.sep.push(sep);
    insegura.push(mala);
  }
  const c = L.a.length;
  let si = -1;
  let ss = -1;
  L.sigInsegura = new Array<number>(c + 1).fill(-1);
  L.sigSep = new Array<number>(c + 1).fill(-1);
  for (let k = c - 1; k >= 0; k--) {
    if (insegura[k]) {
      si = k;
      if (L.ultimaInsegura < 0) L.ultimaInsegura = k;
    }
    if (L.sep[k]) ss = k;
    L.sigInsegura[k] = si;
    L.sigSep[k] = ss;
  }
  let as = -1;
  for (let k = 0; k < c; k++) {
    if (L.sep[k]) as = k;
    L.antSep.push(as);
  }
  return L;
}

/** ¿La palabra j de la línea abre una frase de charla («no puedo…», «¿cuál…», «gracias»)? */
function abreCharla(n: string, L: Linea, j: number): boolean {
  const c = n[L.a[j]];
  if (c === "¿" || c === "¡") return true;
  if (j + 1 < L.a.length) return CHARLA.has(`${L.nucleo[j]} ${L.nucleo[j + 1]}`);
  return CHARLA_SOLA.has(L.nucleo[j]);
}

/** ¿Lo que sigue al separador `tipo` (1 «:», 2 «es») desde la palabra j es charla y no un valor? */
function charlaTrasSeparador(n: string, L: Linea, tipo: number, j: number): boolean {
  return tipo === 2 ? TRAS_COPULA.has(L.nucleo[j]) : abreCharla(n, L, j);
}

/**
 * Tapa lo que anuncian las etiquetas. `s` es el texto y `n` su copia en minúsculas y sin tildes, del
 * mismo largo. Lineal: cada línea se lee una sola vez y cada etiqueta se resuelve con las tablas de
 * la línea (próxima palabra desconocida, próximo separador), sin volver a recorrerla.
 */
function taparPorEtiquetas(s: string, n: string, contar: () => void): string {
  const etiquetas = etiquetasDe(n);
  if (!etiquetas.length) return s;
  let salida = "";
  let ultimo = 0;
  const tapar = (desde: number, hasta: number) => {
    const d = Math.max(desde, ultimo);
    if (hasta <= d) return;
    salida += s.slice(ultimo, d) + TAPADO;
    ultimo = hasta;
    contar();
  };
  /** Hasta dónde se tapa desde `desde` en la línea: la última palabra desconocida y, si abre comilla, su cierre. */
  const finDeTapado = (L: Linea, desde: number, minimo: number): number => {
    let hasta = Math.max(minimo, L.ultimaInsegura >= 0 ? L.b[L.ultimaInsegura] : 0);
    const cierre = COMILLAS[s[desde]];
    if (cierre) {
      const k = s.slice(desde + 1, Math.min(L.fin, desde + 1 + COMILLADO_MAX)).indexOf(cierre);
      if (k > 0) hasta = Math.max(hasta, desde + 1 + k + 1);
    }
    return hasta;
  };
  const lineaEn = (pos: number): Linea => {
    const ini = n.lastIndexOf("\n", pos - 1) + 1;
    let fin = n.indexOf("\n", pos);
    if (fin < 0) fin = n.length;
    return leerLinea(n, ini, fin);
  };
  /** El valor está en la línea que sigue: se tapa entera, salvo que sea pura charla. */
  let siguienteHecha = -1;
  const taparLineaSiguiente = (L: Linea): void => {
    if (siguienteHecha === L.ini) return; // una vez por línea
    siguienteHecha = L.ini;
    let p = L.fin;
    while (p < n.length && /\s/.test(n[p])) p++;
    if (p >= n.length) return;
    const S = lineaEn(p);
    const c = S.a.length;
    if (S.sigInsegura[0] >= 0) tapar(S.a[0], finDeTapado(S, S.a[0], 0));
    else if (!abreCharla(n, S, 0)) tapar(S.a[0], S.b[c - 1]);
  };

  let L: Linea | null = null;
  let t = 0; // la palabra de la línea donde está la etiqueta
  for (const e of etiquetas) {
    if (e.ini < ultimo) continue;
    if (!L || e.ini >= L.fin) {
      L = lineaEn(e.ini);
      t = 0;
    }
    const c = L.a.length;
    while (t < c && L.b[t] <= e.ini) t++;
    if (t >= c) continue;
    const t0 = t; // donde empieza la etiqueta («datos de acceso» ocupa tres palabras)
    while (t < c - 1 && L.b[t] < e.fin) t++;

    // Al revés: «Hunter2x es la clave». Lo desconocido antes de «es [la] <etiqueta>» se tapa.
    let r = t0 - 1;
    for (let k = 0; k < 3 && r >= 0 && DETERMINANTES.has(L.nucleo[r]); k++) r--;
    if (r >= 0 && L.sep[r] === 2) {
      let primera = -1;
      let ultima = -1;
      for (let k = r - 1; k >= 0 && k >= r - 12 && L.a[k] >= ultimo; k--) {
        if (L.sigInsegura[k] === k) {
          primera = k;
          if (ultima < 0) ultima = k;
        }
      }
      if (primera >= 0) tapar(L.a[primera], L.b[ultima]);
    }

    // Lo pegado a la etiqueta: «clave_fiscal:», «pass":», «clave?», «pin:1234», «pass[X]».
    let k = t + 1; // primera palabra después de la etiqueta
    let tipo = 0; // el separador que trae la propia etiqueta
    let pendiente = false;
    const finFicha = L.b[t];
    if (e.fin < finFicha) {
      let p = e.fin;
      while (p < finFicha && p - e.fin < 40 && n[p] !== ":" && n[p] !== "=") p++;
      if (p < finFicha && (n[p] === ":" || n[p] === "=")) {
        tipo = 1;
        if (p + 1 < finFicha) {
          // «pin:1234», «{"pass":"X"}»: el valor está pegado al separador.
          tapar(p + 1, finDeTapado(L, p + 1, finFicha));
          pendiente = true;
        }
      } else {
        let q = e.fin;
        while (q < finFicha && q - e.fin < 8 && PEGADO_A_ETIQUETA.includes(n[q])) q++;
        if (q < finFicha) {
          tapar(e.fin, finDeTapado(L, e.fin, finFicha));
          pendiente = true;
        }
      }
    }
    if (pendiente) {
      // Ya se tapó hasta la última palabra desconocida. Si la línea termina en «:», el valor sigue abajo.
      const z = n[L.b[c - 1] - 1];
      if (z === ":" || z === "=") {
        taparLineaSiguiente(L);
      }
      continue;
    }

    if (k >= c) {
      // La línea termina en la etiqueta: el valor está en la que sigue.
      taparLineaSiguiente(L);
      continue;
    }
    const u = L.sigInsegura[k];
    // El primer separador después de la etiqueta (el propio, si lo trae).
    const s1 = tipo ? k - 1 : L.sigSep[k];
    const tipo1 = tipo || (s1 >= 0 ? L.sep[s1] : 0);
    if (u >= 0) {
      let desde: number;
      if (tipo1 === 1 && s1 < u && !abreCharla(n, L, s1 + 1)) desde = L.a[s1 + 1];
      else {
        const sa = L.antSep[u - 1] >= k ? L.antSep[u - 1] : -1;
        desde = sa >= 0 ? L.a[sa + 1] : L.a[u];
      }
      tapar(desde, finDeTapado(L, desde, 0));
      const z = n[L.b[c - 1] - 1];
      if (z === ":" || z === "=") {
        taparLineaSiguiente(L);
      }
      continue;
    }
    // Todo lo que sigue son palabras conocidas: se salvan sólo si los separadores dan paso a charla.
    if (s1 < 0 && !tipo) continue;
    const s2 = L.antSep[c - 1] >= k ? L.antSep[c - 1] : s1;
    if (s2 + 1 >= c) {
      // Termina en un separador: lo anterior tiene que ser charla y el valor está en la línea que sigue.
      if (s1 !== s2 && s1 + 1 < c && !charlaTrasSeparador(n, L, tipo1, s1 + 1)) tapar(L.a[s1 + 1], L.b[c - 1]);
      taparLineaSiguiente(L);
      continue;
    }
    if (!charlaTrasSeparador(n, L, tipo1, s1 + 1)) tapar(L.a[s1 + 1], L.b[c - 1]);
    else if (s2 !== s1 && !charlaTrasSeparador(n, L, L.sep[s2], s2 + 1)) tapar(L.a[s2 + 1], L.b[c - 1]);
  }
  return salida + s.slice(ultimo);
}

/** Sin tildes pero conservando el largo (para usar los índices sobre el original). */
function normalizarConLargo(s: string): string {
  // Sólo las mayúsculas y lo que no es ASCII necesitan trabajo: el resto pasa tal cual.
  return s.replace(/[A-Z]|[^\x00-\x7f]/gu, (c) => {
    const x = normalizar(c);
    return x.length === c.length ? x : c;
  });
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
const RE_ANUNCIA_CAE = /(?<![a-z])caea?(?![a-z])[^\n\d]{0,16}$/i;
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
      // Punto de venta y número de factura («00001-00001234»): no es una tarjeta aunque pase Luhn.
      if (b === a + 1 && partes[2 * a + 1] === "-" && (nums[a].length === 4 || nums[a].length === 5) && nums[b].length === 8) continue;
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

  // Etiquetas: lo que anuncian se tapa por vocabulario (ver «criterio ESTRUCTURAL» arriba).
  s = taparPorEtiquetas(s, normalizarConLargo(s), contar);

  // Tarjetas y CBU/CVU.
  if (opciones.numeros !== false) {
    s = s.replace(RE_TIRADA, (tirada: string, pos: number, todo: string) => {
      const digitos = tirada.replace(/\D/g, "");
      if (digitos.length < 13) return tirada;
      // Un celular argentino con prefijo («+54 9 11 5555-0000») hace falta para contestar.
      if (digitos.length === 13 && digitos.startsWith("549") && todo[pos - 1] === "+") return tirada;
      // El CAE (14 dígitos seguidos, anunciado por la palabra) es un dato del comprobante.
      if (tirada.length === 14 && digitos.length === 14 && RE_ANUNCIA_CAE.test(todo.slice(Math.max(0, pos - 24), pos))) return tirada;
      return taparTirada(tirada, contar);
    });
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
  "rechaz", "trabad", "colgad", "bug", "se borro", "desaparec", "no funca", "se colgo", "se cuelga", "se trabo", "se traba",
  "se tildo", "se tilda", "anda mal", "no anduvo",
];

/** «problema» si el texto suena a algo que no anda; si no, «consulta». PURA. */
export function tipoDeMensaje(texto: string): "problema" | "consulta" {
  // «no ME anda», «no NOS factura»: el pronombre del medio no cambia el problema.
  const n = ` ${normalizar(texto).replace(/\s+/g, " ")} `.replace(/ no (?:me|nos|te|le|les|se) /g, " no ");
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
 * texto crudo y la prioridad, del tipo. El vencimiento sigue D2 (`reloj`: si el negocio está en vivo). PURA.
 */
export function ticketDesdeMensaje(m: MensajeEntrante, ahora: Date, reloj: ContextoDeReloj = {}): ResultadoMensaje {
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
  // Un remitente gigante se rechaza sin recorrerlo (con margen para espacios de más).
  if (typeof m.remitente === "string" && m.remitente.length > 20 * REMITENTE_MAX) return { ok: false, motivo: `El remitente pasa de ${REMITENTE_MAX} caracteres.` };
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
      venceEl: venceElPara(prioridad, ahora, reloj),
    },
  };
}
