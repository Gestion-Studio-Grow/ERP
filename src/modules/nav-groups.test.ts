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
import { existsSync } from "node:fs";
import { join } from "node:path";
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
import { ALL_ITEMS } from "@/lib/admin-nav-items";

// Los ítems reales de la nav, DERIVADOS de `ALL_ITEMS` (@/lib/admin-nav-items) con su
// grupo aplicado. Antes acá vivía una copia a mano de esa lista, y la copia se
// desincronizó: le faltaban Campañas y los ítems de rubro, así que los tests valídaban
// una nav que ya no era la del producto. Derivarla es la única forma de que un ítem
// nuevo entre automáticamente a todas las vallas de abajo.
const ITEMS_NAV: NavGroupedItem[] = ALL_ITEMS.map((it) => ({
  href: it.href,
  cap: it.cap,
  module: it.module,
  grupo: NAV_ITEM_GROUPS[it.href],
}));

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

test("NAV_ITEM_GROUPS: TODO ítem de ALL_ITEMS tiene grupo — ninguno cae en 'ungrouped'", () => {
  // Antes esto contaba ítems (18). El número se quedó viejo apenas entraron Campañas y
  // los ítems de rubro, y esos 4 se pintaban sueltos al final de la barra sin título —
  // la red de seguridad de `groupNavItems` tapando un olvido. Ahora la valla es la
  // COBERTURA: cada href de la lista real tiene que estar asignado. Un ítem nuevo sin
  // grupo rompe acá, no en la barra del cliente.
  for (const item of ALL_ITEMS) {
    const grupo = NAV_ITEM_GROUPS[item.href];
    assert.ok(grupo, `"${item.href}" (${item.label}) sin grupo en NAV_ITEM_GROUPS`);
    assert.ok(VALID_IDS.has(grupo), `"${item.href}" con grupo inválido: ${grupo}`);
  }
  for (const item of ITEMS_NAV) {
    assert.ok(item.grupo, `"${item.href}" sin grupo asignado`);
    assert.ok(VALID_IDS.has(item.grupo), `"${item.href}" con grupo inválido: ${item.grupo}`);
  }
});

test("ENTERPRISE_NAV_ITEMS ∩ ALL_ITEMS: la única superposición es /admin/inventario", () => {
  // Superposición DELIBERADA y acotada: Inventario es una sola pantalla con dos vías de
  // encendido (rubro retail en `ALL_ITEMS` · perfil Empresa en `ENTERPRISE_NAV_ITEMS`).
  // El AdminShell deduplica por href para no pintarla dos veces. Si mañana aparece OTRA
  // href en ambos registros, este test lo dice — que es justo cuando hay que decidir cuál
  // de los dos registros manda, en vez de descubrirlo por un ítem repetido en la barra.
  const baseHrefs = new Set(ALL_ITEMS.map((i) => i.href));
  const compartidas = ENTERPRISE_NAV_ITEMS.filter((i) => baseHrefs.has(i.href)).map((i) => i.href);
  assert.deepEqual(compartidas, ["/admin/inventario"]);
});

test("NAV_ITEM_GROUPS: 'Ajustes y mermas' cae en Inventario y compras (es stock, no config)", () => {
  assert.equal(NAV_ITEM_GROUPS["/admin/ajustes"], "inventario-y-compras");
});

test("groupNavItems: agrupa respetando el orden fijo de NAV_GROUPS", () => {
  const { groups } = groupNavItems(ITEMS_NAV);
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
  const input = [...ITEMS_NAV];
  const snapshot = JSON.stringify(input);
  groupNavItems(input);
  assert.equal(JSON.stringify(input), snapshot);
});

test("groupNavItems: compone con visibleNavItems (rol × módulo × perfil) sin perder la agrupación", () => {
  // RECEPTION solo tiene lo operativo de mostrador + alta de clientes (capabilities.ts):
  // ve Operación (dashboard/agenda/espera/pedidos/caja) y Clientes (solo /admin/clientes;
  // recordatorios y reseñas son OWNER). NO ve Inventario/Finanzas/Configuración.
  const visible = visibleNavItems(ITEMS_NAV, {
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
  // Cuentas a pagar y libros (ex contabilidad, ADR-060 D7) SÍ son solo Empresa (aditivos).
  assert.equal(byHref["/admin/cuentas-a-pagar"].perfilMin, "enterprise");
  assert.equal(byHref["/admin/libros"].perfilMin, "enterprise");
});

test("ENTERPRISE_NAV_ITEMS: 5 shells (3 enterprise + CxC/Inventario lite reconciliados), ready, grupos válidos, hrefs propios", () => {
  const baseHrefs = new Set(Object.keys(NAV_ITEM_GROUPS));
  assert.equal(ENTERPRISE_NAV_ITEMS.length, 5);
  for (const it of ENTERPRISE_NAV_ITEMS) {
    assert.ok(it.perfilMin === "lite" || it.perfilMin === "enterprise", `perfilMin inválido en ${it.href}`);
    assert.equal(it.ready, true, `${it.href} debe estar 'ready' (su shell existe)`);
    assert.ok(VALID_IDS.has(it.grupo), `grupo inválido en ${it.href}`);
    // `/admin/inventario` es la excepción documentada (misma pantalla, dos vías de
    // encendido: rubro retail o perfil Empresa) y el shell la deduplica por href. El
    // test de arriba vigila que siga siendo la ÚNICA superposición.
    if (it.href !== "/admin/inventario") {
      assert.ok(!baseHrefs.has(it.href), `${it.href} colisiona con un ítem base`);
    }
    assert.ok(it.label && it.icon && it.cap, `${it.href} sin label/icon/cap`);
    // Naming al cliente: la etiqueta NO filtra la palabra de ingeniería (ADR-059 D7).
    assert.ok(!/enterprise|lite/i.test(it.label), `label "${it.label}" filtra lite/enterprise`);
  }
  // Reconciliación S5 (Gate final): CxC/fiado (D3) e Inventario/valuación (D5) son `lite`
  // (Comercio+Empresa), coinciden con sus páginas re-gateadas; los otros 3 son
  // enterprise-only (CxP, Libros, Devoluciones).
  const byHref = Object.fromEntries(ENTERPRISE_NAV_ITEMS.map((i) => [i.href, i]));
  for (const h of ["/admin/cuentas-a-cobrar", "/admin/inventario"]) {
    assert.equal(byHref[h].perfilMin, "lite", `${h} debe ser lite (Comercio+Empresa)`);
  }
  for (const h of ["/admin/cuentas-a-pagar", "/admin/libros", "/admin/devoluciones-proveedor"]) {
    assert.equal(byHref[h].perfilMin, "enterprise", `${h} debe ser enterprise-only`);
  }
});

test("ENTERPRISE_NAV_ITEMS: cada href está en el backlog validado con el MISMO grupo", () => {
  // El grupo es consistente con BACKLOG_SCOPE_ITEM_NAV (el perfil puede diferir: inventario
  // y cuentas a cobrar son shells Empresa acá pero al vivo son rubro-gated/"ambos", S1).
  const backlogGrupo = Object.fromEntries(BACKLOG_SCOPE_ITEM_NAV.map((b) => [b.href, b.grupo]));
  for (const it of ENTERPRISE_NAV_ITEMS) {
    assert.equal(it.grupo, backlogGrupo[it.href], `${it.href} difiere del grupo del backlog`);
  }
  const byHref = Object.fromEntries(ENTERPRISE_NAV_ITEMS.map((i) => [i.href, i]));
  assert.equal(byHref["/admin/cuentas-a-pagar"].grupo, "finanzas");
  assert.equal(byHref["/admin/cuentas-a-cobrar"].grupo, "finanzas");
  assert.equal(byHref["/admin/libros"].grupo, "finanzas");
  assert.equal(byHref["/admin/inventario"].grupo, "inventario-y-compras");
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
  for (const h of ["/admin/cuentas-a-pagar", "/admin/cuentas-a-cobrar", "/admin/libros"]) {
    assert.ok(finanzas && finanzas.items.some((i) => i.href === h), `Finanzas debe incluir ${h}`);
  }
  const inv = groups.find((g) => g.id === "inventario-y-compras");
  for (const h of ["/admin/inventario", "/admin/devoluciones-proveedor"]) {
    assert.ok(inv && inv.items.some((i) => i.href === h), `Inventario y compras debe incluir ${h}`);
  }
});

test("ENTERPRISE_NAV_ITEMS: los 5 shells existen (ready) → readyEnterpriseNavItems los expone todos", () => {
  // Los SHELLS "En preparación" existen (directiva del dueño: producto entero recorrible).
  // `ready` sigue siendo la valla anti-dead-end: si algún ítem se marcara ready sin su
  // page.tsx, ESTE test seguiría verde pero el recorrido en preview lo delataría — por eso
  // el registro y las 5 pages se agregan juntos, en el mismo commit.
  assert.equal(readyEnterpriseNavItems().length, 5);
  const readyHrefs = new Set(readyEnterpriseNavItems().map((i) => i.href));
  assert.deepEqual(readyHrefs, new Set(ENTERPRISE_NAV_ITEMS.map((i) => i.href)));
});

test("ENTERPRISE_NAV_ITEMS: cada shell 'ready' tiene su page.tsx en disco (anti dead-end de verdad)", () => {
  // La valla dura de la regla de oro: un ítem `ready` DEBE tener su ruta. Si alguien marca
  // ready:true sin crear la page, este test falla (no un recorrido manual). Los base (17)
  // ya existen; acá cubrimos los 5 shells Empresa nuevos.
  for (const it of readyEnterpriseNavItems()) {
    const slug = it.href.replace(/^\/admin\//, "");
    const page = join(process.cwd(), "src", "app", "admin", "(dashboard)", slug, "page.tsx");
    assert.ok(existsSync(page), `${it.href} está ready pero falta su página ${page}`);
  }
});

test("ENTERPRISE_NAV_ITEMS: replica el filtro del shell — OWNER Empresa los 5; Comercio CxC+Inventario (lite); RECEPTION/motor-OFF ninguno", () => {
  // Espeja la lógica de AdminShell: candidatos = base + los Empresa `ready`; luego
  // visibleNavItems (rol × módulo × perfil).
  // `isRetail` y la DEDUP por href no son detalle: sin ellos el espejo miente. La lista
  // base trae `/admin/inventario` como ítem de rubro (solo retail) y el registro Empresa
  // lo trae otra vez como shell de perfil — el AdminShell filtra por rubro y deduplica,
  // así que el test tiene que hacer lo mismo o valida una nav que nadie ve.
  const shellMerge = (
    role: "OWNER" | "RECEPTION",
    profile: "lite" | "enterprise" | null,
    isRetail = false,
  ) => {
    const vistos = new Set<string>();
    const candidatos = [
      ...ALL_ITEMS.filter((it) => !it.retailOnly || isRetail).map((it) => ({
        href: it.href, cap: it.cap, module: it.module, grupo: NAV_ITEM_GROUPS[it.href],
      })),
      ...(profile === null
        ? []
        : readyEnterpriseNavItems().map((it) => ({
            href: it.href, cap: it.cap, perfilMin: it.perfilMin, grupo: it.grupo,
          }))),
    ].filter((it) => (vistos.has(it.href) ? false : (vistos.add(it.href), true)));
    return visibleNavItems(candidatos as NavGroupedItem[], {
      role,
      activeModules: null,
      activeProfile: profile,
    });
  };
  const entHrefs = [...ENTERPRISE_NAV_ITEMS.map((i) => i.href)];

  // OWNER Empresa: ve los 5 shells (recorrible) + el piso (⊇).
  const ownerEnt = shellMerge("OWNER", "enterprise");
  for (const h of entHrefs) assert.ok(ownerEnt.some((i) => i.href === h), `OWNER Empresa debe ver ${h}`);
  assert.ok(ownerEnt.some((i) => i.href === "/admin/facturacion"), "y el piso Comercio (⊇)");

  // OWNER Comercio: ve SOLO CxC (lite, reconciliado); NO los 4 enterprise-only.
  const ownerLite = shellMerge("OWNER", "lite");
  const liteItems = ["/admin/cuentas-a-cobrar", "/admin/inventario"];
  for (const h of liteItems) assert.ok(ownerLite.some((i) => i.href === h), `Comercio ve ${h} (lite)`);
  const entOnly = entHrefs.filter((h) => !liteItems.includes(h));
  assert.ok(!entOnly.some((h) => ownerLite.some((i) => i.href === h)), "Comercio NO ve los 3 enterprise-only");

  // Motor OFF (profile null): ninguno + nav idéntica al piso.
  const ownerOff = shellMerge("OWNER", null);
  assert.ok(!entHrefs.some((h) => ownerOff.some((i) => i.href === h)), "motor OFF no suma ítems Empresa");

  // Un tenant RETAIL con el motor ON ve `/admin/inventario` UNA sola vez, no dos: está
  // declarado en los dos registros y la dedup del shell lo resuelve.
  const retailEnt = shellMerge("OWNER", "enterprise", true);
  assert.equal(
    retailEnt.filter((i) => i.href === "/admin/inventario").length,
    1,
    "Inventario duplicado en la barra (colisión base × Empresa sin deduplicar)",
  );

  // RECEPTION Empresa: ninguno (caps billing/reports/catalog son solo OWNER).
  const recepEnt = shellMerge("RECEPTION", "enterprise");
  assert.ok(!entHrefs.some((h) => recepEnt.some((i) => i.href === h)), "RECEPTION no ve ítems Empresa");
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
