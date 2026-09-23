// ============================================================================
// EL RASTRO DE LOS PRECIOS — qué precio cambió, cuándo, quién, y qué etiqueta falta imprimir.
// ============================================================================
//
// Cada cambio de precio de un producto deja UNA fila en AuditLog (`cambio-de-precio`), en la
// MISMA transacción que lo escribe: si el cambio se deshace, el registro también. Un aumento
// de 60 productos son 60 filas, cada una con su antes y su después: "este precio no lo cambié
// yo" se contesta mirando la fila de ese producto, no un resumen del lote.
//
// Imprimir etiquetas deja otra fila por producto (`etiqueta-impresa`) con el precio que salió
// en el papel. Con esas dos, "qué etiquetas faltan" es una cuenta: un producto está pendiente
// si su último cambio de precio es posterior a su última etiqueta impresa. Es por producto y
// no por "la última impresión": si ayer se reimprimieron 10 de los 60 que cambiaron, los otros
// 50 siguen pendientes.
//
// Sin migrar: AuditLog ya existe (schema.prisma, `model AuditLog`) y se filtra por `action`,
// `entity` y `entityId`, que son columnas; el detalle va en `changes` (JSON).
//
// Este archivo no importa ningún valor de Prisma: las funciones que escriben reciben la tx del
// llamador (la de `tenantTransaction`), igual que `escribirPlan`.

import type { Prisma } from "@/generated/prisma/client";
import type { FormaDeVenta } from "./planilla-core";
import { precioDeVenta } from "./aumento-core";

export const ENTIDAD_PRODUCTO = "Product";
export const ACCION_CAMBIO_DE_PRECIO = "cambio-de-precio";
export const ACCION_ETIQUETA_IMPRESA = "etiqueta-impresa";

/**
 * De dónde vino el cambio. `actualizar-precios` y `planilla` son cambios GENERALES (muchos
 * productos a la vez): son los que cuenta "Último aumento". `catalogo` es la edición de un
 * producto y `alta` el precio con que nace uno nuevo.
 */
export type OrigenCambio = "actualizar-precios" | "planilla" | "catalogo" | "alta";
export const ORIGENES_GENERALES: readonly OrigenCambio[] = ["actualizar-precios", "planilla"];

export type CambioDePrecio = {
  productId: string;
  nombre: string;
  saleUnit: FormaDeVenta;
  /** null = no tenía precio (un alta, o un producto que se vendía sin precio cargado). */
  antes: number | null;
  despues: number;
};

/** Lo que identifica un cambio general: todas sus filas llevan el mismo `lote`. */
export type LoteDeCambio = {
  id: string;
  sentido?: "subir" | "bajar";
  porcentaje?: number;
  redondeo?: number;
};

type TxAuditoria = Pick<Prisma.TransactionClient, "auditLog">;

/** Las filas de AuditLog de un grupo de cambios de precio. PURA. */
export function filasCambioDePrecio(args: {
  tenantId: string;
  actor: string;
  origen: OrigenCambio;
  cambios: readonly CambioDePrecio[];
  lote?: LoteDeCambio;
}): Prisma.AuditLogCreateManyInput[] {
  return args.cambios.map((c) => ({
    tenantId: args.tenantId,
    actor: args.actor,
    action: ACCION_CAMBIO_DE_PRECIO,
    entity: ENTIDAD_PRODUCTO,
    entityId: c.productId,
    channel: "admin",
    changes: {
      origen: args.origen,
      nombre: c.nombre,
      forma: c.saleUnit === "WEIGHT" ? "kg" : "u",
      antes: c.antes,
      despues: c.despues,
      ...(args.lote ? { lote: args.lote } : {}),
    },
  }));
}

/**
 * Deja las filas de los cambios de precio adentro de la tx del llamador. UNA sentencia,
 * sean 1 o 200. Devuelve cuántas escribió. Sin cambios no escribe nada.
 */
export async function registrarCambiosDePrecio(
  tx: TxAuditoria,
  args: Parameters<typeof filasCambioDePrecio>[0],
): Promise<number> {
  const data = filasCambioDePrecio(args);
  if (data.length === 0) return 0;
  const r = await tx.auditLog.createMany({ data });
  return r.count;
}

type PrecioGuardado = { saleUnit: FormaDeVenta; price: number | null; pricePerKg: number | null };

/**
 * El cambio de precio de UN producto que se edita (o se da de alta) desde el Catálogo, o
 * `null` si el precio de venta no cambió. PURA.
 *
 * `antes` es lo que había en la base (null en un alta); `venta` es lo que trae el formulario,
 * con la regla de `parseSaleFields`: un campo ausente no se toca. Un producto que se queda SIN
 * precio no deja fila: no hay etiqueta que imprimir, y contarlo como "cambió" haría que el
 * número de Etiquetas pidiera reimprimir algo que ya no se puede imprimir.
 */
export function cambioDePrecioDeUnProducto(args: {
  productId: string;
  nombre: string;
  antes: PrecioGuardado | null;
  venta: { saleUnit?: FormaDeVenta; price?: number | null; pricePerKg?: number | null };
}): CambioDePrecio | null {
  const base: PrecioGuardado = args.antes ?? { saleUnit: "UNIT", price: null, pricePerKg: null };
  const despues: PrecioGuardado = {
    saleUnit: args.venta.saleUnit ?? base.saleUnit,
    price: args.venta.price !== undefined ? args.venta.price : base.price,
    pricePerKg: args.venta.pricePerKg !== undefined ? args.venta.pricePerKg : base.pricePerKg,
  };
  const precioDespues = precioDeVenta(despues);
  if (precioDespues === null) return null;
  const precioAntes = args.antes ? precioDeVenta(args.antes) : null;
  const mismo =
    args.antes !== null &&
    precioAntes !== null &&
    args.antes.saleUnit === despues.saleUnit &&
    Math.round(precioAntes * 100) === Math.round(precioDespues * 100);
  if (mismo) return null;
  return { productId: args.productId, nombre: args.nombre, saleUnit: despues.saleUnit, antes: precioAntes, despues: precioDespues };
}

export type EtiquetaImpresa = { productId: string; nombre: string; precio: number; saleUnit: FormaDeVenta };

/** Las filas de "se imprimió la etiqueta de este producto con este precio". PURA. */
export function filasEtiquetaImpresa(args: {
  tenantId: string;
  actor: string;
  plantilla: string;
  etiquetas: readonly EtiquetaImpresa[];
}): Prisma.AuditLogCreateManyInput[] {
  return args.etiquetas.map((e) => ({
    tenantId: args.tenantId,
    actor: args.actor,
    action: ACCION_ETIQUETA_IMPRESA,
    entity: ENTIDAD_PRODUCTO,
    entityId: e.productId,
    channel: "admin",
    changes: { nombre: e.nombre, precio: e.precio, forma: e.saleUnit === "WEIGHT" ? "kg" : "u", plantilla: args.plantilla },
  }));
}

// ── Cómo se lee la fila en /admin/auditoria ─────────────────────────────────

/**
 * La fila de un cambio de precio o de una etiqueta impresa, en palabras: "Vacío: $9.000 →
 * $9.900 /kg" o "Vacío: $9.900 /kg". `null` si `changes` no tiene esa forma (la pantalla cae
 * al volcado de siempre). PURA; el formato de la plata entra por parámetro para no atar este
 * archivo a la UI.
 */
export function resumenDeFilaDePrecio(
  action: string,
  changes: unknown,
  plata: (n: number) => string,
): string | null {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return null;
  const c = changes as Record<string, unknown>;
  const nombre = typeof c.nombre === "string" && c.nombre.trim() ? c.nombre.trim() : null;
  const porKilo = c.forma === "kg" ? " /kg" : "";
  const monto = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? plata(v) : null);
  if (action === ACCION_CAMBIO_DE_PRECIO) {
    const despues = monto(c.despues);
    if (!nombre || despues === null) return null;
    const antes = c.antes === null ? "sin precio" : monto(c.antes);
    if (antes === null) return null;
    return `${nombre}: ${antes} → ${despues}${porKilo}`;
  }
  if (action === ACCION_ETIQUETA_IMPRESA) {
    const precio = monto(c.precio);
    if (!nombre || precio === null) return null;
    return `${nombre}: ${precio}${porKilo}`;
  }
  return null;
}

// ── Etiquetas pendientes ─────────────────────────────────────────────────────

/**
 * El `where` de "qué etiquetas faltan": los cambios de precio y las impresiones, por
 * producto. Lo usan la pantalla de Etiquetas y el número de su botón: el mismo `where`, la
 * misma cuenta (`pendientesDeEtiqueta`).
 */
export function whereAuditoriaDeEtiquetas(tenantId: string) {
  return {
    tenantId,
    entity: ENTIDAD_PRODUCTO,
    action: { in: [ACCION_CAMBIO_DE_PRECIO, ACCION_ETIQUETA_IMPRESA] },
    entityId: { not: null },
  } satisfies Prisma.AuditLogWhereInput;
}

/** Una fila de `groupBy({ by: ["entityId", "action"], _max: { createdAt } })`. */
export type GrupoAuditoria = { entityId: string | null; action: string; _max: { createdAt: Date | null } };

/**
 * Los productos cuyo último cambio de precio es POSTERIOR a su última etiqueta impresa (o
 * que nunca se imprimieron), con la fecha de ese cambio. PURA.
 */
export function pendientesDeEtiqueta(grupos: readonly GrupoAuditoria[]): Map<string, Date> {
  const ultimoCambio = new Map<string, Date>();
  const ultimaImpresion = new Map<string, Date>();
  for (const g of grupos) {
    const f = g._max.createdAt;
    if (!g.entityId || !f) continue;
    const destino =
      g.action === ACCION_CAMBIO_DE_PRECIO ? ultimoCambio : g.action === ACCION_ETIQUETA_IMPRESA ? ultimaImpresion : null;
    if (!destino) continue;
    const previa = destino.get(g.entityId);
    if (!previa || f.getTime() > previa.getTime()) destino.set(g.entityId, f);
  }
  const out = new Map<string, Date>();
  for (const [id, cambio] of ultimoCambio) {
    const impresa = ultimaImpresion.get(id);
    if (!impresa || cambio.getTime() > impresa.getTime()) out.set(id, cambio);
  }
  return out;
}

/** La última impresión de etiquetas del negocio (cualquier producto), o null si nunca. PURA. */
export function ultimaImpresion(grupos: readonly GrupoAuditoria[]): Date | null {
  let max: Date | null = null;
  for (const g of grupos) {
    if (g.action !== ACCION_ETIQUETA_IMPRESA || !g._max.createdAt) continue;
    if (!max || g._max.createdAt.getTime() > max.getTime()) max = g._max.createdAt;
  }
  return max;
}

// ── Último aumento general ───────────────────────────────────────────────────

/**
 * El `where` de "Último aumento": los cambios de precio que vinieron de un cambio general
 * (Actualizar precios o la planilla). La edición de un producto suelto no cuenta: si no, un
 * precio corregido hoy escondería que el aumento general fue hace dos meses.
 */
export function whereAumentosGenerales(tenantId: string) {
  return {
    tenantId,
    entity: ENTIDAD_PRODUCTO,
    action: ACCION_CAMBIO_DE_PRECIO,
    OR: ORIGENES_GENERALES.map((origen) => ({ changes: { path: ["origen"], equals: origen } })),
  } satisfies Prisma.AuditLogWhereInput;
}

export type UltimoAumento = {
  /** Días enteros en el calendario del negocio (0 = hoy). */
  dias: number;
  origen: OrigenCambio | null;
  /** "+8 %" o "−5 %" cuando vino de Actualizar precios; null si vino de la planilla. */
  porcentaje: string | null;
};

/** Días de calendario entre dos fechas AAAA-MM-DD. PURA. */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(Number(desde.slice(0, 4)), Number(desde.slice(5, 7)) - 1, Number(desde.slice(8, 10)));
  const b = Date.UTC(Number(hasta.slice(0, 4)), Number(hasta.slice(5, 7)) - 1, Number(hasta.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

/**
 * La fila más reciente de `whereAumentosGenerales` → cuántos días pasaron y de qué fue. PURA.
 * `diaDelCambio` es la fecha de esa fila en la zona del negocio (AAAA-MM-DD).
 */
export function resumirUltimoAumento(fila: { diaDelCambio: string; changes: unknown } | null, hoy: string): UltimoAumento | null {
  if (!fila) return null;
  const c = (fila.changes && typeof fila.changes === "object" ? fila.changes : {}) as Record<string, unknown>;
  const origen = typeof c.origen === "string" && (ORIGENES_GENERALES as readonly string[]).includes(c.origen) ? (c.origen as OrigenCambio) : null;
  const lote = (c.lote && typeof c.lote === "object" ? c.lote : {}) as Record<string, unknown>;
  const porcentaje =
    typeof lote.porcentaje === "number" && (lote.sentido === "subir" || lote.sentido === "bajar")
      ? `${lote.sentido === "subir" ? "+" : "−"}${lote.porcentaje.toLocaleString("es-AR", { maximumFractionDigits: 2 })} %`
      : null;
  return { dias: Math.max(0, diasEntre(fila.diaDelCambio, hoy)), origen, porcentaje };
}

/** "hoy", "ayer", "hace 23 días". */
export function haceCuanto(dias: number): string {
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}
