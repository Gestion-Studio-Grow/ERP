// ============================================================================
// DENSIDAD por perfil (ADR-059 D4) — el diferenciador visual Comercio/Empresa.
// ============================================================================
//
// "Un Core, dos motores" también a nivel VISUAL (ADR-059 D4): el MISMO design system en
// DOS densidades. El layout aplica `data-density` junto a `data-theme`; globals.css ya
// tiene los tokens (`--density` + escala `--space-*` derivada) — acá solo se decide el
// valor del atributo según el perfil activo. PURO, testeable sin renderizar.
//
// Mapeo (espeja globals.css):
//   - Comercio (lite)      → `data-density="lite"`  → `[data-density="lite"]` → --density 1.32 (ESPACIOSO).
//   - Empresa (enterprise) → sin atributo           → `:root` --density 1 (DENSO, el default enterprise).
//   - null (PROFILES OFF)  → sin atributo           → --density 1 → BYTE-IDÉNTICO a hoy.
//
// Gate: `getActiveProfile()` devuelve null con `PROFILES_ENABLED` OFF (default) → sin
// atributo → cero cambio. Reversible/aditivo: apagar el flag revierte al instante.

import type { Perfil } from "@/modules/perfil";

/**
 * Valor de `data-density` para el layout según el perfil. `undefined` = no setear el
 * atributo (Empresa y motor OFF caen al default denso de `:root`). Solo Comercio activa
 * la densidad espaciosa, que es la única con regla propia en globals.css. PURA.
 */
export function densityForProfile(profile: Perfil | null): "lite" | undefined {
  return profile === "lite" ? "lite" : undefined;
}

/**
 * `--density` efectivo por perfil, espejo de globals.css — para verificación/documentación
 * (no se usa en runtime; el valor real lo aplica el CSS). Comercio > Empresa = más espacioso.
 */
export const DENSITY_BY_PROFILE = {
  lite: 1.32, // Comercio — espacioso ([data-density="lite"])
  enterprise: 1, // Empresa — denso (:root, default)
  off: 1, // motor OFF — denso (default, = hoy)
} as const;
