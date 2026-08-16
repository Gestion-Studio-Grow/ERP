// ============================================================================
// BUSCADOR DE NAVEGACIÓN — selector PURO (patrón de barra de búsqueda de SAP).
// ============================================================================
//
// Por qué existe: CH Estética pasó de 3 a 14 módulos activos (2026-08). Con la
// nav agrupada en 5 grupos (`./nav-groups.ts`) la barra deja de ser una lista
// interminable, pero el que YA SABE a dónde va sigue teniendo que recorrerla con
// el ojo. La barra de búsqueda es el atajo del que sabe: se tipea "fact", se
// aprieta Enter y se cae en Facturación — sin abrir grupos ni mover el mouse.
// Es el mismo contrato del buscador de SAP: escribir → lista corta → Enter.
//
// PURO a propósito: la búsqueda es matemática de strings sobre los ítems YA
// filtrados por rol × módulo × perfil × rubro (`visibleNavItems` + los filtros de
// `AdminShell`). Acá NO se decide visibilidad — buscar NUNCA puede revelar una
// pantalla que el rol no ve. Sin esa separación, el buscador sería un agujero de
// permisos disfrazado de UX.
//
// Client-safe: cero imports de servidor, cero tipos de Prisma.

/** Forma mínima que un ítem necesita para entrar al buscador. */
export interface NavSearchItem {
  href: string;
  label: string;
  /**
   * Palabras con las que el usuario REAL busca esa pantalla, más allá de su
   * rótulo: "afip" para Facturación, "sueldo" para Reportes. Sin esto, el
   * buscador solo encuentra lo que ya sabés cómo se llama — que es justo lo que
   * no necesita ayuda. Opcional: un ítem sin alias se busca por su label.
   */
  alias?: readonly string[];
}

/**
 * Normaliza para comparar: minúsculas, sin acentos/diéresis ni eñe, sin espacios
 * de borde. "Facturación" y "facturacion" tienen que ser la misma cosa — quien
 * busca escribe rápido y no va a poner el acento. La eñe se colapsa por el mismo
 * motivo (ñ → n): "resenas" encuentra Reseñas y "campanas" encuentra Campañas.
 */
export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Rango de coincidencia — MENOR es mejor. El orden importa: con "ca" tienen que
 * salir primero Caja y Catálogo (empiezan con "ca") y recién después Facturación
 * (la contiene en el medio). Devuelve `null` si el ítem no coincide.
 *
 *   0 = el label ARRANCA con lo tipeado           ("ca" → Caja)
 *   1 = alguna PALABRA del label arranca con eso  ("esp" → Lista de espera)
 *   2 = el label lo contiene en cualquier lado    ("ura" → Facturación)
 *   3 = coincide por alias, no por el rótulo      ("afip" → Facturación)
 */
export function rangoCoincidencia(item: NavSearchItem, queryNormalizada: string): number | null {
  if (!queryNormalizada) return null;
  const label = normalizarBusqueda(item.label);

  if (label.startsWith(queryNormalizada)) return 0;
  if (label.split(/[\s/·-]+/).some((palabra) => palabra.startsWith(queryNormalizada))) return 1;
  if (label.includes(queryNormalizada)) return 2;

  const porAlias = (item.alias ?? []).some((a) =>
    normalizarBusqueda(a).includes(queryNormalizada),
  );
  return porAlias ? 3 : null;
}

/**
 * Ítems que coinciden con `query`, mejores primero. PURA: no muta `items` y con
 * query vacía devuelve `[]` (no "todos") — la barra de búsqueda sin texto no
 * tiene que tapar la nav con la lista entera.
 *
 * El desempate dentro de un mismo rango es el ORDEN ORIGINAL de `items` (sort
 * estable): la nav ya viene ordenada por criterio de negocio (Operación primero,
 * Configuración al final) y la búsqueda respeta esa jerarquía en vez de imponer
 * un alfabético que ignora qué se usa más.
 */
export function searchNavItems<T extends NavSearchItem>(
  items: readonly T[],
  query: string,
): T[] {
  const q = normalizarBusqueda(query);
  if (!q) return [];
  return items
    .map((item, orden) => ({ item, orden, rango: rangoCoincidencia(item, q) }))
    .filter((r): r is { item: T; orden: number; rango: number } => r.rango !== null)
    .sort((a, b) => a.rango - b.rango || a.orden - b.orden)
    .map((r) => r.item);
}
