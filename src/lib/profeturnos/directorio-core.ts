// PROFETURNOS · Directorio público de profes (/profeturnos/profes). PURO: las lecturas entran por
// `DepsDirectorio` (directorio.server.ts las arma contra la base; los tests, con datos de mentira).
//
// Es la ÚNICA lectura entre negocios de ProfeTurnos que muestra algo en público. Reglas:
//  · Opt-in: sale sólo el negocio cuyo `_directorio.visible` es true (por defecto NO, y un JSON
//    raro cuenta como NO: `leerDirectorio`). A un negocio que no se anotó no se le lee nada más.
//  · Sólo campos públicos, los mismos que ya muestra su turnero: nombre, zona, clubes, precio y
//    horarios LIBRES. Nunca teléfonos (ni del profe ni de alumnos), ni clases, ni alumnos, ni el id
//    interno del negocio (la tarjeta se identifica por su subdominio, que ya es su link público).
//  · Cada lectura de un negocio corre en SU contexto (`runInTenantContext` en el .server): la deps
//    recibe el `tenantId` de ese negocio y nada más.
//  · Topes: anotados que se miran, profes que se arman y resultados que se muestran.
//  · Costo (CERT 13/11, MEDIA): los candidatos llegan YA filtrados a los anotados (una consulta, en
//    el .server); recién a ésos se les lee el ajuste, la verificación, la agenda y los clubes. Un
//    armado cuesta 1 + 4 consultas por anotado (no ~560 como cuando se leía el ajuste de todos).

import type { DiaConLugar } from "@/lib/padel/datos.server";
import type { Directorio } from "@/lib/padel/directorio";
import { DESDE_DIRECTORIO } from "@/lib/padel/canal";

/**
 * Cuántos negocios ANOTADOS (`_directorio.visible`) se miran como mucho por armado. Como la fuente
 * ya trae sólo anotados, el tope no deja afuera a los nuevos por haber muchos negocios sin anotar
 * (CERT 13/11, BAJA). Tope provisional a confirmar: 100 anotados ≈ 401 consultas cada 10 min por
 * instancia. TODO(escala): pasados los 100, paginar por zona o pasar `_directorio` a columnas con
 * índice (la migración ya anotada en src/lib/padel/directorio.ts).
 */
export const TOPE_CANDIDATOS = 100;
/** Cuántos profes anotados se arman (horarios y clubes) como mucho: todos los que se miran. */
export const TOPE_PROFES = TOPE_CANDIDATOS;
/** Cuántas tarjetas se muestran como mucho después de filtrar. */
export const TOPE_RESULTADOS = 30;
/** Cuántos días para adelante se ofrecen en el filtro y se guardan por profe. */
export const DIAS_DEL_FILTRO = 7;
/** Cuántos horarios libres muestra cada tarjeta. */
export const HORARIOS_POR_TARJETA = 3;
/** Cada cuánto se rearma el directorio (caché por instancia, directorio.server.ts). CERT 13/11: 10 min. */
export const DIRECTORIO_TTL_MS = 10 * 60_000;
/** Negocios que se leen a la vez (no ahogar el pool de conexiones). */
export const EN_PARALELO = 6;

export type Candidato = { tenantId: string; nombre: string; subdomain: string | null };

export type AjustePublico = { directorio: Directorio; precioIndividual: number; precioGrupal: number };

export interface DepsDirectorio {
  /**
   * Negocios activos con el módulo de clases que se ANOTARON en el directorio (pre-filtro en una
   * sola consulta; sólo columnas de `Tenant`). Es un índice, no la verdad: `ajuste` decide.
   */
  candidatos(tope: number): Promise<Candidato[]>;
  /** Todas las de abajo corren en el contexto del negocio `tenantId`. */
  ajuste(tenantId: string): Promise<AjustePublico>;
  /** ¿Su turnero toma pedidos? (verificado por GSG; lectura fallida → no). */
  abierto(tenantId: string): Promise<boolean>;
  agenda(tenantId: string): Promise<DiaConLugar[]>;
  clubes(tenantId: string): Promise<string[]>;
}

export type DiaPublico = { fecha: string; etiqueta: string; horas: string[]; clubes?: Record<string, string> };

/** Lo que se muestra de un profe. Sin `tenantId` a propósito. */
export interface ProfePublico {
  clave: string;
  nombre: string;
  zona: string;
  clubes: string[];
  precioIndividual: number;
  precioGrupal: number;
  dias: DiaPublico[];
  /** Su turnero: https://<subdominio>.<dominio>/clases */
  turnero: string;
}

const SUBDOMINIO = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** El dominio base sin protocolo ni barras (igual que `urlDelPanel`). */
export const dominioLimpio = (dominio: string): string => String(dominio).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");

/** El turnero del profe (mismo destino que «Tu link» de Ajustes), o null si el subdominio no es válido. */
export function turneroDe(subdomain: string | null | undefined, dominio: string): string | null {
  const s = String(subdomain ?? "").trim().toLowerCase();
  const d = dominioLimpio(dominio);
  if (!SUBDOMINIO.test(s) || !d) return null;
  return `https://${s}.${d}/clases`;
}

/**
 * «Reservar» con el horario elegido (el turnero lo toma de `?hora=`, src/app/clases/cinta.ts:55) y la
 * marca de origen `?desde=directorio`: la clase nace con origen DIRECTORIO y sus avisos los da GSG
 * (src/lib/padel/canal.ts).
 */
export function linkReservar(turnero: string, iso?: string | null): string {
  const q = new URLSearchParams({ desde: DESDE_DIRECTORIO });
  if (iso && !Number.isNaN(new Date(iso).getTime())) q.set("hora", new Date(iso).toISOString());
  return `${turnero}?${q.toString()}`;
}

/** «Cañuelas» = «canuelas» = « CAÑUELAS »: para comparar zonas. */
export const normalizarZona = (z: string): string =>
  z.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Fecha «AAAA-MM-DD» válida o null (lo que llega por la URL no se cree). */
export const fechaValida = (x: unknown): string | null =>
  typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(`${x}T12:00:00Z`)) ? x : null;

/** Corre `fn` sobre `items` de a `n` por vez, en orden. */
async function deA<T, R>(items: readonly T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map(fn))));
  return out;
}

/**
 * Arma el directorio entero (sin filtros; se filtra con `filtrarDirectorio`). Un negocio que falla
 * al leerse se saltea (no tira la página de todos). Orden: con horarios primero, después por nombre.
 */
export async function armarDirectorio(deps: DepsDirectorio, dominio: string): Promise<ProfePublico[]> {
  const candidatos = (await deps.candidatos(TOPE_CANDIDATOS))
    .slice(0, TOPE_CANDIDATOS)
    .map((c) => ({ ...c, turnero: turneroDe(c.subdomain, dominio) }))
    .filter((c): c is Candidato & { turnero: string } => c.turnero !== null);

  // Paso 1: sólo el ajuste (opt-in), leído en SU contexto: es la verdad (un JSON raro = no visible),
  // aunque el pre-filtro lo haya traído. A quien no se anotó no se le lee nada más.
  const anotados = (
    await deA(candidatos, EN_PARALELO, async (c) => {
      try {
        const a = await deps.ajuste(c.tenantId);
        return a.directorio.visible && a.directorio.zona ? { c, a } : null;
      } catch {
        return null;
      }
    })
  )
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, TOPE_PROFES);

  // Paso 2: los anotados con el turnero abierto: horarios libres y clubes.
  const fichas = await deA(anotados, EN_PARALELO, async ({ c, a }): Promise<ProfePublico | null> => {
    try {
      if (!(await deps.abierto(c.tenantId))) return null;
      const [agenda, clubes] = await Promise.all([deps.agenda(c.tenantId), deps.clubes(c.tenantId)]);
      return {
        clave: c.subdomain!.toLowerCase(),
        nombre: c.nombre.replace(/^profe\s+/i, "").trim() || c.nombre,
        zona: a.directorio.zona,
        clubes: [...new Set(clubes)].slice(0, 6),
        precioIndividual: a.precioIndividual,
        precioGrupal: a.precioGrupal,
        dias: agenda.slice(0, DIAS_DEL_FILTRO).map((d) => ({ fecha: d.fecha, etiqueta: d.etiqueta, horas: [...d.horas], ...(d.clubes ? { clubes: { ...d.clubes } } : {}) })),
        turnero: c.turnero,
      };
    } catch {
      return null;
    }
  });

  return fichas
    .filter((x): x is ProfePublico => x !== null)
    .sort((x, y) => Number(y.dias.length > 0) - Number(x.dias.length > 0) || x.nombre.localeCompare(y.nombre, "es"));
}

export type Filtro = { zona?: string | null; dia?: string | null };

/** Los profes que pasan el filtro (zona exacta normalizada; día con algún horario libre), con tope. */
export function filtrarDirectorio(profes: readonly ProfePublico[], f: Filtro): ProfePublico[] {
  const zona = f.zona ? normalizarZona(f.zona) : "";
  const dia = fechaValida(f.dia);
  return profes
    .filter((p) => !zona || normalizarZona(p.zona) === zona)
    .filter((p) => !dia || p.dias.some((d) => d.fecha === dia && d.horas.length > 0))
    .slice(0, TOPE_RESULTADOS);
}

export type HorarioPublico = { iso: string; etiqueta: string; club?: string };

/** Los próximos horarios libres de la tarjeta (de ese día si se filtró por día). */
export function proximosHorarios(p: ProfePublico, dia?: string | null, n = HORARIOS_POR_TARJETA): HorarioPublico[] {
  const d = fechaValida(dia);
  const out: HorarioPublico[] = [];
  for (const x of p.dias) {
    if (d && x.fecha !== d) continue;
    for (const iso of x.horas) {
      if (out.length >= n) return out;
      out.push({ iso, etiqueta: x.etiqueta, ...(x.clubes?.[iso] ? { club: x.clubes[iso] } : {}) });
    }
  }
  return out;
}

/** Las zonas para el filtro: una por zona normalizada, en orden alfabético. */
export function zonasDe(profes: readonly ProfePublico[]): string[] {
  const vistas = new Map<string, string>();
  for (const p of profes) {
    const k = normalizarZona(p.zona);
    if (k && !vistas.has(k)) vistas.set(k, p.zona);
  }
  return [...vistas.values()].sort((a, b) => a.localeCompare(b, "es"));
}

/** Memoria corta del directorio armado (por instancia del servidor). PURO salvo el reloj inyectado. */
export function memoriaCorta<T>(ttlMs: number, reloj: () => number = Date.now) {
  let guardado: { hasta: number; valor: Promise<T> } | null = null;
  return (cargar: () => Promise<T>): Promise<T> => {
    const ahora = reloj();
    if (guardado && guardado.hasta > ahora) return guardado.valor;
    const valor = cargar();
    guardado = { hasta: ahora + ttlMs, valor };
    // Si falló, no se guarda el error: el próximo pedido vuelve a intentar.
    valor.catch(() => {
      if (guardado?.valor === valor) guardado = null;
    });
    return valor;
  };
}
