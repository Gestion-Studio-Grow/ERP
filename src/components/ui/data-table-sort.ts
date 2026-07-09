// Aritmética de orden de DataTable (ADR-059 D6, hito propio del subsistema) —
// PURA y testeable, mismo patrón que perfil.ts: la UI (DataTable.tsx) solo
// llama a esto, el estado/ciclo vive acá. DataTable es CONTROLADO: no dispara
// fetch ni ordena filas — solo calcula el próximo estado de orden y el
// llamador decide qué hacer (ordenar en memoria, refetchear, etc.).

export type SortDirection = "asc" | "desc";
export type DataTableSort = { key: string; direction: SortDirection } | null;

/**
 * Próximo estado al clickear/activar una columna sorteable. Ciclo de 3 pasos:
 * sin orden -> asc -> desc -> sin orden (vuelve al orden original). Cambiar
 * de columna arranca siempre en asc, sin importar en qué dirección haya
 * quedado la columna anterior.
 */
export function nextSort(current: DataTableSort, key: string): DataTableSort {
  if (!current || current.key !== key) return { key, direction: "asc" };
  if (current.direction === "asc") return { key, direction: "desc" };
  return null;
}

/** Valor para `aria-sort` del <th> sorteable: "ascending"/"descending"/"none". */
export function ariaSortFor(current: DataTableSort, key: string): "ascending" | "descending" | "none" {
  if (!current || current.key !== key) return "none";
  return current.direction === "asc" ? "ascending" : "descending";
}
