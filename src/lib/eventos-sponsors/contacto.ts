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
// o más, la fila queda afuera (un teléfono partido en pedazos, «4567 y 8901», suma igual). Las formas cortas (5 cifras o
// menos) suman igual, salvo fechas, años y cantidades redondas. En toda la fila (sus campos juntos) el tope es 7: un fijo
// del AMBA partido entre «nombre» y «lugar» no entra. Formas declaradas:
//   · Fechas, horas y años (1950-2049), solos o en lista: «2026», «2015-2026», «14/11/2026», «20-22/05», «10.00-18.00»,
//     ISO «2026-11-14T23:14:46Z». Una lista hecha SÓLO de años tiene que crecer («2024-2019» no es un rango). Sin año de
//     2 cifras («23-07-24») y horas sin segundos, con minutos de a 5 («12:34:56», «15.19» no). Una fecha sin año va sola
//     (o con un año adelante): «21/02 20/02» no.
//   · Hasta 3 días crecientes de un mes («18, 19 y 20 de noviembre», «10 al 13 de marzo») y horarios en horas enteras
//     («14 a 20hs»), si no vienen pegados a otro número que no sea un año.
//   · Un año y una cifra de hasta 4 dígitos con su unidad: «En 2026: 1500 expositores» (no «1960-241», no «4567 · 2026»).
//   · Cantidades con miles, de hasta 9 cifras (redondas desde 6: «150.000»), una o dos, con unidad de una lista o «$»
//     antes: «12.500 asistentes».
//   · Importes después de «$», «US$» o «USD»: cifras de hasta 3 o con miles, uno o dos (redondos desde 6 cifras).
//   · Coordenadas de Argentina, de a pares: «-34.603722, -58.381592».
//   · CUIT de empresa (30, 33, 34) con dígito verificador válido; el de una persona lleva su DNI adentro.
//   · Después de su palabra y con su forma: ISBN-13 (con verificador), Resolución/Ley/Decreto/Disposición/Expediente
//     («1234/2025», «EXP-2026-0042», «27.430»).
// Un número escrito con otro alfabeto que no se puede llevar a 0-9 («❶») deja la fila afuera.
// Si el texto nombra un teléfono (palabras que empiezan con tel, cel, whats, mov, llam; wa, fax, contacto, informes,
// consultas, número, nro, línea, escribí, interno…), ninguna forma vale: 6 cifras o más en todo el texto (incluidos
// días y horarios) lo dejan afuera.
// Mails, también disfrazados: «juan @ gmail.com», «juan(at)gmail.com», «juan [@] gmail,com», «juan arroba gmail punto
// com», «juan@hotmail», «＠», y codificados una o más veces («%2540»).
//
// Rechazar de más se acepta y se ve en «Quedaron afuera»: «Stand 1210/1211», «$ 15000-25000», «Pabellones 1 a 8» en
// lista, «Matrícula 1234-5678», una cantidad sin unidad o de 6 cifras no redonda, «123.456 visitantes».
// Residuo aceptado y anotado:
//   · Dos años crecientes, o un año y una cifra de 4 con unidad, sin palabra de teléfono («Juan 2019-2031»): un fijo
//     de 8 cifras con esa forma tendría que empezar con 19 o 20, y los del AMBA empiezan con 4, 5 o 6 (provisional a
//     confirmar con el plan de numeración). Lo mismo una fecha completa válida («15-12-1974»).
//   · Un número con año después de Ley/Expte. («Expte. 97-2019») o dos importes redondos tras «$»: sólo con esa palabra
//     o ese signo adelante.
//   · Cifras escritas con letras («4S67-89OI», «cuatro cinco…»): fuera de alcance de una revisión de dígitos.
//   · Un teléfono partido entre filas (evento y marca, dos líneas del registro) o entre un texto y la ruta de una URL
//     (cada parte con 5 cifras o menos), y un local de 7 cifras partido entre dos campos de la misma fila (tope 7).
//     Son formas artificiales; sumarlas dejaba afuera eventos reales (un nombre con «133°» y su URL «/detalle/1234»).
//
// URLs: http(s), sin enlaces de contacto (mailto:, tel:, WhatsApp, Telegram) ni mails. Se guardan sin la query ni el
// fragmento; si la ruta trae números no declarados se guarda sólo el dominio; si el dominio los trae, no se guarda.

/** Dígitos de cualquier escritura a 0-9, ancho completo y superíndices a normales (NFKC), invisibles afuera, guiones a «-». */
export function paraRevisar(texto: string): string {
  return texto
    .normalize("NFKC")
    .replace(/[\p{Cf}\p{Mn}᠎\u115F\u1160\u3164\uFFA0]/gu, "") // también los «rellenos» hangul, que cuentan como letra
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
  `${DIA}[-./]${MES}[-./]${ANIO}`, // 14/11/2026, 14-11-2026 (el año de 2 cifras no: «23-07-24» puede ser un fijo)
  `${DIA}\\s?-\\s?${DIA}/${MES}/${ANIO}`, // 20-22/05/2025 (un rango de días, sólo con barra)
  `${MES}/${DIA}/${ANIO}`, // 11/14/2026
].join("|");
// Sin año, una sola por corrida y como mucho con un año adelante («14/11», «2027 (20-22/05)»): dos seguidas
// («21-02-20-02», «21/02 20/02») son un fijo escrito de a pares.
const FECHA_SIN_ANIO = `(?:${DIA}[-./]${MES}|${DIA}\\s?-\\s?${DIA}/${MES})`;
// Sin segundos y con minutos de a 5 («10.00», «14:30», «18:45»): «12:34:56» o «15.19» pueden ser parte de un teléfono.
const HORA = "(?:[01]?\\d|2[0-3])[:.][0-5][05]";
const TEMPORAL = `(?:${FECHA}|${HORA}|${ANIO})(?!\\d)`;
// Entre dos fechas u horas, un separador de un solo signo no puede ser «.» ni «:» («11.23.12.30» no es una lista).
const ENTRE_TEMPORALES = "(?:[^\\p{L}\\p{N}.:]|[^\\p{L}\\p{N}]{2,4})";
const LISTA_TEMPORAL = new RegExp(`^${TEMPORAL}(?:${ENTRE_TEMPORALES}${TEMPORAL})*$|^(?:${ANIO}${ENTRE_TEMPORALES})?${FECHA_SIN_ANIO}$`, "u");
const SOLO_ANIOS = new RegExp(`^${ANIO}(?:[^\\p{L}\\p{N}]{1,4}${ANIO})+$`, "u");
// Un año y DESPUÉS una cifra de hasta 4 dígitos con su unidad en letras («En 2026: 1500 expositores»). Al revés no:
// «4567 · 2026» tiene la forma de un fijo del AMBA.
// Entre los dos, un separador que no une números («-», «/», «.»): «1960-241» no es un año y una cifra.
const ANIO_Y_CIFRA = new RegExp(`^${ANIO}(?:\\s*[:|·,(]\\s*|\\s+)\\d{1,4}$`, "u");

// Cantidades con separador de miles (hasta 9 cifras: «12.500», «1.250.000», «12,500»), una o dos («150.000 - 200.000»),
// con su unidad en letras después o un «$» antes.
const CANTIDAD = "(?:\\d{1,3}(?:\\.\\d{3}){1,2}(?:,\\d{1,2})?|\\d{1,3}(?:,\\d{3}){1,2}(?:\\.\\d{1,2})?)";
const LISTA_CANTIDAD = new RegExp(`^${CANTIDAD}(?:\\s*-\\s*${CANTIDAD})?$`);
// Importes después de «$», «US$» o «USD»: cifras de hasta 3 o con miles, una o dos («$ 1.500 - $ 2.500», «$ 350»).
const IMPORTE = "(?:\\d{1,3}(?:[.,]\\d{3}){0,2}(?:,\\d{2})?)";
const LISTA_IMPORTE = new RegExp(`^${IMPORTE}(?:\\s*[-/]\\s*(?:\\$|US\\$|U\\$S)?\\s*${IMPORTE})?$`);
const ANTES_DE_IMPORTE = /(?:\$|(?<!\p{L})(?:USD|ARS))\s*$/iu;
// Coordenadas de Argentina: «-34.603722, -58.381592» (latitud y longitud entre -20 y -79).
// Siempre de a pares (latitud -21 a -55, longitud -53 a -73) y con hasta 6 decimales.
const LISTA_COORDENADAS = /^(?:2[1-9]|[34]\d|5[0-5])\.\d{4,6}\s*,?\s*-(?:5[3-9]|6\d|7[0-3])\.\d{4,6}$/;
// CUIT de empresa (30, 33, 34): el de una persona (20, 23, 24, 27) lleva su DNI adentro.
const CUIT = /^3[034]-\d{8}-\d$/;
const CUIT_SIN_GUIONES = /^3[034]\d{9}$/;
// La unidad, de una lista cerrada (con ordinal si viene: «35ª edición»): «421.234 Juan» no es una cantidad.
const DESPUES_UNIDAD = /^(?:[ao°]\.?)?\s*(?:edici[oó]n|personas|asistentes|visitantes|expositores|stands?|empresas|marcas|entradas|participantes|espectadores|invitados|inscriptos|compradores|profesionales|asientos|butacas|lugares|plazas|metros|mts|m2|hect[aá]reas|km|kil[oó]metros|millones|ediciones|charlas|conferencias|actividades|pabellones|sponsors|auspiciantes)(?!\p{L})/iu;

// Números después de una palabra que los declara, cada uno con su forma.
const PALABRAS_QUE_DECLARAN: { palabra: RegExp; forma: RegExp; valida?: (cifras: string) => boolean }[] = [
  { palabra: /isbn(?:-13)?/, forma: /^97[89](?:[- ]?\d){10}$/, valida: isbnValido },
  { palabra: /cuit/, forma: CUIT_SIN_GUIONES, valida: cuitValido },
  {
    palabra: /resoluci[oó]n|res\.|ley|decreto|disposici[oó]n|expediente|expte\.?|exp\.?/,
    forma: new RegExp(`^(?:(?:\\d{1,4}|\\d{1,2}\\.\\d{3})(?:[-/]${ANIO})?|${ANIO}[-/]\\d{1,4})$`),
  },
];
const ANTES_DE_NUMERO = "\\s*(?:n\\.?\\s*[º°o]?\\.?)?\\s*:?\\s*[-#]?\\s*$";

function isbnValido(c: string): boolean {
  const d = c.replace(/\D/g, "");
  const suma = [...d].reduce((s, x, i) => s + Number(x) * (i % 2 ? 3 : 1), 0);
  return d.length === 13 && suma % 10 === 0;
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
// Cualquier palabra que EMPIECE así (tel, cel, whats, mov, llam…) o sea wa/wsp/fax: «Teléf.», «Celu», «Mov.», «Contacto».
// Sobre-rechaza «Telecom 2026 4567» y parecidos: se acepta.
const NOMBRA_TELEFONO = /(?:^|[^\p{L}])(?:t[eé]l\p{L}*|cel\p{L}*|whats?\p{L}*|m[oó]v\p{L}*|llam\p{L}*|phone\p{L}*|fono|wa|wsp|wpp|fax|contacto|cont[aá]ct(?:anos|ate|arse)|informes|consultas|comun[ií]qu\p{L}*|comunic(?:ate|arse)|n[uú]mero\p{L}*|nros?|l[ií]nea\p{L}*|escrib\p{L}*|interno)(?=[^\p{L}]|$)/iu;

const CORRIDA = /\d(?:[^\p{L}\p{N}]{0,4}\d)*/gu;
/** Cifras sueltas (fuera de las formas declaradas) que admite un campo entero: un teléfono local tiene 6 o más. */
const MAX_CIFRAS_SUELTAS = 5;
/**
 * Las que admite una fila entera, sumando sus campos: un fijo del AMBA (8) partido entre «nombre» y «lugar» no entra.
 * Más alto que el de un campo para no perder eventos por la altura de la calle («Calle 1510» y «categoría 250»).
 */
export const MAX_CIFRAS_SUELTAS_FILA = 7;
const NUMERO_RARO = /[^\P{N}0-9]/u;

/**
 * Desde 6 cifras (sola o entre las dos de un rango) cada cantidad o importe tiene que ser redondo («150.000»,
 * «$ 1.500 - $ 2.500»): «421.234» o «11.456 - 78.901» son un teléfono.
 */
function redondas(corrida: string): boolean {
  const enteros = corrida.split(/\s*[-/]\s*(?:\$|US\$|U\$S)?\s*/).map((n) => n.replace(/[.,]\d{1,2}$/, "").replace(/\D/g, ""));
  return enteros.join("").length < 6 || enteros.every((e) => e.endsWith("00"));
}

function corridaDeclarada(corrida: string, antes: string, despues: string): boolean {
  if (LISTA_TEMPORAL.test(corrida)) {
    if (!SOLO_ANIOS.test(corrida)) return true;
    const anios = corrida.match(/\d{4}/g)!.map(Number);
    return anios.every((a, i) => i === 0 || a > anios[i - 1]);
  }
  const conUnidad = DESPUES_UNIDAD.test(despues);
  const trasImporte = ANTES_DE_IMPORTE.test(antes);
  if (ANIO_Y_CIFRA.test(corrida) && conUnidad) return true;
  if (LISTA_CANTIDAD.test(corrida) && (conUnidad || trasImporte) && redondas(corrida)) return true;
  if (trasImporte && LISTA_IMPORTE.test(corrida) && redondas(corrida)) return true;
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
  return t.replace(DIAS_DE_MES, (m, desde: number) => {
    const dias = m.match(/\d+/g)!.map(Number);
    return dias.every((d, i) => i === 0 || d > dias[i - 1]) && !pegadoAOtroNumero(t, desde) ? " " : m;
  });
}

/** ¿Lo que empieza en `desde` sigue a otro número que no es un año («4567, 12 y 30 de mayo» es un teléfono)? */
function pegadoAOtroNumero(t: string, desde: number): boolean {
  const antes = t.slice(Math.max(0, desde - 40), desde).match(/(\d[\d.\-/]*)[^\p{L}\p{N}]{0,4}$/u);
  return antes !== null && !new RegExp(`^${ANIO}$`).test(antes[1]);
}

const ISO_FECHA_HORA = new RegExp(`(?<!\\d)${ANIO}-${MES}-${DIA}T\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?(?:Z|[+-]\\d{2}:?\\d{2})?(?!\\d)`, "g");

// Un horario en horas enteras: «14 a 20hs», «de 10 a 18 h». Se saca antes de contar.
const HORARIO = /(?<!\d)(?:[01]?\d|2[0-3])(?:\s*(?:a|-|y)\s*(?:[01]?\d|2[0-3]))?\s*(?:hs|h|horas)(?!\p{L})/giu;

function numerosNoDeclarados(crudo: string, maxSueltas = MAX_CIFRAS_SUELTAS): boolean {
  const colapsado = crudo.replace(/\s+/g, " ");
  if (NUMERO_RARO.test(colapsado)) return true;
  // Con una palabra de teléfono no vale ninguna forma, ni los días ni los horarios: cuentan todas las cifras.
  if (NOMBRA_TELEFONO.test(colapsado)) return (colapsado.match(/\d/g)?.length ?? 0) > maxSueltas;
  const sinDias = sinDiasDeMes(colapsado.replace(ISO_FECHA_HORA, " "));
  const t = sinDias.replace(HORARIO, (m, desde: number) => (pegadoAOtroNumero(sinDias, desde) ? m : " "));
  let sueltas = 0;
  for (const m of t.matchAll(CORRIDA)) {
    const corrida = m[0];
    const fin = m.index + corrida.length;
    const cifras = corrida.replace(/\D/g, "").length;
    // Una forma corta (5 cifras o menos) que no es fecha, año ni cantidad redonda suma igual: «Expte 11456, Ana 78901».
    const exenta = cifras > MAX_CIFRAS_SUELTAS || LISTA_TEMPORAL.test(corrida) || /^\d{1,3}(?:[.,]?\d{3})?$/.test(corrida) && /00$/.test(corrida);
    if (exenta && corridaDeclarada(corrida, t.slice(Math.max(0, m.index - 24), m.index), t.slice(fin, fin + 24))) continue;
    sueltas += cifras;
    if (sueltas > maxSueltas) return true;
  }
  return false;
}

// ── Mails y enlaces de contacto ──────────────────────────────────────────────

const PARECE_MAIL = /[^\s@]+@[^\s@]+\.\p{L}{2,}/iu;
// Disfrazados: «josé @ gmail.com», «juan(at)gmail.com», «juan [arroba] gmail . com», «juan arroba gmail punto com»,
// «juan AT gmail DOT com».
const ARROBA = "(?:@|[([{]\\s*(?:at|arroba|@|a)\\s*[)\\]}]|\\s(?:at|arroba)\\s)";
const PUNTO = "(?:[.,。｡]|[([{]\\s*(?:dot|punto)\\s*[)\\]}]|\\s(?:dot|punto)\\s)";
// Una arroba pegada a un usuario y a un dominio, aunque falte el «.com»: «juan@hotmail». («@expo» suelto no.)
const ARROBA_PEGADA = /[\p{L}\p{N}._%+-]@[\p{L}\p{N}]/u;
const PARECE_MAIL_OFUSCADO = new RegExp(`[\\p{L}\\p{N}._%+-]+\\s*${ARROBA}\\s*[\\p{L}\\p{N}-]+\\s*${PUNTO}\\s*\\p{L}{2,}`, "iu");
const ESQUEMA_DE_CONTACTO = /^\s*(?:mailto|tel|sms|whatsapp|callto|skype):/i;
const HOST_DE_CONTACTO = /^(?:wa\.me|wa\.link|t\.me|telegram\.me|(?:[a-z0-9-]+\.)*whatsapp\.(?:com|net))$/;

/** Decodifica lo que se pueda: un «%» suelto no deja el resto codificado. */
/** Decodifica hasta que no cambie: «%2540» es «%40», que es «@». */
function decodificar(s: string): string {
  let actual = s;
  for (let i = 0; i < 5; i++) {
    const siguiente = decodificarUnaVez(actual);
    if (siguiente === actual) break;
    actual = siguiente;
  }
  return actual;
}

function decodificarUnaVez(s: string): string {
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
  const d = paraRevisar(decodificar(t)); // «＠» de ancho completo, también codificado, es una arroba
  return PARECE_MAIL.test(d) || PARECE_MAIL_OFUSCADO.test(d) || ARROBA_PEGADA.test(d);
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
  // Un dominio con letras de otro alfabeto llega en punycode («xn--…»), que esconde sus dígitos; un puerto es un número más.
  if (u.port || /(?:^|\.)xn--/.test(host)) return { ok: false, motivo: "el dominio trae números o letras que no se pueden revisar" };
  const dominio = paraRevisar(host.replace(/\./g, " "));
  if (/^\d+(?:\.\d+){3}$/.test(host) || numerosNoDeclarados(dominio)) return { ok: false, motivo: "el dominio trae números que pueden ser un teléfono" };
  // Dominio y ruta se cuentan juntos: «4567.ar/8901» es un teléfono partido entre los dos.
  // La ruta se mira cruda, decodificada una vez y del todo: «45%2567%8901» esconde cifras en cada lectura.
  const lecturas = [u.pathname, decodificarUnaVez(u.pathname), decodificar(u.pathname)];
  const soloDominio = lecturas.some((ruta) => numerosNoDeclarados(`${dominio} / ${paraRevisar(ruta)}`));
  const url = soloDominio ? `${u.origin}/` : `${u.origin}${u.pathname}`;
  if (url.length > maximo) return null;
  return { ok: true, url, soloDominio };
}

/**
 * ¿Por qué este texto libre no se puede guardar? null = se puede. Los enlaces dentro del texto se miran como URL
 * (contacto) y también como texto (sus números, query incluida: el texto se guarda tal cual).
 */
export function motivoDeTexto(texto: string, maxSueltas = MAX_CIFRAS_SUELTAS): string | null {
  const t = paraRevisar(texto);
  if (traeMail(t) || ESQUEMA_DE_CONTACTO.test(t)) return "trae un mail o un enlace de contacto";
  let resto = t;
  for (const enlace of t.match(/\b(?:https?:\/\/|www\.)\S+/gi) ?? []) {
    const r = revisarUrl(enlace.startsWith("www.") ? `https://${enlace}` : enlace);
    if (r && !r.ok && r.motivo.startsWith("es un enlace")) return "trae un enlace de contacto";
    resto = resto.replace(enlace, ` ${decodificar(enlace).replace(/^[a-z]+:\/\//i, "").replace(/[?&=#+%]/g, " ")} `);
  }
  if (numerosNoDeclarados(resto, maxSueltas)) return "trae números que no son un año, una fecha, una cantidad ni un importe (pueden ser un teléfono)";
  return null;
}

/** ¿El texto trae un dato de contacto de una persona, o números que podrían serlo? */
export function traeContacto(texto: string): boolean {
  return motivoDeTexto(texto) !== null;
}
