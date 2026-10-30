// FACTURITA · Clases compartidas de la vidriera (botones y foco). Módulo PURO, sin imports: lo
// usan tanto los server components (VidrieraMarco, páginas) como el asistente de alta, que es
// cliente — por eso no puede vivir en VidrieraMarco, que importa `@/lib/branding` (servidor).
//
// Escala del rediseño 29/10 (fronts/facturita/DISENO.md §4): botón h 56 en celular y 60 en compu,
// radio 14, texto 17–19 px. Las reglas viven en `piel.ts` (clases `fx-*`), que imprime el marco.

/** Foco visible común a los enlaces y botones de la vidriera (bloque 1 del Gate: accesibilidad). */
export const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const BOTON_PRINCIPAL = "fx-btn";

export const BOTON_SECUNDARIO = "fx-btn fx-btn--2";

/** Botón chico (h 44) de la barra de arriba, sólo en compu. */
export const BOTON_CHICO = "fx-btn fx-btn--chico";
