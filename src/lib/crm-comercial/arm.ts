// ARM como negocio propio (GSG-CRM-017 · decisión del dueño del 16/11/2026): qué negocio ES un ARM. PURA y client-safe.
//
// Un ARM (p. ej. `arm-mia`) tiene sólo el CRM comercial: sin Proyectos ni administración (V1). Se lo reconoce por el
// vertical sembrado en el alta (`Tenant.blueprintId`). El nombre del vertical es provisional a confirmar.

/** Vertical de un negocio ARM (provisional a confirmar). */
export const BLUEPRINT_ARM = "arm";

export const esNegocioArm = (blueprintId: string | null | undefined): boolean => blueprintId === BLUEPRINT_ARM;

/** Lo que ve quien intenta usar Proyectos en el ARM. */
export const PROYECTOS_NO_EN_ARM = "Este negocio es el CRM comercial: los proyectos nacen y se trabajan en el negocio vinculado.";

/**
 * Dirección del proyecto en el negocio destino, para el enlace de la ficha de una asignada (B2). Los usuarios son por
 * negocio: entrar ahí pide el usuario de ESE negocio. Si el ARM se está mirando bajo el dominio propio, se arma con el
 * mismo esquema y puerto (así anda también en la prueba local); si no, la dirección pública del negocio
 * (`direccionDelLocal`). `null` si no hay cómo armarla: la pantalla lo dice en vez de mostrar un enlace roto. PURA.
 */
export function enlaceAlProyectoDestino(d: {
  subdominio: string | null;
  proyectoId: string | null;
  hostActual: string | null;
  https: boolean;
  dominioPropio: string | null;
  mapaDeHosts: ReadonlyMap<string, string>;
}): string | null {
  const sub = d.subdominio?.trim().toLowerCase();
  if (!sub || !d.proyectoId || !/^[a-z0-9-]+$/.test(sub)) return null;
  const ruta = `/admin/proyectos/${encodeURIComponent(d.proyectoId)}`;
  const base = d.dominioPropio?.trim().toLowerCase();
  const [nombre, puerto] = (d.hostActual?.split(",")[0].trim().toLowerCase() ?? "").split(":");
  if (base && nombre && (nombre === base || nombre.endsWith(`.${base}`))) {
    return `${d.https ? "https" : "http"}://${sub}.${base}${puerto && /^\d+$/.test(puerto) ? `:${puerto}` : ""}${ruta}`;
  }
  if (base) return `https://${sub}.${base}${ruta}`;
  for (const [host, s] of d.mapaDeHosts) if (s === sub) return `https://${host}${ruta}`;
  return null;
}
