// EVENTOS Y SPONSORS · datos de contacto de personas: se RECHAZA POR DEFECTO (GSG-CRM-009).
//
// Ocho rondas de certificación sobre un detector de «formatos de teléfono» encontraron una fuga nueva en cada una: una
// lista de lo prohibido nunca se termina de probar. Desde el 15/11 (orden de la orquestadora, ORQ-007) es al revés:
// en texto libre, los dígitos sólo entran en las formas DECLARADAS acá; cualquier otra corrida de dígitos, con el
// separador y en el alfabeto que sea, deja la fila afuera. Rechazar de más es aceptable (se ve en «Quedaron afuera»);
// dejar pasar un teléfono es lo que no puede pasar.
//
// Formas declaradas (una corrida = dígitos unidos por hasta 4 signos que no son letras):
//   · Corrida corta: 5 cifras o menos en total («Hall 4», «Stand 1210», «N.º 12»). Ningún teléfono entra en 5 cifras.
//   · Fechas, horas y años (1950-2049), solos o en lista: «2026», «2015-2026», «14/11/2026», «20-22/05», «10.00-18.00»,
//     «19/11/2026 – 13:00 – 14:30». Una lista hecha SÓLO de años tiene que crecer («2024-2019» no es un rango).
//   · Un año seguido de una cifra de hasta 4 dígitos: «En 2026: 1500 expositores» (al revés no: «4567 · 2026»).
//   · Listas de números chicos: «12, 13 y 14», «salones 101, 102», «1 · 2 · 3 · 4» (de a pares sin ninguno de 1 cifra no).
//   · Cantidades con separador de miles: «12.500», «1.250.000», «12,500,000», «1.250,50», «150.000 - 200.000».
//   · Importes después de «$», «US$» o «USD»: «$ 15000-25000», «$ 1.500,50».
//   · Coordenadas negativas (Argentina): «-34.603722, -58.381592».
//   · CUIT con guiones («30-71234567-8») y números después de una palabra que los declara: ISBN, ISSN, CUIT,
//     Resolución, Ley, Decreto, Disposición, Expediente, Matrícula, Legajo.
// Si el texto nombra un teléfono (tel, cel, WhatsApp, fax, móvil, llamar, «contacto:», «informes:»…), ninguna forma
// vale: cualquier corrida de 6 cifras o más lo deja afuera.
//
// Residuo aceptado y anotado: dos años crecientes, o un año y una cifra de 4, sin palabra de teléfono («Juan 2019-2031»,
// «Juan 2030 4567») entran. Un fijo de 8 cifras con esa forma tendría que empezar con 19 o 20, y los fijos del AMBA empiezan con 4, 5 o 6
// (provisional a confirmar con el plan de numeración).
//
// URLs: http(s), sin enlaces de contacto (mailto:, tel:, WhatsApp, Telegram) ni mails. Se guardan sin la query ni el
// fragmento; si la ruta trae números no declarados se guarda sólo el dominio; si el dominio los trae, no se guarda.

/** Dígitos de cualquier escritura a 0-9, ancho completo y superíndices a normales (NFKC), invisibles afuera, guiones a «-». */
export function paraRevisar(texto: string): string {
  return texto
    .normalize("NFKC")
    .replace(/[\p{Cf}\p{Mn}᠎]/gu, "")
    .replace(/[\p{Pd}−]/gu, "-")
    .replace(/\p{Nd}/gu, digitoLatino);
}

// Los dígitos Unicode van en tiradas de 10 seguidas (árabe ٤٥٦٧, devanagari ४५६७…).
function digitoLatino(c: string): string {
  if (c >= "0" && c <= "9") return c;
  const cp = c.codePointAt(0)!;
  let desde = cp;
  while (/\p{Nd}/u.test(String.fromCodePoint(desde - 1))) desde--;
  return String((cp - desde) % 10);
}

// ── Formas declaradas ────────────────────────────────────────────────────────

const ANIO = "(?:19[5-9]\\d|20[0-4]\\d)";
const DIA = "(?:0?[1-9]|[12]\\d|3[01])";
const MES = "(?:0?[1-9]|1[0-2])";
const ISO_HORA = "(?:T\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?(?:Z|[+-]\\d{2}:?\\d{2})?)?";
const FECHA = [
  `${ANIO}[-/.]${MES}[-/.]${DIA}${ISO_HORA}`, // 2026-11-14, 2026/11/14
  `${DIA}(?:\\s?-\\s?${DIA})?[-./]${MES}(?:[-./](?:${ANIO}|\\d{2}))?`, // 14/11/2026, 20-22/05/2025, 14/11/26, 14/11
  `${MES}/${DIA}/${ANIO}`, // 11/14/2026
].join("|");
const HORA = "(?:[01]?\\d|2[0-3])[:.][0-5]\\d(?:[:.][0-5]\\d)?";
const TEMPORAL = `(?:${FECHA}|${HORA}|${ANIO})(?!\\d)`;
const LISTA_TEMPORAL = new RegExp(`^${TEMPORAL}(?:[^\\p{L}\\p{N}]{1,4}${TEMPORAL})*$`, "u");
const SOLO_ANIOS = new RegExp(`^${ANIO}(?:[^\\p{L}\\p{N}]{1,4}${ANIO})+$`, "u");
// Un año y DESPUÉS una cifra de hasta 4 dígitos («En 2026: 1500 expositores», «2026 | 3500 stands»). Al revés no:
// «4567 · 2026» tiene la forma de un fijo del AMBA.
const ANIO_Y_CIFRA = new RegExp(`^${ANIO}[^\\p{L}\\p{N}]{1,4}\\d{1,4}$`, "u");

// Listas de números chicos: con coma y espacio, de hasta 3 cifras («12, 13 y 14», «salones 101, 102»), con un año
// adelante si viene («2027 | 12, 13 y 14»); con otro separador, de hasta 2 cifras y alguna de 1 («1 · 2 · 3 · 4»).
// «11 55 12 34 56» (de a pares, ninguna de 1 cifra) no es una lista: es un teléfono.
const LISTA_CON_COMA = new RegExp(`^(?:${ANIO}\\s*[|·-]\\s*)?\\d{1,3}(?:,\\s+\\d{1,3})+$`);
const LISTA_CHICA = /^\d{1,2}(?:\s*[·|,/-]\s*\d{1,2})+$/;

const CANTIDAD = "(?:\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?)";
const LISTA_CANTIDAD = new RegExp(`^${CANTIDAD}(?:\\s*-\\s*${CANTIDAD})*$`);
const IMPORTE = "\\d+(?:[.,]\\d+)*";
const LISTA_IMPORTE = new RegExp(`^${IMPORTE}(?:\\s*[-/]\\s*(?:\\$|US\\$|U\\$S)?\\s*${IMPORTE})*$`);
const ANTES_DE_IMPORTE = /(?:\$|US\$|U\$S|USD|ARS)\s*$/i;
const LISTA_COORDENADAS = /^\d{1,3}\.\d{4,}(?:\s*,?\s*-\d{1,3}\.\d{4,})*$/;
const CUIT = /^(?:20|23|24|27|30|33|34)-\d{8}-\d$/;
const PALABRA_QUE_DECLARA = /(?:^|[^\p{L}])(?:isbn(?:-1[03])?|issn|cuit|resoluci[oó]n|res\.|ley|decreto|disposici[oó]n|expediente|expte\.?|exp\.?|matr[ií]cula|legajo)\s*(?:n\.?\s*[º°o]?\.?)?\s*:?\s*[-#]?\s*$/iu;
const NUMERO_DECLARADO = /^\d[\d./-]*\d$/;

/** Palabras que nombran un teléfono: con ellas, ninguna forma declarada vale. */
const NOMBRA_TELEFONO = /(?:^|[^\p{L}])(?:tel|tels|tel[eé]fonos?|cel|cels|celular(?:es)?|whats?app|wsp|wpp|fax|m[oó]vil(?:es)?|llamar|llam[aá]|llam[aá]nos|phone|(?:contacto|informes|consultas)\s*:)(?=[^\p{L}]|$)/iu;

const CORRIDA = /\d(?:[^\p{L}\p{N}\n]{0,4}\d)*/gu;
const MAX_CIFRAS_CORTA = 5;
const MAX_CIFRAS_CORRIDA = 64;

function corridaDeclarada(corrida: string, antes: string): boolean {
  const cifras = corrida.replace(/\D/g, "").length;
  if (cifras > MAX_CIFRAS_CORRIDA) return false;
  if (LISTA_TEMPORAL.test(corrida)) {
    if (!SOLO_ANIOS.test(corrida)) return true;
    const anios = corrida.match(/\d{4}/g)!.map(Number);
    return anios.every((a, i) => i === 0 || a > anios[i - 1]);
  }
  if (ANIO_Y_CIFRA.test(corrida) || LISTA_CANTIDAD.test(corrida) || LISTA_CON_COMA.test(corrida)) return true;
  if (LISTA_CHICA.test(corrida) && corrida.match(/\d+/g)!.some((g) => g.length === 1)) return true;
  if (ANTES_DE_IMPORTE.test(antes) && LISTA_IMPORTE.test(corrida)) return true;
  if (antes.endsWith("-") && LISTA_COORDENADAS.test(corrida)) return true;
  if (CUIT.test(corrida)) return true;
  return PALABRA_QUE_DECLARA.test(antes) && NUMERO_DECLARADO.test(corrida) && cifras <= 17;
}

/** ¿El texto (ya pasado por `paraRevisar`) trae una corrida de dígitos que no es una forma declarada? */
function numerosNoDeclarados(t: string): boolean {
  const nombraTelefono = NOMBRA_TELEFONO.test(t);
  for (const m of t.matchAll(CORRIDA)) {
    const corrida = m[0];
    if (corrida.replace(/\D/g, "").length <= MAX_CIFRAS_CORTA) continue;
    if (nombraTelefono) return true;
    if (!corridaDeclarada(corrida, t.slice(Math.max(0, m.index - 24), m.index))) return true;
  }
  return false;
}

// ── Mails y enlaces de contacto ──────────────────────────────────────────────

const PARECE_MAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
// Disfrazados: «juan @ gmail.com», «juan(at)gmail.com», «juan [arroba] gmail . com».
const PARECE_MAIL_OFUSCADO = /[a-z0-9._%+-]+\s*(?:@|\(at\)|\[at\]|\{at\}|\(arroba\)|\[arroba\]|\sarroba\s)\s*[a-z0-9-]+\s*(?:\.|\(dot\)|\[dot\]|\(punto\)|\[punto\])\s*[a-z]{2,}/i;
const ESQUEMA_DE_CONTACTO = /^\s*(?:mailto|tel|sms|whatsapp|callto|skype):/i;
const HOST_DE_CONTACTO = /^(?:wa\.me|wa\.link|t\.me|telegram\.me|(?:[a-z0-9-]+\.)*whatsapp\.(?:com|net))$/;

/** Decodifica lo que se pueda: un «%» suelto no deja el resto codificado. */
function decodificar(s: string): string {
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

function traeMail(t: string): boolean {
  const d = decodificar(t);
  return PARECE_MAIL.test(d) || PARECE_MAIL_OFUSCADO.test(d);
}

export type UrlRevisada =
  | { ok: true; url: string; soloDominio: boolean }
  | { ok: false; motivo: string };

/**
 * La URL tal como se puede guardar. null = no es http(s). `ok: false` = es un contacto o el dominio trae números:
 * no se guarda. Se guarda sin query ni fragmento; si la ruta trae números no declarados, sólo el dominio.
 */
export function revisarUrl(crudo: unknown, maximo = 1000): UrlRevisada | null {
  if (typeof crudo !== "string") return null;
  if (ESQUEMA_DE_CONTACTO.test(crudo)) return { ok: false, motivo: "es un enlace de contacto" };
  if (traeMail(crudo)) return { ok: false, motivo: "trae un mail" };
  let u: URL;
  try {
    u = new URL(crudo.trim());
  } catch {
    return null;
  }
  if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (HOST_DE_CONTACTO.test(host)) return { ok: false, motivo: "es un enlace de contacto (WhatsApp o Telegram)" };
  if (/^\d+(?:\.\d+){3}$/.test(host) || numerosNoDeclarados(paraRevisar(host.replace(/\./g, " ")))) return { ok: false, motivo: "el dominio trae números que pueden ser un teléfono" };
  const ruta = paraRevisar(decodificar(u.pathname));
  const soloDominio = numerosNoDeclarados(ruta);
  const url = soloDominio ? `${u.origin}/` : `${u.origin}${u.pathname}`;
  if (url.length > maximo) return null;
  return { ok: true, url, soloDominio };
}

/**
 * ¿Por qué este texto libre no se puede guardar? null = se puede. Los enlaces dentro del texto se miran como URL
 * (contacto) y también como texto (sus números, query incluida: el texto se guarda tal cual).
 */
export function motivoDeTexto(texto: string): string | null {
  const t = paraRevisar(texto);
  if (traeMail(t) || ESQUEMA_DE_CONTACTO.test(t)) return "trae un mail o un enlace de contacto";
  let resto = t;
  for (const enlace of t.match(/\b(?:https?:\/\/|www\.)\S+/gi) ?? []) {
    const r = revisarUrl(enlace.startsWith("www.") ? `https://${enlace}` : enlace);
    if (r && !r.ok && r.motivo.startsWith("es un enlace")) return "trae un enlace de contacto";
    resto = resto.replace(enlace, ` ${decodificar(enlace).replace(/^[a-z]+:\/\//i, "").replace(/[?&=#+%]/g, " ")} `);
  }
  if (numerosNoDeclarados(resto)) return "trae números que no son un año, una fecha, una cantidad ni un importe (pueden ser un teléfono)";
  return null;
}

/** ¿El texto trae un dato de contacto de una persona, o números que podrían serlo? */
export function traeContacto(texto: string): boolean {
  return motivoDeTexto(texto) !== null;
}
