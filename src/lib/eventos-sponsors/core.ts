// ============================================================================
// EVENTOS Y SPONSORS — núcleo PURO (GSG-CRM-009 · pedido de MIA Producciones, 14/11/2026).
// ============================================================================
//
// Lo que relevó el equipo de agentes: los eventos de una región y las marcas que van a cada uno,
// con la URL donde se vio. Acá vive lo que no toca la base: la llave que impide duplicar, la
// validación del lote que se importa y los filtros de la pantalla.
//
// REGLA DURA: sólo hechos públicos de EMPRESAS. Ningún dato de contacto de personas: un lote que
// trae mails, teléfonos o campos de contacto se rechaza entero, no se «limpia» en silencio.

/** Roles de una marca en un evento. Mismo set que el CHECK de la migración. */
export const ROLES = ["SPONSOR_PRINCIPAL", "SPONSOR", "AUSPICIANTE", "MEDIA_PARTNER", "EXPOSITOR", "ORGANIZADOR", "OTRO"] as const;
export type Rol = (typeof ROLES)[number];

export const ETIQUETA_ROL: Record<Rol, string> = {
  SPONSOR_PRINCIPAL: "Sponsor principal",
  SPONSOR: "Sponsor",
  AUSPICIANTE: "Auspiciante",
  MEDIA_PARTNER: "Media partner",
  EXPOSITOR: "Expositor",
  ORGANIZADOR: "Organizador",
  OTRO: "Otro",
};

/** Lo que dijo el Verificador del equipo de agentes. Mismo set que el CHECK de la migración. */
export const VERIFICACIONES = ["confirmado", "en duda", "falla", "sin verificar"] as const;
export type Verificacion = (typeof VERIFICACIONES)[number];

/**
 * Los puestos del equipo de agentes (diseño: Factory-GSG 20-PRODUCTO/crm-eventos/EQUIPO-AGENTES-EVENTOS.md).
 * Mismo set que el CHECK de la migración. «contactos», «redactor» y «seguidor» quedan registrados,
 * pero este módulo no guarda contactos ni borradores todavía.
 */
export const PUESTOS = ["descubridor", "identificador", "verificador", "contactos", "redactor", "seguidor"] as const;
export type Puesto = (typeof PUESTOS)[number];
export const ETIQUETA_PUESTO: Record<Puesto, string> = {
  descubridor: "Descubridor",
  identificador: "Identificador de marcas",
  verificador: "Verificador",
  contactos: "Buscador de contactos",
  redactor: "Redactor",
  seguidor: "Seguidor",
};

/** Una línea del registro: qué puesto hizo qué, cuándo y con qué fuente. */
export interface AccionDeLote {
  puesto: Puesto;
  accion: string;
  hora: string;
  url: string | null;
  detalle: string | null;
}
export const MAX_REGISTRO_POR_ITEM = 20;

/** Topes del lote: una importación es una corrida del equipo de agentes, no un volcado. */
export const MAX_EVENTOS = 500;
export const MAX_MARCAS_POR_EVENTO = 200;
export const MAX_TEXTO = 300;
export const MAX_URL = 1000;
export const MAX_BYTES_LOTE = 2_000_000;
/** Tope de marcas-en-evento por lote: mantiene la importación (una transacción) muy lejos del timeout. */
export const MAX_RELACIONES = 1_000;
/** Tope de líneas de registro por lote (las que pasan de acá no se guardan; se avisa). */
export const MAX_ACCIONES = 2_000;

/** Minúsculas, sin acentos, sin signos y con un solo espacio. «Expo  Agro, 2026» → «expo agro 2026». */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** La llave de un evento: nombre + fecha de inicio + región. Dos corridas que lo ven igual no lo duplican. */
export function claveEvento(nombre: string, fecha: string, region: string): string {
  return `${normalizar(nombre)}|${fecha}|${normalizar(region)}`;
}

/** La llave de una marca: su nombre normalizado. */
export function claveMarca(nombre: string): string {
  return normalizar(nombre);
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** ¿Es un día real AAAA-MM-DD? (rechaza 2026-02-30). */
export function esDia(s: unknown): s is string {
  if (typeof s !== "string" || !DIA.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** URL http(s) bien formada; cualquier otro esquema (javascript:, data:, file:) se rechaza. */
export function esUrl(s: unknown): s is string {
  return urlLimpia(s) !== null;
}

/**
 * La URL tal como se guarda: la que normaliza el navegador (`new URL().href`, sin espacios ni
 * tabulaciones alrededor). Así lo guardado siempre pasa el CHECK `^https?://` de la base. null si no es http(s).
 */
export function urlLimpia(s: unknown): string | null {
  if (typeof s !== "string" || s.length > MAX_URL) return null;
  try {
    const u = new URL(s.trim());
    if ((u.protocol !== "http:" && u.protocol !== "https:") || u.hostname.length === 0) return null;
    return u.href.length <= MAX_URL ? u.href : null;
  } catch {
    return null;
  }
}

// ── Lo que NO puede entrar: datos de contacto de personas ─────────────────────

// Un nombre de campo que nombra un dato de persona, por SUBCADENA del nombre normalizado (e-mail,
// e_mail, emails, telefonos, phone, celulares, mobile, contactoComercial, whatsapp_url…).
const PEDAZOS_PROHIBIDOS = ["mail", "correo", "telefon", "phone", "celular", "movil", "mobile", "whatsapp", "contacto", "contact", "persona", "linkedin", "dni", "cuil"];
// «tel» sólo como palabra entera (no «hotel», «cartel»).
const PALABRAS_PROHIBIDAS = new Set(["tel", "tels", "cel", "wa"]);

/** ¿El nombre del campo pide un dato de contacto de una persona? camelCase y separadores incluidos. */
export function campoProhibido(nombre: string): boolean {
  const n = normalizar(nombre.replace(/([a-z])([A-Z])/g, "$1 $2"));
  if (n.split(" ").some((w) => PALABRAS_PROHIBIDAS.has(w))) return true;
  const junto = n.replace(/ /g, "");
  return PEDAZOS_PROHIBIDOS.some((p) => junto.includes(p));
}

const PARECE_MAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
// Mails disfrazados: «juan @ gmail.com», «juan(at)gmail.com», «juan [at] gmail . com».
const PARECE_MAIL_OFUSCADO = /[a-z0-9._%+-]+\s*(?:@|\(at\)|\[at\]|\{at\})\s*[a-z0-9-]+\s*(?:\.|\(dot\)|\[dot\])\s*[a-z]{2,}/i;
// ── Teléfonos de personas ────────────────────────────────────────────────────
// Amenaza que se cubre: un teléfono que se cuela SIN QUERER (lo copió un agente o lo pegó alguien) en los formatos
// en que la gente escribe números. No es un filtro contra quien lo esconde a propósito (eso no lo para ningún
// patrón). Primero se sacan los números que claramente son otra cosa y después se busca el resto.

// Dígitos de ancho completo a normales (NFKC), invisibles afuera (\p{Cf}: formato y direccionalidad; \p{Mn}: marcas
// sueltas) y cualquier guion a «-».
function paraBuscarTelefonos(texto: string): string {
  return texto
    .normalize("NFKC")
    .replace(/[\p{Cf}\p{Mn}᠎]/gu, "")
    .replace(/[\p{Pd}−]/gu, "-")
    .replace(/\p{Nd}/gu, digitoLatino);
}

// Un dígito de otra escritura (árabe ٤٥٦٧, devanagari ४५६७…) a 0-9: los dígitos Unicode van en tiradas de 10 seguidas.
function digitoLatino(c: string): string {
  if (c >= "0" && c <= "9") return c;
  const cp = c.codePointAt(0)!;
  let desde = cp;
  while (/\p{Nd}/u.test(String.fromCodePoint(desde - 1))) desde--;
  return String((cp - desde) % 10);
}

const ANIO_TXT = "(?:199\\d|20[0-3]\\d)";
const SEP_FECHA = "[-./]";
// Lo que NO es teléfono, en el orden en que se saca (cada tramo se cambia por un corte «;»):
const NO_TELEFONOS: readonly RegExp[] = [
  /\bhttps?:\/\/\S+/gi, // URLs: se revisan aparte con urlConContacto
  // Días: 2026-11-14 (con hora), 14-11-2026, 14.11.2026, 14/11/2026 y rangos «20-22/05/2025».
  new RegExp(`(?<!\\d)${ANIO_TXT}${SEP_FECHA}(?:0?[1-9]|1[0-2])${SEP_FECHA}(?:0?[1-9]|[12]\\d|3[01])(?:T\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?(?:Z|[+-]\\d{2}:?\\d{2})?)?(?![\\d:])`, "g"),
  new RegExp(`(?<!\\d)(?:0?[1-9]|[12]\\d|3[01])(?:\\s?-\\s?(?:0?[1-9]|[12]\\d|3[01]))?${SEP_FECHA}(?:0?[1-9]|[12]\\d|3[01])${SEP_FECHA}${ANIO_TXT}(?!\\d)`, "g"), // también 11/14/2026
  // Días con año corto, sólo con barra: 14/11/26.
  /(?<!\d)(?:0?[1-9]|[12]\d|3[01])\/(?:0?[1-9]|1[0-2])\/\d{2}(?![\d/])/g,
  // Horas: 10:00, 10.00 hs, «10.00-18.00».
  /(?<!\d)(?:[01]?\d|2[0-3])[:.][0-5]\d(?:\s?-\s?(?:[01]?\d|2[0-3])[:.][0-5]\d)?(?!\d)/g,
  // CUIT de una empresa (30-71234567-8) y coordenadas con decimales (-34.603722). En Argentina latitud y longitud
  // son negativas: sin el «-» no es coordenada («Tel. 011.4567-8901», «351.423-4567» son teléfonos).
  /(?<!\d)(?:20|23|24|27|30|33|34)-\d{8}-\d(?!\d)|\bCUIT\s*:?\s*(?:20|23|24|27|30|33|34)\d{9}(?!\d)/gi,
  /(?<![\d.)][\s]?)-\d{1,3}\.\d{4,}(?![\d.])/g, // «(0351)-423.4567» no es coordenada
  // Plata y cantidades con miles: $ 150.000.000, 12,500,000 visitantes, 1.250,50.
  /\$\s?\d[\d.,]*/g,
  // (No si sigue un bloque de 4 cifras: «351.423-4567», «351.423-2030» y, salvo que sea un año, «351.423 · 4567» son
  // teléfonos.)
  new RegExp(`(?<![\\d.,])\\d{1,3}(?:([.,])\\d{3})(?:\\1\\d{3})*(?:[.,]\\d{1,2})?(?![\\d.,])(?![\\s-]{1,3}\\d{4}(?![\\d.,]))(?![\\s-]{1,3}\\d{2}[\\s-]\\d{2}(?!\\d))(?![^\\p{L}\\p{N}\\n]{1,3}(?!${ANIO_TXT})\\d{4}(?![\\d.,]))`, "gu"),
  // Años y rangos de años, crecientes: 2026, 2015-2024, (2016-2026), 2019/2026, «2025, 2026 y 2027».
  // (No si sigue «-55-12»: eso no es un año suelto, es un número.)
  new RegExp(`(?<!\\d)${ANIO_TXT}(?:(?:\\s*(?:-|/|,|y|a|al)\\s*|\\s+)${ANIO_TXT})*(?!\\d|[-./]\\d)`, "g"),
];

// Un AÑO pegado DETRÁS de otros dígitos por los mismos signos que une TRAMO_NUMERICO (espacio, guion, punto, barra,
// «·», «|», «*», «)»…) es parte de algo más largo («Cel 11 5512 · 2030», «(011) 2020-2021»): no se saca, se mira
// entero. DELANTE de otros dígitos sólo lo pegan espacio, guion, punto o barra («+54 9 11 2023 4567»): «En 2026: 1500
// expositores» y «2026 | 3500 stands» no son teléfonos. Un paréntesis que abre sí separa («2025 (20-22/05)»). Días y horas tienen forma propia y se sacan siempre (por eso
// los años van al final, cuando ya no están). Tampoco se saca un año que sigue a «Tel», «Cel», «WhatsApp»…
const PEGADO_ANTES = /\d[\s\-./_]{0,3}$/;
// Con «·», «|», «*» o «)» el bloque de antes tiene que ser de 3 cifras o más, no un año y parte de un número más
// largo: «Hall 4 · 2026», «Expositores 1500 · 2026» y «Edición 2025-2026 · 2026-2027» no son teléfonos; «Cel 11 5512 ·
// 2030», «(011) 4567 | 2025», «(011) 2020-2021» y «(11) 2030-2031» sí (una característica entre paréntesis pega).
const PEGADO_ANTES_ANCHO = new RegExp(`(?:\\d(?:(?!,\\s)[^\\p{L}\\p{N}\\n]){1,3}(?!${ANIO_TXT}(?!\\d))\\d{3,}(?:(?!,\\s)[^\\p{L}\\p{N}\\n(]){1,3}|(?<!\\d)\\d{1,4}\\)\\s?-?\\s?)$`, "u");
const PEGADO_DESPUES = /^[\s\-./_]{0,3}\d/;
const PALABRA_DE_TELEFONO = /(?:^|[^\p{L}])(?:tel|tel[eé]fono|tel[eé]fonos|cel|celular|whats?app|wsp|fax|m[oó]vil|llamar(?:\s+al)?)\.?\s*[:/]?\s*$/iu;

function sinNoTelefonos(texto: string): string {
  let t = texto;
  for (const re of NO_TELEFONOS) {
    const esAnio = re === NO_TELEFONOS[NO_TELEFONOS.length - 1];
    t = t.replace(re, (m: string, ...resto: unknown[]) => {
      const desde = resto.find((x) => typeof x === "number") as number;
      const todo = resto.find((x) => typeof x === "string" && x.length >= m.length) as string;
      if (esAnio && (PEGADO_ANTES.test(todo.slice(Math.max(0, desde - 4), desde)) || PEGADO_ANTES_ANCHO.test(todo.slice(Math.max(0, desde - 24), desde)) || PEGADO_DESPUES.test(todo.slice(desde + m.length, desde + m.length + 4)) || PALABRA_DE_TELEFONO.test(todo.slice(Math.max(0, desde - 20), desde)))) return m;
      // Un rango de años sólo vale si crece («2024-2019» no es un rango: queda como número).
      const anios = esAnio ? m.match(new RegExp(ANIO_TXT, "g")) : null;
      if (anios && anios.some((a, i) => i > 0 && Number(a) <= Number(anios[i - 1]))) return m;
      return " CORTE ";
    });
  }
  return t;
}

// Lo que queda: dígitos unidos por hasta 3 signos que no son letras (espacio, guion, punto, barra, «·», «|», «:»,
// «*»…). Una coma con espacio separa una lista («12, 13 y 14») y corta, igual que un salto de línea o una letra.
// 8 dígitos o más = teléfono, salvo una lista de números chicos con alguno de 1 cifra («pabellones 1 · 2 · 3 · 4…»).
const TRAMO_NUMERICO = /\+?\d(?:(?:(?!,\s)[^\p{L}\p{N}\n]){0,3}\d)+/gu;

// Si el texto nombra un teléfono («Cel 11 5512, 3456»), la coma con espacio también une, pero sólo entre bloques de 3
// cifras o más y uno de 4 («Salones 101, 102, 103 (info por tel)» es una lista): «Expo Móvil 2026, 10, 11, 12 de agosto» y «Stands 10, 12, 14 · consultas por WhatsApp» siguen siendo listas.
const TRAMO_CON_COMA = /\+?\d(?:(?:(?:(?!,\s)[^\p{L}\p{N}\n]){0,3}|(?<=\d{3}),\s+(?=\d{4}))\d)+/gu;
const NOMBRA_TELEFONO = /(?:^|[^\p{L}])(?:tel|tel[eé]fono|tel[eé]fonos|cel|celular|whats?app|wsp|fax|m[oó]vil)(?:[^\p{L}]|$)/iu;

// Un texto largo se mira en trozos de 1.000 caracteres que se pisan 60 (un teléfono entra entero en alguno): el detector
// no es lineal y un campo de 40.000 dígitos no puede trabar la importación.
const TROZO = 1_000;
const SOLAPE = 60;
// Los cortes caen en un espacio cuando se puede (no parten una URL, un CUIT ni una coordenada) y el trozo siguiente
// arranca al menos SOLAPE caracteres antes del corte, en el comienzo de una palabra.
function enTrozos(texto: string, mirar: (trozo: string) => boolean): boolean {
  if (texto.length <= TROZO) return mirar(texto);
  let i = 0;
  for (;;) {
    let fin = Math.min(texto.length, i + TROZO);
    if (fin < texto.length) {
      const espacio = texto.lastIndexOf(" ", fin);
      if (espacio > i + TROZO / 2) fin = espacio;
    }
    if (mirar(texto.slice(i, fin))) return true;
    if (fin >= texto.length) return false;
    const atras = fin - SOLAPE;
    const palabra = texto.lastIndexOf(" ", atras);
    i = palabra > i ? palabra + 1 : atras;
  }
}

// Si el texto nombra un teléfono en cualquier parte (aunque caiga en otro trozo), la coma con espacio une.
function hayTelefono(texto: string): boolean {
  const nombra = NOMBRA_TELEFONO.test(texto);
  return enTrozos(texto, (trozo) => hayTelefonoEnTrozo(trozo, nombra));
}

function hayTelefonoEnTrozo(texto: string, nombra: boolean): boolean {
  const limpio = sinNoTelefonos(paraBuscarTelefonos(texto));
  for (const tramo of limpio.match(nombra ? TRAMO_CON_COMA : TRAMO_NUMERICO) ?? []) {
    const grupos = tramo.match(/\d+/g) ?? [];
    const lista = !tramo.startsWith("+") && grupos.every((g) => g.length <= 2) && grupos.some((g) => g.length === 1); // «1 · 2 · 3 · 4…»
    if (grupos.join("").length >= 8 && !lista) return true;
  }
  return false;
}

/** En la query de una URL, cada valor (y cada clave) se revisa como texto, salvo lo que es claramente un id: una sola
 *  tirada de 14 dígitos o más (perfiles), el seguimiento de sitios (_ga=2.123456789.987654321) y un número pelado en
 *  una clave de id o de fecha (?id=12345678, ?fecha=20261114). */
const CLAVE_DE_ID = /^(?:.*id|p|page|post|nota|articulo|article|fecha|date|ts|t|v|ver|version|_ga|_gl)$/i;
function queryConTelefono(k: string, v: string): boolean {
  const t = paraBuscarTelefonos(v).trim();
  const seguimiento = /^\d+(?:[.-]\d+){2,}$/.test(t) && t.split(/[.-]/).some((g) => g.length >= 7); // 2.123456789.1698765432-…
  if (/^\d{14,}$/.test(t) || seguimiento || (CLAVE_DE_ID.test(k) && /^\d+$/.test(t))) return false;
  return hayTelefono(k) || hayTelefono(v);
}

/**
 * ¿Una URL lleva a una persona? mailto:/tel:, un mail en cualquier parte, links de WhatsApp
 * (wa.me, api.whatsapp.com, chat.whatsapp.com) o un parámetro de la query que nombra un contacto o
 * trae un teléfono. La RUTA sólo se mira donde nombra un teléfono (ver rutaConTelefono): las fuentes traen ids largos.
 */
export function urlConContacto(url: string): boolean {
  const t = url.trim();
  if (/^(mailto|tel|sms|whatsapp):/i.test(t) || PARECE_MAIL.test(t) || PARECE_MAIL_OFUSCADO.test(decodeURIComponentSeguro(t))) return true;
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    // Una URL que no se puede leer suele ser texto pegado («https://expo.com.arTel:011-4567-8901»): se mira como texto.
    return hayTelefono(t.replace(/^[a-z][a-z0-9+.-]*:\/\//i, ""));
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "wa.me" || host === "wa.link" || /(^|\.)whatsapp\.(com|net)$/.test(host)) return true;
  if (rutaConTelefono(u.pathname) || (!/^\d+(?:\.\d+){3}$/.test(host) && hayTelefono(host))) return true; // «expo.com.ar011-4567-8901», «11-5512-3456.example.com»
  for (const [k, v] of u.searchParams) if (campoProhibido(k) || queryConTelefono(k, v)) return true;
  // Lo que va después del # no lo usa el sitio: si trae un mail o un teléfono, es una nota escondida.
  const fragmento = decodeURIComponentSeguro(u.hash.slice(1));
  if (fragmento && traeContacto(fragmento)) return true;
  return false;
}

/**
 * La ruta trae ids largos (noticias/12345678) y no se mira entera. Sí se mira un tramo que arranca con «+» y dígitos
 * (t.me/+5491155123456), uno que nombra un teléfono («/Tel.011-4567-8901», «/whatsapp-11-5512-3456»), el que
 * sigue a «/contacto/», «/tel/», «/llamar/»… y el que tiene forma de teléfono («/11-5512-3456»; también en el host).
 */
function rutaConTelefono(ruta: string): boolean {
  const tramos = ruta.split("/").map(decodeURIComponentSeguro);
  return tramos.some((tramo, i) => {
    const anterior = (tramos[i - 1] ?? "").toLowerCase();
    const nombraTelefono = /^\+\s?\d/.test(tramo) || NOMBRA_TELEFONO.test(tramo) || NOMBRA_CONTACTO.test(tramo) || NOMBRA_TELEFONO.test(anterior) || NOMBRA_CONTACTO.test(anterior);
    return (nombraTelefono && hayTelefono(tramo)) || conFormaDeTelefono(tramo) || TELEFONO_EN_TRAMO.test(paraBuscarTelefonos(tramo));
  });
}

const NOMBRA_CONTACTO = /(?:^|[^\p{L}])(?:contact(?:o|os|anos|enos|us|ar)?|phone|llam(?:a|ar|anos|enos|ános)|ll[aá]manos)(?:[^\p{L}]|$)/iu;
// Un teléfono con su forma completa dentro de un tramo («eventos-011-4567-8901», «11.5512.3456», «x|11-5512-3456»).
const TELEFONO_EN_TRAMO = /(?<!\d)(?:\+?54[-.]?)?(?:9[-.]?)?0?\d{2,4}[-.]\d{3,4}[-.]\d{4}(?!\d)/;

/** Un tramo de ruta hecho sólo de dígitos con dos cortes o más («11-5512-3456», «11_5512_3456»). Un id es una tirada
 *  sin cortes o con uno («20261114-123456», «12345-67890»); un punto tampoco corta («v/1.2.3456789»). */
function conFormaDeTelefono(tramo: string): boolean {
  const t = paraBuscarTelefonos(tramo);
  return /^\+?[\d\s()_-]+$/.test(t) && (t.match(/\d[\s()_-]+(?=\d)/g) ?? []).length >= 2 && hayTelefono(t.replace(/_/g, "-"));
}

/** Decodifica lo que se pueda: un «%» suelto no deja el resto codificado (los %20 pasan a espacio igual). */
function decodeURIComponentSeguro(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s.replace(/(?:%[0-9a-f]{2})+/gi, (m) => {
      try {
        return decodeURIComponent(m);
      } catch {
        return " ";
      }
    });
  }
}

/** ¿El texto trae un mail (también disfrazado) o un teléfono (8 a 15 dígitos en un tramo)? Días y años no cuentan. */
export function traeContacto(texto: string): boolean {
  const t = paraBuscarTelefonos(texto);
  if (enTrozos(t, (trozo) => PARECE_MAIL.test(trozo) || PARECE_MAIL_OFUSCADO.test(trozo)) || /^(mailto|tel):/i.test(t.trim())) return true;
  // Las URLs dentro del texto no se miran como número (traen ids largos) pero sí como URL: query y fragmento.
  if ((t.match(/\bhttps?:\/\/\S+/gi) ?? []).some((u) => urlConContacto(u))) return true;
  return hayTelefono(t);
}

// ── Validación del lote ──────────────────────────────────────────────────────

export interface MarcaDeLote {
  nombre: string;
  clave: string;
  rol: Rol;
  nivel: string | null;
  urlFuente: string;
  rubro: string | null;
  web: string | null;
  edicion: string | null;
  verificacion: Verificacion;
  registro: AccionDeLote[];
}

export interface EventoDeLote {
  nombre: string;
  clave: string;
  fecha: string;
  fechaHasta: string | null;
  lugar: string;
  region: string;
  organizador: string | null;
  urlFuente: string | null;
  tipo: string | null;
  verificacion: Verificacion;
  registro: AccionDeLote[];
  marcas: MarcaDeLote[];
}

export interface Rechazo {
  /** «evento 3», «evento 3 · marca 2» o «lote». */
  donde: string;
  motivo: string;
}

export type LoteValidado =
  | { ok: true; eventos: EventoDeLote[]; rechazos: Rechazo[] }
  | { ok: false; motivo: string; rechazos: Rechazo[] };

/** El rol en mayúsculas o con un sinónimo en minúsculas («sponsor principal», «media partner»). */
export function rolDe(v: unknown): Rol | null {
  if (typeof v !== "string") return null;
  const k = normalizar(v).replace(/ /g, "_").toUpperCase();
  if ((ROLES as readonly string[]).includes(k)) return k as Rol;
  const sinonimos: Record<string, Rol> = {
    PRINCIPAL: "SPONSOR_PRINCIPAL",
    TITULAR: "SPONSOR_PRINCIPAL",
    PATROCINADOR: "SPONSOR",
    PATROCINANTE: "SPONSOR",
    AUSPICIO: "AUSPICIANTE",
    PRENSA: "MEDIA_PARTNER",
    MEDIA: "MEDIA_PARTNER",
    MEDIO: "MEDIA_PARTNER",
    STAND: "EXPOSITOR",
  };
  return sinonimos[k] ?? null;
}

function texto(v: unknown, max = MAX_TEXTO): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  return t.length > 0 && t.length <= max ? t : null;
}

function opcional(v: unknown, max = MAX_TEXTO): string | null | undefined {
  if (v === undefined || v === null || v === "") return null;
  // El equipo de agentes escribe «sin dato» cuando no lo encontró: es lo mismo que no traerlo.
  if (typeof v === "string" && normalizar(v) === "sin dato") return null;
  return texto(v, max) ?? undefined; // undefined = vino algo inválido
}

/** ¿Es una hora ISO completa (2026-11-14T23:14:46Z)? */
export function esHora(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s) && !Number.isNaN(Date.parse(s));
}

/** «confirmado», «en duda»…; sin dato → «sin verificar»; otra cosa → null (inválido). */
export function verificacionDe(v: unknown): Verificacion | null {
  if (v === undefined || v === null || v === "") return "sin verificar";
  if (typeof v !== "string") return null;
  const k = normalizar(v);
  return (VERIFICACIONES as readonly string[]).includes(k) ? (k as Verificacion) : null;
}

/** El registro de un evento o una marca. Las líneas inválidas no se guardan y se cuentan. */
function leerRegistro(v: unknown): { registro: AccionDeLote[]; invalidas: number } {
  if (v === undefined || v === null) return { registro: [], invalidas: 0 };
  if (!Array.isArray(v)) return { registro: [], invalidas: 1 };
  const registro: AccionDeLote[] = [];
  let invalidas = 0;
  for (const r of v.slice(0, MAX_REGISTRO_POR_ITEM)) {
    const o = r && typeof r === "object" ? (r as Record<string, unknown>) : null;
    const puesto = o && typeof o.puesto === "string" ? normalizar(o.puesto) : "";
    const accion = o ? texto(o.accion, 120) : null;
    const detalle = o ? opcional(o.detalle) : undefined;
    const url = o && o.url !== undefined && o.url !== null && o.url !== "" ? urlLimpia(o.url) : null;
    const urlMala = o && o.url !== undefined && o.url !== null && o.url !== "" && !url;
    if (!o || !(PUESTOS as readonly string[]).includes(puesto) || !accion || !esHora(o.hora) || detalle === undefined || urlMala) {
      invalidas++;
      continue;
    }
    registro.push({ puesto: puesto as Puesto, accion, hora: new Date(o.hora as string).toISOString(), url, detalle });
  }
  return { registro, invalidas: invalidas + Math.max(0, v.length - MAX_REGISTRO_POR_ITEM) };
}

/** Recorre claves y valores buscando datos de personas. Devuelve dónde, o null. */
function buscarContacto(v: unknown, ruta: string): string | null {
  if (typeof v === "string") return traeContacto(v) ? ruta : null;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const r = buscarContacto(v[i], `${ruta}[${i}]`);
      if (r) return r;
    }
    return null;
  }
  if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v)) {
      if (campoProhibido(k)) return `${ruta}.${k}`;
      // Los campos de fecha con forma de fecha no se miran como teléfono: si el día no existe («2027-13-01») lo rechaza
      // la validación de ESE evento, no el lote entero. En texto libre, en cambio, «2027-55-12» sí cuenta como número.
      if ((k === "fecha" || k === "fechaHasta" || k === "fechaFin" || k === "hora") && typeof val === "string" && (/^\d{4}-\d{2}-\d{2}$/.test(val) || esHora(val))) continue;
      // Las URLs: mail, WhatsApp o teléfono en la query (la ruta trae ids largos que no son teléfonos). Sólo si de
      // verdad es una URL: «notaWeb: "Juan 11 5512 3456"» es texto y se revisa como texto.
      if (typeof val === "string" && /url|web|link|sitio/i.test(k) && esUrl(val)) {
        if (urlConContacto(val)) return `${ruta}.${k}`;
        continue;
      }
      const r = buscarContacto(val, `${ruta}.${k}`);
      if (r) return r;
    }
  }
  return null;
}

/**
 * Valida el lote que trae el equipo de agentes. Formato:
 *   { "eventos": [ { nombre, fecha "AAAA-MM-DD", fechaHasta?, lugar, region, organizador?, urlFuente?,
 *                    marcas: [ { nombre, rol, urlFuente, nivel?, rubro?, web? } ] } ] }
 * También acepta el array de eventos suelto. Un evento inválido se rechaza con su motivo y el resto
 * entra; una marca inválida se rechaza sola. Si el lote trae datos de contacto de personas, se
 * rechaza ENTERO. Duplicados dentro del mismo lote se unen (misma llave).
 */
export function validarLote(entrada: unknown): LoteValidado {
  const rechazos: Rechazo[] = [];
  const crudo = Array.isArray(entrada) ? entrada : entrada && typeof entrada === "object" ? (entrada as { eventos?: unknown }).eventos : undefined;
  if (!Array.isArray(crudo)) return { ok: false, motivo: "El archivo no trae una lista de «eventos».", rechazos };
  if (crudo.length === 0) return { ok: false, motivo: "La lista de eventos está vacía.", rechazos };
  if (crudo.length > MAX_EVENTOS) return { ok: false, motivo: `Son ${crudo.length} eventos: el tope por importación es ${MAX_EVENTOS}.`, rechazos };

  const conContacto = buscarContacto(crudo, "eventos");
  if (conContacto) {
    return {
      ok: false,
      motivo: `El lote trae datos de contacto de personas (${conContacto}). No se importa nada: este módulo guarda sólo eventos y marcas.`,
      rechazos,
    };
  }

  const porClave = new Map<string, EventoDeLote>();
  crudo.forEach((e, i) => {
    const donde = `evento ${i + 1}`;
    if (!e || typeof e !== "object") return void rechazos.push({ donde, motivo: "no es un evento" });
    const o = e as Record<string, unknown>;
    const nombre = texto(o.nombre);
    const lugar = texto(o.lugar);
    const region = texto(o.region, 120);
    if (!nombre) return void rechazos.push({ donde, motivo: "falta el nombre" });
    if (!esDia(o.fecha)) return void rechazos.push({ donde: `${donde} (${nombre})`, motivo: "la fecha no es un día AAAA-MM-DD" });
    if (!lugar) return void rechazos.push({ donde: `${donde} (${nombre})`, motivo: "falta el lugar" });
    if (!region) return void rechazos.push({ donde: `${donde} (${nombre})`, motivo: "falta la región" });
    const fecha = o.fecha;
    let fechaHasta: string | null = null;
    const fin = o.fechaHasta ?? o.fechaFin; // «fechaFin» es como lo escribe el equipo de agentes
    if (fin !== undefined && fin !== null && fin !== "") {
      if (!esDia(fin) || fin < fecha) return void rechazos.push({ donde: `${donde} (${nombre})`, motivo: "la fecha de fin no es válida o es anterior al inicio" });
      fechaHasta = fin;
    }
    const tipo = opcional(o.tipo, 60);
    const verificacion = verificacionDe(o.verificacion);
    if (tipo === undefined || !verificacion) return void rechazos.push({ donde: `${donde} (${nombre})`, motivo: "el tipo o la verificación no son válidos" });
    const reg = leerRegistro(o.registro);
    if (reg.invalidas) rechazos.push({ donde: `${donde} (${nombre})`, motivo: `${reg.invalidas} línea(s) del registro no se guardan (puesto, hora o URL inválidos)` });
    const organizador = opcional(o.organizador);
    if (organizador === undefined) return void rechazos.push({ donde: `${donde} (${nombre})`, motivo: "el organizador no es válido" });
    let urlFuente: string | null = null;
    if (o.urlFuente !== undefined && o.urlFuente !== null && o.urlFuente !== "") {
      urlFuente = urlLimpia(o.urlFuente);
      if (!urlFuente) return void rechazos.push({ donde: `${donde} (${nombre})`, motivo: "la URL de la fuente no es http(s)" });
    }
    if (!normalizar(nombre) || !normalizar(region)) return void rechazos.push({ donde: `${donde} (${nombre})`, motivo: "el nombre o la región no tienen letras ni números" });
    // «marcas» se valida ANTES de sumar el evento: un evento rechazado no entra.
    const marcas = o.marcas ?? [];
    if (!Array.isArray(marcas)) return void rechazos.push({ donde: `${donde} (${nombre})`, motivo: "«marcas» no es una lista" });
    if (marcas.length > MAX_MARCAS_POR_EVENTO) return void rechazos.push({ donde: `${donde} (${nombre})`, motivo: `más de ${MAX_MARCAS_POR_EVENTO} marcas` });

    const clave = claveEvento(nombre, fecha, region);
    const previo = porClave.get(clave);
    const evento: EventoDeLote = previo ?? { nombre, clave, fecha, fechaHasta, lugar, region, organizador, urlFuente, tipo, verificacion, registro: [], marcas: [] };
    if (previo) previo.verificacion = verificacion; // la última copia del lote manda
    evento.registro.push(...reg.registro.slice(0, MAX_REGISTRO_POR_ITEM - evento.registro.length));
    porClave.set(clave, evento);
    marcas.forEach((m, j) => {
      const dm = `${donde} · marca ${j + 1}`;
      if (!m || typeof m !== "object") return void rechazos.push({ donde: dm, motivo: "no es una marca" });
      const mo = m as Record<string, unknown>;
      const mNombre = texto(mo.nombre, 160);
      if (!mNombre || !claveMarca(mNombre)) return void rechazos.push({ donde: dm, motivo: "falta el nombre de la marca" });
      const rol = rolDe(mo.rol);
      if (!rol) return void rechazos.push({ donde: `${dm} (${mNombre})`, motivo: "el rol no es uno de los conocidos" });
      const mUrl = urlLimpia(mo.urlFuente);
      if (!mUrl) return void rechazos.push({ donde: `${dm} (${mNombre})`, motivo: "falta la URL de la fuente (http/https)" });
      const nivel = opcional(mo.nivel, 60);
      const rubro = opcional(mo.rubro, 120);
      if (nivel === undefined || rubro === undefined) return void rechazos.push({ donde: `${dm} (${mNombre})`, motivo: "nivel o rubro inválido" });
      let web: string | null = null;
      if (mo.web !== undefined && mo.web !== null && mo.web !== "") {
        web = urlLimpia(mo.web);
        if (!web) return void rechazos.push({ donde: `${dm} (${mNombre})`, motivo: "la web no es http(s)" });
      }
      const edicion = opcional(mo.edicion, 40);
      const mVerif = verificacionDe(mo.verificacion);
      if (edicion === undefined || !mVerif) return void rechazos.push({ donde: `${dm} (${mNombre})`, motivo: "la edición o la verificación no son válidas" });
      const mReg = leerRegistro(mo.registro);
      if (mReg.invalidas) rechazos.push({ donde: `${dm} (${mNombre})`, motivo: `${mReg.invalidas} línea(s) del registro no se guardan (puesto, hora o URL inválidos)` });
      const mClave = claveMarca(mNombre);
      if (evento.marcas.some((x) => x.clave === mClave && x.rol === rol)) return; // repetida en el lote
      // El tope vale también después de unir copias del mismo evento.
      if (evento.marcas.length >= MAX_MARCAS_POR_EVENTO) return void rechazos.push({ donde: `${dm} (${mNombre})`, motivo: `el evento ya tiene ${MAX_MARCAS_POR_EVENTO} marcas` });
      evento.marcas.push({ nombre: mNombre, clave: mClave, rol, nivel, urlFuente: mUrl, rubro, web, edicion, verificacion: mVerif, registro: mReg.registro });
    });
  });

  const eventos = [...porClave.values()];
  if (eventos.length === 0) return { ok: false, motivo: "Ningún evento del lote es válido.", rechazos };
  const relaciones = eventos.reduce((n, e) => n + e.marcas.length, 0);
  if (relaciones > MAX_RELACIONES) return { ok: false, motivo: `Son ${relaciones} marcas en eventos: el tope por importación es ${MAX_RELACIONES}. Partí el archivo en varios.`, rechazos };
  const acciones = eventos.reduce((n, e) => n + e.registro.length + e.marcas.reduce((k, m) => k + m.registro.length, 0), 0);
  if (acciones > MAX_ACCIONES) return { ok: false, motivo: `Son ${acciones} líneas de registro: el tope por importación es ${MAX_ACCIONES}. Partí el archivo en varios.`, rechazos };
  return { ok: true, eventos, rechazos };
}

/** Lee el texto que pegó o subió la persona. JSON inválido o demasiado grande → motivo claro. */
export function leerLote(textoCrudo: string): LoteValidado {
  if (textoCrudo.length > MAX_BYTES_LOTE) return { ok: false, motivo: "El archivo es demasiado grande (tope 2 MB).", rechazos: [] };
  let json: unknown;
  try {
    json = JSON.parse(textoCrudo);
  } catch {
    return { ok: false, motivo: "El archivo no es un JSON válido.", rechazos: [] };
  }
  return validarLote(json);
}

// ── Filtros de la pantalla ───────────────────────────────────────────────────

export interface FiltrosEventos {
  region: string | null;
  desde: string | null;
  hasta: string | null;
}

/** De la URL a filtros válidos: lo que no es un día real o una región corta se ignora. */
export function leerFiltros(sp: Record<string, string | string[] | undefined>): FiltrosEventos {
  const uno = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v.trim() : null;
  };
  const region = uno("region");
  const desde = uno("desde");
  const hasta = uno("hasta");
  return {
    region: region && region.length <= 120 ? region : null,
    desde: esDia(desde) ? desde : null,
    hasta: esDia(hasta) ? hasta : null,
  };
}

/** «12 al 14 de mar. 2027» / «12 de mar. 2027». */
export function rangoDeFechas(fecha: Date, hasta: Date | null): string {
  const f = (d: Date, conAnio: boolean) =>
    d.toLocaleDateString("es-AR", { day: "numeric", month: "short", ...(conAnio ? { year: "numeric" } : {}), timeZone: "UTC" });
  if (!hasta || hasta.getTime() === fecha.getTime()) return f(fecha, true);
  // Mismo mes y año: «26 al 27 de nov de 2026», no «26 nov al 27 de nov de 2026».
  const mismoMes = fecha.getUTCMonth() === hasta.getUTCMonth() && fecha.getUTCFullYear() === hasta.getUTCFullYear();
  return `${mismoMes ? fecha.getUTCDate() : f(fecha, false)} al ${f(hasta, true)}`;
}

/** Día AAAA-MM-DD → Date a medianoche UTC (columna @db.Date). */
export function diaADate(dia: string): Date {
  return new Date(`${dia}T00:00:00Z`);
}

// ── Pedidos al equipo ────────────────────────────────────────────────────────

/** Los puestos a los que el negocio le puede pedir trabajo hoy (los de contactos y mails, todavía no). */
export const PUESTOS_PEDIBLES = ["descubridor", "identificador", "verificador"] as const satisfies readonly Puesto[];
export const MAX_PEDIDO = 500;

export const MAX_REGION_PEDIDO = 80;
export const REGION_POR_DEFECTO = "Buenos Aires";

export interface PedidoValido {
  puesto: Puesto;
  pedido: string;
  /** Dónde buscar. El Descubridor siempre lleva una (por defecto «Buenos Aires»); los demás, si la pidieron. */
  region: string | null;
  desde: string | null;
  hasta: string | null;
}

/**
 * Un pedido válido («buscá ferias de alimentos en Córdoba para marzo»): puesto conocido, texto corto, sin datos de
 * personas. La región y las fechas se eligen en cada encargo (decisión del dueño, 14/11), no quedan fijas.
 */
export function validarPedido(
  puesto: unknown,
  pedido: unknown,
  donde: { region?: unknown; desde?: unknown; hasta?: unknown } = {},
): ({ ok: true } & PedidoValido) | { ok: false; motivo: string } {
  const p = typeof puesto === "string" ? normalizar(puesto) : "";
  if (!(PUESTOS_PEDIBLES as readonly string[]).includes(p)) return { ok: false, motivo: "Elegí a qué puesto del equipo va el pedido." };
  const t = typeof pedido === "string" ? pedido.trim().replace(/\s+/g, " ") : "";
  if (t.length < 5) return { ok: false, motivo: "Escribí qué tiene que hacer el equipo (por ejemplo, «buscá ferias de alimentos en Córdoba»)." };
  if (t.length > MAX_PEDIDO) return { ok: false, motivo: `El pedido es muy largo: hasta ${MAX_PEDIDO} caracteres.` };
  if (traeContacto(t)) return { ok: false, motivo: "El pedido trae datos de contacto de personas: este módulo no los guarda." };

  const r = typeof donde.region === "string" ? donde.region.trim().replace(/\s+/g, " ") : "";
  if (r.length > MAX_REGION_PEDIDO) return { ok: false, motivo: `La región es muy larga: hasta ${MAX_REGION_PEDIDO} caracteres.` };
  if (traeContacto(r)) return { ok: false, motivo: "La región trae datos de contacto de personas: este módulo no los guarda." };
  const region = r || (p === "descubridor" ? REGION_POR_DEFECTO : null);
  const dia = (v: unknown): string | null | undefined => (v === undefined || v === null || v === "" ? null : esDia(v) ? v : undefined);
  const desde = dia(donde.desde);
  const hasta = dia(donde.hasta);
  if (desde === undefined || hasta === undefined) return { ok: false, motivo: "Una de las fechas no es un día válido." };
  if (desde && hasta && hasta < desde) return { ok: false, motivo: "La fecha «hasta» no puede ser anterior a «desde»." };
  return { ok: true, puesto: p as Puesto, pedido: t, region, desde, hasta };
}

export const ETIQUETA_VERIFICACION: Record<Verificacion, string> = {
  confirmado: "Verificado",
  "en duda": "En duda",
  falla: "No se pudo verificar",
  "sin verificar": "Sin verificar",
};
