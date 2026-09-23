// ============================================================================
// NÚMEROS DE CATÁLOGO Y PRECIOS — Catálogo, Actualizar precios, Etiquetas y Promociones.
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
//   · Etiquetas: `pendientesDeEtiqueta` sobre el `groupBy` de `whereAuditoriaDeEtiquetas`, y de
//     esos, sólo los que la lista muestra (`pendientesEnLaLista`, la misma función que usa el
//     titular de la pantalla). Es la única de este archivo que hace DOS consultas: ver el loader.
//   · Promociones: `whereCuponesVigentes`, el mismo `where` de la pantalla de cupones.
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
import { precioDeVenta } from "@/lib/catalogo/aumento-core";
import { whereCuponesVigentes } from "@/lib/venta-reglas";
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

/** Lo que `pendientesEnLaLista` necesita de cada producto. */
export type ProductoDeEtiqueta = { id: string; deletedAt?: Date | null } & Parameters<typeof precioDeVenta>[0];

/**
 * Cuántos de los `pendientes` (precio cambiado y sin reimprimir, `pendientesDeEtiqueta`) están
 * en la LISTA de Etiquetas: no borrados y con precio de venta (`precioDeVenta`). PURA.
 *
 * Es LA regla de los dos números: la llaman el botón del Inicio (abajo) y el titular de la
 * pantalla (catalogo/etiquetas/page.tsx), cada uno con sus filas, y por eso dicen lo mismo. Un
 * producto que se borró o se quedó sin precio después del cambio no tiene etiqueta que
 * reimprimir: si contara, el botón diría 14 y la lista tendría 12, sin forma de encontrar los
 * otros dos.
 *
 * `deletedAt` es opcional porque la pantalla ya lee sólo los productos no borrados; el botón lo
 * trae y la regla lo mira acá, no en el `where`.
 */
export function pendientesEnLaLista(
  pendientes: ReadonlyMap<string, unknown>,
  productos: readonly ProductoDeEtiqueta[],
): number {
  let n = 0;
  for (const p of productos) {
    if (pendientes.has(p.id) && p.deletedAt == null && precioDeVenta(p) !== null) n += 1;
  }
  return n;
}

/**
 * "14 precios cambiaron y no se reimprimieron", contando lo mismo que el titular de la
 * pantalla: `pendientesEnLaLista`.
 *
 * DOS consultas, no una (excepción a la regla 8, aceptada por plataforma y declarada en
 * CONSULTAS_ESPERADAS de loaders.test.ts): los cambios salen de la auditoría y el "sigue en el catálogo con precio"
 * del producto, y entre las dos tablas no hay relación que Prisma pueda cruzar en un `where`.
 * La segunda sólo corre si hay algo pendiente, trae sólo esos productos y no filtra nada: la
 * regla la aplica la función pura, igual que en la pantalla.
 */
export const etiquetasDePrecio: LoaderKpi = async ({ db, tenantId }) => {
  const grupos = await db.auditLog.groupBy({
    by: ["entityId", "action"],
    where: whereAuditoriaDeEtiquetas(tenantId),
    _max: { createdAt: true },
  });
  const pendientes = pendientesDeEtiqueta(grupos);
  const n =
    pendientes.size === 0
      ? 0
      : pendientesEnLaLista(
          pendientes,
          await db.product.findMany({
            where: { tenantId, id: { in: [...pendientes.keys()] } },
            select: { id: true, deletedAt: true, saleUnit: true, price: true, pricePerKg: true },
          }),
        );
  if (n === 0) return { valor: "0", detalle: "precios para reimprimir" };
  return {
    valor: fmtNumberAR(n),
    detalle: plural(n, "precio cambió y no se reimprimió", "precios cambiaron y no se reimprimieron"),
  };
};

// ── Promociones y cupones ────────────────────────────────────────────────────

/**
 * "4 cupones activos · 12 usos". UNA consulta, con el `where` de la pantalla
 * (`whereCuponesVigentes`, venta-reglas.ts). No lleva plata: lo descontado con cupones no se
 * guarda por mes en ninguna columna (en los pedidos queda en la auditoría del alta y en los
 * turnos en otra tabla), y sumarlo serían dos o tres consultas más por tile.
 */
export const promociones: LoaderKpi = async ({ db, tenantId, ahora }) => {
  const r = await db.coupon.aggregate({
    where: whereCuponesVigentes(tenantId, ahora),
    _count: { _all: true },
    _sum: { usedCount: true },
  });
  // Tolerante a una fila vacía (una base de prueba que no contesta el agregado): 0 real.
  const n = r?._count?._all ?? 0;
  if (n === 0) return { valor: "0", detalle: "cupones activos" };
  const usos = r?._sum?.usedCount ?? 0;
  return {
    valor: fmtNumberAR(n),
    detalle: `${plural(n, "cupón activo", "cupones activos")} · ${fmtNumberAR(usos)} ${usos === 1 ? "uso" : "usos"}`,
  };
};

export const LOADERS_PRECIOS: Readonly<Record<string, LoaderKpi>> = {
  catalogo,
  "actualizar-precios": actualizarPrecios,
  "etiquetas-de-precio": etiquetasDePrecio,
  promociones,
};
