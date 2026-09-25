import type { CSSProperties } from "react";

// Acento de Rendí: el preset "celeste" de la casa (ACCENT_PRESETS en src/lib/branding.ts), con sus
// dos tonos y su tinta AA, para que el cambio claro/oscuro mueva también el acento. Va copiado a
// propósito: branding.ts arrastra el resolvedor de tenant (Prisma), y ni la página ni su límite de
// error tienen por qué importarlo. Comerciante es azul, Contador verde y Facturita ámbar: Rendí
// queda en otra familia de color.
export const ACENTO_RENDI = {
  "--tenant-accent-light": "#2e7c97",
  "--tenant-on-accent-light": "#ffffff",
  "--tenant-accent-dark": "#74c0da",
  "--tenant-on-accent-dark": "#08181d",
} as CSSProperties;
