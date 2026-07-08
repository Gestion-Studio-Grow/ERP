// ============================================================================
// TEST de la agrupación de nav — 5 grupos criollos (ADR-059 D3).
// ============================================================================
//
// PR-2/M2 (Sesión 4). Cubre: orden fijo de grupos, grupos vacíos omitidos, red
// de seguridad para ítems sin `grupo` asignado, pureza, y composición con el
// invariante de NAV de `perfil.ts` (rol × módulo × perfil sigue mandando; el
// grupo es solo presentación sobre lo YA visible).

import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleNavItems, type NavGateItem } from "./perfil";
import {
  DRAFT_NAV_ITEM_GROUPS,
  NAV_GROUPS,
  groupNavItems,
  type NavGroupedItem,
} from "./nav-groups";

// Los 17 ítems reales de `AdminShell.ALL_ITEMS`, con el DRAFT de grupo aplicado
// (mismos hrefs/caps/módulos; ver docs/estrategia/mapa-rol-perfil-nav-grupos.md).
const ALL_17: NavGroupedItem[] = [
  { href: "/admin", cap: "dashboard:read", grupo: DRAFT_NAV_ITEM_GROUPS["/admin"] },
  { href: "/admin/turnos", cap: "agenda:read", module: "agenda", grupo: DRAFT_NAV_ITEM_GROUPS["/admin/turnos"] },
  { href: "/admin/clientes", cap: "clients:read", module: "clients", grupo: DRAFT_NAV_ITEM_GROUPS["/admin/clientes"] },
  { href: "/admin/espera", cap: "waitlist:manage", module: "waitlist", grupo: DRAFT_NAV_ITEM_GROUPS["/admin/espera"] },
  { href: "/admin/pedidos", cap: "orders:read", module: "pos", grupo: DRAFT_NAV_ITEM_GROUPS["/admin/pedidos"] },
  { href: "/admin/caja", cap: "orders:read", module: "pos", grupo: DRAFT_NAV_ITEM_GROUPS["/admin/caja"] },
  { href: "/admin/catalogo", cap: "catalog:manage", module: "catalog", grupo: DRAFT_NAV_ITEM_GROUPS["/admin/catalogo"] },
  { href: "/admin/compras", cap: "catalog:manage", module: "catalog", grupo: DRAFT_NAV_ITEM_GROUPS["/admin/compras"] },
  { href: "/admin/ajustes", cap: "catalog:manage", module: "catalog", grupo: DRAFT_NAV_ITEM_GROUPS["/admin/ajustes"] },
  { href: "/admin/resenas", cap: "reviews:manage", module: "reviews", grupo: DRAFT_NAV_ITEM_GROUPS["/admin/resenas"] },
  { href: "/admin/recordatorios", cap: "reminders:manage", module: "reminders", grupo: DRAFT_NAV_ITEM_GROUPS["/admin/recordatorios"] },
  { href: "/admin/facturacion", cap: "billing:manage", module: "arca", grupo: DRAFT_NAV_ITEM_GROUPS["/admin/facturacion"] },
  { href: "/admin/reportes", cap: "reports:read", module: "reports", grupo: DRAFT_NAV_ITEM_GROUPS["/admin/reportes"] },
  { href: "/admin/auditoria", cap: "audit:read", grupo: DRAFT_NAV_ITEM_GROUPS["/admin/auditoria"] },
  { href: "/admin/usuarios", cap: "users:manage", grupo: DRAFT_NAV_ITEM_GROUPS["/admin/usuarios"] },
  { href: "/admin/localizacion", cap: "location:manage", grupo: DRAFT_NAV_ITEM_GROUPS["/admin/localizacion"] },
  { href: "/admin/modulos", cap: "modules:manage", grupo: DRAFT_NAV_ITEM_GROUPS["/admin/modulos"] },
];

test("DRAFT_NAV_ITEM_GROUPS: asigna grupo a los 17 ítems existentes de AdminShell", () => {
  assert.equal(Object.keys(DRAFT_NAV_ITEM_GROUPS).length, 17);
  for (const item of ALL_17) {
    assert.ok(item.grupo, `"${item.href}" sin grupo asignado`);
  }
});

test("DRAFT_NAV_ITEM_GROUPS: solo usa ids de grupo válidos (los 5 de ADR-059 D3)", () => {
  const validIds = new Set(NAV_GROUPS.map((g) => g.id));
  for (const grupo of Object.values(DRAFT_NAV_ITEM_GROUPS)) {
    assert.ok(validIds.has(grupo), `grupo inválido: ${grupo}`);
  }
});

test("groupNavItems: agrupa respetando el orden fijo de NAV_GROUPS", () => {
  const { groups } = groupNavItems(ALL_17);
  const ids = groups.map((g) => g.id);
  const expectedOrder = NAV_GROUPS.map((g) => g.id).filter((id) => ids.includes(id));
  assert.deepEqual(ids, expectedOrder);
});

test("groupNavItems: omite grupos vacíos en vez de renderizar un heading sin ítems", () => {
  const soloDiaADia: NavGroupedItem[] = [
    { href: "/admin", cap: "dashboard:read", grupo: "dia-a-dia" },
  ];
  const { groups } = groupNavItems(soloDiaADia);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, "dia-a-dia");
});

test("groupNavItems: manda a `ungrouped` los ítems sin `grupo` en vez de perderlos en silencio", () => {
  const conUnoSinGrupo: NavGroupedItem[] = [
    { href: "/admin", cap: "dashboard:read", grupo: "dia-a-dia" },
    { href: "/admin/nuevo-scope-item", cap: "reports:read" }, // sin grupo todavía
  ];
  const { groups, ungrouped } = groupNavItems(conUnoSinGrupo);
  assert.equal(ungrouped.length, 1);
  assert.equal(ungrouped[0].href, "/admin/nuevo-scope-item");
  assert.equal(
    groups.flatMap((g) => g.items).length,
    1,
  );
});

test("groupNavItems: no muta el array de entrada", () => {
  const input = [...ALL_17];
  const snapshot = JSON.stringify(input);
  groupNavItems(input);
  assert.equal(JSON.stringify(input), snapshot);
});

test("groupNavItems: compone con visibleNavItems (rol × módulo × perfil) sin perder la agrupación", () => {
  // RECEPTION no ve Catálogo/Compras/Ajustes/Facturación/Reportes/Auditoría/
  // Usuarios/Localización/Módulos/Reseñas/Recordatorios (solo OWNER) — los
  // grupos "lo-que-vendo-y-repongo", "plata-y-papeles" y "configuracion"
  // deberían desaparecer; solo queda lo operativo de mostrador.
  const visible = visibleNavItems(ALL_17, {
    role: "RECEPTION",
    activeModules: null,
    activeProfile: null,
  }) as NavGroupedItem<NavGateItem>[];
  const { groups } = groupNavItems(visible);
  const ids = groups.map((g) => g.id);
  assert.ok(ids.includes("dia-a-dia"));
  assert.ok(ids.includes("clientes-y-avisos"));
  assert.ok(!ids.includes("lo-que-vendo-y-repongo"));
  assert.ok(!ids.includes("plata-y-papeles"));
  assert.ok(!ids.includes("configuracion"));
});
