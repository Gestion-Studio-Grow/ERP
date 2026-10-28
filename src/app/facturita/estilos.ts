// FACTURITA · Clases compartidas de la vidriera (botones y foco). Módulo PURO, sin imports: lo
// usan tanto los server components (VidrieraMarco, páginas) como el asistente de alta, que es
// cliente — por eso no puede vivir en VidrieraMarco, que importa `@/lib/branding` (servidor).

/** Foco visible común a los enlaces y botones de la vidriera (bloque 1 del Gate: accesibilidad). */
export const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const BOTON_PRINCIPAL = `inline-flex h-12 items-center justify-center rounded-lg bg-accent px-6 text-base font-semibold text-on-accent transition-colors hover:bg-accent-hover ${FOCO}`;

export const BOTON_SECUNDARIO = `inline-flex h-12 items-center justify-center rounded-lg border border-line-strong bg-surface-raised px-6 text-base font-semibold text-strong transition-colors hover:bg-surface-sunken ${FOCO}`;
