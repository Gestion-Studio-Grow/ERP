// ============================================================================
// TEST de la agrupación de nav — 5 grupos de negocio (ADR-059 D3, naming profesional).
// ============================================================================
//
// PR-2/M2 (Sesión 4). Cubre: naming profesional (sin lunfardo), orden fijo de
// grupos, grupos vacíos omitidos, red de seguridad para ítems sin `grupo`, pureza,
// composición con el invariante de NAV de `perfil.ts` (rol × módulo × perfil sigue
// mandando; el grupo es solo presentación), y la asignación CERRADA de los 17 ítems
// existentes + el backlog validado (grupo + perfil coherentes con el mapa).

import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleNavItems, type NavGateItem } from "./perfil";
import {
  BACKLOG_SCOPE_ITEM_NAV,
  ENTERPRISE_NAV_ITEMS,
  NAV_GROUPS,
  NAV_ITEM_GROUPS,
  groupNavItems,
  readyEnterpriseNavItems,
  type NavGroupId,
  type NavGroupedItem,
} from "./nav-groups";

// Los 17 ítems reales de `AdminShell.ALL_ITEMS`, con la asignación de grupo aplicada
// (mismos hrefs/caps/módulos; ver docs/estrategia/mapa-rol-perfil-nav-grupos.md).
const ALL_17: NavGroupedItem[] = [
  { href: "/admin", cap: "dashboard:read", grupo: NAV_ITEM_GROUPS["/admin"] },
  { href: "/admin/turnos", cap: "agenda:read", module: "agenda", grupo: NAV_ITEM_GROUPS["/admin/turnos"] },
  { href: "/admin/clientes", cap: "clients:read", module: "clients", grupo: NAV_ITEM_GROUPS["/admin/clientes"] },
  { href: "/admin/espera", cap: "waitlist:manage", module: "waitlist", grupo: NAV_ITEM_GROUPS["/admin/espera"] },
  { href: "/admin/pedidos", cap: "orders:read", module: "pos", grupo: NAV_ITEM_GROUPS["/admin/pedidos"] },
  { href: "/admin/caja", cap: "orders:read", module: "pos", grupo: NAV_ITEM_GROUPS["/admin/caja"] },
  { href: "/admin/catalogo", cap: "catalog:manage", module: "catalog", grupo: NAV_ITEM_GROUPS["/admin/catalogo"] },
  { href: "/admin/compras", cap: "catalog:manage", module: "catalog", grupo: NAV_ITEM_GROUPS["/admin/compras"] },
  { href: "/admin/ajustes", cap: "catalog:manage", module: "catalog", grupo: NAV_ITEM_GROUPS["/admin/ajustes"] },
  { href: "/admin/resenas", cap: "reviews:manage", module: "reviews", grupo: NAV_ITEM_GROUPS["/admin/resenas"] },
  { href: "/admin/recordatorios", cap: "reminders:manage", module: "reminders", grupo: NAV_ITEM_GROUPS["/admin/recordatorios"] },
  { href: "/admin/facturacion", cap: "billing:manage", module: "arca", grupo: NAV_ITEM_GROUPS["/admin/facturacion"] },
  { href: "/admin/reportes", cap: "reports:read", module: "reports", grupo: NAV_ITEM_GROUPS["/admin/reportes"] },
  { href: "/admin/auditoria", cap: "audit:read", grupo: NAV_ITEM_GROUPS["/admin/auditoria"] },
  { href: "/admin/usuarios", cap: "users:manage", grupo: NAV_ITEM_GROUPS["/admin/usuarios"] },
  { href: "/admin/localizacion", cap: "location:manage", grupo: NAV_ITEM_GROUPS["/admin/localizacion"] },
  { href: "/admin/modulos", cap: "modules:manage", grupo: NAV_ITEM_GROUPS["/admin/modulos"] },
];

const VALID_IDS = new Set<NavGroupId>(NAV_GROUPS.map((g) => g.id));

test("NAV_GROUPS: labels profesionales en español neutro, sin lunfardo", () => {
  // Los labels criollos previos quedaron reemplazados por el override del dueño.
  const bannedTokens = ["plata", "papeles", "día a día", "avisos", "vendo", "repongo", "guita", "laburo"];
  for (const g of NAV_GROUPS) {
    const lower = g.label.toLowerCase();
    for (const banned of bannedTokens) {
      assert.ok(!lower.includes(banned), `label "${g.label}" contiene lunfardo/coloquial: "${banned}"`);
    }
    assert.ok(g.label.length > 0);
  }
  assert.deepEqual(
    NAV_GROUPS.map((g) => g.label),
    ["Operación", "Clientes", "Inventario y compras", "Finanzas", "Configuración"],
  );
});

test("NAV_ITEM_GROUPS: asigna grupo a los 17 ítems existentes de AdminShell", () => {
  assert.equal(Object.keys(NAV_ITEM_GROUPS).length, 17);
  for (const item of ALL_17) {
    assert.ok(item.grupo, `"${item.href}" sin grupo asignado`);
    assert.ok(VALID_IDS.has(item.grupo), `"${item.href}" con grupo inválido: ${item.grupo}`);
  }
});

test("NAV_ITEM_GROUPS: 'Ajustes y mermas' cae en Inventario y compras (es stock, no config)", () => {
  assert.equal(NAV_ITEM_GROUPS["/admin/ajustes"], "inventario-y-compras");
});

test("groupNavItems: agrupa respetando el orden fijo de NAV_GROUPS", () => {
  const { groups } = groupNavItems(ALL_17);
  const ids = groups.map((g) => g.id);
  const expectedOrder = NAV_GROUPS.map((g) => g.id).filter((id) => ids.includes(id));
  assert.deepEqual(ids, expectedOrder);
});

test("groupNavItems: omite grupos vacíos en vez de renderizar un heading sin ítems", () => {
  const soloOperacion: NavGroupedItem[] = [
    { href: "/admin", cap: "dashboard:read", grupo: "operacion" },
  ];
  const { groups } = groupNavItems(soloOperacion);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, "operacion");
  assert.equal(groups[0].label, "Operación");
});

test("groupNavItems: manda a `ungrouped` los ítems sin `grupo` en vez de perderlos en silencio", () => {
  const conUnoSinGrupo: NavGroupedItem[] = [
    { href: "/admin", cap: "dashboard:read", grupo: "operacion" },
    { href: "/admin/nuevo-scope-item", cap: "reports:read" }, // sin grupo todavía
  ];
  const { groups, ungrouped } = groupNavItems(conUnoSinGrupo);
  assert.equal(ungrouped.length, 1);
  assert.equal(ungrouped[0].href, "/admin/nuevo-scope-item");
  assert.equal(groups.flatMap((g) => g.items).length, 1);
});

test("groupNavItems: no muta el array de entrada", () => {
  const input = [...ALL_17];
  const snapshot = JSON.stringify(input);
  groupNavItems(input);
  assert.equal(JSON.stringify(input), snapshot);
});

test("groupNavItems: compone con visibleNavItems (rol × módulo × perfil) sin perder la agrupación", () => {
  // RECEPTION solo tiene lo operativo de mostrador + alta de clientes (capabilities.ts):
  // ve Operación (dashboard/agenda/espera/pedidos/caja) y Clientes (solo /admin/clientes;
  // recordatorios y reseñas son OWNER). NO ve Inventario/Finanzas/Configuración.
  const visible = visibleNavItems(ALL_17, {
    role: "RECEPTION",
    activeModules: null,
    activeProfile: null,
  }) as NavGroupedItem<NavGateItem>[];
  const { groups } = groupNavItems(visible);
  const ids = groups.map((g) => g.id);
  assert.ok(ids.includes("operacion"));
  assert.ok(ids.includes("clientes"));
  assert.ok(!ids.includes("inventario-y-compras"));
  assert.ok(!ids.includes("finanzas"));
  assert.ok(!ids.includes("configuracion"));
});

test("BACKLOG_SCOPE_ITEM_NAV: grupos válidos y coherentes con la guía S5 (inventario→inv, fiado→finanzas)", () => {
  for (const it of BACKLOG_SCOPE_ITEM_NAV) {
    assert.ok(VALID_IDS.has(it.grupo), `backlog "${it.href}" con grupo inválido: ${it.grupo}`);
    assert.ok(["lite", "enterprise"].includes(it.perfilMin), `perfilMin inválido en ${it.href}`);
  }
  const byHref = Object.fromEntries(BACKLOG_SCOPE_ITEM_NAV.map((i) => [i.href, i]));
  // Guía explícita de S5:
  assert.equal(byHref["/admin/inventario"].grupo, "inventario-y-compras"); // stock → Inventario
  assert.equal(byHref["/admin/cuentas-a-cobrar"].grupo, "finanzas"); // fiado = deuda de cliente
});

test("BACKLOG_SCOPE_ITEM_NAV: fiado y stock son 'ambos' (lite), no enterprise-only; fiado default OFF", () => {
  const byHref = Object.fromEntries(BACKLOG_SCOPE_ITEM_NAV.map((i) => [i.href, i]));
  // Reclasificados a "ambos" por S1 → perfilMin lite (versión light para Comercio).
  assert.equal(byHref["/admin/inventario"].perfilMin, "lite");
  assert.equal(byHref["/admin/cuentas-a-cobrar"].perfilMin, "lite");
  // El fiado NO va al piso universal: descriptor definido pero default OFF (opt-in por rubro).
  assert.equal(byHref["/admin/cuentas-a-cobrar"].defaultOff, true);
  // Cuentas a pagar y contabilidad SÍ son solo Empresa (aditivos).
  assert.equal(byHref["/admin/cuentas-a-pagar"].perfilMin, "enterprise");
  assert.equal(byHref["/admin/contabilidad"].perfilMin, "enterprise");
});

test("ENTERPRISE_NAV_ITEMS: los 3 módulos Empresa son perfilMin enterprise, grupos válidos, hrefs propios", () => {
  const baseHrefs = new Set(Object.keys(NAV_ITEM_GROUPS));
  assert.equal(ENTERPRISE_NAV_ITEMS.length, 3);
  for (const it of ENTERPRISE_NAV_ITEMS) {
    assert.equal(it.perfilMin, "enterprise");
    assert.ok(VALID_IDS.has(it.grupo), `grupo inválido en ${it.href}`);
    assert.ok(!baseHrefs.has(it.href), `${it.href} colisiona con un ítem base`);
    assert.ok(it.label && it.icon && it.cap, `${it.href} sin label/icon/cap`);
    // Naming al cliente: la etiqueta NO filtra la palabra de ingeniería (ADR-059 D7).
    assert.ok(!/enterprise|lite/i.test(it.label), `label "${it.label}" filtra lite/enterprise`);
  }
});

test("ENTERPRISE_NAV_ITEMS: consistentes con el backlog validado (mismo href→grupo que BACKLOG)", () => {
  const backlogEnterprise = Object.fromEntries(
    BACKLOG_SCOPE_ITEM_NAV.filter((b) => b.perfilMin === "enterprise").map((b) => [b.href, b.grupo]),
  );
  for (const it of ENTERPRISE_NAV_ITEMS) {
    assert.equal(it.grupo, backlogEnterprise[it.href], `${it.href} difiere del grupo del backlog`);
  }
  // Guía S5: cuentas a pagar / contabilidad → Finanzas; devoluciones → Inventario y compras.
  const byHref = Object.fromEntries(ENTERPRISE_NAV_ITEMS.map((i) => [i.href, i]));
  assert.equal(byHref["/admin/cuentas-a-pagar"].grupo, "finanzas");
  assert.equal(byHref["/admin/contabilidad"].grupo, "finanzas");
  assert.equal(byHref["/admin/devoluciones-proveedor"].grupo, "inventario-y-compras");
});

test("ENTERPRISE_NAV_ITEMS: al agruparse caen en su grupo (Finanzas / Inventario y compras)", () => {
  const items: NavGroupedItem[] = ENTERPRISE_NAV_ITEMS.map((it) => ({
    href: it.href,
    cap: it.cap,
    perfilMin: it.perfilMin,
    grupo: it.grupo,
  }));
  const { groups, ungrouped } = groupNavItems(items);
  assert.equal(ungrouped.length, 0, "ningún ítem Empresa debe quedar sin grupo");
  const finanzas = groups.find((g) => g.id === "finanzas");
  assert.ok(finanzas && finanzas.items.some((i) => i.href === "/admin/cuentas-a-pagar"));
  assert.ok(finanzas && finanzas.items.some((i) => i.href === "/admin/contabilidad"));
  const inv = groups.find((g) => g.id === "inventario-y-compras");
  assert.ok(inv && inv.items.some((i) => i.href === "/admin/devoluciones-proveedor"));
});

test("ENTERPRISE_NAV_ITEMS: regla de oro S1 — hoy ninguno tiene pantalla (ready:false) → día-1 no agrega ítems", () => {
  // El set validado de S1: Empresa día-1 NO agrega ítems a la nav (las 5 rutas enterprise
  // no existen). El shell solo renderiza los `ready` → hoy, cero.
  for (const it of ENTERPRISE_NAV_ITEMS) {
    assert.equal(it.ready, false, `${it.href} no debería estar 'ready' (su pantalla aún no existe)`);
  }
  assert.equal(readyEnterpriseNavItems().length, 0);
});

test("ENTERPRISE_NAV_ITEMS: replica el filtro del shell — con ready:false, ni OWNER Empresa los ve (sin dead-ends)", () => {
  // Espeja la lógica de AdminShell: candidatos = base + SOLO los Empresa `ready`; luego
  // visibleNavItems (rol × módulo × perfil). Hoy no hay ready → Empresa ve solo el piso.
  const shellMerge = (profile: "lite" | "enterprise") =>
    visibleNavItems(
      [
        ...ALL_17,
        ...readyEnterpriseNavItems().map((it) => ({
          href: it.href, cap: it.cap, perfilMin: it.perfilMin, grupo: it.grupo,
        })),
      ] as NavGroupedItem[],
      { role: "OWNER", activeModules: null, activeProfile: profile },
    );
  const entHrefs = new Set(ENTERPRISE_NAV_ITEMS.map((i) => i.href));
  // Empresa hoy: ningún ítem enterprise (todos ready:false) → sin callejones sin salida.
  const ownerEnt = shellMerge("enterprise");
  assert.ok(![...entHrefs].some((h) => ownerEnt.some((i) => i.href === h)), "sin pantallas, Empresa no debe cablear ítems");
  // El piso Comercio sí se ve en Empresa (invariante ⊇).
  assert.ok(ownerEnt.some((i) => i.href === "/admin/facturacion"));
});

test("ENTERPRISE_NAV_ITEMS: cuando un ítem shippea su pantalla (ready:true) SÍ se cablea para OWNER Empresa", () => {
  // Simula la habilitación de S1: se pone ready:true al ancla (J59 cuentas a pagar).
  const enabled = ENTERPRISE_NAV_ITEMS.map((it) =>
    it.href === "/admin/cuentas-a-pagar" ? { ...it, ready: true } : it,
  );
  const ready = enabled.filter((i) => i.ready);
  const merged: NavGroupedItem[] = [
    ...ALL_17,
    ...ready.map((it) => ({ href: it.href, cap: it.cap, perfilMin: it.perfilMin, grupo: it.grupo })),
  ];
  // OWNER Empresa → ve Cuentas a pagar.
  const ownerEnt = visibleNavItems(merged, { role: "OWNER", activeModules: null, activeProfile: "enterprise" });
  assert.ok(ownerEnt.some((i) => i.href === "/admin/cuentas-a-pagar"), "OWNER Empresa debe ver el ancla ya shippeada");
  // OWNER Comercio → NO lo ve (perfilGateAllows lo filtra: es enterprise-only).
  const ownerLite = visibleNavItems(merged, { role: "OWNER", activeModules: null, activeProfile: "lite" });
  assert.ok(!ownerLite.some((i) => i.href === "/admin/cuentas-a-pagar"), "Comercio no debe ver el ítem Empresa");
  // RECEPTION Empresa → tampoco (billing:manage es solo OWNER).
  const recepEnt = visibleNavItems(merged, { role: "RECEPTION", activeModules: null, activeProfile: "enterprise" });
  assert.ok(!recepEnt.some((i) => i.href === "/admin/cuentas-a-pagar"), "RECEPTION no debe ver el ítem Empresa");
});

test("BACKLOG_SCOPE_ITEM_NAV: invariante enterprise ⊇ lite — un ítem 'lite' se ve en ambos perfiles", () => {
  // Simula que los backlog ya están en la nav (con su perfilMin) y que sus módulos
  // están activos: todo lo visible en Comercio (lite) debe verse en Empresa (enterprise).
  const items: NavGroupedItem[] = BACKLOG_SCOPE_ITEM_NAV.map((b) => ({
    href: b.href,
    cap: "dashboard:read", // cap común para aislar el eje perfil en este test
    perfilMin: b.perfilMin,
    grupo: b.grupo,
  }));
  const lite = new Set(
    visibleNavItems(items, { role: "OWNER", activeModules: null, activeProfile: "lite" }).map((i) => i.href),
  );
  const ent = new Set(
    visibleNavItems(items, { role: "OWNER", activeModules: null, activeProfile: "enterprise" }).map((i) => i.href),
  );
  for (const href of lite) {
    assert.ok(ent.has(href), `"${href}" visible en Comercio pero no en Empresa (rompe ⊇)`);
  }
});
