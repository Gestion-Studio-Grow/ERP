// ============================================================================
// AGRUPACIÓN DE NAV — 5 grupos de negocio (ADR-059 D3) + mapa rol↔perfil (D6b).
// ============================================================================
//
// PR-2/M2 (Sesión 4 — Ingeniería de interfaz, sprint GROW-AR 2026-07-08).
//
// NAMING (override del dueño, 2026-07-08): los 5 grupos usan etiquetas de negocio
// claras en español neutro — SIN lunfardo ni coloquialismos. (La versión criolla
// previa de ADR-059 D3 quedó reemplazada por este naming profesional; los grupos
// conceptuales son los mismos, solo cambia el rótulo). El naming al cliente sigue
// siendo "Comercio"/"Empresa" (nunca lite/enterprise) y el tier en canal neutro.
//
// ⚠️ ESQUELETO, NO WIRED: este módulo no lo importa (todavía) ni `AdminShell.tsx`
// ni ningún layout. Es código puro, sin efecto, hasta que otra sesión lo consuma
// detrás de un flag (candado/flag = carril de Sesión 3) y lo renderice con los
// primitivos nuevos (`SectionGroup` = carril de Sesión 2). Por construcción es
// REVERSIBLE Y DEFAULT-OFF: no hay ningún import real todavía, así que no cambia
// ningún comportamiento visible. Cero conflicto: no toca `AdminShell.tsx`,
// `perfil.ts` ni `flags.ts` (carriles de otras sesiones del pool).
//
// Qué resuelve (asignación CERRADA sobre el mapa VALIDADO de S1 + revisión S5/Opus):
// 1. Los 5 grupos de negocio (ADR-059 D3, renombrados), con ORDEN de aparición fijo.
// 2. `groupNavItems`: selector puro que agrupa una lista de ítems YA filtrada por
//    `visibleNavItems` (rol × módulo × perfil, `./perfil.ts`) en esos 5 grupos.
// 3. `NAV_ITEM_GROUPS`: la asignación ítem→grupo de los 17 ítems HOY existentes.
// 4. `BACKLOG_SCOPE_ITEM_NAV`: los scope items KEEP del mapa validado que se suman a
//    la nav en M2, con su grupo + perfil mínimo + naturaleza de gating (rubro / OFF).
//
// El GATING (universal vs. rubro-flag vs. default-OFF) NO cambia en qué grupo cae un
// ítem — solo si renderiza para un tenant dado. Eso lo resuelve la composición de
// `perfilMin` (este archivo lo declara) + module-gating (`./gating.ts`, ya existe);
// el flag/candado que lo enciende es carril de S3.
//
// Client-safe: no importa Prisma/tenant/barrel `@/modules` — mismo criterio que
// `perfil.ts`. Solo importa TIPOS de `./perfil` (no los modifica).

import type { Capability } from "@/lib/capabilities";
import type { NavGateItem, Perfil } from "./perfil";

/** Los 5 grupos de negocio de la IA de navegación (ADR-059 D3), en su orden fijo. */
export type NavGroupId =
  | "operacion"
  | "clientes"
  | "inventario-y-compras"
  | "finanzas"
  | "configuracion";

export interface NavGroupMeta {
  id: NavGroupId;
  /** Etiqueta de negocio, español neutro, sin lunfardo (override del dueño 2026-07-08). */
  label: string;
}

/** Orden fijo de despliegue en el sidebar (ADR-059 D3, naming profesional). */
export const NAV_GROUPS: readonly NavGroupMeta[] = [
  { id: "operacion", label: "Operación" },
  { id: "clientes", label: "Clientes" },
  { id: "inventario-y-compras", label: "Inventario y compras" },
  { id: "finanzas", label: "Finanzas" },
  { id: "configuracion", label: "Configuración" },
] as const;

/** Un ítem de nav con su grupo asignado (además de los 3 ejes de `perfil.ts`). */
export type NavGroupedItem<T extends NavGateItem = NavGateItem> = T & {
  /** Grupo de negocio. Ausente = todavía no asignado (ver `ungrouped` en `groupNavItems`). */
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
 * 5 grupos de negocio. PURA — no muta `items`, no decide visibilidad (eso ya pasó).
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
// Asignación ítem→grupo de los 17 ítems HOY en `AdminShell.ALL_ITEMS` — CERRADA.
// ============================================================================
//
// Clave = `href` de `AdminShell.ALL_ITEMS` (no se importa ese array acá para no
// acoplar/tocar `AdminShell.tsx`). Ninguno de los 17 necesita perfilMin:"enterprise"
// hoy: todos viven en el piso `lite` que el micro ya opera de punta a punta
// (coincide con `mapa-cobertura-scope-items.md` §4). El invariante `enterprise ⊇
// lite` se respeta: lo enterprise-only llega ADITIVO por el backlog (abajo), sin
// restar nada de lo existente.
//
// Nota de ubicación corregida vs. el draft previo: "Ajustes" es **"Ajustes y
// mermas"** (recuento físico, merma, rotura, vencimiento) → es stock puro, va a
// **Inventario y compras**, NO a Configuración.
export const NAV_ITEM_GROUPS: Readonly<Record<string, NavGroupId>> = {
  // Operación — el día a día: tablero, agenda, mostrador, caja.
  "/admin": "operacion",
  "/admin/turnos": "operacion",
  "/admin/espera": "operacion",
  "/admin/pedidos": "operacion",
  "/admin/caja": "operacion",
  // Clientes — base de clientes + comunicación con ellos.
  "/admin/clientes": "clientes",
  "/admin/recordatorios": "clientes",
  "/admin/resenas": "clientes",
  // Inventario y compras — lo que se vende, se repone y se ajusta.
  "/admin/catalogo": "inventario-y-compras",
  "/admin/compras": "inventario-y-compras",
  "/admin/ajustes": "inventario-y-compras", // "Ajustes y mermas" = stock
  // Finanzas — facturación y análisis de resultados.
  "/admin/facturacion": "finanzas",
  "/admin/reportes": "finanzas",
  // Configuración — administración del sistema.
  "/admin/auditoria": "configuracion",
  "/admin/usuarios": "configuracion",
  "/admin/localizacion": "configuracion",
  "/admin/modulos": "configuracion",
};

// ============================================================================
// BACKLOG — scope items KEEP del mapa VALIDADO (S1 + revisión adversarial S5/Opus)
// que se suman a la nav en M2. Asignación de grupo + perfil CERRADA.
// ============================================================================
//
// `perfilMin`:
//   - "lite"       → visible en Comercio Y Empresa (min = lite). El ítem está en
//                    el set de ambos; si además trae rubro-gating, ver `defaultOff`
//                    / la nota (el módulo decide si RENDERIZA para ese tenant).
//   - "enterprise" → solo Empresa (aditivo sobre lite, `enterprise ⊇ lite`).
//
// `defaultOff`: descriptor DEFINIDO en el catálogo pero apagado por defecto — solo
// renderiza para tenants cuyo rubro/perfil de negocio lo enciende (opt-in). NO va al
// piso universal. El encendido real lo maneja module-gating (carril S3); acá solo se
// declara la intención para que el grupo/perfil queden fijos.
//
// El `module` (descriptor de catálogo que gatea por rubro) queda TBD para varios:
// esos descriptores todavía no existen (son backlog del PO Catálogo), así que no se
// inventan ids acá — la nota lo indica.
export interface BacklogNavItem {
  /** Código de scope item SAP de referencia (trazabilidad al mapa de cobertura). */
  scopeItem: string;
  href: string;
  label: string;
  grupo: NavGroupId;
  perfilMin: Perfil;
  /** Id del módulo del catálogo que lo gatea por rubro; ausente = descriptor aún por definir. */
  module?: string;
  /** true = definido pero DEFAULT OFF (opt-in por rubro/perfil de negocio, no piso universal). */
  defaultOff?: boolean;
  nota?: string;
}

export const BACKLOG_SCOPE_ITEM_NAV: readonly BacklogNavItem[] = [
  {
    scopeItem: "BMC",
    href: "/admin/inventario",
    label: "Inventario",
    grupo: "inventario-y-compras",
    perfilMin: "lite", // reclasificado a "ambos" por S1 (stock básico con versión light para Comercio)
    defaultOff: false,
    nota:
      "Anti-oversell. Se construye para ambos perfiles, gateado por RUBRO: apagado " +
      "para servicios puros sin stock, encendido para retail/carnicería/etc. El " +
      "rubro-gating es module-gating (descriptor de inventario, PO Catálogo).",
  },
  {
    scopeItem: "2F3/J60",
    href: "/admin/cuentas-a-cobrar",
    label: "Cuentas a cobrar",
    grupo: "finanzas", // es deuda del cliente → Finanzas (guía S5)
    perfilMin: "lite", // reclasificado a "ambos" por S1: fiado es cultura de comercio de barrio AR
    defaultOff: true,
    nota:
      "Fiado. Descriptor DEFINIDO en el catálogo pero DEFAULT OFF: solo renderiza " +
      "para tenants con perfil de fiado (opt-in por rubro), NO va al piso universal. " +
      "Comercio ve la versión light; Empresa suma vencimientos/recordatorios (J60, " +
      "profundización aditiva del mismo ítem, no un ítem nuevo).",
  },
  {
    scopeItem: "J59",
    href: "/admin/cuentas-a-pagar",
    label: "Cuentas a pagar",
    grupo: "finanzas",
    perfilMin: "enterprise",
    nota: "Proveedores + cheque diferido. Solo Empresa (aditivo).",
  },
  {
    scopeItem: "J58",
    href: "/admin/libros",
    label: "Libros / Exportar al contador",
    grupo: "finanzas",
    perfilMin: "enterprise",
    nota:
      "ADR-060 D7 (naming honesto): Libro IVA ESTRUCTURADO (Ventas + Compras) + export al " +
      "contador. NUNCA 'Contabilidad'. Libro mayor formal (JournalEntry) = RESERVA/§C.",
  },
  {
    scopeItem: "BMK",
    href: "/admin/devoluciones-proveedor",
    label: "Devoluciones a proveedor",
    grupo: "inventario-y-compras",
    perfilMin: "enterprise",
    nota:
      "Prioridad baja. Puede absorberse como sub-pantalla de Compras en vez de ítem " +
      "propio; si se hace ítem, cae en Inventario y compras. Solo Empresa.",
  },
];

// ============================================================================
// ÍTEMS DE NAV EMPRESA (perfilMin=enterprise) — 5 shells navegables (preview).
// ============================================================================
//
// Forma COMPLETA de nav (href/label/icon/cap/grupo/perfilMin) de las 5 pantallas Empresa,
// para que `AdminShell` las concatene a la nav agrupada cuando el perfil activo es
// Empresa (`activeProfile==="enterprise"`). Cubren el backlog validado (J59/J58/BMK
// enterprise + BMC/2F3 que al vivo son rubro-gated, ver BACKLOG_SCOPE_ITEM_NAV).
//
// Sus SHELLS "En preparación" YA EXISTEN (por eso `ready:true`) → recorribles en preview,
// cero callejón sin salida. Naming al cliente profesional, sin fuga de "enterprise"
// (ADR-059 D7): el cliente ve "Empresa", nunca la palabra de ingeniería. Punto único de
// swap: agregar/quitar acá no toca el plumbing de AdminShell/layout.
//
// Decisiones (a revisar cuando cada pantalla tenga su lógica de datos real):
// - `cap`: se REUSAN capabilities OWNER existentes — NO se toca `capabilities.ts`
//   (perfil ≠ rol, ADR-059 D6b). `billing:manage` (cuentas a pagar / a cobrar),
//   `reports:read` (libros), `catalog:manage` (inventario / devoluciones). Todas
//   solo-OWNER → ni RECEPTION ni PROFESSIONAL ven estos ítems. La pantalla también las
//   exige (requireCapability), así el guard ya está para el día del vivo.
// - `module`: SIN descriptor de catálogo todavía (los descriptores Empresa son backlog
//   del PO Catálogo) → hoy NO se gatean por módulo, solo por rol × perfil. El día que
//   exista el descriptor se agrega `module` acá y el OWNER podrá prenderlo/apagarlo
//   desde `/admin/modulos` (sin cambiar el plumbing).
export interface EnterpriseNavItem {
  href: string;
  /** Etiqueta al cliente — profesional, español neutro (ADR-059 D7). */
  label: string;
  /** Nombre del ícono en el set inline de `AdminShell` (ver su mapa `Icon`). */
  icon: string;
  cap: Capability;
  /** Descriptor de catálogo que lo gatearía por rubro; ausente = aún por definir (PO Catálogo). */
  module?: string;
  /**
   * Perfil mínimo. Casi todos son `enterprise` (aditivos de Empresa), PERO este registro es el
   * CANAL de nav gateado por el motor de perfiles (solo se concatena con `activeProfile != null`,
   * i.e. `PROFILES_ENABLED` ON) — el mismo gate que evita que pantallas con tablas §C sin aplicar
   * rendericen/crasheen en prod. Por eso CxC (fiado) vive acá con `perfilMin:"lite"`: es de
   * Comercio+Empresa (ADR-060 D3) pero comparte la seguridad "no rendea en prod con flags OFF".
   */
  perfilMin: Perfil;
  grupo: NavGroupId;
  /**
   * ¿La PANTALLA/ruta de este ítem ya existe (shippeada)? REGLA DE ORO del set validado
   * de S1 (`docs/estrategia/set-minimo-empresa-2026-07-08.md` §4): *un ítem entra a la nav
   * SOLO cuando su pantalla existe* — cablear un href sin ruta es un callejón sin salida
   * (anti-patrón QA / ADR-059 D3 fix #4). `AdminShell` NO renderiza los `ready:false` ni
   * con el flag maestro ON. Hoy los 5 son `true`: sus SHELLS navegables ("En preparación")
   * existen, así que Empresa los recorre en preview sin dead-ends. `ready` sigue siendo la
   * valla: distingue "pantalla existe y se recorre" de "pantalla con su lógica real viva".
   */
  ready: boolean;
}

// ⚠️ Los 5 ya son `ready:true`: sus SHELLS navegables ("En preparación") EXISTEN en
// `src/app/admin/(dashboard)/<ruta>/page.tsx` (directiva del dueño: producto entero
// recorrible en preview detrás de flags, cero callejón sin salida). Se recorren cuando
// el perfil es Empresa + nav agrupada ON; con los flags default OFF no cambia nada. Cada
// pantalla pasa a "viva de verdad" recién cuando tenga su lógica de datos real; hasta
// entonces es shell. El icono reusa nombres del set de `AdminShell` (no se toca su map).
export const ENTERPRISE_NAV_ITEMS: readonly EnterpriseNavItem[] = [
  {
    href: "/admin/cuentas-a-pagar",
    label: "Cuentas a pagar",
    icon: "cuentas-a-pagar",
    cap: "billing:manage",
    perfilMin: "enterprise",
    grupo: "finanzas",
    ready: true, // shell navegable existe; datos reales (J59 + cheque diferido) = después
  },
  {
    href: "/admin/cuentas-a-cobrar",
    label: "Cuentas a cobrar",
    icon: "caja", // reusa el ícono de "caja" (cobrar) del set de AdminShell
    cap: "billing:manage",
    // RECONCILIADO (S5, re-gate Fase D/E): `lite` — CxC/fiado es de Comercio+Empresa
    // (ADR-060 D3), coincide con la página (des-gateada de enterprise → capability
    // billing:manage). Invariante `enterprise ⊇ lite` intacto (ambos lo ven). El
    // rubro-gating fino llega con su descriptor de catálogo (`module`, PO Catálogo);
    // hoy la barrera es la capability OWNER. CxP (J59) sí queda enterprise-only.
    perfilMin: "lite",
    grupo: "finanzas",
    ready: true,
  },
  {
    // ADR-060 D7: ex "/admin/contabilidad" → "/admin/libros". Naming HONESTO "Libros /
    // Exportar al contador" (NUNCA "Contabilidad": prometería asientos que no hay). Ya
    // tiene lógica REAL (Libro IVA estructurado + export), no es shell — capa verde S4.
    href: "/admin/libros",
    label: "Libros",
    icon: "contabilidad", // el glifo de libro/ledger sigue calzando con "Libros"
    cap: "reports:read",
    perfilMin: "enterprise",
    grupo: "finanzas",
    ready: true,
  },
  {
    href: "/admin/inventario",
    label: "Inventario",
    icon: "modulos", // reusa el ícono de cajas ("modulos") del set de AdminShell
    cap: "catalog:manage",
    perfilMin: "enterprise",
    grupo: "inventario-y-compras",
    // Shell Empresa para recorrer. Al vivo es rubro-gated (S1: aplica también a Comercio
    // con stock; el mínimo anti-oversell ya lo cubren Compras + Ajustes) — se revisita con
    // su lógica; ver BACKLOG_SCOPE_ITEM_NAV (perfilMin "lite", rubro-gated).
    ready: true,
  },
  {
    href: "/admin/devoluciones-proveedor",
    label: "Devoluciones a proveedor",
    icon: "devoluciones",
    cap: "catalog:manage",
    perfilMin: "enterprise",
    grupo: "inventario-y-compras",
    ready: true, // shell navegable existe; puede terminar como sub-pantalla de Compras (S1)
  },
];

/** Ítems Empresa cuya pantalla YA existe (regla de oro de S1). Lo que `AdminShell` renderiza. */
export function readyEnterpriseNavItems(): EnterpriseNavItem[] {
  return ENTERPRISE_NAV_ITEMS.filter((it) => it.ready);
}

// ============================================================================
// Notas de trazabilidad al mapa validado (NO son ítems de nav nuevos):
// - 1J2 (ARCA)  → ya existe como `/admin/facturacion` (Finanzas).
// - BD9 (POS)   → ya existe como `/admin/pedidos` + `/admin/caja` (Operación).
// - J45/18J     → ya existe como `/admin/compras` (Inventario y compras); Comercio
//                 la ve (reposición), rubro-gated como el stock. Empresa profundiza
//                 con órdenes formales/proveedores (aditivo), no ítem nuevo.
// - 16T rentab. → profundización del `/admin/reportes` existente (Finanzas), no ítem nuevo.
// RESERVA (NO van a la nav de M2, quedan documentados en el catálogo): J62, 1W0, 3W0, J12.
// CUT: BFA (se absorbe en Configuración, no es módulo propio).
// ============================================================================
