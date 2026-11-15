// ============================================================================
// EVENTOS Y SPONSORS — núcleo PURO (GSG-CRM-009 · pedido de MIA Producciones, 14/11/2026).
// ============================================================================
//
// Lo que relevó el equipo de agentes: los eventos de una región y las marcas que van a cada uno,
// con la URL donde se vio. Acá vive lo que no toca la base: la llave que impide duplicar, la
// validación del lote que se importa y los filtros de la pantalla.
//
// REGLA DURA: sólo hechos públicos de EMPRESAS. Ningún dato de contacto de personas: la fila que trae un
// mail, un enlace de contacto, un campo de contacto o números que no son una forma declarada queda afuera
// con su motivo y sin guardar el dato («rechazar por defecto», ver contacto.ts).

import { MAX_CIFRAS_SUELTAS_FILA, motivoDeTexto, revisarUrl } from "./contacto";

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

// Mails, teléfonos y números que podrían serlo: `contacto.ts` (rechazar por defecto).
export { motivoDeTexto, revisarUrl, traeContacto } from "./contacto";

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
    const conUrl = o && o.url !== undefined && o.url !== null && o.url !== "";
    const revisada = conUrl ? revisarUrl(o.url, MAX_URL) : null;
    const url = revisada?.ok ? revisada.url : null;
    const urlMala = conUrl && !url;
    const contacto = o && motivoDeContacto(o, { accion: o.accion, detalle: o.detalle });
    if (!o || !(PUESTOS as readonly string[]).includes(puesto) || !accion || !esHora(o.hora) || detalle === undefined || urlMala || contacto) {
      invalidas++;
      continue;
    }
    registro.push({ puesto: puesto as Puesto, accion, hora: new Date(o.hora as string).toISOString(), url, detalle });
  }
  return { registro, invalidas: invalidas + Math.max(0, v.length - MAX_REGISTRO_POR_ITEM) };
}

const SOLO_DOMINIO = "de la URL se guardó sólo el dominio: la ruta traía números que pueden ser un teléfono";

/**
 * ¿La fila trae un dato de contacto? Un campo que lo nombra (email, telefono, whatsapp…) o un texto libre con un mail,
 * un enlace de contacto o números no declarados. Devuelve el motivo SIN el dato (no se muestra ni se guarda).
 */
function motivoDeContacto(fila: Record<string, unknown>, textos: Record<string, unknown>): string | null {
  if (Object.keys(fila).some((k) => k !== "marcas" && k !== "registro" && campoProhibido(k))) return "trae un campo de datos de contacto de personas: la fila no se guarda";
  for (const [campo, v] of Object.entries(textos)) {
    if (typeof v !== "string") continue;
    const motivo = motivoDeTexto(v);
    if (motivo) return `el campo «${campo}» ${motivo}: la fila no se guarda`;
  }
  // Las cifras se suman en toda la fila: un teléfono partido entre «nombre» y «lugar» suma igual.
  const juntos = Object.values(textos).filter((v): v is string => typeof v === "string").join(" · ");
  if (motivoDeTexto(juntos, MAX_CIFRAS_SUELTAS_FILA)) return "entre sus campos trae números que pueden ser un teléfono: la fila no se guarda";
  return null;
}

/**
 * Valida el lote que trae el equipo de agentes. Formato:
 *   { "eventos": [ { nombre, fecha "AAAA-MM-DD", fechaHasta?, lugar, region, organizador?, urlFuente?,
 *                    marcas: [ { nombre, rol, urlFuente, nivel?, rubro?, web? } ] } ] }
 * También acepta el array de eventos suelto. Un evento inválido se rechaza con su motivo y el resto
 * entra; una marca inválida se rechaza sola. Datos de contacto de personas (o números que podrían serlo, ver
 * `contacto.ts`): esa fila queda afuera con su motivo y sin guardar el dato. Duplicados dentro del lote se unen.
 */
export function validarLote(entrada: unknown): LoteValidado {
  const rechazos: Rechazo[] = [];
  const crudo = Array.isArray(entrada) ? entrada : entrada && typeof entrada === "object" ? (entrada as { eventos?: unknown }).eventos : undefined;
  if (!Array.isArray(crudo)) return { ok: false, motivo: "El archivo no trae una lista de «eventos».", rechazos };
  if (crudo.length === 0) return { ok: false, motivo: "La lista de eventos está vacía.", rechazos };
  if (crudo.length > MAX_EVENTOS) return { ok: false, motivo: `Son ${crudo.length} eventos: el tope por importación es ${MAX_EVENTOS}.`, rechazos };

  const porClave = new Map<string, EventoDeLote>();
  crudo.forEach((e, i) => {
    const donde = `evento ${i + 1}`;
    if (!e || typeof e !== "object") return void rechazos.push({ donde, motivo: "no es un evento" });
    const o = e as Record<string, unknown>;
    const contacto = motivoDeContacto(o, { nombre: o.nombre, lugar: o.lugar, región: o.region, organizador: o.organizador, tipo: o.tipo });
    if (contacto) return void rechazos.push({ donde, motivo: contacto });
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
    if (reg.invalidas) rechazos.push({ donde: `${donde} (${nombre})`, motivo: `${reg.invalidas} línea(s) del registro no se guardan (puesto, hora o URL inválidos, o datos de contacto)` });
    const organizador = opcional(o.organizador);
    if (organizador === undefined) return void rechazos.push({ donde: `${donde} (${nombre})`, motivo: "el organizador no es válido" });
    let urlFuente: string | null = null;
    if (o.urlFuente !== undefined && o.urlFuente !== null && o.urlFuente !== "") {
      const r = revisarUrl(o.urlFuente, MAX_URL);
      if (!r) return void rechazos.push({ donde: `${donde} (${nombre})`, motivo: "la URL de la fuente no es http(s)" });
      if (!r.ok) return void rechazos.push({ donde: `${donde} (${nombre})`, motivo: `la URL de la fuente ${r.motivo}: no se guarda` });
      if (r.soloDominio) rechazos.push({ donde: `${donde} (${nombre})`, motivo: SOLO_DOMINIO });
      urlFuente = r.url;
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
      const mContacto = motivoDeContacto(mo, { nombre: mo.nombre, nivel: mo.nivel, rubro: mo.rubro, edición: mo.edicion });
      if (mContacto) return void rechazos.push({ donde: dm, motivo: mContacto });
      const mNombre = texto(mo.nombre, 160);
      if (!mNombre || !claveMarca(mNombre)) return void rechazos.push({ donde: dm, motivo: "falta el nombre de la marca" });
      const rol = rolDe(mo.rol);
      if (!rol) return void rechazos.push({ donde: `${dm} (${mNombre})`, motivo: "el rol no es uno de los conocidos" });
      const mRevisada = revisarUrl(mo.urlFuente, MAX_URL);
      if (!mRevisada) return void rechazos.push({ donde: `${dm} (${mNombre})`, motivo: "falta la URL de la fuente (http/https)" });
      if (!mRevisada.ok) return void rechazos.push({ donde: `${dm} (${mNombre})`, motivo: `la URL de la fuente ${mRevisada.motivo}: no se guarda` });
      if (mRevisada.soloDominio) rechazos.push({ donde: `${dm} (${mNombre})`, motivo: SOLO_DOMINIO });
      const mUrl = mRevisada.url;
      const nivel = opcional(mo.nivel, 60);
      const rubro = opcional(mo.rubro, 120);
      if (nivel === undefined || rubro === undefined) return void rechazos.push({ donde: `${dm} (${mNombre})`, motivo: "nivel o rubro inválido" });
      let web: string | null = null;
      if (mo.web !== undefined && mo.web !== null && mo.web !== "") {
        const w = revisarUrl(mo.web, MAX_URL);
        if (!w) return void rechazos.push({ donde: `${dm} (${mNombre})`, motivo: "la web no es http(s)" });
        if (!w.ok) return void rechazos.push({ donde: `${dm} (${mNombre})`, motivo: `la web ${w.motivo}: no se guarda` });
        web = w.url;
      }
      const edicion = opcional(mo.edicion, 40);
      const mVerif = verificacionDe(mo.verificacion);
      if (edicion === undefined || !mVerif) return void rechazos.push({ donde: `${dm} (${mNombre})`, motivo: "la edición o la verificación no son válidas" });
      const mReg = leerRegistro(mo.registro);
      if (mReg.invalidas) rechazos.push({ donde: `${dm} (${mNombre})`, motivo: `${mReg.invalidas} línea(s) del registro no se guardan (puesto, hora o URL inválidos, o datos de contacto)` });
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
  if (motivoDeTexto(t)) return { ok: false, motivo: "El pedido trae un mail o números que pueden ser un teléfono: este módulo no guarda datos de contacto de personas. Los años, fechas y cantidades sí van." };

  const r = typeof donde.region === "string" ? donde.region.trim().replace(/\s+/g, " ") : "";
  if (r.length > MAX_REGION_PEDIDO) return { ok: false, motivo: `La región es muy larga: hasta ${MAX_REGION_PEDIDO} caracteres.` };
  if (motivoDeTexto(r)) return { ok: false, motivo: "La región trae un mail o números que pueden ser un teléfono: este módulo no guarda datos de contacto de personas." };
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
