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
// Un tramo de dígitos con espacios, guiones, puntos, barras, guiones bajos o paréntesis entre medio.
const TRAMO_NUMERICO = /\+?\d[\d\s\-().\/_]{6,}\d/g;
// Antes de buscar: dígitos de ancho completo a normales (NFKC), invisibles afuera y guiones largos a «-». Una coma, «·» o
// «|» PEGADOS entre dígitos («11,5512,3456») unen el número; con espacio («2027 | 12, 13 y 14») son una lista y cortan.
function paraBuscarTelefonos(texto: string): string {
  return texto
    .normalize("NFKC")
    .replace(/[\u00AD\u200B-\u200F\u2060\uFEFF]/g, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/(?<=\d)[,·•|](?=\d)/g, "-")
    .replace(/[·•|]/g, ";");
}
// Lo que parece número pero no es teléfono: un día real (2026-11-14, 14/11/2026, «20-22/05/2025») o años
// seguidos con separador (2026-2027, «2026 2027»), entre 1990 y 2039 y crecientes. «2033-2044» o «20262027» sí cuentan.
const ANIO = /^(?:199\d|20[0-3]\d)$/;
function esDiaArgentino(t: string): boolean {
  const m = /^(\d{1,2})(?:\s?-\s?(\d{1,2}))?\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) return false;
  const [d1, d2, mes] = [Number(m[1]), m[2] === undefined ? Number(m[1]) : Number(m[2]), Number(m[3])];
  return ANIO.test(m[4]) && mes >= 1 && mes <= 12 && d1 >= 1 && d1 <= 31 && d2 >= d1 && d2 <= 31;
}
function noEsTelefono(tramo: string): boolean {
  if (esDia(tramo as unknown) || esDiaArgentino(tramo)) return true;
  // Años seguidos de verdad: cada uno después del anterior y a 5 o menos («2026-2027» sí; «2019-2031», un fijo, no).
  const anios = tramo.split(/[\s\-/_,]+/);
  return anios.every((a, i) => ANIO.test(a) && (i === 0 || (Number(a) > Number(anios[i - 1]) && Number(a) - Number(anios[i - 1]) <= 5)));
}

// Días dentro de un texto: se sacan antes de buscar teléfonos («2025 (20-22/05/2025)» no es un número), pero
// SÓLO si son un día de verdad y no siguen más dígitos: «1155-12-3456» o «2026-11-14T5491155…» no se borran.
const DIAS_EN_TEXTO = /(?<!\d)(?:\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?|\d{1,2}(?:\s?-\s?\d{1,2})?\/\d{1,2}\/\d{4})(?![\d:])/g;

function sinDias(texto: string): string {
  return texto.replace(DIAS_EN_TEXTO, (m) => (esDia(m.slice(0, 10)) && /^.{10}(T.*)?$/.test(m)) || esDiaArgentino(m) ? " " : m);
}

function hayTelefono(texto: string): boolean {
  // Sin tope de dígitos: dos teléfonos seguidos o uno con relleno («… 0000») suman más de 15 y siguen siendo contacto.
  for (const m of sinDias(paraBuscarTelefonos(texto)).match(TRAMO_NUMERICO) ?? []) {
    const tramo = m.trim();
    if (noEsTelefono(tramo)) continue;
    if (tramo.replace(/\D/g, "").length >= 8) return true;
  }
  return false;
}

/**
 * ¿Una URL lleva a una persona? mailto:/tel:, un mail en cualquier parte, links de WhatsApp
 * (wa.me, api.whatsapp.com, chat.whatsapp.com) o un parámetro de la query que nombra un contacto o
 * trae un teléfono. La RUTA no se mira por números: las fuentes traen ids largos (noticias/12345678).
 */
export function urlConContacto(url: string): boolean {
  const t = url.trim();
  if (/^(mailto|tel|sms|whatsapp):/i.test(t) || PARECE_MAIL.test(t) || PARECE_MAIL_OFUSCADO.test(decodeURIComponentSeguro(t))) return true;
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "wa.me" || host === "wa.link" || /(^|\.)whatsapp\.(com|net)$/.test(host)) return true;
  for (const [k, v] of u.searchParams) if (campoProhibido(k) || hayTelefono(v)) return true;
  // Lo que va después del # no lo usa el sitio: si trae un mail o un teléfono, es una nota escondida.
  const fragmento = decodeURIComponentSeguro(u.hash.slice(1));
  if (fragmento && traeContacto(fragmento)) return true;
  return false;
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
  if (PARECE_MAIL.test(t) || PARECE_MAIL_OFUSCADO.test(t) || /^(mailto|tel):/i.test(t.trim())) return true;
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
