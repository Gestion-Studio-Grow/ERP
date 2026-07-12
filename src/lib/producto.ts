// ============================================================================
// RESOLUCIÓN DEL PRODUCTO ACTUAL (server) — la capa de DB sobre la derivación pura.
// ============================================================================
//
// Lee el dato maestro del tenant (blueprintId + modules) y deriva su PRODUCTO
// (`@/lib/producto-identidad`, pura). Lo consumen el login, el shell del admin, el
// ruteo post-login y el root del sitio para dar a cada producto SU identidad/casa.
//
// Cliente BASE (no `@/lib/prisma`): la tabla Tenant es metadata de control, vive fuera
// de RLS y la leen igual team-accent/cartera/brand-sheet. Cacheado por request.
//
// Fail-open A PROPÓSITO (como getTenantBrand/getTeamAccentPreset): ante cualquier error
// (build sin DB, tenant no resoluble) cae a `vertical` → comportamiento LEGADO, nunca
// tumba el render ni colapsa un tenant por un problema cosmético/de derivación.

import { cache } from "react";
import { basePrisma } from "@/lib/prisma-base";
import { getCurrentTenantId } from "@/lib/tenant";
import {
  derivarProducto,
  identidadProducto,
  type Producto,
  type ProductoIdentidad,
} from "@/lib/producto-identidad";

export type ProductoContexto = {
  producto: Producto;
  identidad: ProductoIdentidad | null;
  /** Set de módulos ASIGNADOS al tenant (para gatear la nav del producto sin depender del flag global). */
  modules: string[];
  blueprintId: string | null;
};

const VERTICAL_FALLBACK: ProductoContexto = {
  producto: "vertical",
  identidad: null,
  modules: [],
  blueprintId: null,
};

/** Contexto de producto del tenant actual (producto + identidad + módulos). Cacheado por request. */
export const getProductoContexto = cache(async (): Promise<ProductoContexto> => {
  try {
    const id = await getCurrentTenantId();
    const t = await basePrisma.tenant.findUnique({
      where: { id },
      select: { blueprintId: true, modules: true },
    });
    const input = { blueprintId: t?.blueprintId ?? null, modules: t?.modules ?? [] };
    const producto = derivarProducto(input);
    return {
      producto,
      identidad: identidadProducto(producto),
      modules: input.modules,
      blueprintId: input.blueprintId,
    };
  } catch {
    return VERTICAL_FALLBACK;
  }
});

/** Producto del tenant actual (atajo). Cacheado por request. */
export const getProductoActual = cache(async (): Promise<Producto> => {
  return (await getProductoContexto()).producto;
});
