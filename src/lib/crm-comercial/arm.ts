// ARM como negocio propio (GSG-CRM-017 · decisión del dueño del 16/11/2026): qué negocio ES un ARM. PURA y client-safe.
//
// Un ARM (p. ej. `arm-mia`) tiene sólo el CRM comercial: sin Proyectos ni administración (V1). Se lo reconoce por el
// vertical sembrado en el alta (`Tenant.blueprintId`). El nombre del vertical es provisional a confirmar.

/** Vertical de un negocio ARM (provisional a confirmar). */
export const BLUEPRINT_ARM = "arm";

export const esNegocioArm = (blueprintId: string | null | undefined): boolean => blueprintId === BLUEPRINT_ARM;

/** Lo que ve quien intenta usar Proyectos en el ARM. */
export const PROYECTOS_NO_EN_ARM = "Este negocio es el CRM comercial: los proyectos nacen y se trabajan en el negocio vinculado.";
