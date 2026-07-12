// ============================================================================
// CATÁLOGO DE ÍTEMS DE NAV DEL BACKOFFICE — dato PURO, una sola fuente de verdad.
// ============================================================================
//
// `ALL_ITEMS` vivía embebido en `AdminShell.tsx` (client). Se extrajo acá para que
// DOS consumidores compartan EXACTAMENTE la misma lista sin duplicarla:
//   1. `AdminShell` (client) — pinta la navegación filtrada por rol × módulo × perfil.
//   2. El gating por-URL del producto Comerciante (server, en el layout del dashboard) —
//      mapea ruta → módulo para no dejar entrar por tecleo a un módulo que el tenant no
//      tiene asignado (ADR-054/055). Antes esa lista solo existía en el client → una URL
//      directa (/admin/turnos, /admin/caja…) evadía el ocultamiento de la nav.
//
// Client-safe: SOLO importa TIPOS (Capability/Perfil/NavGroupId) — cero runtime de
// servidor, así lo puede importar tanto el client component como el layout server.

import type { Capability } from "@/lib/capabilities";
import type { Perfil } from "@/modules/perfil";
import type { NavGroupId } from "@/modules/nav-groups";

// Cada ítem declara la capacidad que lo habilita; se filtra por el rol del
// usuario. Ocultar en el front es UX (ADR-017 §2.e) — la seguridad real la aplican
// los guardas server-side (`requireCapability`) en cada loader/acción.
// `module` (opcional) ata el ítem a un módulo del catálogo (src/modules): cuando el
// gating está encendido (flag), el ítem se esconde si ese módulo está apagado para el
// tenant. Los ítems SIN `module` son core/config (Inicio, Ajustes, Usuarios, la propia
// vidriera de Módulos…) y nunca se gatean por módulo — solo por rol.
// `perfilMin`/`grupo` son opcionales: los 18 ítems base no los traen (viven en el set
// Comercio y su grupo lo resuelve `NAV_ITEM_GROUPS`); los ítems Empresa
// (`ENTERPRISE_NAV_ITEMS`) sí, para gatearse por perfil y caer en su grupo.
export type ShellItem = {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
  cap: Capability;
  module?: string;
  perfilMin?: Perfil;
  grupo?: NavGroupId;
  // Eje RUBRO (Magra carnicería/retail). `retailOnly`: solo tenants retail/mostrador →
  // NO se muestra en servicios (CH byte-idéntico). `carniceriaOnly`: además exige la
  // migración cárnica aplicada (hasCarniceriaSchema). AdminShell los filtra por
  // isRetail/carniceriaReady; el gating por-URL los trata como su `module` (catalog).
  // Ambos default undefined → los ítems base no cambian.
  retailOnly?: boolean;
  carniceriaOnly?: boolean;
};

export const ALL_ITEMS: ShellItem[] = [
  { href: "/admin", label: "Inicio", icon: "dashboard", exact: true, cap: "dashboard:read" },
  { href: "/admin/turnos", label: "Agenda", icon: "agenda", cap: "agenda:read", module: "agenda" },
  { href: "/admin/clientes", label: "Clientes", icon: "clientes", cap: "clients:read", module: "clients" },
  { href: "/admin/espera", label: "Lista de espera", icon: "espera", cap: "waitlist:manage", module: "waitlist" },
  { href: "/admin/pedidos", label: "Pedidos", icon: "pedidos", cap: "orders:read", module: "pos" },
  { href: "/admin/caja", label: "Caja", icon: "caja", cap: "orders:read", module: "pos" },
  { href: "/admin/catalogo", label: "Catálogo", icon: "catalogo", cap: "catalog:manage", module: "catalog" },
  { href: "/admin/compras", label: "Compras", icon: "compras", cap: "catalog:manage", module: "catalog" },
  { href: "/admin/inventario", label: "Inventario", icon: "inventario", cap: "catalog:read", module: "catalog", retailOnly: true },
  { href: "/admin/lotes", label: "Lotes / Vacío", icon: "lotes", cap: "catalog:manage", module: "catalog", carniceriaOnly: true },
  { href: "/admin/despiece", label: "Despiece", icon: "despiece", cap: "catalog:manage", module: "catalog", carniceriaOnly: true },
  { href: "/admin/ajustes", label: "Ajustes", icon: "ajustes", cap: "catalog:manage", module: "catalog" },
  { href: "/admin/resenas", label: "Reseñas", icon: "resenas", cap: "reviews:manage", module: "reviews" },
  { href: "/admin/recordatorios", label: "Recordatorios", icon: "recordatorios", cap: "reminders:manage", module: "reminders" },
  { href: "/admin/facturacion", label: "Facturación", icon: "facturacion", cap: "billing:manage", module: "arca" },
  { href: "/admin/reportes", label: "Reportes", icon: "reportes", cap: "reports:read", module: "reports" },
  { href: "/admin/auditoria", label: "Auditoría", icon: "auditoria", cap: "audit:read" },
  { href: "/admin/usuarios", label: "Usuarios", icon: "usuarios", cap: "users:manage" },
  { href: "/admin/localizacion", label: "Localización", icon: "localizacion", cap: "location:manage" },
  { href: "/admin/apariencia", label: "Apariencia", icon: "apariencia", cap: "appearance:manage" },
  { href: "/admin/modulos", label: "Módulos", icon: "modulos", cap: "modules:manage" },
];

/** Normaliza un path: saca query/hash y colapsa trailing slash. */
function normalizarPath(path: string): string {
  const sinQuery = path.split(/[?#]/, 1)[0];
  if (sinQuery.length > 1 && sinQuery.endsWith("/")) return sinQuery.slice(0, -1);
  return sinQuery;
}

/**
 * Ítem de nav cuya ruta CUBRE `path` — match más específico (href más largo) primero,
 * consciente de segmentos: `/admin/facturacion` cubre `/admin/facturacion/bancos` pero
 * NO `/admin/facturacionX`. El ítem Inicio (`exact`) solo matchea `/admin` exacto, así no
 * absorbe todas las sub-rutas. PURA — la usa el gating por-URL del producto.
 */
export function navItemForPath(path: string): ShellItem | undefined {
  const target = normalizarPath(path);
  return [...ALL_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) =>
      i.exact ? target === i.href : target === i.href || target.startsWith(i.href + "/"),
    );
}

/**
 * ¿Un producto con su set de `modules` asignado puede entrar a `path`? Whitelist derivada de
 * `ALL_ITEMS` (la MISMA lista que pinta la nav — sin segunda verdad):
 *   - ruta fuera del set del backoffice (sin ítem que la cubra) → NO (p.ej. /admin/inventario);
 *   - ruta core/config (ítem sin `module`: Inicio, Auditoría, Usuarios, Localización,
 *     Apariencia, Módulos) → SÍ;
 *   - ruta con `module` → SÍ solo si ese módulo está ASIGNADO al tenant (`modules`).
 * Así un OWNER que teclea /admin/turnos · /admin/caja · /admin/catalogo sin tener ese módulo
 * cae de nuevo en su Inicio en vez de ver una pantalla vacía. Inicio (`/admin`) SIEMPRE pasa
 * (no tiene módulo) → el redirect a /admin nunca hace loop.
 *
 * Antes se llamaba `rutaPermitidaComerciante` (hardcodeado al Comerciante); se generalizó a
 * CUALQUIER producto de facturación que focaliza su nav por módulos (ADR-089): la lógica ya
 * era genérica (solo mira `modules`), el rename lo hace explícito.
 */
export function rutaPermitidaParaModulos(path: string, modules: readonly string[]): boolean {
  const item = navItemForPath(path);
  if (!item) return false;
  if (!item.module) return true;
  return modules.includes(item.module);
}
