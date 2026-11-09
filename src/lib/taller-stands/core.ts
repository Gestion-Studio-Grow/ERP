// ============================================================================
// TALLER DE STANDS — núcleo puro (GSG-MIA-004 · T2): costo del despiece, su pase al presupuesto
// y el papel para la productora (sin costo ni margen). Sin base ni Next: se prueba solo.
// ============================================================================

import { precioConMargen, redondear } from "@/lib/proyectos/core";
import { ventaTotalItem } from "@/lib/proyectos/gestion-core";

export const MODULO_TALLER = "taller-stands";
export const RUBRO_DESPIECE = "Materiales";
const PREFIJO = "despiece:";

/** ¿Se muestra lo del taller? Flag prendida, módulo asignado y rubro del taller: la productora (MIA) nunca lo ve. */
export function tallerVisible(d: { flag: boolean; modules: readonly string[] | null | undefined; blueprintId: string | null | undefined }): boolean {
  return d.flag && d.blueprintId === MODULO_TALLER && (d.modules ?? []).includes(MODULO_TALLER);
}

export const origenDespiece = (despieceId: string): string => `${PREFIJO}${despieceId}`;
export const esOrigenDespiece = (origen: string | null | undefined): boolean => !!origen?.startsWith(PREFIJO);

// ── Piezas ─────────────────────────────────────────────────────────────────

export interface PiezaValida {
  nombre: string;
  unidad: string;
  costoUnit: number;
  horasStd: number;
}

/** Valida lo que viene del formulario. Devuelve el motivo en criollo o la pieza lista. */
export function validarPieza(d: { nombre: string; unidad: string; costoUnit: number; horasStd: number }): { ok: true; pieza: PiezaValida } | { ok: false; error: string } {
  const nombre = d.nombre.trim().slice(0, 120);
  if (!nombre) return { ok: false, error: "Poné el nombre de la pieza." };
  if (!Number.isFinite(d.costoUnit) || d.costoUnit < 0) return { ok: false, error: "El costo no puede ser negativo." };
  if (!Number.isFinite(d.horasStd) || d.horasStd < 0) return { ok: false, error: "Las horas no pueden ser negativas." };
  return { ok: true, pieza: { nombre, unidad: d.unidad.trim().slice(0, 12) || "u", costoUnit: redondear(d.costoUnit), horasStd: redondear(d.horasStd) } };
}

// ── Despiece ───────────────────────────────────────────────────────────────

export interface LineaDespiece {
  id: string;
  nombre: string;
  unidad: string;
  cantidad: number;
  costoUnitSnap: number;
}

export const costoLinea = (l: Pick<LineaDespiece, "cantidad" | "costoUnitSnap">): number => redondear(l.cantidad * l.costoUnitSnap);

/** Costo total del despiece de un stand, al costo congelado de cada pieza. */
export function costoDespiece(lineas: readonly Pick<LineaDespiece, "cantidad" | "costoUnitSnap">[]): number {
  return redondear(lineas.reduce((s, l) => s + costoLinea(l), 0));
}

export interface ItemDeDespiece {
  rubro: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  costo: number;
  precio: number;
  origen: string;
}

/** Cada renglón del despiece es un ítem del rubro «Materiales», con el margen general del negocio. */
export function itemsDelDespiece(lineas: readonly LineaDespiece[], margenPct: number): ItemDeDespiece[] {
  return lineas
    .filter((l) => l.cantidad > 0)
    .map((l) => ({
      rubro: RUBRO_DESPIECE,
      descripcion: l.nombre,
      unidad: l.unidad || "u",
      cantidad: l.cantidad,
      costo: l.costoUnitSnap,
      precio: precioConMargen(l.costoUnitSnap, margenPct),
      origen: origenDespiece(l.id),
    }));
}

export interface PlanDePase {
  crear: ItemDeDespiece[];
  actualizar: { id: string; item: ItemDeDespiece }[];
  borrar: string[];
}

/**
 * Volver a pasar el despiece actualiza los ítems que ya vinieron de él (mismo `origen`), crea los nuevos y saca los
 * de piezas que ya no están. Lo cargado a mano (otro origen o ninguno) no se toca. Nunca duplica.
 */
export function planDePase(existentes: readonly { id: string; origen: string | null }[], items: readonly ItemDeDespiece[]): PlanDePase {
  const porOrigen = new Map<string, string[]>();
  for (const e of existentes) {
    if (!e.origen || !esOrigenDespiece(e.origen)) continue;
    porOrigen.set(e.origen, [...(porOrigen.get(e.origen) ?? []), e.id]);
  }
  const plan: PlanDePase = { crear: [], actualizar: [], borrar: [] };
  for (const item of items) {
    const ids = porOrigen.get(item.origen);
    if (!ids) plan.crear.push(item);
    else {
      plan.actualizar.push({ id: ids[0], item });
      plan.borrar.push(...ids.slice(1)); // un duplicado viejo se limpia
    }
    porOrigen.delete(item.origen);
  }
  for (const ids of porOrigen.values()) plan.borrar.push(...ids);
  return plan;
}

// ── Papel para la productora ───────────────────────────────────────────────

export interface ItemParaPapel {
  descripcion: string;
  unidad?: string;
  cantidad: number;
  costo: number;
  moneda: string;
  recargoPct: number | null;
  precio: number;
  visibleCliente?: boolean;
}

export interface LineaPapelMia {
  descripcion: string;
  cantidad: number;
  unidad: string;
  precio: number;
  total: number;
}

export interface PapelMia {
  lineas: LineaPapelMia[];
  neto: number;
  ivaPct: number;
  iva: number;
  total: number;
}

/**
 * Lo único que viaja a la productora: descripción, cantidad, precio y total. Se arma campo por campo (nunca con
 * spread) para que el costo, el costo real, el recargo o el margen no se cuelen. Lo oculto al cliente va en
 * «Otros conceptos», como en la planilla de venta.
 */
export function papelParaMia(items: readonly ItemParaPapel[], tc: Readonly<Record<string, number>>, recargoGeneral: number, ivaPct: number): PapelMia {
  const lineas: LineaPapelMia[] = [];
  let otros = 0;
  for (const i of items) {
    const total = ventaTotalItem(i, tc, recargoGeneral);
    if (i.visibleCliente === false) {
      otros = redondear(otros + total);
      continue;
    }
    lineas.push({ descripcion: i.descripcion, cantidad: i.cantidad, unidad: i.unidad || "u", precio: i.cantidad > 0 ? redondear(total / i.cantidad) : 0, total });
  }
  // Distinto de cero (no «mayor»): un descuento oculto también tiene que restar en el papel, como en la planilla.
  if (otros !== 0) lineas.push({ descripcion: "Otros conceptos", cantidad: 1, unidad: "", precio: otros, total: otros });
  const neto = redondear(lineas.reduce((s, l) => s + l.total, 0));
  const iva = redondear((neto * ivaPct) / 100);
  return { lineas, neto, ivaPct, iva, total: redondear(neto + iva) };
}

/** P2021/P2022: la tabla o la columna todavía no existe (migración sin aplicar). */
export function faltaLaTabla(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return code === "P2021" || code === "P2022";
}
