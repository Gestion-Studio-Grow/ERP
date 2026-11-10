// ============================================================================
// PROYECTOS · Etapa 2 · T3 — importador de planillas de estado (núcleo PURO, sin base ni red).
// ============================================================================
// Lee la matriz cruda de cada pestaña (importador-xlsx.ts), encuentra los títulos, interpreta fechas escritas a mano,
// traduce Etapa × Status al pipeline y arma el PLAN: qué se carga, qué está repetido, qué ya está en el ERP y qué no
// se carga y por qué. No escribe nada: la acción (acciones-importador.ts) replanifica dentro de la transacción y sólo
// escribe si la huella es la misma que vio la persona.
//
// Idempotencia (opción A, sin migración): clave = sha256(tenantId|cliente|proyecto|año) con nombres normalizados, SIN
// mes: la clave de una fila no depende de su mes ni del resto del archivo. Un proyecto por cliente+nombre+año: si en el
// archivo hay filas del mismo grupo con meses distintos, se carga la primera y las demás se muestran para cargarlas a
// mano. Se anota en ProyectoCambio (entidad «Importacion», campo «clave»). Lo que ya tiene su clave anotada, o un
// proyecto del mismo cliente, nombre y año cargado a mano, no se vuelve a cargar.
// Sólo altas: corregir una fila ya importada no actualiza el proyecto; corregirle el mes o el año en la planilla y
// volver a subirla puede duplicarlo (si cambia el año) o no hacer nada (si cambia el mes). Riesgo anotado.

import { createHash } from "node:crypto";
import { normalizarNombre as normalizarBase } from "@/lib/venta-reglas";
import type { Etapa } from "./core";
import { linkSeguro } from "./ficha-core";

export type Celda = string | number | boolean | Date | null;
export interface HojaCruda {
  nombre: string;
  filas: Celda[][];
  /** Hipervínculos de las celdas (`celda.l.Target`), por «fila:columna» de `filas`. El texto visible va en `filas`. */
  links?: Readonly<Record<string, string>>;
}

// ── Textos ─────────────────────────────────────────────────────────────────

const TOPE_NOMBRE = 120;
const TOPE_TEXTO = 2000;
const TOPE_CORTO = 300;

/** Sin tildes, minúsculas, sin puntuación y sin la forma societaria del final (S.A., SRL, SAS…). */
export function normalizarNombre(s: string | null | undefined): string {
  let t = normalizarBase(s)
    .replace(/\./g, "")
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (let i = 0; i < 2; i++) t = t.replace(/\s+(s\s?a\s?i\s?c|s\s?a\s?s|s\s?a\s?u|s\s?r\s?l|s\s?a|s\s?h)$/, "").trim();
  return t;
}

/** Títulos de columna: además de normalizar, «#» y números quedan. */
function normalizarTitulo(s: string): string {
  return normalizarBase(s).replace(/[^a-z0-9#ñ ]+/g, " ").replace(/\s+/g, " ").trim();
}

export function textoDe(c: Celda | undefined, tope = TOPE_CORTO): string {
  if (c === null || c === undefined) return "";
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? "" : c.toISOString().slice(0, 10);
  return String(c).replace(/\s+/g, " ").trim().slice(0, tope);
}

// ── Encabezado ─────────────────────────────────────────────────────────────

export type Campo = "cliente" | "proyecto" | "mes" | "anio" | "etapa" | "status" | "productor" | "diseno" | "fecha" | "drive" | "entrega" | "monto";

const ALIAS: Record<Campo, readonly string[]> = {
  cliente: ["cliente", "clientes", "empresa", "marca", "cuenta", "razon social"],
  proyecto: ["proyecto", "proyectos", "evento", "nombre", "nombre del proyecto", "nombre del evento", "trabajo", "accion"],
  mes: ["mes"],
  anio: ["ano", "anio", "year"],
  etapa: ["etapa"],
  status: ["status", "estado", "estatus"],
  productor: ["productor", "productora", "responsable", "pm", "a cargo"],
  diseno: ["diseno", "disenador", "disenadora", "diseno a cargo"],
  fecha: ["fecha", "fechas", "fecha del evento", "fecha evento", "fecha de evento", "dia del evento"],
  drive: ["drive", "carpeta", "link", "link drive", "link al drive", "carpeta drive", "link carpeta"],
  entrega: ["entrega", "fecha de entrega", "entregable", "entregables"],
  monto: ["monto", "importe", "presupuesto", "total", "valor"],
};

export interface Encabezado {
  /** Índice (0) de la fila de títulos. */
  fila: number;
  columnas: Partial<Record<Campo, number>>;
  /** Comentario #n con su Fecha #n, ordenados por n. */
  comentarios: { n: number; texto: number; fecha: number | null }[];
}

/** Busca la fila de títulos en las 10 primeras. Hace falta al menos Cliente y Proyecto. */
export function detectarEncabezado(filas: readonly Celda[][]): Encabezado | null {
  let mejor: { enc: Encabezado; puntos: number } | null = null;
  for (let i = 0; i < Math.min(10, filas.length); i++) {
    const columnas: Partial<Record<Campo, number>> = {};
    const textos = new Map<number, number>();
    const fechas = new Map<number, number>();
    let puntos = 0;
    (filas[i] ?? []).forEach((c, j) => {
      if (typeof c !== "string") return;
      const t = normalizarTitulo(c);
      if (!t) return;
      const com = /^(?:comentarios?|coment|notas?|observacion(?:es)?|seguimiento)\s*#?\s*(\d{1,2})$/.exec(t);
      if (com) {
        if (!textos.has(+com[1])) textos.set(+com[1], j);
        puntos++;
        return;
      }
      const fec = /^fecha\s*(?:comentario\s*)?#?\s*(\d{1,2})$/.exec(t);
      if (fec) {
        if (!fechas.has(+fec[1])) fechas.set(+fec[1], j);
        return;
      }
      for (const campo of Object.keys(ALIAS) as Campo[]) {
        if (columnas[campo] === undefined && ALIAS[campo].includes(t)) {
          columnas[campo] = j;
          puntos++;
          return;
        }
      }
      // Un solo «Comentario(s)» sin número cuenta como el #1.
      if (/^(?:comentarios?|notas?|observacion(?:es)?)$/.test(t) && !textos.has(1)) {
        textos.set(1, j);
        puntos++;
      }
    });
    if (columnas.cliente === undefined || columnas.proyecto === undefined) continue;
    if (mejor && mejor.puntos >= puntos) continue;
    const comentarios = [...textos.entries()].sort((a, b) => a[0] - b[0]).map(([n, texto]) => ({ n, texto, fecha: fechas.get(n) ?? null }));
    mejor = { enc: { fila: i, columnas, comentarios }, puntos };
  }
  return mejor?.enc ?? null;
}

// ── Mes y año ──────────────────────────────────────────────────────────────

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function mesDePalabra(p: string): number | null {
  const t = normalizarBase(p).replace(/[^a-z]/g, "");
  if (t.length < 3) return null;
  if (t.startsWith("set")) return 9;
  const i = MESES.findIndex((m) => t.startsWith(m));
  return i < 0 ? null : i + 1;
}

export function leerMes(c: Celda | undefined): number | null {
  if (c instanceof Date) return diaDe(c).m;
  if (typeof c === "number") return Number.isInteger(c) && c >= 1 && c <= 12 ? c : null;
  const t = textoDe(c);
  if (!t) return null;
  const n = /^(\d{1,2})\b/.exec(t);
  if (n && +n[1] >= 1 && +n[1] <= 12) return +n[1];
  const palabra = /[a-záéíóúñ]{3,}/i.exec(t);
  return palabra ? mesDePalabra(palabra[0]) : null;
}

export function leerAnio(c: Celda | undefined): number | null {
  if (c instanceof Date) return diaDe(c).y;
  const t = typeof c === "number" ? String(c) : textoDe(c);
  const m = /^(\d{2}|\d{4})$/.exec(t.trim());
  if (!m) return null;
  const y = m[1].length === 2 ? 2000 + +m[1] : +m[1];
  return y >= 2000 && y <= 2100 ? y : null;
}

// ── Fechas escritas a mano ─────────────────────────────────────────────────

/** Mediodía de Buenos Aires (como las fechas que carga la ficha). */
export const fechaLocal = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d, 15));

/** El día de una celda Date de la planilla, tolerante al huso con que la escribió SheetJS. */
function diaDe(d: Date): { y: number; m: number; d: number } {
  const r = new Date(d.getTime() + 12 * 3_600_000);
  return { y: r.getUTCFullYear(), m: r.getUTCMonth() + 1, d: r.getUTCDate() };
}

function valida(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const f = new Date(Date.UTC(y, m - 1, d));
  return f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

export type TipoFecha = "exacta" | "rango" | "difusa" | "ambigua" | "vacia";
export interface FechaLeida {
  desde?: Date;
  hasta?: Date;
  texto: string;
  tipo: TipoFecha;
  aviso?: string;
}

const anio4 = (s: string | undefined, def: number | null): number | null => (s ? (s.length === 2 ? 2000 + +s : +s) : def);

/**
 * Lee una fecha escrita como la escribe una persona. `anio` y `mes` son los de las columnas Año y Mes de la fila:
 * deciden día/mes cuando los dos números son ≤ 12 y completan lo que falta. Lo que no se puede decidir no se carga.
 */
export function leerFechaDifusa(c: Celda | undefined, ctx: { anio: number | null; mes: number | null }): FechaLeida {
  if (c === null || c === undefined || c === "") return { texto: "", tipo: "vacia" };
  if (c instanceof Date) {
    if (Number.isNaN(c.getTime())) return { texto: "", tipo: "vacia" };
    const { y, m, d } = diaDe(c);
    const texto = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
    const r: FechaLeida = { desde: fechaLocal(y, m, d), texto, tipo: "exacta" };
    if (ctx.mes && m !== ctx.mes) r.aviso = `Posible día/mes invertido: la fecha ${texto} no es del mes de la columna Mes.`;
    return r;
  }
  const texto = textoDe(c, TOPE_CORTO);
  if (typeof c === "number") {
    if (Number.isInteger(c) && c >= 1 && c <= 31 && ctx.anio && ctx.mes && valida(ctx.anio, ctx.mes, c)) return { desde: fechaLocal(ctx.anio, ctx.mes, c), texto, tipo: "exacta" };
    return { texto, tipo: "difusa" };
  }
  if (!texto) return { texto: "", tipo: "vacia" };
  const t = normalizarBase(texto);

  // Rango: «4 al 6 de diciembre», «del 4 al 6/12», «4-6 dic», «4 y 5 de diciembre».
  const rango = /^(?:del?\s+)?(\d{1,2})(?:\s*\/\s*(\d{1,2}))?\s*(al|a|-|y|–)\s*(\d{1,2})(?:\s*(?:\/|de)?\s*(\d{1,2}|[a-z]{3,}))?(?:\s*(?:\/|de|del)?\s*(\d{4}|\d{2}))?$/.exec(t);
  if (rango) {
    const [, d1, m1, sep, d2, mTxt, yTxt] = rango;
    // «4-6» a secas puede ser el 4 de junio: con guion sólo es rango si dice el mes o el segundo número no puede ser mes.
    const guionDudoso = (sep === "-" || sep === "–") && !mTxt && !m1 && +d2 <= 12;
    const m2 = mTxt ? (/^\d+$/.test(mTxt) ? +mTxt : mesDePalabra(mTxt)) : (m1 ? +m1 : ctx.mes);
    const mesIni = m1 ? +m1 : m2;
    const y = anio4(yTxt, ctx.anio);
    if (!guionDudoso && m2 && mesIni && y && valida(y, mesIni, +d1) && valida(y, m2, +d2)) {
      const desde = fechaLocal(y, mesIni, +d1);
      const hasta = fechaLocal(y, m2, +d2);
      if (hasta >= desde) return { desde, hasta, texto, tipo: "rango" };
    }
  }

  // «6 de diciembre», «6 dic 2026», «diciembre 6».
  const conPalabra = /^(\d{1,2})\s*(?:de\s+)?([a-z]{3,})\.?(?:\s*(?:de|del)?\s*(\d{4}|\d{2}))?$/.exec(t) ?? (() => {
    const x = /^([a-z]{3,})\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?$/.exec(t);
    return x ? ([x[0], x[2], x[1], x[3]] as unknown as RegExpExecArray) : null;
  })();
  if (conPalabra) {
    const m = mesDePalabra(conPalabra[2]);
    const y = anio4(conPalabra[3], ctx.anio);
    if (m && y && valida(y, m, +conPalabra[1])) return { desde: fechaLocal(y, m, +conPalabra[1]), texto, tipo: "exacta" };
  }

  // Numérica: dd/mm, dd/mm/aa, dd-mm-aaaa.
  const num = /^(\d{1,2})\s*([/.-])\s*(\d{1,2})(?:\s*[/.-]\s*(\d{4}|\d{2}))?$/.exec(t);
  if (num) {
    const a = +num[1];
    const b = +num[3];
    const y = anio4(num[4], ctx.anio);
    if (!y) return { texto, tipo: "ambigua", aviso: `Fecha «${texto}» sin año: no se carga.` };
    let d: number, m: number;
    let aviso: string | undefined;
    if (a > 12 && b <= 12) [d, m] = [a, b];
    else if (b > 12 && a <= 12) {
      [d, m] = [b, a];
      aviso = `Posible día/mes invertido: «${texto}» se leyó como ${b}/${a}.`;
    } else if (a <= 12 && b <= 12) {
      if (a === b) [d, m] = [a, b];
      else if (ctx.mes === b) [d, m] = [a, b];
      // «4-6» con Mes=4: ¿del 4 al 6 de abril o el 6 de abril? Con guion y sin año no se adivina.
      else if (ctx.mes === a && num[2] === "-" && !num[4] && a < b) return { texto, tipo: "ambigua", aviso: `Fecha «${texto}» ambigua: ¿rango del ${a} al ${b} o una fecha? No se carga.` };
      else if (ctx.mes === a) [d, m] = [b, a];
      else return { texto, tipo: "ambigua", aviso: `Fecha «${texto}» ambigua (día/mes): no se carga.` };
    } else return { texto, tipo: "difusa" };
    if (!valida(y, m, d)) return { texto, tipo: "difusa" };
    const r: FechaLeida = { desde: fechaLocal(y, m, d), texto, tipo: "exacta" };
    if (aviso) r.aviso = aviso;
    else if (ctx.mes && m !== ctx.mes) r.aviso = `Posible día/mes invertido: «${texto}» no es del mes de la columna Mes.`;
    return r;
  }
  return { texto, tipo: "difusa" };
}

// ── Etapa × Status ─────────────────────────────────────────────────────────

export const MOTIVO_NO_APROBADO = "Otro — No aprobado, sin dato (importado)";
export const MOTIVO_CANCELADO = "El cliente canceló el evento — importado";

export type EtapaImportada = { ok: true; etapa: Etapa; motivoPerdida: string | null; aviso?: string } | { ok: false; error: string };

function etapaDeStatus(s: string): Etapa | null {
  if (/^ingresad/.test(s)) return "PEDIDO";
  if (/^cotiz/.test(s)) return "PRESUPUESTO";
  if (/^presentad/.test(s)) return "PROPUESTA";
  return null;
}

/** Traduce la Etapa y el Status de la planilla a la etapa del pipeline (y al motivo, si se perdió). */
export function mapearEtapa(etapa: string, status: string): EtapaImportada {
  const e = normalizarNombre(etapa);
  const s = normalizarNombre(status);
  const deStatus = etapaDeStatus(s);
  const clase = (x: string): "curso" | "aprobado" | "finalizado" | "no" | "cancelado" | null => {
    if (/^en curso/.test(x)) return "curso";
    if (/^no aprobad/.test(x)) return "no";
    if (/^aprobad/.test(x)) return "aprobado";
    if (/^finalizad/.test(x)) return "finalizado";
    if (/^cancelad/.test(x)) return "cancelado";
    return null;
  };
  const c = clase(e) ?? (e ? null : clase(s));
  switch (c) {
    case "curso":
      return deStatus ? { ok: true, etapa: deStatus, motivoPerdida: null } : { ok: true, etapa: "PEDIDO", motivoPerdida: null, aviso: `Status «${status || "vacío"}» sin reconocer: queda en Pedido.` };
    case "aprobado":
      return { ok: true, etapa: "APROBADO", motivoPerdida: null };
    case "finalizado":
      return { ok: true, etapa: "CIERRE", motivoPerdida: null };
    case "no":
      return { ok: true, etapa: deStatus ?? "PROPUESTA", motivoPerdida: MOTIVO_NO_APROBADO };
    case "cancelado":
      return { ok: true, etapa: deStatus ?? "PEDIDO", motivoPerdida: MOTIVO_CANCELADO };
  }
  if (!e && deStatus) return { ok: true, etapa: deStatus, motivoPerdida: null, aviso: "Sin etapa: se tomó del status." };
  return { ok: false, error: e ? `La etapa «${etapa}» no se reconoce.` : "Falta la etapa." };
}

// ── Plan ───────────────────────────────────────────────────────────────────

export interface PersonaBase {
  id: string;
  nombre: string;
}
export interface BaseImportacion {
  tenantId: string;
  /** Clientes del negocio (el primero gana si dos normalizan igual: pasarlos en orden estable). */
  clientes: readonly { id: string; nombre: string }[];
  personas: readonly PersonaBase[];
  /** Claves ya anotadas en ProyectoCambio (entidad Importacion). */
  claves: ReadonlySet<string> | readonly string[];
  /** Proyectos que ya están (cargados a mano o importados): cliente, nombre y año. Un proyecto puede venir en varias
   *  entradas (año de alta y año del evento). */
  proyectos: readonly { cliente: string; nombre: string; anio: number }[];
}

export interface Persona {
  personaId: string | null;
  nombre: string;
}
export interface Comentario {
  texto: string;
  fecha: Date | null;
  fechaTexto: string;
}
export interface Alta {
  clave: string;
  hoja: string;
  fila: number;
  cliente: { id: string | null; nombre: string; norm: string };
  nombre: string;
  anio: number;
  mes: number;
  etapa: Etapa;
  etapaOriginal: string;
  statusOriginal: string;
  motivoPerdida: string | null;
  perdidoEl: Date | null;
  fechaEvento: Date | null;
  fechaFin: Date | null;
  fecha: { texto: string; tipo: TipoFecha };
  creadoEl: Date;
  productor: Persona | null;
  diseno: Persona | null;
  carpetaUrl: string | null;
  driveTexto: string;
  entrega: string;
  monto: string;
  comentarios: Comentario[];
  avisos: string[];
}
export type EstadoFila = "carga" | "revisar" | "repetida" | "yaEnBase" | "error";
export interface FilaVista {
  hoja: string;
  fila: number;
  cliente: string;
  proyecto: string;
  estado: EstadoFila;
  /** Para «No se carga» y «Repetida»: el porqué. Para «Revisar»: los avisos. */
  motivo: string;
  etapa: string;
}
export interface FilaRef {
  hoja: string;
  fila: number;
  motivo: string;
}
export interface PlanImportacion {
  altas: Alta[];
  clientesNuevos: { nombre: string; norm: string }[];
  repetidas: FilaRef[];
  yaEnBase: FilaRef[];
  errores: FilaRef[];
  avisos: FilaRef[];
  filas: FilaVista[];
  huella: string;
}

export const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");
/** Clave estable de un proyecto importado: negocio, cliente y nombre normalizados y año. Sin mes, a propósito. */
export const claveDeImportacion = (tenantId: string, cliNorm: string, proyNorm: string, anio: number): string =>
  sha256(`${tenantId}|${cliNorm}|${proyNorm}|${anio}`);

type TipoHoja = "general" | "sinAsignar" | "productor";
function tipoDeHoja(nombre: string): TipoHoja {
  const n = normalizarNombre(nombre);
  if (/^(general|todos|todas|resumen general)$/.test(n)) return "general";
  if (/^sin asignar/.test(n)) return "sinAsignar";
  return "productor";
}

/** Cruce por nombre: exacto normalizado, o el nombre de pila si una sola persona lo tiene. */
export function buscarPersona(nombre: string, personas: readonly PersonaBase[]): Persona | null {
  const n = normalizarNombre(nombre);
  if (!n) return null;
  const exacta = personas.find((p) => normalizarNombre(p.nombre) === n);
  if (exacta) return { personaId: exacta.id, nombre: exacta.nombre };
  if (!n.includes(" ")) {
    const pila = personas.filter((p) => normalizarNombre(p.nombre).split(" ")[0] === n);
    if (pila.length === 1) return { personaId: pila[0].id, nombre: pila[0].nombre };
  }
  return { personaId: null, nombre: textoDe(nombre, TOPE_NOMBRE) };
}

interface Leida {
  hoja: string;
  tipo: TipoHoja;
  fila: number;
  orden: number;
  clave: string;
  cliente: string;
  cliNorm: string;
  proyecto: string;
  proyNorm: string;
  anio: number | null;
  /** El mes que la fila dice (columna Mes o la fecha); null si no lo dice. */
  mesDicho: number | null;
  alta: Omit<Alta, "cliente" | "clave"> | null;
  error: string | null;
}

const ETIQUETA_ETAPA: Record<string, string> = { PEDIDO: "Pedido", PRESUPUESTO: "Presupuesto", PROPUESTA: "Propuesta", APROBADO: "Aprobado", CIERRE: "Cierre" };

/** Lee una fila con su encabezado. Devuelve null si está vacía. */
function leerFila(h: HojaCruda, tipo: TipoHoja, enc: Encabezado, i: number, base: BaseImportacion): Omit<Leida, "orden"> | null {
  const fila = h.filas[i] ?? [];
  const col = (c: Campo): Celda | undefined => (enc.columnas[c] === undefined ? undefined : fila[enc.columnas[c]!]);
  const cliente = textoDe(col("cliente"), TOPE_NOMBRE);
  const proyecto = textoDe(col("proyecto"), TOPE_NOMBRE);
  const ref = { hoja: h.nombre, tipo, fila: i + 1, cliente, proyecto, cliNorm: normalizarNombre(cliente), proyNorm: normalizarNombre(proyecto), anio: null as number | null, mesDicho: null as number | null };
  if (!cliente && !proyecto) return null;
  if (!ref.cliNorm) return { ...ref, clave: "", alta: null, error: "Falta el cliente." };
  if (!ref.proyNorm) return { ...ref, clave: "", alta: null, error: "Falta el nombre del proyecto." };

  const avisos: string[] = [];
  let anio = leerAnio(col("anio"));
  let mes = leerMes(col("mes"));
  const fecha = leerFechaDifusa(col("fecha"), { anio, mes });
  if (!anio && fecha.desde) anio = diaDe(fecha.desde).y;
  if (!anio) return { ...ref, clave: "", alta: null, error: "Falta el año (columna Año)." };
  ref.anio = anio;
  ref.mesDicho = mes ?? (fecha.desde ? diaDe(fecha.desde).m : null);
  if (!mes) {
    if (fecha.desde) mes = diaDe(fecha.desde).m;
    else {
      mes = 1;
      avisos.push("Sin mes: se toma enero como fecha de alta.");
    }
  }
  if (fecha.aviso) avisos.push(fecha.aviso);
  if (fecha.tipo === "difusa") avisos.push(`Fecha «${fecha.texto}» sin día: no se carga, queda anotada.`);

  const etapaTxt = textoDe(col("etapa"));
  const statusTxt = textoDe(col("status"));
  const etapa = mapearEtapa(etapaTxt, statusTxt);
  const clave = claveDeImportacion(base.tenantId, ref.cliNorm, ref.proyNorm, anio);
  if (!etapa.ok) return { ...ref, clave, alta: null, error: etapa.error };
  if (etapa.aviso) avisos.push(etapa.aviso);

  const productorTxt = textoDe(col("productor"), TOPE_NOMBRE) || (tipo === "productor" ? h.nombre : "");
  const productor = productorTxt ? buscarPersona(productorTxt, base.personas) : null;
  const disenoTxt = textoDe(col("diseno"), TOPE_NOMBRE);
  const diseno = disenoTxt ? buscarPersona(disenoTxt, base.personas) : null;

  // El chip de Drive de Sheets llega como hipervínculo: el texto dice «Carpeta» y la URL está en el link.
  const visible = textoDe(col("drive"), TOPE_CORTO);
  const link = enc.columnas.drive === undefined ? "" : textoDe(h.links?.[`${i}:${enc.columnas.drive}`], TOPE_CORTO);
  const carpetaUrl = link && linkSeguro(link) ? link : visible && linkSeguro(visible) ? visible : null;
  const driveTexto = link && link !== visible ? (visible ? `${visible} (${link})` : link) : visible;
  if (driveTexto && !carpetaUrl) avisos.push("El link de Drive no es https: queda sólo anotado.");

  const comentarios: Comentario[] = [];
  for (const c of enc.comentarios) {
    const texto = textoDe(fila[c.texto], TOPE_TEXTO);
    if (!texto) continue;
    const f = c.fecha === null ? null : leerFechaDifusa(fila[c.fecha], { anio, mes });
    comentarios.push({ texto, fecha: f?.desde ?? null, fechaTexto: f?.texto ?? "" });
  }

  const creadoEl = fechaLocal(anio, mes, 1);
  let perdidoEl: Date | null = null;
  if (etapa.motivoPerdida) {
    const conFecha = comentarios.map((c) => c.fecha).filter((d): d is Date => d !== null);
    perdidoEl = conFecha.length ? new Date(Math.max(...conFecha.map((d) => d.getTime()))) : (fecha.desde ?? creadoEl);
    if (!conFecha.length && !fecha.desde) avisos.push("Fecha de pérdida aproximada (día 1 del mes).");
  }

  return {
    ...ref,
    clave,
    error: null,
    alta: {
      hoja: h.nombre,
      fila: i + 1,
      nombre: proyecto,
      anio,
      mes,
      etapa: etapa.etapa,
      etapaOriginal: etapaTxt,
      statusOriginal: statusTxt,
      motivoPerdida: etapa.motivoPerdida,
      perdidoEl,
      fechaEvento: fecha.desde ?? null,
      fechaFin: fecha.tipo === "rango" ? (fecha.hasta ?? null) : null,
      fecha: { texto: fecha.texto, tipo: fecha.tipo },
      creadoEl,
      productor,
      diseno,
      carpetaUrl,
      driveTexto,
      entrega: textoDe(col("entrega")),
      monto: textoDe(col("monto")),
      comentarios,
      avisos,
    },
  };
}

/**
 * El plan de la importación. Reglas de duplicados (todas por cliente+proyecto+año, la clave):
 *  · si figura en una pestaña de productor o en «Sin asignar», sus filas de «General» quedan como repetidas, sea cual
 *    sea el mes; lo que está SÓLO en General se carga para revisar;
 *  · un proyecto por clave: se carga el primero en orden estable (productor, Sin asignar, General; después el orden del
 *    archivo). Las filas del mismo grupo con otro mes no se cargan: «parece otro evento», se cargan a mano;
 *  · la misma fila (mismo mes o sin mes) en dos pestañas de productor distintas es un conflicto: no se carga ninguna;
 *  · lo que ya tiene su clave anotada, o un proyecto del mismo cliente, nombre y año en el ERP, no se carga.
 */
export function planificarImportacion(hojas: readonly HojaCruda[], base: BaseImportacion): PlanImportacion {
  const claves = new Set(base.claves);
  const yaEstan = new Set(base.proyectos.map((p) => `${normalizarNombre(p.cliente)}|${normalizarNombre(p.nombre)}|${p.anio}`));
  const clientesBase = new Map<string, { id: string; nombre: string }>();
  for (const c of base.clientes) {
    const n = normalizarNombre(c.nombre);
    if (n && !clientesBase.has(n)) clientesBase.set(n, c);
  }

  const leidas: Leida[] = [];
  const avisos: FilaRef[] = [];
  let orden = 0;
  for (const h of hojas) {
    const enc = detectarEncabezado(h.filas);
    if (!enc) {
      if (h.filas.some((f) => f.some((c) => c !== null && c !== ""))) avisos.push({ hoja: h.nombre, fila: 0, motivo: "No se encontraron los títulos (Cliente, Proyecto): la pestaña no se lee." });
      continue;
    }
    const tipo = tipoDeHoja(h.nombre);
    for (let i = enc.fila + 1; i < h.filas.length; i++) {
      const l = leerFila(h, tipo, enc, i, base);
      if (l) leidas.push({ ...l, orden: orden++ });
    }
  }

  const estado = new Map<Leida, { estado: EstadoFila; motivo: string }>();
  for (const l of leidas) if (!l.clave) estado.set(l, { estado: "error", motivo: l.error ?? "" });

  // Por cliente+proyecto+año: si el proyecto está en la pestaña de un productor o en «Sin asignar», General no decide
  // nada (aunque diga otro mes: el productor pudo corregirlo). Así la decisión de una fila no depende de su mes.
  const grupoDe = (l: Leida) => `${l.cliNorm}|${l.proyNorm}|${l.anio}`;
  const fueraDeGeneral = new Set(leidas.filter((l) => l.clave && l.tipo !== "general").map(grupoDe));
  const porClave = new Map<string, Leida[]>();
  for (const l of leidas) {
    if (!l.clave) continue;
    if (l.tipo === "general" && fueraDeGeneral.has(grupoDe(l))) {
      estado.set(l, { estado: "repetida", motivo: "Repetida: el proyecto está en la pestaña de su productor." });
      continue;
    }
    porClave.set(l.clave, [...(porClave.get(l.clave) ?? []), l]);
  }

  const lugar = (l: Leida) => (l.fila ? `«${l.hoja}», fila ${l.fila}` : `«${l.hoja}»`);
  const prioridad = (l: Leida) => (l.tipo === "productor" ? 0 : l.tipo === "sinAsignar" ? 1 : 2);
  for (const [clave, grupo] of porClave) {
    const ordenados = [...grupo].sort((a, b) => prioridad(a) - prioridad(b) || a.orden - b.orden);
    const primera = ordenados.find((l) => !l.error) ?? ordenados[0];
    // El mes del evento: el de la primera; si no lo dice, el primero que aparezca en el grupo. Las filas con otro mes
    // no se cargan (la clave no lleva mes): se muestran para cargarlas a mano, también si el proyecto ya está.
    const mesEvento = primera.mesDicho ?? ordenados.find((l) => l.mesDicho !== null)?.mesDicho ?? null;
    const otroEvento = (l: Leida) => l.mesDicho !== null && mesEvento !== null && l.mesDicho !== mesEvento;
    const mismo = ordenados.filter((l) => !otroEvento(l));
    for (const l of ordenados) {
      if (otroEvento(l))
        estado.set(l, { estado: "error", motivo: "Revisar: parece otro evento del mismo cliente y nombre en el año; cargalo a mano o cambiale el nombre en la planilla." });
    }
    if (claves.has(clave) || yaEstan.has(grupoDe(primera))) {
      for (const l of mismo) estado.set(l, { estado: "yaEnBase", motivo: "" }); // la etiqueta «Ya está en el ERP» ya lo dice
      continue;
    }
    const deProductor = mismo.filter((l) => l.tipo === "productor");
    const pestanas = new Set(deProductor.map((l) => normalizarNombre(l.hoja)));
    if (pestanas.size > 1) {
      const donde = [...new Set(deProductor.map((l) => `«${l.hoja}»`))].join(" y ");
      for (const l of mismo) estado.set(l, { estado: "error", motivo: `Conflicto: está en las pestañas ${donde}. Dejala en una sola.` });
      continue;
    }
    for (const l of mismo) {
      if (l === primera) {
        if (l.error) estado.set(l, { estado: "error", motivo: l.error });
        else {
          if (l.tipo === "general") l.alta!.avisos.unshift("Sólo está en la pestaña General: revisar el productor.");
          estado.set(l, { estado: l.alta!.avisos.length ? "revisar" : "carga", motivo: l.alta!.avisos.join(" ") });
        }
      } else estado.set(l, { estado: "repetida", motivo: `Repetida: se carga la de ${lugar(primera)}.` });
    }
  }

  const altas: Alta[] = [];
  const clientesNuevos = new Map<string, { nombre: string; norm: string }>();
  const plan: PlanImportacion = { altas, clientesNuevos: [], repetidas: [], yaEnBase: [], errores: [], avisos, filas: [], huella: "" };
  for (const l of leidas) {
    const e = estado.get(l)!;
    const ref = { hoja: l.hoja, fila: l.fila, motivo: e.motivo };
    if (e.estado === "carga" || e.estado === "revisar") {
      const existente = clientesBase.get(l.cliNorm);
      if (!existente && !clientesNuevos.has(l.cliNorm)) clientesNuevos.set(l.cliNorm, { nombre: l.cliente, norm: l.cliNorm });
      altas.push({ ...l.alta!, clave: l.clave, cliente: { id: existente?.id ?? null, nombre: existente?.nombre ?? clientesNuevos.get(l.cliNorm)!.nombre, norm: l.cliNorm } });
      for (const a of l.alta!.avisos) avisos.push({ hoja: l.hoja, fila: l.fila, motivo: a });
    } else if (e.estado === "repetida") plan.repetidas.push(ref);
    else if (e.estado === "yaEnBase") plan.yaEnBase.push(ref);
    else plan.errores.push(ref);
    const etapa = l.alta ? (l.alta.motivoPerdida ? `Perdido (${ETIQUETA_ETAPA[l.alta.etapa] ?? l.alta.etapa})` : (ETIQUETA_ETAPA[l.alta.etapa] ?? l.alta.etapa)) : "";
    plan.filas.push({ hoja: l.hoja, fila: l.fila, cliente: l.cliente, proyecto: l.proyecto, estado: e.estado, motivo: e.motivo, etapa });
  }
  plan.clientesNuevos = [...clientesNuevos.values()];
  plan.huella = huellaDe(plan);
  return plan;
}

/** Huella estable del plan: misma planilla + misma base → misma huella. */
export function huellaDe(plan: Omit<PlanImportacion, "huella">): string {
  const altas = plan.altas
    .map((a) => [a.clave, a.cliente.id ?? `nuevo:${a.cliente.norm}`, a.nombre, a.etapa, a.motivoPerdida, a.fechaEvento?.toISOString() ?? "", a.fechaFin?.toISOString() ?? "", a.perdidoEl?.toISOString() ?? "", a.productor?.personaId ?? a.productor?.nombre ?? "", a.diseno?.personaId ?? a.diseno?.nombre ?? "", a.carpetaUrl ?? "", a.comentarios.map((c) => [c.texto, c.fecha?.toISOString() ?? ""]), a.hoja, a.fila])
    .sort((x, y) => String(x[0]).localeCompare(String(y[0])));
  const otras = (r: FilaRef[]) => r.map((x) => `${x.hoja}|${x.fila}|${x.motivo}`).sort();
  return sha256(JSON.stringify({ altas, nuevos: plan.clientesNuevos.map((c) => c.norm).sort(), rep: otras(plan.repetidas), ya: otras(plan.yaEnBase), err: otras(plan.errores) }));
}

/** El primer mensaje del proyecto importado: lo que la planilla decía tal cual, para no perder nada. */
export function mensajeDeDatosCrudos(a: Alta): string {
  const lineas = [
    `Importado de la planilla — pestaña «${a.hoja}», fila ${a.fila}.`,
    `Etapa: ${a.etapaOriginal || "—"} · Status: ${a.statusOriginal || "—"}.`,
    `Mes/Año: ${String(a.mes).padStart(2, "0")}/${a.anio} (la fecha de alta es el día 1, aproximada).`,
  ];
  if (a.fecha.texto) lineas.push(`Fecha escrita: «${a.fecha.texto}» (${a.fecha.tipo === "exacta" || a.fecha.tipo === "rango" ? "cargada" : "no se cargó"}).`);
  if (a.productor) lineas.push(`Productor: ${a.productor.nombre}${a.productor.personaId ? "" : " (no está en el equipo)"}.`);
  if (a.diseno) lineas.push(`Diseño: ${a.diseno.nombre}${a.diseno.personaId ? "" : " (no está en el equipo)"}.`);
  if (a.driveTexto) lineas.push(`Drive: ${a.driveTexto}`);
  if (a.entrega) lineas.push(`Entrega: ${a.entrega}`);
  if (a.monto) lineas.push(`Monto: ${a.monto}`);
  if (a.avisos.length) lineas.push(`Para revisar: ${a.avisos.join(" ")}`);
  return lineas.join("\n");
}

export interface ConteoImportacion {
  seCargan: number;
  revisar: number;
  repetidas: number;
  yaEnBase: number;
  noSeCargan: number;
  clientesNuevos: number;
}
export function contar(plan: PlanImportacion): ConteoImportacion {
  const n = (e: EstadoFila) => plan.filas.filter((f) => f.estado === e).length;
  return { seCargan: plan.altas.length, revisar: n("revisar"), repetidas: n("repetida"), yaEnBase: n("yaEnBase"), noSeCargan: n("error"), clientesNuevos: plan.clientesNuevos.length };
}
