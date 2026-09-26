// ============================================================================
// IDENTIDAD PÚBLICA DEL LOCAL — de qué rubro es y de qué marca es.
// ============================================================================
//
// El problema que resuelve (MAGRA, 5 locales, cada local un tenant propio):
// la vidriera pública elegía qué mostrar con `if (slug === "magra")`. Cuatro de
// los cinco locales NO se llaman `magra` (`magra-lomas`, `magra-canning`, …) →
// su dominio servía la landing de ESTÉTICA de otra clienta, con el nombre y las
// fotos de su equipo. La identidad tiene que salir del DATO del alta, no del
// nombre que tocó en la URL.
//
// Dos ejes distintos, a propósito:
//   · RUBRO   = `Tenant.blueprintId` ("carniceria"). Decide vocabulario, si la
//               raíz es landing de agenda o vidriera, y qué pantallas tienen
//               sentido. Es config: una carnicería nueva no toca una línea de código.
//   · MARCA   = familia del slug ("magra"). Decide el front editorial (el relato,
//               las reseñas, los proveedores). NO se puede derivar del rubro: otra
//               carnicería también es `carniceria` y no es MAGRA.
//
// Server-only (lee Prisma) pero no es una server action: es un lector, igual que
// src/lib/carniceria/rubro.ts (`getCurrentTenantRubro`), que ya usaba este criterio
// para el backoffice.

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { getRetailRubro, resolveRubroId, type RetailRubro } from "@/blueprints/retail/rubros";
import { resolveTenantBrandId } from "@/tenants/storefront";

export interface TenantIdentityInput {
  slug: string | null;
  blueprintId: string | null;
}

export interface TenantIdentity {
  slug: string | null;
  /** `Tenant.blueprintId` tal como está en la DB (null si no hay o no se pudo leer). */
  blueprintId: string | null;
  /** Id del rubro retail resuelto ("carniceria"), o null si no es de mostrador. */
  rubroId: string | null;
  /** Config completa del rubro (wording, catálogo semilla, branding por defecto). */
  rubro: RetailRubro | null;
  /** true = local de mostrador: su raíz pública es la vidriera, no la agenda. */
  isRetail: boolean;
  /** Marca editorial ("magra" / "shinevelas"), o null → vidriera genérica del rubro. */
  brandId: string | null;
}

/**
 * Marcas con front editorial PROPIO: un componente dedicado en src/app/tienda, con su
 * paleta, su tipografía y su relato. Es un subconjunto de las marcas con copy propio —
 * `adosmanos` tiene copy pero se sirve con la vidriera genérica.
 *
 * Es una lista corta a propósito: cada entrada es un componente React que existe en el
 * repo. Lo que NO es una lista a mano es qué TENANT cae en cada marca: eso lo resuelve
 * la familia del slug, así los 5 locales de MAGRA entran solos.
 */
const EDITORIAL_FRONT_IDS = ["magra", "shinevelas", "quebienoles"] as const;
export type EditorialFrontId = (typeof EDITORIAL_FRONT_IDS)[number];

/** Qué front editorial le corresponde al tenant, o null → vidriera genérica del rubro. */
export function editorialFrontFor(identity: Pick<TenantIdentity, "brandId">): EditorialFrontId | null {
  const brand = identity.brandId;
  return EDITORIAL_FRONT_IDS.find((id) => id === brand) ?? null;
}

/** Resolución PURA, sin DB. Es lo que se testea (src/lib/identidad-rubro.test.ts). */
export function buildTenantIdentity(t: TenantIdentityInput): TenantIdentity {
  const rubroId = resolveRubroId(t);
  return {
    slug: t.slug,
    blueprintId: t.blueprintId,
    rubroId,
    rubro: rubroId ? getRetailRubro(rubroId) : null,
    isRetail: rubroId != null,
    brandId: resolveTenantBrandId(t.slug),
  };
}

// Lectura del tenant en DOS pasos, a propósito.
//
// `Tenant.blueprintId` entra por la migración `20260705120000_control_plane_tenant`, y
// la doc del repo se contradice sobre si está aplicada en Neon: ESTADO-ACTUAL.md:238 la
// da por aplicada, ESTADO-ACTUAL.md:266 dice "la columna `subdomain` figura aplicada;
// confirmar el resto". Si la columna no existiera, un `select` que la pide tira P2022 y
// se lleva puesta la HOME de beauty-spa, que es el único tenant vivo en producción.
// Por eso: primero se pide la columna; si la DB la rechaza, se reintenta pidiendo sólo
// el slug y se sigue con la red de contención por familia de slug. Es el mismo patrón
// defensivo que `getLocation` (src/lib/settings.ts) usa por la misma razón.
// Con el schema migrado este segundo camino nunca se ejecuta.
async function readTenantIdentityRow(): Promise<TenantIdentityInput> {
  let tenantId: string;
  try {
    tenantId = await getCurrentTenantId();
  } catch {
    return { slug: null, blueprintId: null };
  }
  try {
    const t = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true, blueprintId: true },
    });
    return { slug: t?.slug ?? null, blueprintId: t?.blueprintId ?? null };
  } catch {
    try {
      const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
      return { slug: t?.slug ?? null, blueprintId: null };
    } catch {
      return { slug: null, blueprintId: null };
    }
  }
}

/**
 * Identidad del tenant actual. Cacheada por request (React.cache): la vidriera la
 * pide desde `generateMetadata` y desde el componente, y Neon está en plan free —
 * el mismo motivo por el que `tienda/page.tsx` ya cachea storefront y acento.
 */
export const getTenantIdentity = cache(async (): Promise<TenantIdentity> => {
  return buildTenantIdentity(await readTenantIdentityRow());
});
