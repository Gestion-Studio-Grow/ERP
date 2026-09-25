// ============================================================================
// TABLA DENSA — lo que se decide sin DOM: orden y filtros en la URL, selección, teclado, cursor.
// ============================================================================
//
// La tabla densa (Tabla.tsx) es un client component; todo lo que se puede decidir con datos va acá
// para probarlo con node --test. Nada de esto lee la base ni decide qué ve cada uno: la página (el
// servidor) trae las filas ya filtradas, ordenadas y paginadas con los MISMOS parámetros de la URL.
//
//   · Orden en la URL: `?orden=total` (ascendente) o `?orden=-total` (descendente). Así un enlace de
//     la bandeja abre la tabla ya ordenada y «Atrás» vuelve al orden de antes.
//   · Filtros en la URL: `?estado=pendiente&canal=tienda`. Cambiar un filtro borra el cursor (la
//     página 2 de otro filtro no existe).
//   · Paginación por cursor: la página pide `tamanio + 1` filas; si vino una de más, hay siguiente
//     y su cursor es la clave de la última mostrada. Nunca `OFFSET` (con 2.000 turnos por año, el
//     offset se vuelve lento y salta filas si entra una nueva).
//   · Selección: un conjunto de claves; con Mayúsculas, el rango desde la última tocada.
//   · Teclado: ↑/↓ o j/k mueven el foco de fila, x selecciona, Enter abre, Mayúsculas+A selecciona
//     todo lo filtrado, Esc limpia; una letra suelta es la tecla del paso que sigue de la fila.

import { nextSort, type DataTableSort } from "./data-table-sort";

export type OrdenTabla = DataTableSort;

/** Lee `?orden=` (`clave` o `-clave`). Una clave que no es ordenable no ordena (no se inventa). */
export function ordenDesdeUrl(valor: string | null | undefined, ordenables: readonly string[]): OrdenTabla {
  if (!valor) return null;
  const desc = valor.startsWith("-");
  const clave = desc ? valor.slice(1) : valor;
  if (!ordenables.includes(clave)) return null;
  return { key: clave, direction: desc ? "desc" : "asc" };
}

/** El valor de `?orden=` para un orden (o `null` para sacarlo). */
export function ordenAUrl(orden: OrdenTabla): string | null {
  if (!orden) return null;
  return orden.direction === "desc" ? `-${orden.key}` : orden.key;
}

/** El orden que sigue al tocar una columna: ascendente → descendente → sin orden. */
export function siguienteOrden(actual: OrdenTabla, clave: string): OrdenTabla {
  return nextSort(actual, clave);
}

/** Los parámetros que NO son filtros: cambiarlos no reinicia la página. */
const NO_REINICIAN = new Set(["cursor"]);

/**
 * El enlace con los parámetros cambiados. `null` o "" saca el parámetro. Cambiar cualquier cosa que
 * no sea el cursor saca el cursor: un filtro u orden nuevo vuelve a la primera página.
 */
export function hrefConParametros(
  ruta: string,
  actuales: Readonly<Record<string, string | string[] | undefined>> | URLSearchParams,
  cambios: Readonly<Record<string, string | null | undefined>>,
): string {
  const p = new URLSearchParams();
  const entradas: [string, string][] =
    actuales instanceof URLSearchParams
      ? [...actuales.entries()]
      : Object.entries(actuales).flatMap(([k, v]) => (v === undefined ? [] : Array.isArray(v) ? v.map((x) => [k, x] as [string, string]) : [[k, v] as [string, string]]));
  for (const [k, v] of entradas) if (!(k in cambios)) p.append(k, v);
  const reinicia = Object.keys(cambios).some((k) => !NO_REINICIAN.has(k));
  if (reinicia) p.delete("cursor");
  for (const [k, v] of Object.entries(cambios)) {
    if (v !== null && v !== undefined && v !== "") p.set(k, v);
  }
  const q = p.toString();
  return q ? `${ruta}?${q}` : ruta;
}

/**
 * Una página por cursor. `filas` es lo que devolvió la base pidiendo `tamanio + 1`. Devuelve las
 * `tamanio` a mostrar y el cursor de la siguiente (la clave de la última), o `null` si no hay más.
 */
export function paginaConCursor<T>(filas: readonly T[], tamanio: number, clave: (f: T) => string): { filas: T[]; siguiente: string | null } {
  const hay = filas.length > tamanio;
  const visibles = filas.slice(0, tamanio);
  return { filas: visibles, siguiente: hay && visibles.length > 0 ? clave(visibles[visibles.length - 1]) : null };
}

// ── Selección ────────────────────────────────────────────────────────────────

export function alternarSeleccion(sel: ReadonlySet<string>, clave: string): Set<string> {
  const s = new Set(sel);
  if (s.has(clave)) s.delete(clave);
  else s.add(clave);
  return s;
}

/**
 * Con Mayúsculas: selecciona (o saca) el rango entre la última fila tocada y esta, en el orden de
 * la pantalla. El rango toma el estado de la fila tocada ahora (si queda marcada, marca todo).
 */
export function seleccionarRango(
  sel: ReadonlySet<string>,
  orden: readonly string[],
  desde: string | null,
  hasta: string,
): Set<string> {
  const i = desde === null ? -1 : orden.indexOf(desde);
  const j = orden.indexOf(hasta);
  if (i < 0 || j < 0) return alternarSeleccion(sel, hasta);
  const marcar = !sel.has(hasta);
  const s = new Set(sel);
  for (const k of orden.slice(Math.min(i, j), Math.max(i, j) + 1)) {
    if (marcar) s.add(k);
    else s.delete(k);
  }
  return s;
}

/** El estado de la casilla de «todas»: marcada, a medias o vacía. */
export function estadoDeTodas(sel: ReadonlySet<string>, visibles: readonly string[]): "todas" | "algunas" | "ninguna" {
  const n = visibles.filter((k) => sel.has(k)).length;
  return n === 0 ? "ninguna" : n === visibles.length ? "todas" : "algunas";
}

// ── Teclado ──────────────────────────────────────────────────────────────────

export type AccionDeTeclado =
  | { tipo: "mover"; delta: 1 | -1 }
  | { tipo: "seleccionar" }
  | { tipo: "abrir" }
  | { tipo: "todas" }
  | { tipo: "limpiar" }
  | { tipo: "tecla"; letra: string };

export interface EventoDeTecla {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/**
 * Qué hace una tecla sobre la tabla. `null` = no es de la tabla (se deja pasar: Ctrl/⌘K, F2…).
 * `letras` son las teclas de contexto que la tabla ofrece («p» preparar); cualquier otra letra suelta
 * no hace nada, para no robarle teclas a nadie.
 */
export function accionDeTecla(e: EventoDeTecla, letras: readonly string[] = []): AccionDeTeclado | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const k = e.key;
  if (k === "ArrowDown" || (k === "j" && !e.shiftKey)) return { tipo: "mover", delta: 1 };
  if (k === "ArrowUp" || (k === "k" && !e.shiftKey)) return { tipo: "mover", delta: -1 };
  if (k === "x" && !e.shiftKey) return { tipo: "seleccionar" };
  if (k === "Enter") return { tipo: "abrir" };
  if ((k === "A" || k === "a") && e.shiftKey) return { tipo: "todas" };
  if (k === "Escape") return { tipo: "limpiar" };
  const letra = k.length === 1 ? k.toLowerCase() : null;
  if (letra && !e.shiftKey && letras.includes(letra)) return { tipo: "tecla", letra };
  return null;
}

/** El foco de fila que sigue, sin salirse (arriba del todo se queda arriba). -1 = sin foco. */
export function moverFoco(foco: number, delta: 1 | -1, total: number): number {
  if (total === 0) return -1;
  if (foco < 0) return delta > 0 ? 0 : total - 1;
  return Math.min(total - 1, Math.max(0, foco + delta));
}

/**
 * Qué hace abrir una fila (clic en el renglón o Enter con el foco): ir a su ficha si tiene
 * enlace, abrirla en esta misma pantalla (un cajón) si la tabla la sabe abrir, o nada.
 * El enlace gana: una fila con ficha propia no se abre en un cajón.
 */
export type AperturaDeFila = { tipo: "enlace"; href: string } | { tipo: "cajon" } | null;

export function aperturaDeFila(href: string | null | undefined, abreEnCajon: boolean): AperturaDeFila {
  if (href) return { tipo: "enlace", href };
  return abreEnCajon ? { tipo: "cajon" } : null;
}
