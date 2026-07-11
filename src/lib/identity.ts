// ============================================================================
// IDENTIDAD DE PRODUCTO GSG (RFC-004) — flag maestro, tenant-agnóstica.
// ============================================================================
//
// Separa la IDENTIDAD del PRODUCTO (GSG) del BRANDING del TENANT (accent/tema/logo):
// el color es del tenant, la identidad es de GSG (ADR-059 D5, C-004). Hoy el "look base"
// es la paleta de CH (RFC-004 §1 L1); esta capa introduce la base neutra PROPIA de GSG
// bajo `[data-identity="gsg"]` en globals.css.
//
// DEFAULT OFF: con `GSG_IDENTITY_ENABLED` apagado, el layout no setea el atributo →
// tokens actuales intactos → byte-idéntico. Aditivo/reversible: encender el flag (o
// revertir) alterna la identidad sin tocar el mecanismo de accent/tema que ya funciona.
//
// NOTA de lane: estos flags de IDENTIDAD/BRANDING viven acá (lib, lane de Diseño), NO en
// `src/modules/flags.ts` (candados/perfiles, lane S3). Mismo parseo booleano, distinto dueño.

/** Parseo booleano compartido (env string → boolean). PURA. Espeja el de src/modules/flags.ts. */
function truthy(v: string | undefined): boolean {
  const n = v?.trim().toLowerCase();
  return n === "1" || n === "true" || n === "on" || n === "yes";
}

/** ¿Está encendida la identidad de producto GSG? Default OFF. PURA (env inyectable). */
export function gsgIdentityEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return truthy(env.GSG_IDENTITY_ENABLED);
}

/** Valor de `data-identity` para el layout: "gsg" si el flag está ON, si no `undefined` (sin atributo). PURA. */
export function identityAttr(enabled: boolean): "gsg" | undefined {
  return enabled ? "gsg" : undefined;
}

// ============================================================================
// FIDELIDAD POR TENANT (RFC-004-A §3 / RFC-004-B) — romper el "molde único".
// ============================================================================
//
// Sesgo A (RFC-004 §1): la ESTRUCTURA de la vidriera está hardcodeada (mismo header/hero
// para todos), así que "todas las webs salen iguales". Este flag habilita que cada tenant
// use SU layout real (posición del logo, banner sí/no, hero editorial/estándar) + su logo
// asset — declarado en branding.ts (`TenantBrand.layout` / `logoAsset`).
//
// DEFAULT OFF: con `TENANT_FIDELITY_ENABLED` apagado, la vidriera renderiza el molde de
// hoy (sin masthead ni banner, hero a la izquierda) → byte-idéntico. Ortogonal al flag de
// identidad GSG (uno es el chrome del backoffice; el otro, la vidriera pública del tenant):
// se pueden prender por separado. Reversible/aditivo.

/** ¿Cada tenant usa su layout/logo reales en la vidriera (en vez del molde único)? Default OFF. PURA. */
export function tenantFidelityEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return truthy(env.TENANT_FIDELITY_ENABLED);
}

// ============================================================================
// FICHA DE MARCA POR TENANT (RFC-004-D) — piel tenant-scoped de punta a punta.
// ============================================================================
//
// El bug real (verificado en runtime): resolución y módulos FUNCIONAN, pero la PIEL cae a
// CH. El branding leía un mapa hardcodeado por slug (que no tiene los slugs demo) → todos a
// DEFAULT_BRAND (contenido de CH) + tokens neutros/tipografía globales de CH. Este flag
// enciende la ficha de marca por tenant: el brand se resuelve de los DATOS del Tenant
// (accentPreset/frontTheme/blueprintId/name) + un THEME PACK curado (neutros/tipografía/
// densidad) inyectado en la raíz del front Y del back vía `data-brand`.
//
// DEFAULT OFF: con `TENANT_BRAND_SHEET_ENABLED` apagado, el branding sigue el camino legado
// (mapa por slug) → byte-idéntico. beauty-spa/erp-ch NO se tocan. Reversible/aditivo.

/** ¿Está encendida la ficha de marca por tenant (piel por datos + theme packs)? Default OFF. PURA. */
export function tenantBrandSheetEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return truthy(env.TENANT_BRAND_SHEET_ENABLED);
}
