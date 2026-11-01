// Reglas puras de Inicio, Calendario, Proveedores, Equipo y Portal: fechas en hora argentina, grilla del mes, llave del
// calendario, lo que se ve del cliente y la matriz de permisos. Sin base ni React.

import { createHmac, timingSafeEqual } from "node:crypto";
import { COLUMNAS_FICHA, cuandoEs, MODULOS, ROLES_GESTION, type RolGestion } from "./gestion-core";

const HORAS_AR = 3;

// ── Fechas: el servidor corre en UTC y una reunión de las 22 no puede caer al día siguiente ──

export const claveDia = (d: Date): string => new Date(d.getTime() - HORAS_AR * 3_600_000).toISOString().slice(0, 10);
export const inicioDelDia = (clave: string): Date => new Date(`${clave}T00:00:00-03:00`);
export const finDelDia = (clave: string): Date => new Date(`${clave}T23:59:59.999-03:00`);
export const mediodia = (clave: string): Date => new Date(`${clave}T12:00:00-03:00`);

const sumarAClave = (clave: string, dias: number): string => {
  const [a, m, d] = clave.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
};

/** Hoy, mañana, en n días: contado en días argentinos, sea cual sea la zona del servidor. */
export function cuandoEnArgentina(fecha: Date, hoy: Date = new Date()): string {
  const local = (clave: string) => {
    const [a, m, d] = clave.split("-").map(Number);
    return new Date(a, m - 1, d, 12);
  };
  return cuandoEs(local(claveDia(fecha)), local(claveDia(hoy)));
}

export function mesPedido(valor: string | undefined | null, hoy: Date = new Date()): string {
  if (valor && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor)) return valor;
  return claveDia(hoy).slice(0, 7);
}

export function mesVecino(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

export function nombreDelMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(a, m - 1, 15)));
}

/** Los días de la grilla, de lunes a domingo, con los del mes vecino que completan las semanas. */
export function grillaDelMes(mes: string): string[] {
  const [a, m] = mes.split("-").map(Number);
  const primero = new Date(Date.UTC(a, m - 1, 1));
  const ultimo = new Date(Date.UTC(a, m, 0));
  const antes = (primero.getUTCDay() + 6) % 7;
  const despues = (7 - ((ultimo.getUTCDay() + 6) % 7) - 1) % 7;
  const total = antes + ultimo.getUTCDate() + despues;
  const inicio = sumarAClave(`${mes}-01`, -antes);
  return Array.from({ length: total }, (_, i) => sumarAClave(inicio, i));
}

/** Cada día de un evento de varios días. Con un tope: una fecha mal cargada no llena el calendario. */
export function diasDelRango(desde: Date, hasta: Date | null, tope = 31): string[] {
  const primera = claveDia(desde);
  const ultima = hasta ? claveDia(hasta) : primera;
  const dias: string[] = [primera];
  while (dias[dias.length - 1] < ultima && dias.length < tope) dias.push(sumarAClave(dias[dias.length - 1], 1));
  return dias;
}

export function agruparPorDia<T extends { fecha: Date }>(entradas: readonly T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const e of [...entradas].sort((a, b) => a.fecha.getTime() - b.fecha.getTime())) {
    const clave = claveDia(e.fecha);
    const lista = mapa.get(clave);
    if (lista) lista.push(e);
    else mapa.set(clave, [e]);
  }
  return mapa;
}

// ── Entradas del calendario ─────────────────────────────────────────────────

export type TipoCalendario = "REUNION" | "DEADLINE" | "PAGO" | "COBRO" | "EVENTO" | "MONTAJE" | "TAREA" | "CONFIRMACION" | "EVENTO_TENTATIVO";

export interface EntradaCalendario {
  id: string;
  tipo: TipoCalendario;
  titulo: string;
  fecha: Date;
  conHora: boolean;
  proyectoId: string | null;
  proyecto: string | null;
  /** Sólo pagos y cobros, y sólo para quien tiene permiso: la lectura ni los trae sin él. */
  monto: number | null;
  moneda: string | null;
}

export const ETIQUETA_CORTA: Record<TipoCalendario, string> = {
  REUNION: "Reunión",
  DEADLINE: "Límite",
  PAGO: "Pago",
  COBRO: "Cobro",
  EVENTO: "Evento",
  MONTAJE: "Armado",
  TAREA: "Tarea",
  CONFIRMACION: "Confirmar",
  EVENTO_TENTATIVO: "Tentativo",
};

/**
 * Lo que sale hacia un calendario externo. De pagos y cobros va sólo el tipo y el proyecto: el concepto de una cuota manual
 * es texto libre y podría traer una cifra. La ruta nunca incluye montos.
 */
export function entradaParaSuscripcion(e: Pick<EntradaCalendario, "id" | "tipo" | "titulo" | "fecha" | "proyecto">): { id: string; titulo: string; fecha: Date } {
  const esPlata = e.tipo === "PAGO" || e.tipo === "COBRO";
  const titulo = esPlata ? `${ETIQUETA_CORTA[e.tipo]}${e.proyecto ? ` · ${e.proyecto}` : ""}` : `${ETIQUETA_CORTA[e.tipo]} · ${e.titulo}`;
  return { id: e.id, titulo, fecha: e.fecha };
}

// ── La llave del calendario de cada persona ─────────────────────────────────

const firma = (secreto: string, tenantId: string, userId: string): string =>
  createHmac("sha256", secreto).update(`calendario-proyectos\n${tenantId}\n${userId}`).digest("base64url");

export const tokenDeCalendario = (secreto: string, tenantId: string, userId: string): string => `${userId}.${firma(secreto, tenantId, userId)}`;

/** Devuelve el usuario si la firma es de este negocio y esta persona; si no, nada. */
export function usuarioDelToken(secreto: string, tenantId: string, token: string): string | null {
  const m = /^([A-Za-z0-9_-]{1,64})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m) return null;
  const esperada = Buffer.from(firma(secreto, tenantId, m[1]));
  const recibida = Buffer.from(m[2]);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida) ? m[1] : null;
}

// ── Vista ───────────────────────────────────────────────────────────────────

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return (partes.length === 1 ? partes[0].slice(0, 2) : partes[0][0] + partes[1][0]).toUpperCase();
}

export function paginacion(pedida: string | undefined | null, total: number, porPagina: number): { pagina: number; paginas: number; salto: number } {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const n = Number(pedida);
  const pagina = Number.isInteger(n) && n >= 1 ? Math.min(n, paginas) : 1;
  return { pagina, paginas, salto: (pagina - 1) * porPagina };
}

export const entre = (n: number, min: number, max: number, siNo: number): number => (Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : siNo);

/** La última versión de cada proyecto es la ficha viva: las anteriores repetirían los ítems. */
export function versionesVivas(presupuestos: readonly { proyectoId: string; version: number }[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const p of presupuestos) mapa.set(p.proyectoId, Math.max(mapa.get(p.proyectoId) ?? 0, p.version));
  return mapa;
}

// ── Lo que ve el cliente ────────────────────────────────────────────────────

/** Un link o imagen que se puede mostrar en una pantalla pública: https o imagen embebida. Otro esquema no sale. */
export function enlaceSeguro(u: unknown): string | null {
  if (typeof u !== "string") return null;
  if (/^data:image\/(jpeg|png|webp);base64,/.test(u)) return u;
  try {
    return new URL(u).protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

export interface LaminaPublica {
  titulo: string;
  texto: string;
  imagen: string | null;
}

const textoDe = (o: Record<string, unknown>, ...claves: string[]): string => {
  for (const c of claves) {
    const v = o[c];
    if (typeof v === "string" && v.trim()) return v;
    if (Array.isArray(v)) {
      const lineas = v.filter((x): x is string => typeof x === "string" && !!x.trim());
      if (lineas.length > 0) return lineas.join("\n");
    }
  }
  return "";
};

/**
 * De cada lámina, sólo título, texto e imagen. Lo demás que tenga guardado no sale del servidor. La imagen suele ser una
 * referencia a una foto guardada en la base, cuya ruta pide sesión: `resolver` la cambia por la imagen misma.
 */
export function laminasPublicas(laminas: unknown, resolver: (ref: string) => string | null = () => null): LaminaPublica[] {
  if (!Array.isArray(laminas)) return [];
  return laminas
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object" && !Array.isArray(l))
    .map((l) => ({
      titulo: textoDe(l, "titulo"),
      texto: textoDe(l, "texto", "items"),
      imagen: typeof l.imagen === "string" ? (enlaceSeguro(l.imagen) ?? enlaceSeguro(resolver(l.imagen))) : null,
    }))
    .filter((l) => l.titulo || l.texto || l.imagen);
}

export function respuestaDePresentacion(aprueba: boolean, nombre: string, comentario: string, fecha: string): string {
  return aprueba ? `Aprobada por ${nombre} el ${fecha}.` : `Cambios pedidos por ${nombre} el ${fecha}: ${comentario}`;
}

// ── Matriz de permisos ──────────────────────────────────────────────────────

export interface FilaPermiso {
  rol: RolGestion;
  modulo: string;
  ver: boolean;
  editar: boolean;
  columnasOcultas?: string[];
}

const ROLES_EDITABLES = ROLES_GESTION.filter((r) => r !== "DIRECCION");

/** Lee el formulario de la matriz. Dirección no se lee nunca, y quien edita sin ver se corrige a ver y editar. */
export function matrizDelFormulario(campo: (nombre: string) => boolean): FilaPermiso[] {
  const filas: FilaPermiso[] = [];
  for (const rol of ROLES_EDITABLES) {
    for (const { id } of MODULOS) {
      const editar = campo(`editar:${rol}:${id}`);
      const fila: FilaPermiso = { rol, modulo: id, ver: editar || campo(`ver:${rol}:${id}`), editar };
      if (id === "ficha") fila.columnasOcultas = COLUMNAS_FICHA.map((c) => c.id).filter((c) => campo(`oculta:${rol}:${c}`));
      filas.push(fila);
    }
  }
  return filas;
}
