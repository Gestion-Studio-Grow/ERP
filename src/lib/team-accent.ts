// ============================================================================
// COLOR DEL EQUIPO (backoffice) — el acento persistido del tenant.
// ============================================================================
//
// El dueño elige el color de SU panel en /admin/apariencia y queda guardado en
// `Tenant.accentPreset` (columna que ya existía; hasta hoy solo la seteaba el
// operador en el alta). Este helper lo lee para las superficies del BACK
// (admin, login, /contador): si hay un preset válido persistido, pisa el del
// mapa legado de branding.ts; si no, todo sigue exactamente como antes.
//
// SCOPE deliberado: SOLO el backoffice. La vidriera pública del tenant no pasa
// por acá — su marca (theme packs / paleta por tenant) queda intacta. Cuando la
// ficha de marca (RFC-004-D, TENANT_BRAND_SHEET_ENABLED) está ON, getBrandSheet
// ya lee la MISMA columna → un único dato, cero divergencia.
//
// Fail-open a propósito (como getTenantBrand): la apariencia es cosmética y
// jamás debe tumbar un render (build sin DB, login sin base, etc.).

import { cache } from "react";
import { basePrisma } from "@/lib/prisma-base";
import { getCurrentTenantId } from "@/lib/tenant";
import { ACCENT_PRESETS, type AccentPreset } from "@/lib/branding";

function coerce(v: string | null | undefined): AccentPreset | null {
  const s = (v ?? "").trim().toLowerCase();
  return s in ACCENT_PRESETS ? (s as AccentPreset) : null;
}

/**
 * Preset de acento persistido del tenant actual, o `null` si no eligió uno
 * (→ el llamador cae al preset del branding legado). Cacheado por request.
 * Lee la tabla Tenant (fuera de RLS por diseño: es metadata de control, la
 * misma lectura que hace getBrandSheet).
 */
export const getTeamAccentPreset = cache(async (): Promise<AccentPreset | null> => {
  try {
    const id = await getCurrentTenantId();
    const t = await basePrisma.tenant.findUnique({
      where: { id },
      select: { accentPreset: true },
    });
    return coerce(t?.accentPreset);
  } catch {
    return null;
  }
});
