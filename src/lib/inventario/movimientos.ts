// ============================================================================
// MOVIMIENTOS DE UN PRODUCTO — filtros y palabras de la pantalla. PURO.
// ============================================================================
//
// Responde "¿por qué el stock dice esto?": cada entrada y salida del registro de movimientos
// (StockMovement), con el saldo después de cada una, el motivo y quién. Acá están las reglas
// sin base: qué filtros se aceptan de la URL (nada que no sea un tipo o un día válido llega a
// la consulta), cómo se nombra cada tipo y quién hizo cada movimiento.
//
// Sin imports de servidor: lo usan la página, el loader y los tests.

import { ANULACION_VENTA_ACTOR_PREFIX, EDICION_ACTOR_PREFIX } from "@/lib/order-anulacion";
import { TRASLADO_ACTOR_PREFIX } from "@/lib/multilocal/traslado-core";

export const TIPOS_DE_MOVIMIENTO = ["VENTA", "COMPRA", "REPOSICION", "CONSUMO", "AJUSTE", "DEVOLUCION_PROVEEDOR"] as const;
export type TipoDeMovimiento = (typeof TIPOS_DE_MOVIMIENTO)[number];

/** Cómo se llama cada tipo en pantalla, en palabras del negocio. */
export function nombreDelTipo(t: string): string {
  switch (t) {
    case "VENTA":
      return "Venta";
    case "COMPRA":
      return "Compra";
    case "REPOSICION":
      return "Reposición";
    case "CONSUMO":
      return "Consumo en un servicio";
    case "AJUSTE":
      return "Ajuste o merma";
    case "DEVOLUCION_PROVEEDOR":
      return "Devolución a proveedor";
    default:
      return t;
  }
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Un "YYYY-MM-DD" que existe en el calendario, o null. PURA. */
function diaValido(v: string | undefined): string | null {
  if (!v || !DIA.test(v)) return null;
  const d = new Date(`${v}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

export interface FiltrosDeMovimientos {
  producto: string | null;
  tipo: TipoDeMovimiento | null;
  desde: string | null;
  hasta: string | null;
}

/**
 * Lee los filtros de la URL. Lo que no es válido se descarta (no se busca con un tipo
 * inventado ni con un 30 de febrero); un rango al revés se da vuelta. PURA.
 */
export function leerFiltros(sp: Record<string, string | string[] | undefined>): FiltrosDeMovimientos {
  const uno = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  };
  const tipoRaw = uno("tipo")?.toUpperCase();
  const tipo = (TIPOS_DE_MOVIMIENTO as readonly string[]).includes(tipoRaw ?? "") ? (tipoRaw as TipoDeMovimiento) : null;
  let desde = diaValido(uno("desde"));
  let hasta = diaValido(uno("hasta"));
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];
  const producto = uno("producto") ?? null;
  return { producto: producto && /^[A-Za-z0-9_-]{1,64}$/.test(producto) ? producto : null, tipo, desde, hasta };
}

/** La URL de la pantalla con estos filtros (sin los vacíos). PURA. */
export function hrefMovimientos(f: Partial<FiltrosDeMovimientos>): string {
  const q = new URLSearchParams();
  if (f.producto) q.set("producto", f.producto);
  if (f.tipo) q.set("tipo", f.tipo);
  if (f.desde) q.set("desde", f.desde);
  if (f.hasta) q.set("hasta", f.hasta);
  const s = q.toString();
  return s ? `/admin/inventario/movimientos?${s}` : "/admin/inventario/movimientos";
}

/**
 * El id de usuario detrás de un `createdBy` del registro ("user:<id>", o con la marca de una
 * anulación o una edición de pedido adelante), o null si fue el sistema. PURA.
 */
export function usuarioDe(createdBy: string): string | null {
  const sinMarca = createdBy.replace(ANULACION_VENTA_ACTOR_PREFIX, "").replace(EDICION_ACTOR_PREFIX, "");
  return sinMarca.startsWith("user:") && sinMarca.length > 5 ? sinMarca.slice(5) : null;
}

/** Quién hizo el movimiento, para leer: el nombre, o "el sistema", y si fue una anulación. PURA. */
export function quienHizo(createdBy: string, nombres: ReadonlyMap<string, string>): string {
  // Un traslado entre locales lo firma la casa ("traslado:user:<id de la casa>"): en el local
  // ese usuario no existe, y el motivo ya nombra el remito.
  if (createdBy.startsWith(TRASLADO_ACTOR_PREFIX)) return "traslado de la casa";
  const id = usuarioDe(createdBy);
  const nombre = id ? (nombres.get(id) ?? "un usuario dado de baja") : "el sistema";
  if (createdBy.startsWith(ANULACION_VENTA_ACTOR_PREFIX)) return `${nombre} (anulación de venta)`;
  if (createdBy.startsWith(EDICION_ACTOR_PREFIX)) return `${nombre} (pedido reajustado)`;
  return nombre;
}
