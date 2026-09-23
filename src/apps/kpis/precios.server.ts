// ============================================================================
// NÚMEROS DE CATÁLOGO Y PRECIOS — Catálogo, Actualizar precios y Etiquetas de precio.
// ============================================================================
//
// Mismas reglas que todos los loaders de esta carpeta (ver mostrador.server.ts): el `db` del
// contexto, sin transacciones, UNA consulta por número y el `where` de la pantalla, importado
// del módulo que lo define. Cada número dice lo mismo que su pantalla:
//   · Catálogo: `resumirCatalogo` sobre `whereCatalogoActivo`, con el costo vigente de
//     stock/costo.ts. Sin `Product.cost`: esa columna se lee con SQL crudo y un tile no puede
//     abrir una transacción; hasta que la migración cárnica esté en la base no existe, y cuando
//     esté, el tile puede contar "sin costo" un producto al que la pantalla sí le ve el costo
//     cargado a mano (la misma salvedad que el número de Stock, logistica.server.ts).
//   · Actualizar precios: la fila más reciente de `whereAumentosGenerales`, la misma que muestra
//     la pantalla arriba de todo.
//   · Etiquetas: `pendientesDeEtiqueta` sobre el `groupBy` de `whereAuditoriaDeEtiquetas`, la
//     misma cuenta que la pantalla. Cuenta también un producto borrado después de cambiarle el
//     precio; la pantalla lo dice aparte ("ya no está en el catálogo") para que los dos números
//     sigan siendo el mismo.
// Ninguno lleva plata: son cantidades y días.

import { dateStrInBusinessTz } from "@/lib/datetime";
import { SELECT_INGRESOS, costosVigentesDe } from "@/lib/stock/costo";
import { resumirCatalogo, whereCatalogoActivo } from "@/lib/catalogo/resumen";
import {
  pendientesDeEtiqueta,
  resumirUltimoAumento,
  whereAumentosGenerales,
  whereAuditoriaDeEtiquetas,
  type UltimoAumento,
} from "@/lib/catalogo/precios-auditoria";
import { fmtNumberAR } from "@/components/ui/format";
import { plural, type DatoKpi, type LoaderKpi } from "./nucleo.server";

// ── Catálogo ─────────────────────────────────────────────────────────────────

/**
 * "3 sin precio · 5 sin costo". En un negocio de servicios no hay número: ahí lo que se vende
 * sobre todo son servicios (otra tabla) y buena parte de los productos son insumos que no se
 * venden, así que "N sin precio" contaría insumos y sería una alarma falsa. No es que no haya
 * productos con precio (en la base de QA, 6 de los 7 de beauty-spa lo tienen).
 */
export const catalogo: LoaderKpi = async ({ db, tenantId, esMostrador }) => {
  if (!esMostrador) return null;
  const productos = await db.product.findMany({
    where: whereCatalogoActivo(tenantId),
    select: { id: true, saleUnit: true, price: true, pricePerKg: true, ...SELECT_INGRESOS },
  });
  const r = resumirCatalogo(productos, costosVigentesDe(productos, new Map()));
  return { valor: fmtNumberAR(r.sinPrecio), detalle: `sin precio · ${fmtNumberAR(r.sinCosto)} sin costo` };
};

// ── Actualizar precios ───────────────────────────────────────────────────────

/** El número del botón a partir del último cambio general. PURA. */
export function datoUltimoAumento(u: UltimoAumento | null): DatoKpi {
  if (!u) return { sinDato: "Todavía no se cambiaron precios en bloque desde el sistema" };
  const baja = u.porcentaje?.startsWith("−") ?? false;
  const que =
    u.origen === "planilla" ? "último cambio por planilla" : baja ? `última baja (${u.porcentaje})` : `último aumento${u.porcentaje ? ` (${u.porcentaje})` : ""}`;
  if (u.dias === 0) return { valor: "Hoy", detalle: que };
  if (u.dias === 1) return { valor: "Ayer", detalle: que };
  return { valor: `${fmtNumberAR(u.dias)} días`, detalle: `desde ${baja ? "la" : "el"} ${que}` };
}

export const actualizarPrecios: LoaderKpi = async ({ db, tenantId, hoy }) => {
  const fila = await db.auditLog.findFirst({
    where: whereAumentosGenerales(tenantId),
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, changes: true },
  });
  return datoUltimoAumento(
    resumirUltimoAumento(fila ? { diaDelCambio: dateStrInBusinessTz(fila.createdAt), changes: fila.changes } : null, hoy),
  );
};

// ── Etiquetas de precio ──────────────────────────────────────────────────────

/** "14 precios cambiaron y no se reimprimieron". */
export const etiquetasDePrecio: LoaderKpi = async ({ db, tenantId }) => {
  const grupos = await db.auditLog.groupBy({
    by: ["entityId", "action"],
    where: whereAuditoriaDeEtiquetas(tenantId),
    _max: { createdAt: true },
  });
  const n = pendientesDeEtiqueta(grupos).size;
  if (n === 0) return { valor: "0", detalle: "precios para reimprimir" };
  return {
    valor: fmtNumberAR(n),
    detalle: plural(n, "precio cambió y no se reimprimió", "precios cambiaron y no se reimprimieron"),
  };
};

export const LOADERS_PRECIOS: Readonly<Record<string, LoaderKpi>> = {
  catalogo,
  "actualizar-precios": actualizarPrecios,
  "etiquetas-de-precio": etiquetasDePrecio,
};
