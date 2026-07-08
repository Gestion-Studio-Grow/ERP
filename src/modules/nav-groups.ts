// ============================================================================
// AGRUPACIÓN DE NAV — 5 grupos criollos (ADR-059 D3) + mapa rol↔perfil (D6b).
// ============================================================================
//
// PR-2/M2 (Sesión 4 — Ingeniería de interfaz, sprint GROW-AR 2026-07-08).
//
// ⚠️ ESQUELETO, NO WIRED: este módulo no lo importa (todavía) ni `AdminShell.tsx`
// ni ningún layout. Es código puro, sin efecto, hasta que otra sesión lo consuma
// detrás de un flag (candado/flag = carril de Sesión 3) y lo renderice con los
// primitivos nuevos (`SectionGroup` = carril de Sesión 2). Por construcción es
// REVERSIBLE Y DEFAULT-OFF: no hay ningún import real todavía, así que no cambia
// ningún comportamiento visible. Cero riesgo de conflicto: no toca `AdminShell.tsx`,
// `perfil.ts` ni `flags.ts` (carriles de otras sesiones del pool).
//
// Qué resuelve:
// 1. Los 5 grupos criollos (ADR-059 D3), con su ORDEN de aparición fijo.
// 2. `groupNavItems`: selector puro que agrupa una lista de ítems YA filtrada por
//    `visibleNavItems` (rol × módulo × perfil, `./perfil.ts`) en esos 5 grupos.
// 3. La asignación ítem→grupo de los 17 ítems HOY existentes en `AdminShell` — ver
//    `DRAFT_NAV_ITEM_GROUPS` abajo. Es DRAFT/propuesta: los 17 son de bajo riesgo
//    (grupo funcional obvio, no dependen de la clasificación fina de scope items).
//    NO incluye los ítems de BACKLOG (cuentas-a-cobrar, inventario, compras
//    formalizada, cuentas-a-pagar, contabilidad, activos/banco) — esos scope items
//    los está curando la Sesión 1 (analista de cobertura); su grupo + `perfilMin`
//    se agregan acá cuando llegue el mapa validado (ver
//    `docs/estrategia/mapa-rol-perfil-nav-grupos.md`).
//
// Client-safe: no importa Prisma/tenant/barrel `@/modules` — mismo criterio que
// `perfil.ts`. Solo importa el TIPO `NavGateItem` (no lo modifica).

import type { NavGateItem, Perfil } from "./perfil";

/** Los 5 grupos criollos de la IA de navegación (ADR-059 D3), en su orden fijo de aparición. */
export type NavGroupId =
  | "dia-a-dia"
  | "clientes-y-avisos"
  | "lo-que-vendo-y-repongo"
  | "plata-y-papeles"
  | "configuracion";

export interface NavGroupMeta {
  id: NavGroupId;
  /** Nombre criollo tal cual lo fija ADR-059 D3 — no traducir, no tecnicismo. */
  label: string;
}

/** Orden fijo de despliegue en el sidebar (ADR-059 D3). */
export const NAV_GROUPS: readonly NavGroupMeta[] = [
  { id: "dia-a-dia", label: "Día a día" },
  { id: "clientes-y-avisos", label: "Clientes y avisos" },
  { id: "lo-que-vendo-y-repongo", label: "Lo que vendo y repongo" },
  { id: "plata-y-papeles", label: "Plata y papeles" },
  { id: "configuracion", label: "Configuración" },
] as const;

/** Un ítem de nav con su grupo asignado (además de los 3 ejes de `perfil.ts`). */
export type NavGroupedItem<T extends NavGateItem = NavGateItem> = T & {
  /** Grupo criollo. Ausente = todavía no asignado (ver `ungrouped` en `groupNavItems`). */
  grupo?: NavGroupId;
};

export interface GroupedNav<T extends NavGateItem> {
  /** Grupos con al menos un ítem visible, en el orden de `NAV_GROUPS`. Grupos vacíos se omiten. */
  groups: { id: NavGroupId; label: string; items: NavGroupedItem<T>[] }[];
  /**
   * Ítems sin `grupo` asignado. Red de seguridad: si un ítem nuevo entra a
   * `ALL_ITEMS` sin pasar por la asignación, aparece acá en vez de desaparecer
   * en silencio. En régimen normal (todo asignado) esta lista está vacía.
   */
  ungrouped: NavGroupedItem<T>[];
}

/**
 * Agrupa ítems YA filtrados (rol × módulo × perfil vía `visibleNavItems`) en los
 * 5 grupos criollos. PURA — no muta `items`, no decide visibilidad (eso ya pasó).
 */
export function groupNavItems<T extends NavGateItem>(
  items: readonly NavGroupedItem<T>[],
): GroupedNav<T> {
  const byGroup = new Map<NavGroupId, NavGroupedItem<T>[]>();
  const ungrouped: NavGroupedItem<T>[] = [];

  for (const item of items) {
    if (!item.grupo) {
      ungrouped.push(item);
      continue;
    }
    const bucket = byGroup.get(item.grupo);
    if (bucket) {
      bucket.push(item);
    } else {
      byGroup.set(item.grupo, [item]);
    }
  }

  const groups = NAV_GROUPS.filter((g) => byGroup.has(g.id)).map((g) => ({
    id: g.id,
    label: g.label,
    items: byGroup.get(g.id)!,
  }));

  return { groups, ungrouped };
}

// ============================================================================
// DRAFT — asignación ítem→grupo de los 17 ítems HOY en `AdminShell.ALL_ITEMS`.
// ============================================================================
//
// Propuesta de Sesión 4, NO cerrada como asignación final del sprint (así lo
// pidió el Dispatch): estos 17 son de bajo riesgo porque su grupo funcional es
// obvio y no dependen de la clasificación de scope items que cura Sesión 1. Se
// puede aplicar tal cual cuando el Gate integre, o ajustarse si S1/el dueño ven
// algo distinto. Clave = `href` de `AdminShell.ALL_ITEMS` (no se importa ese
// array acá para no acoplar/tocar `AdminShell.tsx`).
export const DRAFT_NAV_ITEM_GROUPS: Readonly<Record<string, NavGroupId>> = {
  "/admin": "dia-a-dia",
  "/admin/turnos": "dia-a-dia",
  "/admin/espera": "dia-a-dia",
  "/admin/pedidos": "dia-a-dia",
  "/admin/caja": "dia-a-dia",
  "/admin/clientes": "clientes-y-avisos",
  "/admin/recordatorios": "clientes-y-avisos",
  "/admin/resenas": "clientes-y-avisos",
  "/admin/catalogo": "lo-que-vendo-y-repongo",
  "/admin/compras": "lo-que-vendo-y-repongo",
  "/admin/facturacion": "plata-y-papeles",
  "/admin/reportes": "plata-y-papeles",
  "/admin/ajustes": "configuracion",
  "/admin/auditoria": "configuracion",
  "/admin/usuarios": "configuracion",
  "/admin/localizacion": "configuracion",
  "/admin/modulos": "configuracion",
};

/**
 * Ninguno de los 17 ítems HOY existentes necesita `perfilMin:"enterprise"` (D6b,
 * ver doc). Son el piso `lite` que el micro ya opera de punta a punta (coincide
 * con `mapa-cobertura-scope-items.md` §4: "Set del MICRO ~5 piezas" ya construido
 * + Catálogo/Reportes/Facturación base). El primer candidato real a
 * `perfilMin:"enterprise"` es **Compras** en su forma FORMAL de proveedores/
 * órdenes (hoy `/admin/compras` ya existe y el micro también repone con ella;
 * si S1 confirma que el micro debe seguir viéndola tal cual, se queda `lite`) —
 * marcado PENDING abajo, no se decide acá.
 */
export const PENDING_S1_PERFIL_DECISIONS: readonly {
  href: string;
  nota: string;
}[] = [
  {
    href: "/admin/compras",
    nota:
      "mapa-cobertura-scope-items.md clasifica Compras (J45/18J) como 🔵 " +
      "enterprise/pyme (\"el micro repone a ojo\"), pero la página ya existe y " +
      "hoy la usa cualquier tenant con inventario. Confirmar con el mapa " +
      "validado de S1 si se degrada a perfilMin:\"enterprise\" o se queda lite.",
  },
];

/**
 * Placeholder tipado para lo que llega de Sesión 1: por cada scope item nuevo
 * (cuentas-a-cobrar, inventario, cuentas-a-pagar, contabilidad, activos/banco…)
 * que se convierta en ítem de nav real, se agrega acá su grupo + perfil mínimo.
 * Vacío a propósito — cerrar esto es el próximo paso exacto post mapa validado
 * (ver `docs/estrategia/mapa-rol-perfil-nav-grupos.md` §3).
 */
export const BACKLOG_SCOPE_ITEM_NAV: readonly {
  scopeItem: string;
  href: string;
  grupo: NavGroupId;
  perfilMin: Perfil;
}[] = [];
