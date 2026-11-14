// ============================================================================
// PROYECTOS · Etapa 2 — interruptores por negocio (PUROS, sin DB).
// ============================================================================
//
// Las partes de la Etapa 2 de una productora (asistentes con IA, armador de stands en 3D, portal
// del cliente, precio por capas con comisiones y, reservadas, facturación por proyecto e importador) se prenden
// negocio por negocio
// con una clave en `Tenant.modules`. Fallan CERRADO: una parte está activa SÓLO si su clave está
// explícitamente en la lista. No se usa `getActiveModuleIds`/`moduleGateAllows`, que con el registro
// global apagado dejan pasar todo.

export const PARTES_ETAPA2 = ["ia", "armador3d", "portal", "facturacion-proyectos", "importador", "precio-capas"] as const;
export type ParteEtapa2 = (typeof PARTES_ETAPA2)[number];

/** Clave en `Tenant.modules` (= id del descriptor en el catálogo) de cada parte. */
export const CLAVE_ETAPA2: Record<ParteEtapa2, string> = {
  ia: "proyectos-ia",
  armador3d: "proyectos-armador3d",
  portal: "proyectos-portal",
  "facturacion-proyectos": "proyectos-facturacion",
  importador: "proyectos-importador",
  // MIA T1 (#41): precio por capas, comisiones por persona, defensa del presupuesto e importador de status.
  "precio-capas": "proyectos-precio-capas",
};

/** Mensaje en criollo cuando la parte está apagada para el negocio. */
export const MENSAJE_APAGADO: Record<ParteEtapa2, string> = {
  ia: "Los asistentes con IA no están activados para tu negocio. Pedile a GSG que los active.",
  armador3d: "El armador de stands en 3D no está activado para tu negocio. Pedile a GSG que lo active.",
  portal: "El portal del cliente no está activado para tu negocio. Pedile a GSG que lo active.",
  "facturacion-proyectos": "La facturación por proyecto no está activada para tu negocio.",
  importador: "El importador no está activado para tu negocio.",
  "precio-capas": "El precio por capas y las comisiones no están activados para tu negocio. Pedile a GSG que los active.",
};

/** ¿La parte está prendida? Falla cerrado: sin lista, lista vacía o sin la clave exacta → false. */
export function etapa2Activa(modules: readonly string[] | null | undefined, parte: ParteEtapa2): boolean {
  if (!Array.isArray(modules)) return false;
  const clave = CLAVE_ETAPA2[parte];
  if (!clave) return false;
  return modules.includes(clave);
}

/** Todas las partes resueltas de una vez (para pasar a la UI). */
export function etapa2Estado(modules: readonly string[] | null | undefined): Record<ParteEtapa2, boolean> {
  return Object.fromEntries(PARTES_ETAPA2.map((p) => [p, etapa2Activa(modules, p)])) as Record<ParteEtapa2, boolean>;
}
