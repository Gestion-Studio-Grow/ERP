// EVENTOS Y SPONSORS · datos de contacto de personas: se RECHAZA POR DEFECTO (GSG-CRM-009).
//
// Ocho rondas de certificación sobre un detector de «formatos de teléfono» encontraron una fuga nueva en cada una: una
// lista de lo prohibido nunca se termina de probar. Desde el 15/11 (orden de la orquestadora, ORQ-007) es al revés:
// en texto libre, los dígitos sólo entran en las formas DECLARADAS acá; cualquier otra corrida de dígitos, con el
// separador y en el alfabeto que sea, deja la fila afuera. Rechazar de más es aceptable (se ve en «Quedaron afuera»);
// dejar pasar un teléfono es lo que no puede pasar.
//
// Se revisa el texto como se guarda (espacios y saltos de línea colapsados). Una corrida = dígitos unidos por hasta 4
// signos que no son letras. Las cifras de las corridas que NO son una forma declarada se suman en TODO el campo: con 6
// o más, la fila queda afuera (un teléfono partido en pedazos, «4567 y 8901», suma igual). Formas declaradas:
//   · Fechas, horas y años (1950-2049), solos o en lista: «2026», «2015-2026», «14/11/2026», «20-22/05», «10.00-18.00».
//     Una lista hecha SÓLO de años tiene que crecer («2024-2019» no es un rango).
//   · Hasta 3 días crecientes de un mes: «18, 19 y 20 de noviembre», «10 al 13 de marzo».
//   · Un año y una cifra de hasta 4 dígitos con su unidad en letras: «En 2026: 1500 expositores».
//   · Cantidades con miles, de hasta 9 cifras, una o dos, con unidad en letras o «$» antes: «12.500 asistentes».
//   · Importes después de «$», «US$» o «USD»: cifras de hasta 3 o con miles, uno o dos («$ 350», «$ 1.500 - $ 2.500»).
//   · Coordenadas de Argentina: «-34.603722, -58.381592».
//   · CUIT de empresa (30, 33, 34) con dígito verificador válido; el de una persona lleva su DNI adentro.
//   · Después de su palabra y con su forma: ISBN-13 e ISSN (con verificador), Resolución/Ley/Decreto/Disposición/
//     Expediente («1234/2025», «EXP-2026-0042», «27.430»), Matrícula/Legajo (hasta 5 cifras).
// Un número escrito con otro alfabeto que no se puede llevar a 0-9 («❶») deja la fila afuera.
// Si el texto nombra un teléfono (tel, cel, WhatsApp, fax, móvil, llamar, «contacto:», «informes:»…), ninguna forma
// vale: 6 cifras o más en todo el texto lo dejan afuera.
//
// Rechazar de más se acepta y se ve en «Quedaron afuera»: «Stand 1210/1211», «$ 15000-25000», «Pabellones 1 a 8» en
// lista, «Matrícula 1234-5678», una cantidad sin unidad.
// Residuo aceptado y anotado: dos años crecientes, o un año y una cifra de 4 con unidad, sin palabra de teléfono
// («Juan 2019-2031», «2030 4567 stands») entran. Un fijo de 8 cifras con esa forma tendría que empezar con 19 o 20, y los
// fijos del AMBA empiezan con 4, 5 o 6 (provisional a confirmar con el plan de numeración). Las fechas y horas sólo
// admiten valores válidos (mes hasta 12, minuto hasta 59); un teléfono que justo se escriba así es residuo anotado.
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
// Un año y DESPUÉS una cifra de hasta 4 dígitos con su unidad en letras («En 2026: 1500 expositores»). Al revés no:
// «4567 · 2026» tiene la forma de un fijo del AMBA.
const ANIO_Y_CIFRA = new RegExp(`^${ANIO}[^\\p{L}\\p{N}]{1,4}\\d{1,4}$`, "u");

// Cantidades con separador de miles (hasta 9 cifras: «12.500», «1.250.000», «12,500»), una o dos («150.000 - 200.000»),
// con su unidad en letras después o un «$» antes.
const CANTIDAD = "(?:\\d{1,3}(?:\\.\\d{3}){1,2}(?:,\\d{1,2})?|\\d{1,3}(?:,\\d{3}){1,2}(?:\\.\\d{1,2})?)";
const LISTA_CANTIDAD = new RegExp(`^${CANTIDAD}(?:\\s*-\\s*${CANTIDAD})?$`);
// Importes después de «$», «US$» o «USD»: cifras de hasta 3 o con miles, una o dos («$ 1.500 - $ 2.500», «$ 350»).
const IMPORTE = "(?:\\d{1,3}(?:[.,]\\d{3}){0,2}(?:,\\d{2})?)";
const LISTA_IMPORTE = new RegExp(`^${IMPORTE}(?:\\s*[-/]\\s*(?:\\$|US\\$|U\\$S)?\\s*${IMPORTE})?$`);
const ANTES_DE_IMPORTE = /(?:\$|US\$|U\$S|USD|ARS)\s*$/i;
// Coordenadas de Argentina: «-34.603722, -58.381592» (latitud y longitud entre -20 y -79).
const LISTA_COORDENADAS = /^[2-7]\d\.\d{4,7}(?:\s*,?\s*-[2-7]\d\.\d{4,7})?$/;
// CUIT de empresa (30, 33, 34): el de una persona (20, 23, 24, 27) lleva su DNI adentro.
const CUIT = /^3[034]-\d{8}-\d$/;
const CUIT_SIN_GUIONES = /^3[034]\d{9}$/;
const DESPUES_UNIDAD = /^\s*\p{L}/u;

// Números después de una palabra que los declara, cada uno con su forma.
const PALABRAS_QUE_DECLARAN: { palabra: RegExp; forma: RegExp; valida?: (cifras: string) => boolean }[] = [
  { palabra: /isbn(?:-13)?/, forma: /^97[89](?:[- ]?\d){10}$/, valida: isbnValido },
  { palabra: /issn/, forma: /^\d{4}-\d{4}$/, valida: issnValido },
  { palabra: /cuit/, forma: CUIT_SIN_GUIONES, valida: cuitValido },
  {
    palabra: /resoluci[oó]n|res\.|ley|decreto|disposici[oó]n|expediente|expte\.?|exp\.?/,
    forma: new RegExp(`^(?:(?:\\d{1,4}|\\d{1,3}\\.\\d{3})(?:[-/](?:${ANIO}|\\d{2}))?|${ANIO}[-/]\\d{1,5})$`),
  },
  { palabra: /matr[ií]cula|legajo/, forma: /^\d{1,5}$/ },
];
const ANTES_DE_NUMERO = "\\s*(?:n\\.?\\s*[º°o]?\\.?)?\\s*:?\\s*[-#]?\\s*$";

function isbnValido(c: string): boolean {
  const d = c.replace(/\D/g, "");
  const suma = [...d].reduce((s, x, i) => s + Number(x) * (i % 2 ? 3 : 1), 0);
  return d.length === 13 && suma % 10 === 0;
}
function issnValido(c: string): boolean {
  const d = c.replace(/\D/g, "");
  const verificador = (11 - ([...d.slice(0, 7)].reduce((s, x, i) => s + Number(x) * (8 - i), 0) % 11)) % 11;
  return d.length === 8 && verificador === Number(d[7]);
}
function cuitValido(c: string): boolean {
  const d = c.replace(/\D/g, "");
  const verificador = (11 - ([...d.slice(0, 10)].reduce((s, x, i) => s + Number(x) * [5, 4, 3, 2, 7, 6, 5, 4, 3, 2][i], 0) % 11)) % 11;
  return d.length === 11 && verificador < 10 && verificador === Number(d[10]);
}

function declaradaPorPalabra(corrida: string, antes: string): boolean {
  return PALABRAS_QUE_DECLARAN.some(
    ({ palabra, forma, valida }) =>
      new RegExp(`(?:^|[^\\p{L}])(?:${palabra.source})${ANTES_DE_NUMERO}`, "iu").test(antes) &&
      forma.test(corrida) &&
      (!valida || valida(corrida)),
  );
}

/** Palabras que nombran un teléfono: con ellas, ninguna forma declarada vale. */
const NOMBRA_TELEFONO = /(?:^|[^\p{L}])(?:tel|tels|tel[eé]fonos?|cel|cels|celular(?:es)?|whats?app|wsp|wpp|fax|m[oó]vil(?:es)?|llamar|llam[aá]|llam[aá]nos|phone|(?:contacto|informes|consultas)\s*:)(?=[^\p{L}]|$)/iu;

const CORRIDA = /\d(?:[^\p{L}\p{N}]{0,4}\d)*/gu;
/** Cifras sueltas (fuera de las formas declaradas) que admite un campo entero: un teléfono local tiene 6 o más. */
const MAX_CIFRAS_SUELTAS = 5;
const NUMERO_RARO = /[^\P{N}0-9]/u;

function corridaDeclarada(corrida: string, antes: string, despues: string): boolean {
  if (LISTA_TEMPORAL.test(corrida)) {
    if (!SOLO_ANIOS.test(corrida)) return true;
    const anios = corrida.match(/\d{4}/g)!.map(Number);
    return anios.every((a, i) => i === 0 || a > anios[i - 1]);
  }
  const conUnidad = DESPUES_UNIDAD.test(despues);
  const trasImporte = ANTES_DE_IMPORTE.test(antes);
  if (ANIO_Y_CIFRA.test(corrida) && conUnidad) return true;
  if (LISTA_CANTIDAD.test(corrida) && (conUnidad || trasImporte)) return true;
  if (trasImporte && LISTA_IMPORTE.test(corrida)) return true;
  if (antes.endsWith("-") && LISTA_COORDENADAS.test(corrida)) return true;
  if (CUIT.test(corrida) && cuitValido(corrida)) return true;
  return declaradaPorPalabra(corrida, antes);
}

/**
 * ¿El texto (ya pasado por `paraRevisar`) trae números que no son una forma declarada? Las cifras que quedan fuera de
 * las formas se suman en TODO el campo: un teléfono partido en pedazos («4567 y 8901», «11456 - · - 78901») suma igual.
 */
// Días de un mes: hasta 3, crecientes («18, 19 y 20 de noviembre», «10 al 13 de marzo»). Se sacan antes de contar.
const MESES = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre";
const DIAS_DE_MES = new RegExp(`(?<!\\d)${DIA}(?:\\s*(?:,|y|al|a|-)\\s*${DIA}){0,2}\\s+de\\s+(?:${MESES})(?!\\p{L})`, "giu");
function sinDiasDeMes(t: string): string {
  return t.replace(DIAS_DE_MES, (m) => {
    const dias = m.match(/\d+/g)!.map(Number);
    return dias.every((d, i) => i === 0 || d > dias[i - 1]) ? " " : m;
  });
}

function numerosNoDeclarados(crudo: string): boolean {
  const t = sinDiasDeMes(crudo.replace(/\s+/g, " "));
  if (NUMERO_RARO.test(t)) return true;
  if (NOMBRA_TELEFONO.test(t)) return (t.match(/\d/g)?.length ?? 0) > MAX_CIFRAS_SUELTAS;
  let sueltas = 0;
  for (const m of t.matchAll(CORRIDA)) {
    const corrida = m[0];
    const fin = m.index + corrida.length;
    if (corridaDeclarada(corrida, t.slice(Math.max(0, m.index - 24), m.index), t.slice(fin, fin + 24))) continue;
    sueltas += corrida.replace(/\D/g, "").length;
    if (sueltas > MAX_CIFRAS_SUELTAS) return true;
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
