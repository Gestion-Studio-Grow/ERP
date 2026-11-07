// PROYECTOS · IMPORTADOR DE LA PLANILLA DE STATUS (MIA T1) — reglas puras, sin base ni React.
//
// Lee el CSV exportado de la planilla (cliente, proyecto, productor, comercial, status, fecha del evento en texto
// libre), arma la previsualización fila por fila y marca lo que no se va a escribir: repetidas en el archivo, las que
// ya existen en el negocio y las que tienen errores. Nada de esto escribe: la acción vuelve a correr el plan adentro
// de la transacción, con lo que haya en la base en ese momento.

import { MOTIVOS_PERDIDA } from "./gestion-core";

export const MAX_BYTES_CSV = 512_000;
export const MAX_FILAS_CSV = 1_000;

/** Sin acentos, minúsculas y un solo espacio: «Fundación  Ñandú» y «fundacion ñandu» son el mismo. */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Clave de duplicado: el mismo cliente con el mismo proyecto. */
export const claveDeProyecto = (cliente: string, proyecto: string): string => `${normalizar(cliente)}|${normalizar(proyecto)}`;

// ── CSV ─────────────────────────────────────────────────────────────────────

/** El separador más frecuente fuera de comillas en la primera línea (Excel en castellano exporta con «;»). */
function separadorDe(primera: string): string {
  const cuenta: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let comillas = false;
  for (const ch of primera) {
    if (ch === '"') comillas = !comillas;
    else if (!comillas && ch in cuenta) cuenta[ch]++;
  }
  const [sep, veces] = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
  return veces > 0 ? sep : ",";
}

/** RFC 4180 con comillas dobles, saltos dentro de comillas y BOM. Devuelve las filas no vacías. */
export function leerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, "");
  const fin = t.search(/\r?\n/);
  const sep = separadorDe(fin === -1 ? t : t.slice(0, fin));
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let comillas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch === '"' && t[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (ch === '"') comillas = false;
      else celda += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) {
      fila.push(celda);
      celda = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += ch;
  }
  fila.push(celda);
  filas.push(fila);
  return filas.filter((f) => f.some((c) => c.trim() !== ""));
}

// ── Columnas ────────────────────────────────────────────────────────────────

export const COLUMNAS = ["cliente", "proyecto", "productor", "comercial", "status", "fecha"] as const;
export type Columna = (typeof COLUMNAS)[number];

const ALIAS: Record<Columna, readonly string[]> = {
  cliente: ["cliente", "empresa", "cuenta"],
  proyecto: ["proyecto", "evento", "nombre", "nombre del proyecto"],
  productor: ["productor", "productora", "responsable"],
  comercial: ["comercial", "vendedor", "ejecutivo comercial"],
  status: ["status", "estado", "etapa"],
  fecha: ["fecha del evento", "fecha evento", "fecha de evento", "fecha"],
};

/** Encabezado → índice de cada columna. Faltan cliente o proyecto → error. */
export function columnasDe(encabezado: readonly string[]): { indices: Partial<Record<Columna, number>>; error: string | null } {
  const norm = encabezado.map(normalizar);
  const indices: Partial<Record<Columna, number>> = {};
  for (const c of COLUMNAS) {
    const i = norm.findIndex((h) => ALIAS[c].includes(h));
    if (i >= 0) indices[c] = i;
  }
  const faltan = (["cliente", "proyecto"] as const).filter((c) => indices[c] === undefined);
  return { indices, error: faltan.length ? `Al archivo le falta la columna ${faltan.join(" y ")}. La primera fila tiene que traer los títulos.` : null };
}

// ── Status y fecha ──────────────────────────────────────────────────────────

export interface EstadoImportado {
  etapa: string;
  /** Si viene perdido: el motivo, de la lista fija + el detalle. */
  motivoPerdida: string | null;
  reconocido: boolean;
}

const OTRO = MOTIVOS_PERDIDA[MOTIVOS_PERDIDA.length - 1];
const CANCELO = MOTIVOS_PERDIDA[2];

/** Status y etapas de la planilla de MIA → etapas del ERP. Lo desconocido queda en Lead, con aviso. */
export function estadoDeStatus(status: string): EstadoImportado {
  const s = normalizar(status);
  const etapa = (e: string): EstadoImportado => ({ etapa: e, motivoPerdida: null, reconocido: true });
  switch (s) {
    case "":
    case "ingresado":
    case "en curso":
      return etapa("PEDIDO");
    case "cotizando":
      return etapa("PRESUPUESTO");
    case "presentado":
      return etapa("PROPUESTA");
    case "aprobado":
      return etapa("APROBADO");
    case "finalizado":
      return etapa("CIERRE");
    case "no aprobado":
      return { etapa: "PROPUESTA", motivoPerdida: `${OTRO} — importado de la planilla: No aprobado`, reconocido: true };
    case "cancelado":
      return { etapa: "PROPUESTA", motivoPerdida: `${CANCELO} — importado de la planilla`, reconocido: true };
    default:
      return { etapa: "PEDIDO", motivoPerdida: null, reconocido: false };
  }
}

export interface FechaEvento {
  /** YYYY-MM-DD si el texto es una fecha exacta; null si es «a confirmar», «primeros días», un rango… */
  fecha: string | null;
  /** El texto tal cual, cuando no es una fecha exacta. */
  texto: string | null;
}

function fechaValida(a: number, m: number, d: number): string | null {
  if (a < 2000 || a > 2100 || m < 1 || m > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** «12/11/2026» (día/mes, como se escribe acá) o «2026-11-12» → fecha. Cualquier otra cosa queda como texto. */
export function leerFechaEvento(texto: string): FechaEvento {
  const s = texto.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!s) return { fecha: null, texto: null };
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) {
    const f = fechaValida(Number(m[3]), Number(m[2]), Number(m[1]));
    if (f) return { fecha: f, texto: null };
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const f = fechaValida(Number(m[1]), Number(m[2]), Number(m[3]));
    if (f) return { fecha: f, texto: null };
  }
  return { fecha: null, texto: s };
}

// ── El plan ─────────────────────────────────────────────────────────────────

export type EstadoFila = "nueva" | "repetida" | "existe" | "error";

export interface FilaPlan {
  /** Línea del archivo (1 = encabezado). */
  linea: number;
  cliente: string;
  proyecto: string;
  productor: string;
  comercial: string;
  status: string;
  fechaTexto: string;
  estado: EstadoFila;
  motivo: string | null;
  avisos: string[];
  etapa: string;
  motivoPerdida: string | null;
  fecha: FechaEvento;
  productorId: string | null;
  comercialId: string | null;
  clave: string;
}

export interface PlanImportacion {
  error: string | null;
  filas: FilaPlan[];
  resumen: Record<EstadoFila, number>;
}

export interface PersonaDelNegocio {
  id: string;
  nombre: string;
}

const RESUMEN_VACIO = (): Record<EstadoFila, number> => ({ nueva: 0, repetida: 0, existe: 0, error: 0 });

/**
 * El plan completo. `existentes`: claves cliente|proyecto que ya están en el negocio. `personas`: las del equipo del
 * negocio, para reconocer productor y comercial por nombre. PURA.
 */
export function planDeImportacion(texto: string, existentes: ReadonlySet<string>, personas: readonly PersonaDelNegocio[]): PlanImportacion {
  if (new TextEncoder().encode(texto).length > MAX_BYTES_CSV) return { error: `El archivo es muy grande: hasta ${MAX_BYTES_CSV / 1000} KB.`, filas: [], resumen: RESUMEN_VACIO() };
  const tabla = leerCsv(texto);
  if (tabla.length < 2) return { error: "El archivo no trae filas: tiene que tener la fila de títulos y al menos un proyecto.", filas: [], resumen: RESUMEN_VACIO() };
  if (tabla.length - 1 > MAX_FILAS_CSV) return { error: `Son muchas filas: hasta ${MAX_FILAS_CSV} por archivo.`, filas: [], resumen: RESUMEN_VACIO() };
  const { indices, error } = columnasDe(tabla[0]);
  if (error) return { error, filas: [], resumen: RESUMEN_VACIO() };

  const porNombre = new Map<string, string | null>();
  for (const p of personas) {
    const k = normalizar(p.nombre);
    porNombre.set(k, porNombre.has(k) ? null : p.id); // dos personas con el mismo nombre: no se adivina
  }
  const persona = (nombre: string, rol: string, avisos: string[]): string | null => {
    if (!nombre) return null;
    const k = normalizar(nombre);
    const id = porNombre.get(k);
    if (id) return id;
    avisos.push(id === null ? `Hay dos personas que se llaman «${nombre}»: el ${rol} queda sin asignar.` : `«${nombre}» no está en el equipo: el ${rol} queda sin asignar.`);
    return null;
  };

  const vistas = new Map<string, number>();
  const filas: FilaPlan[] = [];
  const resumen = RESUMEN_VACIO();
  tabla.slice(1).forEach((celdas, i) => {
    const val = (c: Columna, max: number) => (indices[c] === undefined ? "" : (celdas[indices[c]!] ?? "").trim().replace(/\s+/g, " ").slice(0, max));
    const cliente = val("cliente", 120);
    const proyecto = val("proyecto", 120);
    const productor = val("productor", 80);
    const comercial = val("comercial", 80);
    const status = val("status", 40);
    const fechaTexto = val("fecha", 120);
    const linea = i + 2;
    const avisos: string[] = [];
    const est = estadoDeStatus(status);
    if (!est.reconocido) avisos.push(`El status «${status}» no se reconoce: entra como Lead.`);
    const fecha = leerFechaEvento(fechaTexto);
    const clave = claveDeProyecto(cliente, proyecto);
    let estado: EstadoFila = "nueva";
    let motivo: string | null = null;
    if (!cliente || !proyecto) {
      estado = "error";
      motivo = !cliente ? "Falta el cliente." : "Falta el nombre del proyecto.";
    } else if (vistas.has(clave)) {
      estado = "repetida";
      motivo = `Repetida: es la misma que la línea ${vistas.get(clave)}.`;
    } else if (existentes.has(clave)) {
      estado = "existe";
      motivo = "Ya existe en el ERP un proyecto con este cliente y este nombre.";
    }
    if (cliente && proyecto && !vistas.has(clave)) vistas.set(clave, linea);
    const productorId = estado === "nueva" ? persona(productor, "productor", avisos) : null;
    const comercialId = estado === "nueva" ? persona(comercial, "comercial", avisos) : null;
    resumen[estado]++;
    filas.push({ linea, cliente, proyecto, productor, comercial, status, fechaTexto, estado, motivo, avisos, etapa: est.etapa, motivoPerdida: est.motivoPerdida, fecha, productorId, comercialId, clave });
  });
  return { error: null, filas, resumen };
}
