// ============================================================================
// INMOBILIARIA — reglas puras del módulo (sin base, sin Next): propiedades, precios,
// consultas, contratos de alquiler, ajuste por índice, cuotas, mora y liquidaciones al
// propietario. Todo lo que se puede probar sin levantar nada.
// ============================================================================
//
// Las fechas de negocio viajan como DÍA ("2026-11-01") y los meses como PERÍODO ("2026-11"):
// un contrato no tiene hora, y así ninguna cuenta depende del huso de quien la corre.
// `hoy` siempre se inyecta.
//
// 🔶 A VALIDAR con el contador y con la cláusula de cada contrato (está dicho también en
// docs/tenants/inmobiliaria/README.md): la convención del ajuste por IPC (qué meses compara),
// el cálculo de la mora (interés simple diario) y la base de la comisión de administración.

import { redondearAlCentavo } from "@/lib/dinero/redondeo";

// Mensajes y plata: una sola implementación en el motor. Nacieron en el taller; cuando un
// tercer módulo las pida, suben a una carpeta común y este renglón no cambia.
export { armarMensaje, fechaCorta, pesos, waLink } from "@/lib/taller/core";

export const redondear = redondearAlCentavo;

// ── Días y períodos ─────────────────────────────────────────────────────────

/** Día de negocio, "AAAA-MM-DD". */
export type Dia = string;
/** Mes de negocio, "AAAA-MM". */
export type Periodo = string;

const DIA_MS = 86_400_000;
const dos = (n: number): string => String(n).padStart(2, "0");

export const esDia = (v: unknown): v is Dia => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** El día que es en Argentina (UTC−3, sin horario de verano) para un instante. */
export function diaDe(instante: Date): Dia {
  return new Date(instante.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

/** El instante que guarda la base para un día: mediodía de Argentina (no cambia de día en ningún huso). */
export const instanteDe = (dia: Dia): Date => new Date(`${dia}T12:00:00-03:00`);

export const periodoDe = (dia: Dia): Periodo => dia.slice(0, 7);

const partes = (dia: Dia): [number, number, number] => [Number(dia.slice(0, 4)), Number(dia.slice(5, 7)), Number(dia.slice(8, 10))];
const diasDelMes = (anio: number, mes: number): number => new Date(Date.UTC(anio, mes, 0)).getUTCDate();

export function sumarMeses(periodo: Periodo, n: number): Periodo {
  const total = Number(periodo.slice(0, 4)) * 12 + (Number(periodo.slice(5, 7)) - 1) + n;
  return `${Math.floor(total / 12)}-${dos((total % 12) + 1)}`;
}

/** Mismo día del mes, n meses después. El 31 en un mes de 30 cae el 30. */
export function sumarMesesADia(dia: Dia, n: number): Dia {
  const [, , d] = partes(dia);
  const p = sumarMeses(periodoDe(dia), n);
  const tope = diasDelMes(Number(p.slice(0, 4)), Number(p.slice(5, 7)));
  return `${p}-${dos(Math.min(d, tope))}`;
}

export function sumarDias(dia: Dia, n: number): Dia {
  return new Date(Date.parse(`${dia}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);
}

/** Días corridos de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: Dia, hasta: Dia): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS);
}

/** "noviembre de 2026". */
export function nombrePeriodo(periodo: Periodo): string {
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${MESES[Number(periodo.slice(5, 7)) - 1] ?? periodo} de ${periodo.slice(0, 4)}`;
}

/** 01/11/2026. */
export const diaCorto = (dia: Dia | null | undefined): string => (dia && esDia(dia) ? `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}` : "");

// ── Propiedad ───────────────────────────────────────────────────────────────

export const TIPOS = ["DEPARTAMENTO", "CASA", "PH", "DUPLEX", "TERRENO", "LOCAL", "OFICINA", "GALPON", "COCHERA", "QUINTA", "EDIFICIO"] as const;
export type TipoPropiedad = (typeof TIPOS)[number];

export const TIPO_LABEL: Record<TipoPropiedad, string> = {
  DEPARTAMENTO: "Departamento",
  CASA: "Casa",
  PH: "PH",
  DUPLEX: "Dúplex",
  TERRENO: "Terreno",
  LOCAL: "Local",
  OFICINA: "Oficina",
  GALPON: "Galpón",
  COCHERA: "Cochera",
  QUINTA: "Quinta",
  EDIFICIO: "Edificio",
};

export const TIPO_PLURAL: Record<TipoPropiedad, string> = {
  DEPARTAMENTO: "Departamentos",
  CASA: "Casas",
  PH: "PH",
  DUPLEX: "Dúplex",
  TERRENO: "Terrenos",
  LOCAL: "Locales",
  OFICINA: "Oficinas",
  GALPON: "Galpones",
  COCHERA: "Cocheras",
  QUINTA: "Quintas",
  EDIFICIO: "Edificios",
};

export const esTipo = (v: unknown): v is TipoPropiedad => typeof v === "string" && (TIPOS as readonly string[]).includes(v);

export const ESTADOS_PROPIEDAD = ["BORRADOR", "PUBLICADA", "RESERVADA", "ALQUILADA", "VENDIDA", "PAUSADA"] as const;
export type EstadoPropiedad = (typeof ESTADOS_PROPIEDAD)[number];

export const ESTADO_PROPIEDAD_LABEL: Record<EstadoPropiedad, string> = {
  BORRADOR: "Borrador",
  PUBLICADA: "Publicada",
  RESERVADA: "Reservada",
  ALQUILADA: "Alquilada",
  VENDIDA: "Vendida",
  PAUSADA: "Pausada",
};

export const esEstadoPropiedad = (v: unknown): v is EstadoPropiedad => typeof v === "string" && (ESTADOS_PROPIEDAD as readonly string[]).includes(v);

/** Lo que ve la calle: lo publicado y lo reservado (con su cartel). El resto es interno. */
export const ESTADOS_EN_LA_WEB: readonly EstadoPropiedad[] = ["PUBLICADA", "RESERVADA"];

export const MONEDAS = ["ARS", "USD"] as const;
export type Moneda = (typeof MONEDAS)[number];
export const esMoneda = (v: unknown): v is Moneda => v === "ARS" || v === "USD";

export const OPERACIONES = ["venta", "alquiler"] as const;
export type Operacion = (typeof OPERACIONES)[number];
export const esOperacion = (v: unknown): v is Operacion => v === "venta" || v === "alquiler";

/** Precio de cartel: sin centavos. "USD 75.000" · "$ 480.000". Sin precio: "Consultar". */
export function precio(monto: number | null | undefined, moneda: string | null | undefined): string {
  if (!Number.isFinite(monto as number) || (monto as number) <= 0) return "Consultar";
  const n = Math.round(monto as number).toLocaleString("es-AR");
  return moneda === "USD" ? `USD ${n}` : `$ ${n}`;
}

export interface PropiedadCartel {
  tipo: string;
  enVenta: boolean;
  enAlquiler: boolean;
  precioVenta: number | null;
  monedaVenta: string;
  precioAlquiler: number | null;
  monedaAlquiler: string;
}

/** El precio que se muestra para una operación; si no se pide ninguna, la principal de la ficha. */
export function precioDeCartel(p: PropiedadCartel, operacion?: Operacion | null): { operacion: Operacion; texto: string } {
  const op: Operacion = operacion && (operacion === "venta" ? p.enVenta : p.enAlquiler) ? operacion : p.enVenta ? "venta" : "alquiler";
  return op === "venta"
    ? { operacion: "venta", texto: precio(p.precioVenta, p.monedaVenta) }
    : { operacion: "alquiler", texto: `${precio(p.precioAlquiler, p.monedaAlquiler)}${(p.precioAlquiler ?? 0) > 0 ? " / mes" : ""}` };
}

// Siglas que quedan en mayúsculas cuando se arregla un título escrito a los gritos.
const SIGLAS = new Set(["PH", "USD", "UVA", "SUM", "ABL", "AYSA", "PB", "GBA", "CABA", "IVA"]);
const MINUSCULAS = new Set(["de", "del", "la", "las", "el", "los", "en", "con", "y", "a", "al", "sobre", "por", "para", "sin", "e", "o", "u"]);

/**
 * Arregla un título cargado TODO EN MAYÚSCULAS: lo pasa a oración, deja las siglas, y devuelve
 * la mayúscula a los nombres propios que se le pasen (localidad, barrio). Un título que ya
 * viene bien escrito no se toca.
 */
export function tituloProlijo(raw: string | null | undefined, nombresPropios: readonly string[] = []): string {
  const limpio = (raw ?? "").replace(/\s+/g, " ").replace(/\s*-\s*$/g, "").trim();
  if (!limpio) return "";
  const letras = limpio.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
  const mayus = letras.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, "").length;
  if (letras.length === 0 || mayus / letras.length < 0.6) return limpio;

  let out = limpio
    .toLowerCase()
    .split(" ")
    .map((palabra, i) => {
      const pelada = palabra.replace(/[^a-záéíóúüñ0-9²]/g, "");
      if (SIGLAS.has(pelada.toUpperCase())) return palabra.toUpperCase();
      if (pelada === "m²" || pelada === "m2") return "m²";
      if (i === 0 || !MINUSCULAS.has(pelada)) return i === 0 ? palabra.charAt(0).toUpperCase() + palabra.slice(1) : palabra;
      return palabra;
    })
    .join(" ");
  // Después de un separador (" - ", ". ") arranca otra frase.
  out = out.replace(/(\s[-–·]\s|\.\s)([a-záéíóúüñ])/g, (_, sep: string, l: string) => sep + l.toUpperCase());
  for (const nombre of nombresPropios) {
    const n = nombre.trim();
    if (n.length < 3) continue;
    out = out.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), n);
  }
  return out;
}

/** "Departamento de 3 ambientes en alquiler en Monte Grande" — para fichas sin título. */
export function tituloSugerido(p: { tipo: string; ambientes?: number | null; enVenta: boolean; enAlquiler: boolean; localidad?: string | null; barrio?: string | null }): string {
  const tipo = esTipo(p.tipo) ? TIPO_LABEL[p.tipo] : "Propiedad";
  const amb = p.ambientes && p.ambientes > 0 && p.tipo !== "TERRENO" ? ` de ${p.ambientes} ambiente${p.ambientes > 1 ? "s" : ""}` : "";
  const op = p.enVenta && p.enAlquiler ? " en venta y alquiler" : p.enAlquiler ? " en alquiler" : " en venta";
  const donde = [p.barrio, p.localidad].filter((v) => v && v.trim()).join(", ");
  return `${tipo}${amb}${op}${donde ? ` en ${donde}` : ""}`;
}

/** Texto para URL: sin acentos, minúsculas y guiones. */
export function aSlug(texto: string, max = 70): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** El link público de una ficha: título legible + código, que es lo que la hace única. */
export const slugDePropiedad = (titulo: string, codigo: string): string => [aSlug(titulo), aSlug(codigo, 20)].filter(Boolean).join("-");

/** Código correlativo de la casa: PRO-0001, PRO-0002… */
export function siguienteCodigo(ultimo: string | null | undefined, prefijo = "PRO"): string {
  const n = Number((ultimo ?? "").match(/(\d+)\s*$/)?.[1] ?? 0);
  return `${prefijo}-${String(n + 1).padStart(4, "0")}`;
}

export interface PropiedadResumen {
  tipo: string;
  ambientes?: number | null;
  dormitorios?: number | null;
  banos?: number | null;
  cocheras?: number | null;
  supCubierta?: number | null;
  supTotal?: number | null;
}

/** Los datos duros de la tarjeta, en el orden en que la gente los busca. */
export function datosClave(p: PropiedadResumen): { clave: string; valor: string }[] {
  const out: { clave: string; valor: string }[] = [];
  const sup = p.tipo === "TERRENO" ? (p.supTotal ?? p.supCubierta) : (p.supCubierta ?? p.supTotal);
  if (p.ambientes && p.tipo !== "TERRENO") out.push({ clave: "ambientes", valor: `${p.ambientes} amb.` });
  if (p.dormitorios) out.push({ clave: "dormitorios", valor: `${p.dormitorios} dorm.` });
  if (p.banos) out.push({ clave: "banos", valor: `${p.banos} baño${p.banos > 1 ? "s" : ""}` });
  if (p.cocheras) out.push({ clave: "cocheras", valor: `${p.cocheras} cochera${p.cocheras > 1 ? "s" : ""}` });
  if (sup) out.push({ clave: "superficie", valor: `${Math.round(sup).toLocaleString("es-AR")} m²` });
  return out;
}

export type ClaveEtiqueta = "reservada" | "nuevo" | "bajo-de-precio" | "apto-credito";
export interface Etiqueta {
  clave: ClaveEtiqueta;
  texto: string;
}

export const DIAS_NUEVO = 21;
export const DIAS_BAJO_DE_PRECIO = 30;

/** Los carteles de una ficha. Como mucho dos, el más importante primero. */
export function etiquetas(
  p: { estado: string; publicadaEl?: Dia | null; bajoDePrecioEl?: Dia | null; aptoCredito?: boolean; enVenta?: boolean },
  hoy: Dia,
): Etiqueta[] {
  const out: Etiqueta[] = [];
  if (p.estado === "RESERVADA") out.push({ clave: "reservada", texto: "Reservada" });
  if (p.bajoDePrecioEl && diasEntre(p.bajoDePrecioEl, hoy) <= DIAS_BAJO_DE_PRECIO && diasEntre(p.bajoDePrecioEl, hoy) >= 0) out.push({ clave: "bajo-de-precio", texto: "Bajó de precio" });
  else if (p.publicadaEl && diasEntre(p.publicadaEl, hoy) <= DIAS_NUEVO && diasEntre(p.publicadaEl, hoy) >= 0) out.push({ clave: "nuevo", texto: "Nuevo" });
  if (p.aptoCredito && p.enVenta) out.push({ clave: "apto-credito", texto: "Apto crédito" });
  return out.slice(0, 2);
}

// ── Calidad de la ficha ─────────────────────────────────────────────────────
// Una ficha floja no recibe consultas. Antes de publicar se le dice al que carga qué le falta.

export interface FichaParaRevisar {
  titulo: string;
  descripcion: string;
  localidad: string;
  direccion: string;
  enVenta: boolean;
  enAlquiler: boolean;
  precioVenta: number | null;
  precioAlquiler: number | null;
  tipo: string;
  ambientes: number | null;
  supCubierta: number | null;
  supTotal: number | null;
  fotos: number;
  lat: number | null;
  lng: number | null;
}

export interface RevisionFicha {
  /** 0 a 100. */
  puntaje: number;
  /** Sin esto no se publica. */
  bloqueos: string[];
  /** Con esto recibe más consultas. */
  mejoras: string[];
}

export const FOTOS_RECOMENDADAS = 8;
export const DESCRIPCION_RECOMENDADA = 200;

export function revisarFicha(f: FichaParaRevisar): RevisionFicha {
  const bloqueos: string[] = [];
  const mejoras: string[] = [];
  let puntos = 0;
  const suma = (ok: boolean, valor: number, falta: string, bloquea = false) => {
    if (ok) puntos += valor;
    else (bloquea ? bloqueos : mejoras).push(falta);
  };
  const gritado = /[A-ZÁÉÍÓÚÑ]{4,}/.test(f.titulo) && tituloProlijo(f.titulo) !== f.titulo.trim();

  suma(f.titulo.trim().length >= 12, 10, "Falta un título claro (qué es y dónde queda).", true);
  suma(!gritado, 5, "El título está todo en mayúsculas: en letra normal se lee mejor.");
  suma(f.enVenta || f.enAlquiler, 5, "Falta decir si se vende, se alquila o las dos cosas.", true);
  suma((!f.enVenta || (f.precioVenta ?? 0) > 0) && (!f.enAlquiler || (f.precioAlquiler ?? 0) > 0), 15, "Falta el precio. Las fichas sin precio reciben muchas menos consultas.");
  suma(f.localidad.trim().length > 0, 10, "Falta la localidad.", true);
  suma(f.direccion.trim().length > 0, 5, "Falta la dirección (se puede mostrar sólo la zona).");
  suma(f.lat != null && f.lng != null, 5, "Falta ubicarla en el mapa.");
  suma(f.fotos >= 1, 10, "Falta al menos una foto.", true);
  suma(f.fotos >= FOTOS_RECOMENDADAS, 15, `Sumá fotos: con ${FOTOS_RECOMENDADAS} o más se consulta más.`);
  suma(f.descripcion.trim().length >= DESCRIPCION_RECOMENDADA, 10, "La descripción es corta: contá los ambientes, el estado y qué hay cerca.");
  suma(f.tipo === "TERRENO" || (f.ambientes ?? 0) > 0, 5, "Falta la cantidad de ambientes.");
  suma((f.supCubierta ?? 0) > 0 || (f.supTotal ?? 0) > 0, 5, "Faltan los metros cuadrados.");
  return { puntaje: Math.min(100, puntos), bloqueos, mejoras };
}

// ── Búsqueda pública ────────────────────────────────────────────────────────

export const ORDENES = ["recientes", "precio-asc", "precio-desc"] as const;
export type Orden = (typeof ORDENES)[number];

export interface Filtros {
  operacion: Operacion | null;
  tipo: TipoPropiedad | null;
  localidad: string | null;
  ambientes: number | null;
  dormitorios: number | null;
  precioMin: number | null;
  precioMax: number | null;
  aptoCredito: boolean;
  texto: string | null;
  orden: Orden;
  pagina: number;
}

type Crudo = Record<string, string | string[] | undefined>;
const uno = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();
/** Un entero positivo, con o sin puntos de miles. "-4", "3,5" o "muchos" no son un número: se ignoran. */
const positivo = (v: string, tope: number): number | null => {
  const s = v.replace(/[.\s$]/g, "");
  if (!/^\d{1,15}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? Math.min(n, tope) : null;
};

/** Lee los filtros de la URL. Lo que no entiende lo ignora: una URL rota nunca rompe la página. */
export function leerFiltros(q: Crudo): Filtros {
  const operacion = uno(q.operacion);
  const tipo = uno(q.tipo).toUpperCase();
  const orden = uno(q.orden);
  return {
    operacion: esOperacion(operacion) ? operacion : null,
    tipo: esTipo(tipo) ? tipo : null,
    localidad: uno(q.localidad).slice(0, 60) || null,
    ambientes: positivo(uno(q.ambientes), 10),
    dormitorios: positivo(uno(q.dormitorios), 10),
    precioMin: positivo(uno(q.desde), 1e12),
    precioMax: positivo(uno(q.hasta), 1e12),
    aptoCredito: uno(q.credito) === "1",
    texto: uno(q.q).slice(0, 80) || null,
    orden: (ORDENES as readonly string[]).includes(orden) ? (orden as Orden) : "recientes",
    pagina: positivo(uno(q.pagina), 500) ?? 1,
  };
}

/** La URL de una búsqueda (sólo lleva lo que no es el valor por defecto). */
export function urlDeBusqueda(f: Partial<Filtros>, base = "/propiedades"): string {
  const q = new URLSearchParams();
  if (f.operacion) q.set("operacion", f.operacion);
  if (f.tipo) q.set("tipo", f.tipo.toLowerCase());
  if (f.localidad) q.set("localidad", f.localidad);
  if (f.ambientes) q.set("ambientes", String(f.ambientes));
  if (f.dormitorios) q.set("dormitorios", String(f.dormitorios));
  if (f.precioMin) q.set("desde", String(f.precioMin));
  if (f.precioMax) q.set("hasta", String(f.precioMax));
  if (f.aptoCredito) q.set("credito", "1");
  if (f.texto) q.set("q", f.texto);
  if (f.orden && f.orden !== "recientes") q.set("orden", f.orden);
  if (f.pagina && f.pagina > 1) q.set("pagina", String(f.pagina));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** "Departamentos en alquiler en Monte Grande" — título de la búsqueda, para la gente y para Google. */
export function tituloDeBusqueda(f: Pick<Filtros, "operacion" | "tipo" | "localidad">): string {
  const que = f.tipo ? TIPO_PLURAL[f.tipo] : "Propiedades";
  const op = f.operacion ? ` en ${f.operacion}` : "";
  return `${que}${op}${f.localidad ? ` en ${f.localidad}` : ""}`;
}

/** Descripción para buscadores y para cuando se comparte el link: una frase, sin gritos, hasta 160 caracteres. */
export function descripcionSeo(p: PropiedadCartel & PropiedadResumen & { titulo: string; localidad: string; descripcion: string }): string {
  const datos = datosClave(p).map((d) => d.valor).join(", ");
  const base = `${tituloProlijo(p.titulo, [p.localidad])}. ${precioDeCartel(p).texto}${datos ? ` · ${datos}` : ""}.`;
  const resto = tituloProlijo(p.descripcion.replace(/\s+/g, " ").trim(), [p.localidad]);
  const texto = resto ? `${base} ${resto}` : base;
  return texto.length <= 160 ? texto : `${texto.slice(0, 157).replace(/\s+\S*$/, "")}…`;
}

// ── Consultas ───────────────────────────────────────────────────────────────

export const ESTADOS_CONSULTA = ["NUEVA", "CONTACTADA", "VISITA", "NEGOCIACION", "GANADA", "PERDIDA"] as const;
export type EstadoConsulta = (typeof ESTADOS_CONSULTA)[number];

export const ESTADO_CONSULTA_LABEL: Record<EstadoConsulta, string> = {
  NUEVA: "Sin responder",
  CONTACTADA: "Contactada",
  VISITA: "Visita coordinada",
  NEGOCIACION: "En negociación",
  GANADA: "Operación cerrada",
  PERDIDA: "No siguió",
};

export const esEstadoConsulta = (v: unknown): v is EstadoConsulta => typeof v === "string" && (ESTADOS_CONSULTA as readonly string[]).includes(v);
export const CONSULTA_ABIERTA: readonly EstadoConsulta[] = ["NUEVA", "CONTACTADA", "VISITA", "NEGOCIACION"];

export const TIPOS_CONSULTA = ["CONSULTA", "VISITA", "TASACION"] as const;
export type TipoConsulta = (typeof TIPOS_CONSULTA)[number];
export const TIPO_CONSULTA_LABEL: Record<TipoConsulta, string> = { CONSULTA: "Consulta", VISITA: "Pide visita", TASACION: "Quiere tasar" };
export const esTipoConsulta = (v: unknown): v is TipoConsulta => typeof v === "string" && (TIPOS_CONSULTA as readonly string[]).includes(v);

export const ORIGENES = ["WEB", "WHATSAPP", "PORTAL", "MOSTRADOR", "REFERIDO"] as const;
export type Origen = (typeof ORIGENES)[number];
export const ORIGEN_LABEL: Record<Origen, string> = { WEB: "Sitio web", WHATSAPP: "WhatsApp", PORTAL: "Portal", MOSTRADOR: "Oficina", REFERIDO: "Recomendado" };
export const esOrigen = (v: unknown): v is Origen => typeof v === "string" && (ORIGENES as readonly string[]).includes(v);

// El que responde primero suele quedarse con el cliente. Umbrales provisionales, editables.
export const MIN_ATENCION = 15;
export const MIN_TARDE = 120;
export type Urgencia = "al-dia" | "atencion" | "tarde";

/** Minutos que lleva una consulta sin primera respuesta (0 si ya se respondió). */
export function minutosSinResponder(creada: Date, respondida: Date | null | undefined, ahora: Date): number {
  if (respondida) return 0;
  return Math.max(0, Math.floor((ahora.getTime() - creada.getTime()) / 60_000));
}

export function urgencia(minutos: number): Urgencia {
  return minutos >= MIN_TARDE ? "tarde" : minutos >= MIN_ATENCION ? "atencion" : "al-dia";
}

/** "hace 12 min" · "hace 3 h" · "hace 2 días". */
export function haceCuanto(minutos: number): string {
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  if (minutos < 1440) return `hace ${Math.floor(minutos / 60)} h`;
  const dias = Math.floor(minutos / 1440);
  return `hace ${dias} día${dias > 1 ? "s" : ""}`;
}

export interface ConsultaEntrante {
  nombre: string;
  telefono: string;
  email: string;
  mensaje: string;
}

/** Valida lo que llega del formulario público. Devuelve el dato limpio o el error para mostrar. */
export function validarConsulta(c: Partial<ConsultaEntrante>): { ok: true; dato: ConsultaEntrante } | { ok: false; error: string } {
  const nombre = (c.nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const telefono = (c.telefono ?? "").replace(/[^\d+]/g, "").slice(0, 20);
  const email = (c.email ?? "").trim().toLowerCase().slice(0, 120);
  const mensaje = (c.mensaje ?? "").trim().slice(0, 1000);
  if (nombre.length < 2) return { ok: false, error: "Decinos tu nombre." };
  if (telefono.replace(/\D/g, "").length < 8 && !email) return { ok: false, error: "Dejanos un teléfono o un mail para responderte." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: "Revisá el mail: parece que le falta algo." };
  return { ok: true, dato: { nombre, telefono, email, mensaje } };
}

// ── Contrato de alquiler ────────────────────────────────────────────────────

export const INDICES = ["ICL", "IPC", "CASA_PROPIA", "FIJO", "SIN_AJUSTE"] as const;
export type IndiceAjuste = (typeof INDICES)[number];

export const INDICE_LABEL: Record<IndiceAjuste, string> = {
  ICL: "ICL (Banco Central)",
  IPC: "IPC (INDEC)",
  CASA_PROPIA: "Casa Propia",
  FIJO: "Porcentaje fijo",
  SIN_AJUSTE: "Sin ajuste",
};

export const esIndice = (v: unknown): v is IndiceAjuste => typeof v === "string" && (INDICES as readonly string[]).includes(v);
/** Los que necesitan que alguien cargue la serie publicada. */
export const usaSerie = (i: IndiceAjuste): boolean => i === "ICL" || i === "IPC" || i === "CASA_PROPIA";

export const ESTADOS_CONTRATO = ["VIGENTE", "FINALIZADO", "RESCINDIDO"] as const;
export type EstadoContrato = (typeof ESTADOS_CONTRATO)[number];
export const ESTADO_CONTRATO_LABEL: Record<EstadoContrato, string> = { VIGENTE: "Vigente", FINALIZADO: "Finalizado", RESCINDIDO: "Rescindido" };

export interface ContratoCalc {
  inicio: Dia;
  fin: Dia;
  montoInicial: number;
  /** Día del mes en que vence la cuota (1 a 28). */
  diaVencimiento: number;
  ajusteIndice: IndiceAjuste;
  /** Cada cuántos meses se ajusta (3, 4, 6, 12…). */
  ajusteCadaMeses: number;
  /** Sólo con índice FIJO: porcentaje de cada ajuste. */
  ajusteFijoPct?: number | null;
}

/** Cuántas cuotas mensuales tiene el contrato. Un resto de mes cuenta como una cuota más. */
export function mesesDelContrato(inicio: Dia, fin: Dia): number {
  if (!esDia(inicio) || !esDia(fin) || fin < inicio) return 0;
  // Meses enteros que entran hasta el día siguiente al fin; si sobra un resto, una cuota más.
  // Se cuenta con la misma suma de meses del cronograma: del 31/08 al 28/02 son 6, no 7.
  const tope = sumarDias(fin, 1);
  let k = 0;
  while (k < 1200 && sumarMesesADia(inicio, k + 1) <= tope) k++;
  // Si el mes k es más corto que el día de inicio (31 → 28), ese mes entero ya está contado.
  const corte = sumarMesesADia(inicio, k);
  const cierre = corte.slice(8) < inicio.slice(8) ? `${sumarMeses(periodoDe(corte), 1)}-01` : corte;
  return k + (cierre < tope ? 1 : 0);
}

/** En qué tramo de precio cae la cuota número `n` (desde 0). El tramo 0 es el precio inicial. */
export function tramoDe(n: number, c: Pick<ContratoCalc, "ajusteIndice" | "ajusteCadaMeses">): number {
  if (c.ajusteIndice === "SIN_AJUSTE" || c.ajusteCadaMeses <= 0) return 0;
  return Math.floor(n / c.ajusteCadaMeses);
}

/** El día en que arranca un tramo: ahí corresponde ajustar. */
export const inicioDeTramo = (c: Pick<ContratoCalc, "inicio" | "ajusteCadaMeses">, tramo: number): Dia => sumarMesesADia(c.inicio, tramo * c.ajusteCadaMeses);

export interface CuotaPlan {
  numero: number;
  periodo: Periodo;
  vence: Dia;
  tramo: number;
  alquiler: number;
  /** true: el monto es el último conocido, falta aplicar el índice de ese tramo. */
  ajustePendiente: boolean;
}

/**
 * El cronograma completo del contrato. Las cuotas del tramo 0 salen con el precio inicial.
 * Con porcentaje fijo salen todas calculadas; con índice, las de los tramos siguientes quedan
 * marcadas "falta ajustar" con el último monto conocido, hasta que se aplique el índice.
 */
export function planDeCuotas(c: ContratoCalc): CuotaPlan[] {
  const meses = mesesDelContrato(c.inicio, c.fin);
  const dia = Math.max(1, Math.min(28, Math.round(c.diaVencimiento) || 10));
  const out: CuotaPlan[] = [];
  for (let n = 0; n < meses; n++) {
    const periodo = sumarMeses(periodoDe(c.inicio), n);
    const vence = `${periodo}-${dos(dia)}`;
    const tramo = tramoDe(n, c);
    const fijo = c.ajusteIndice === "FIJO";
    out.push({
      numero: n + 1,
      periodo,
      // La primera cuota no puede vencer antes de que empiece el contrato.
      vence: vence < c.inicio ? c.inicio : vence,
      tramo,
      alquiler: fijo ? redondear(c.montoInicial * Math.pow(1 + (c.ajusteFijoPct ?? 0) / 100, tramo)) : redondear(c.montoInicial),
      ajustePendiente: tramo > 0 && !fijo,
    });
  }
  return out;
}

// ── Ajuste por índice ───────────────────────────────────────────────────────

/** Un valor publicado del índice. Diario (ICL, Casa Propia) o del primer día del mes (IPC). */
export interface PuntoIndice {
  fecha: Dia;
  valor: number;
}

/** El último valor publicado hasta ese día, si no es más viejo que `tolerancia` días. */
export function valorAl(serie: readonly PuntoIndice[], dia: Dia, tolerancia = 7): PuntoIndice | null {
  let mejor: PuntoIndice | null = null;
  for (const p of serie) {
    if (p.fecha <= dia && p.valor > 0 && (!mejor || p.fecha > mejor.fecha)) mejor = p;
  }
  return mejor && diasEntre(mejor.fecha, dia) <= tolerancia ? mejor : null;
}

export type ResultadoAjuste =
  | { ok: true; coeficiente: number; nuevo: number; desde: Dia; hasta: Dia; detalle: string }
  | { ok: false; falta: string };

/**
 * Cuánto pasa a valer el alquiler al empezar un tramo.
 *
 * ICL y Casa Propia (valor diario): valor del día del ajuste ÷ valor del día del ajuste anterior.
 * IPC (valor mensual): nivel del mes ANTERIOR al ajuste ÷ nivel del mes anterior al ajuste previo
 * (el dato de un mes se publica a mediados del siguiente). 🔶 A validar contra la cláusula.
 * Fijo: el porcentaje del contrato.
 */
export function calcularAjuste(c: ContratoCalc, tramo: number, montoVigente: number, serie: readonly PuntoIndice[]): ResultadoAjuste {
  if (tramo <= 0 || c.ajusteIndice === "SIN_AJUSTE") return { ok: false, falta: "Este tramo no lleva ajuste." };
  const desde = inicioDeTramo(c, tramo - 1);
  const hasta = inicioDeTramo(c, tramo);
  if (c.ajusteIndice === "FIJO") {
    const coeficiente = 1 + (c.ajusteFijoPct ?? 0) / 100;
    return { ok: true, coeficiente, nuevo: redondear(montoVigente * coeficiente), desde, hasta, detalle: `${c.ajusteFijoPct ?? 0} % fijo por contrato` };
  }
  let a: PuntoIndice | null;
  let b: PuntoIndice | null;
  if (c.ajusteIndice === "IPC") {
    const mesA = `${sumarMeses(periodoDe(desde), -1)}-01`;
    const mesB = `${sumarMeses(periodoDe(hasta), -1)}-01`;
    a = serie.find((p) => p.fecha === mesA && p.valor > 0) ?? null;
    b = serie.find((p) => p.fecha === mesB && p.valor > 0) ?? null;
    if (!a) return { ok: false, falta: `Falta cargar el IPC de ${nombrePeriodo(periodoDe(mesA))}.` };
    if (!b) return { ok: false, falta: `Falta cargar el IPC de ${nombrePeriodo(periodoDe(mesB))}.` };
  } else {
    // El valor de ESE día, no uno cercano: un ajuste aplicado con un dato viejo queda firme.
    a = valorAl(serie, desde, 0);
    b = valorAl(serie, hasta, 0);
    if (!a) return { ok: false, falta: `Falta cargar el índice del ${diaCorto(desde)}.` };
    if (!b) return { ok: false, falta: `Falta cargar el índice del ${diaCorto(hasta)}.` };
  }
  const coeficiente = b.valor / a.valor;
  return {
    ok: true,
    coeficiente,
    nuevo: redondear(montoVigente * coeficiente),
    desde,
    hasta,
    detalle: `${INDICE_LABEL[c.ajusteIndice]}: ${b.valor.toLocaleString("es-AR")} ÷ ${a.valor.toLocaleString("es-AR")} = ${coeficiente.toLocaleString("es-AR", { maximumFractionDigits: 4 })}`,
  };
}

/** "+37,4 %" */
export const variacion = (coeficiente: number): string => `${coeficiente >= 1 ? "+" : ""}${((coeficiente - 1) * 100).toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

// ── Cuotas, mora y cobros ───────────────────────────────────────────────────

export interface Extra {
  concepto: string;
  monto: number;
}

export interface CuotaCalc {
  alquiler: number;
  extras: readonly Extra[];
  /** Mora ya asentada en la cuota (lo que se le cobró o se le va a cobrar). */
  punitorios: number;
  pagado: number;
  vence: Dia;
  anulada?: boolean;
}

export const sumaExtras = (extras: readonly Extra[]): number => redondear(extras.reduce((s, e) => s + redondear(e.monto), 0));
export const totalCuota = (c: Pick<CuotaCalc, "alquiler" | "extras" | "punitorios">): number => redondear(c.alquiler + sumaExtras(c.extras) + c.punitorios);
export const saldoCuota = (c: Pick<CuotaCalc, "alquiler" | "extras" | "punitorios" | "pagado">): number => Math.max(0, redondear(totalCuota(c) - c.pagado));

/**
 * Mora de una cuota vencida: interés simple por día corrido sobre lo que falta pagar del
 * alquiler y los extras (no se cobra mora sobre la mora). 🔶 A validar contra la cláusula.
 */
export function punitorioSugerido(c: Pick<CuotaCalc, "alquiler" | "extras" | "pagado" | "vence">, hoy: Dia, tasaDiariaPct: number): { dias: number; monto: number } {
  const dias = Math.max(0, diasEntre(c.vence, hoy));
  const base = Math.max(0, redondear(c.alquiler + sumaExtras(c.extras) - c.pagado));
  if (dias === 0 || base === 0 || tasaDiariaPct <= 0) return { dias, monto: 0 };
  return { dias, monto: redondear((base * tasaDiariaPct * dias) / 100) };
}

export const ESTADOS_CUOTA = ["PENDIENTE", "VENCIDA", "PARCIAL", "PAGADA", "ANULADA"] as const;
export type EstadoCuota = (typeof ESTADOS_CUOTA)[number];
export const ESTADO_CUOTA_LABEL: Record<EstadoCuota, string> = { PENDIENTE: "A cobrar", VENCIDA: "Vencida", PARCIAL: "Pago parcial", PAGADA: "Pagada", ANULADA: "Anulada" };

/** El estado se deriva: nadie tiene que acordarse de marcar una cuota como vencida. */
export function estadoCuota(c: CuotaCalc, hoy: Dia): EstadoCuota {
  if (c.anulada) return "ANULADA";
  if (saldoCuota(c) <= 0.005) return "PAGADA";
  if (c.pagado > 0.005) return "PARCIAL";
  return c.vence < hoy ? "VENCIDA" : "PENDIENTE";
}

export const MEDIOS = ["TRANSFERENCIA", "EFECTIVO", "MERCADO_PAGO", "DEPOSITO", "CHEQUE"] as const;
export type MedioPago = (typeof MEDIOS)[number];
export const MEDIO_LABEL: Record<MedioPago, string> = { TRANSFERENCIA: "Transferencia", EFECTIVO: "Efectivo", MERCADO_PAGO: "Mercado Pago", DEPOSITO: "Depósito", CHEQUE: "Cheque" };
export const esMedio = (v: unknown): v is MedioPago => typeof v === "string" && (MEDIOS as readonly string[]).includes(v);

/**
 * Cómo se reparte un cobro dentro de la cuota: primero la mora, después los extras
 * (expensas, servicios) y al final el alquiler. Sirve para saber cuánto alquiler entró de verdad.
 */
export function imputar(c: Pick<CuotaCalc, "alquiler" | "extras" | "punitorios">, pagado: number): { punitorios: number; extras: number; alquiler: number } {
  let resto = Math.max(0, redondear(pagado));
  const toma = (tope: number): number => {
    const v = Math.min(resto, redondear(tope));
    resto = redondear(resto - v);
    return v;
  };
  const punitorios = toma(c.punitorios);
  const extras = toma(sumaExtras(c.extras));
  const alquiler = toma(c.alquiler);
  return { punitorios, extras, alquiler };
}

// ── Avisos del contrato ─────────────────────────────────────────────────────

export type TipoAvisoContrato = "ajuste" | "vence-contrato";
export interface AvisoContrato {
  tipo: TipoAvisoContrato;
  dia: Dia;
  /** Días que faltan (negativo: ya pasó). */
  faltan: number;
  tramo?: number;
}

export const AVISO_AJUSTE_DIAS = 30;
export const AVISO_VENCIMIENTO_DIAS = 60;

/** Qué le toca a un contrato vigente: el próximo ajuste sin aplicar y el fin del contrato. */
export function avisosDeContrato(c: ContratoCalc, tramosAplicados: number, hoy: Dia): AvisoContrato[] {
  const out: AvisoContrato[] = [];
  const meses = mesesDelContrato(c.inicio, c.fin);
  const ultimoTramo = meses > 0 ? tramoDe(meses - 1, c) : 0;
  const proximo = tramosAplicados + 1;
  if (c.ajusteIndice !== "SIN_AJUSTE" && c.ajusteIndice !== "FIJO" && proximo <= ultimoTramo) {
    const dia = inicioDeTramo(c, proximo);
    const faltan = diasEntre(hoy, dia);
    if (faltan <= AVISO_AJUSTE_DIAS) out.push({ tipo: "ajuste", dia, faltan, tramo: proximo });
  }
  const faltanFin = diasEntre(hoy, c.fin);
  if (faltanFin <= AVISO_VENCIMIENTO_DIAS) out.push({ tipo: "vence-contrato", dia: c.fin, faltan: faltanFin });
  return out;
}

// ── Liquidación al propietario ──────────────────────────────────────────────

export interface CobroALiquidar {
  concepto: string;
  alquiler: number;
  extras: number;
  punitorios: number;
}

export interface ReglasLiquidacion {
  /** Comisión de administración, en % del alquiler cobrado. */
  comisionPct: number;
  /** IVA sobre la comisión (0 si la inmobiliaria es monotributista). */
  ivaComisionPct: number;
  /** true: la mora cobrada va al propietario; false: queda para la inmobiliaria. */
  punitoriosAlPropietario: boolean;
}

export interface Liquidacion {
  alquileres: number;
  extras: number;
  punitorios: number;
  cobrado: number;
  comision: number;
  ivaComision: number;
  gastos: number;
  /** Lo que se le transfiere al propietario. */
  neto: number;
}

/**
 * Lo que se le paga al propietario por lo cobrado en un período: alquileres + extras (+ mora,
 * si le corresponde) − comisión (sobre el alquiler) − IVA de la comisión − gastos a su cargo.
 * Cada renglón se redondea y se suma exacto (regla R3 de la casa).
 */
export function liquidar(cobros: readonly CobroALiquidar[], gastos: readonly Extra[], r: ReglasLiquidacion): Liquidacion {
  const alquileres = redondear(cobros.reduce((s, c) => s + redondear(c.alquiler), 0));
  const extras = redondear(cobros.reduce((s, c) => s + redondear(c.extras), 0));
  const punitorios = redondear(cobros.reduce((s, c) => s + redondear(c.punitorios), 0));
  const comision = redondear((alquileres * Math.max(0, r.comisionPct)) / 100);
  const ivaComision = redondear((comision * Math.max(0, r.ivaComisionPct)) / 100);
  const totalGastos = sumaExtras(gastos);
  const paraElPropietario = redondear(alquileres + extras + (r.punitoriosAlPropietario ? punitorios : 0));
  return {
    alquileres,
    extras,
    punitorios,
    cobrado: redondear(alquileres + extras + punitorios),
    comision,
    ivaComision,
    gastos: totalGastos,
    neto: redondear(paraElPropietario - comision - ivaComision - totalGastos),
  };
}

export interface CobroConComision extends CobroALiquidar {
  /** La comisión del contrato del que salió este cobro. */
  comisionPct: number;
}

/**
 * Igual que `liquidar`, pero cada cobro paga la comisión de SU contrato: un propietario puede
 * tener dos propiedades administradas con porcentajes distintos.
 */
export function liquidarPorContrato(
  cobros: readonly CobroConComision[],
  gastos: readonly Extra[],
  r: Pick<ReglasLiquidacion, "ivaComisionPct" | "punitoriosAlPropietario">,
): Liquidacion {
  const base = liquidar(cobros, gastos, { comisionPct: 0, ivaComisionPct: 0, punitoriosAlPropietario: r.punitoriosAlPropietario });
  const comision = redondear(cobros.reduce((s, c) => s + redondear((redondear(c.alquiler) * Math.max(0, c.comisionPct)) / 100), 0));
  const ivaComision = redondear((comision * Math.max(0, r.ivaComisionPct)) / 100);
  return { ...base, comision, ivaComision, neto: redondear(base.neto - comision - ivaComision) };
}

/**
 * Escala de la comisión por administrar alquileres en la provincia de Buenos Aires (Ley 10.973,
 * art. 54): del 3 % al 10 %, a cargo del locador. No frena la carga: avisa si queda afuera.
 * 🔶 A validar con el colegio de martilleros que corresponda.
 */
export const COMISION_ADMIN_LEGAL = { min: 3, max: 10 } as const;
export const comisionFueraDeEscala = (pct: number): boolean => pct > 0 && (pct < COMISION_ADMIN_LEGAL.min || pct > COMISION_ADMIN_LEGAL.max);

// ── Índices oficiales: lectura de las respuestas públicas ───────────────────
// ICL: API del Banco Central (estadísticas v4.0, variable 40). IPC: nivel general nacional,
// base diciembre 2016, por datos.gob.ar. Acá sólo se LEE la respuesta; pedirla es de acciones.ts.

export const FUENTE_ICL = "https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/40";
export const FUENTE_IPC = "https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&format=json";

const puntoValido = (fecha: unknown, valor: unknown): PuntoIndice | null => {
  const v = Number(valor);
  return esDia(fecha) && Number.isFinite(v) && v > 0 ? { fecha, valor: v } : null;
};

/** `{ results: [{ detalle: [{ fecha, valor }] }] }` → puntos. Lo que no entiende lo saltea. */
export function leerRespuestaBcra(json: unknown): PuntoIndice[] {
  const detalle = (json as { results?: { detalle?: unknown }[] } | null)?.results?.[0]?.detalle;
  if (!Array.isArray(detalle)) return [];
  return detalle.map((d) => puntoValido((d as { fecha?: unknown })?.fecha, (d as { valor?: unknown })?.valor)).filter((p): p is PuntoIndice => p !== null);
}

/** `{ data: [["2026-08-01", 12276.766], …] }` → puntos (uno por mes, con fecha del día 1). */
export function leerRespuestaDatosGobAr(json: unknown): PuntoIndice[] {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data.map((fila) => (Array.isArray(fila) ? puntoValido(fila[0], fila[1]) : null)).filter((p): p is PuntoIndice => p !== null);
}

// ── Crédito hipotecario (orientativo) ───────────────────────────────────────

/** Cuota del sistema francés. Sólo para orientar al que consulta: no es una oferta de ningún banco. */
export function cuotaFrancesa(capital: number, tasaAnualPct: number, meses: number): number {
  if (!(capital > 0) || !(meses > 0)) return 0;
  const i = tasaAnualPct / 100 / 12;
  if (i <= 0) return redondear(capital / meses);
  return redondear((capital * i) / (1 - Math.pow(1 + i, -meses)));
}

// ── Plantillas de WhatsApp ──────────────────────────────────────────────────
// Texto con {variables}. La inmobiliaria las edita en Configuración; lo que no edita usa éstas.

export const PLANTILLAS_DEFAULT = {
  consulta: "Hola {nombre}! Soy {agente} de {inmobiliaria}. Recibimos tu consulta por {propiedad}. ¿Te queda bien que coordinemos una visita? Acá tenés la ficha: {link}",
  visita: "Hola {nombre}! Te confirmamos la visita a {propiedad} el {fecha} a las {hora}. Dirección: {direccion}. Cualquier cambio avisanos por acá.",
  tasacion: "Hola {nombre}! Soy {agente} de {inmobiliaria}. Recibimos tu pedido de tasación. ¿Cuándo te queda cómodo que pasemos a ver la propiedad?",
  vencimiento: "Hola {nombre}! Te recordamos que el alquiler de {propiedad} de {periodo} vence el {fecha}. Total: {total}. Podés ver el detalle y cómo pagar acá: {link}",
  mora: "Hola {nombre}! El alquiler de {propiedad} de {periodo} venció el {fecha} y figura un saldo de {saldo}. Si ya lo pagaste, mandanos el comprobante. Detalle: {link}",
  ajuste: "Hola {nombre}! Según el contrato, desde {periodo} el alquiler de {propiedad} se actualiza por {indice} ({variacion}) y pasa a {monto}. Cualquier duda, escribinos.",
  recibo: "Hola {nombre}! Registramos tu pago de {monto} por el alquiler de {propiedad} ({periodo}). ¡Gracias! Tu comprobante: {link}",
  liquidacion: "Hola {nombre}! Ya está la liquidación de {periodo}: te corresponden {neto}. Mirá el detalle acá: {link}",
  finDeContrato: "Hola {nombre}! El contrato de {propiedad} vence el {fecha}. ¿Lo charlamos para ver cómo seguimos?",
} as const;

export type ClavePlantilla = keyof typeof PLANTILLAS_DEFAULT;
export const CLAVES_PLANTILLA = Object.keys(PLANTILLAS_DEFAULT) as ClavePlantilla[];

export const PLANTILLA_LABEL: Record<ClavePlantilla, string> = {
  consulta: "Respuesta a una consulta",
  visita: "Confirmación de visita",
  tasacion: "Respuesta a un pedido de tasación",
  vencimiento: "Recordatorio: vence el alquiler",
  mora: "Aviso de alquiler vencido",
  ajuste: "Aviso de actualización del alquiler",
  recibo: "Pago recibido (con comprobante)",
  liquidacion: "Liquidación lista para el propietario",
  finDeContrato: "Contrato por vencer",
};

// ── Pasos de una ficha ──────────────────────────────────────────────────────

const SIGUIENTES: Record<EstadoPropiedad, EstadoPropiedad[]> = {
  BORRADOR: ["PUBLICADA"],
  PUBLICADA: ["RESERVADA", "PAUSADA", "ALQUILADA", "VENDIDA"],
  RESERVADA: ["PUBLICADA", "ALQUILADA", "VENDIDA"],
  PAUSADA: ["PUBLICADA"],
  ALQUILADA: ["PUBLICADA", "PAUSADA"],
  VENDIDA: ["PAUSADA"],
};

/** A qué estados puede pasar una ficha desde donde está (los botones del panel). */
export const estadosSiguientes = (actual: EstadoPropiedad): EstadoPropiedad[] => SIGUIENTES[actual] ?? [];

/** El verbo del botón que lleva a cada estado. */
export const ACCION_ESTADO: Record<EstadoPropiedad, string> = {
  BORRADOR: "Volver a borrador",
  PUBLICADA: "Publicar",
  RESERVADA: "Marcar reservada",
  PAUSADA: "Pausar",
  ALQUILADA: "Marcar alquilada",
  VENDIDA: "Marcar vendida",
};
