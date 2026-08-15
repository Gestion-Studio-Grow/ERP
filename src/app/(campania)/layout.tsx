import type { CSSProperties } from "react";
import { getTenantBrand, resolveAccent } from "@/lib/branding";
import { getBrandSheet, brandSheetAccent } from "@/lib/brand-sheet";
import { tenantBrandSheetEnabled } from "@/lib/identity";

export const dynamic = "force-dynamic";

/**
 * Layout de páginas de campaña.
 *
 * Deliberadamente SIN cabecera ni pie: se llega por QR con una sola intención
 * —dejar los datos— y cualquier otra cosa en pantalla es una salida. El pie del
 * sitio, además, incluye el enlace "Acceso administrador": no tiene por qué
 * estar delante de cientos de desconocidos que escanean un código en un evento.
 *
 * Sí conserva la piel del tenant (acento y tema), para que la pieza se siga
 * viendo parte del mismo negocio.
 */
export default async function CampaniaLayout({ children }: { children: React.ReactNode }) {
  const sheet = tenantBrandSheetEnabled() ? await getBrandSheet() : null;
  const brand = await getTenantBrand();
  const frontTheme = sheet ? sheet.frontTheme : brand.frontTheme;
  const { accent, onAccent } = sheet
    ? brandSheetAccent(sheet, frontTheme)
    : resolveAccent(brand.preset, brand.frontTheme);

  return (
    <div
      data-theme={frontTheme}
      data-brand={sheet ? sheet.themeId : undefined}
      style={{
        minHeight: "100dvh",
        background: "var(--surface)",
        color: "var(--text-strong)",
        fontFamily: "var(--font-body), system-ui, sans-serif",
        "--accent": accent,
        "--text-on-accent": onAccent,
      } as CSSProperties}
    >
      <main>{children}</main>
    </div>
  );
}
