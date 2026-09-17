// ============================================================================
// EL MENÚ DE UN LOCAL DE MOSTRADOR — y el de la estética que ya factura.
// ============================================================================
//
// Qué blinda este test, en términos del negocio:
//
//   1. Una CARNICERÍA no abre un menú de estética. Las cuatro pantallas que sólo
//      funcionan con turnos (Agenda, Lista de espera, Reseñas, Recordatorios) no
//      aparecen: en un tenant retail no hay un solo `Service` ni `Professional`
//      —el seeder crea únicamente Products (src/blueprints/retail/index.ts:31)— y
//      los formularios de esas pantallas los piden `required`. Son callejones sin
//      salida, y en el mostrador cada ítem de más es tiempo de la persona que atiende.
//   2. `beauty-spa`, el ÚNICO tenant vivo en producción, conserva EXACTAMENTE el menú
//      de siempre. No "parecido": se compara contra la nav legada calculada aparte.
//   3. Un local de MAGRA que NO se llama `magra` (son 5 locales, cada uno un tenant:
//      `magra-canning`, `magra-lomas`…) se reconoce igual como carnicería.
//
// Se ejecutan las funciones REALES sobre el catálogo REAL (`ALL_ITEMS`) y los rubros
// REALES (`resolveRubroId`), no sobre ítems de juguete: si mañana alguien agrega una
// pantalla de agenda sin marcarla, este test la ve.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_ITEMS, menuItemsParaTenant, rubroGateAllows } from "./admin-nav-items";
import { dashboardMode } from "./dashboard-mode";
import { resolveRubroId } from "@/blueprints/retail/rubros";
import { visibleNavItems } from "@/modules/perfil";

// Filas de `Tenant` tal como están HOY en la base (blueprintId + slug). El estado de
// beauty-spa —`blueprintId` nulo— es el que hace que su rubro se resuelva por slug.
const MAGRA = { slug: "magra", blueprintId: "carniceria" };
const MAGRA_LOMAS = { slug: "magra-lomas", blueprintId: null };
const BEAUTY = { slug: "beauty-spa", blueprintId: null };

/** El contexto real del shell: registro de módulos APAGADO y perfiles APAGADOS (hoy). */
function ctxHoy(t: { slug: string; blueprintId: string | null }, extra?: { carniceriaReady?: boolean }) {
  return {
    role: "OWNER" as const,
    activeModules: null,
    activeProfile: null,
    isRetail: resolveRubroId(t) != null,
    carniceriaReady: extra?.carniceriaReady ?? false,
  };
}

const hrefs = (items: { href: string }[]) => items.map((i) => i.href);

// Las cuatro pantallas que sólo tienen sentido con turnos.
const SOLO_AGENDA = ["/admin/turnos", "/admin/espera", "/admin/resenas", "/admin/recordatorios"];

test("carnicería: el rubro resuelve, y el home entra en modo MOSTRADOR sin prender ningún flag", () => {
  for (const t of [MAGRA, MAGRA_LOMAS]) {
    assert.equal(resolveRubroId(t), "carniceria", `${t.slug} tiene que ser carnicería`);
    // `activeModules: null` = registro de módulos apagado, que es el estado de hoy.
    assert.equal(dashboardMode({ activeModules: null, isRetail: true }), "retail", t.slug);
  }
  // Y la estética sigue en su home de agenda.
  assert.equal(resolveRubroId(BEAUTY), null);
  assert.equal(dashboardMode({ activeModules: null, isRetail: false }), "servicios");
});

test("menú de una carnicería: NO trae Agenda, Lista de espera, Reseñas ni Recordatorios", () => {
  const menu = hrefs(menuItemsParaTenant(ctxHoy(MAGRA)));
  for (const href of SOLO_AGENDA) {
    assert.equal(menu.includes(href), false, `${href} no puede estar en el menú de un mostrador`);
  }
  // Y sí trae lo del mostrador: vender, cobrar y saber qué hay.
  for (const href of ["/admin/pedidos", "/admin/caja", "/admin/inventario", "/admin/clientes"]) {
    assert.equal(menu.includes(href), true, `${href} le falta al mostrador`);
  }
});

test("un local de MAGRA que no se llama `magra` tiene el MISMO menú que magra", () => {
  assert.deepEqual(hrefs(menuItemsParaTenant(ctxHoy(MAGRA_LOMAS))), hrefs(menuItemsParaTenant(ctxHoy(MAGRA))));
});

test("Lotes y Despiece esperan a la migración cárnica; el resto del menú no cambia", () => {
  const sinSchema = hrefs(menuItemsParaTenant(ctxHoy(MAGRA)));
  const conSchema = hrefs(menuItemsParaTenant(ctxHoy(MAGRA, { carniceriaReady: true })));
  assert.equal(sinSchema.includes("/admin/lotes"), false);
  assert.equal(sinSchema.includes("/admin/despiece"), false);
  assert.equal(conSchema.includes("/admin/lotes"), true);
  assert.equal(conSchema.includes("/admin/despiece"), true);
  assert.deepEqual(
    conSchema.filter((h) => h !== "/admin/lotes" && h !== "/admin/despiece"),
    sinSchema,
    "el schema cárnico SUMA dos pantallas y no toca ninguna otra",
  );
});

test("beauty-spa (el único tenant vivo) conserva EXACTAMENTE la nav legada", () => {
  const ctx = ctxHoy(BEAUTY);
  assert.equal(ctx.isRetail, false, "beauty-spa no es un local de mostrador");
  // La nav legada = rol × módulo × perfil, sin eje rubro, menos los ítems que el eje
  // rubro ENCIENDE (Inventario, Lotes, Despiece) y que un tenant de servicios nunca vio.
  const legada = visibleNavItems(ALL_ITEMS, ctx)
    .filter((i) => !i.retailOnly && !i.carniceriaOnly)
    .map((i) => i.href);
  assert.deepEqual(hrefs(menuItemsParaTenant(ctx)), legada);
  // Y explícitamente: las cuatro pantallas de turnos siguen ahí.
  for (const href of SOLO_AGENDA) {
    assert.equal(hrefs(menuItemsParaTenant(ctx)).includes(href), true, `${href} le falta a la estética`);
  }
});

test("el rol sigue mandando: la recepción de una carnicería no ve lo que no le toca", () => {
  const recepcion = menuItemsParaTenant({ ...ctxHoy(MAGRA), role: "RECEPTION" });
  const dueño = menuItemsParaTenant(ctxHoy(MAGRA));
  assert.ok(recepcion.length < dueño.length, "la recepción ve menos que el dueño");
  assert.equal(hrefs(recepcion).includes("/admin/usuarios"), false);
  // Y tampoco se le cuela ninguna pantalla de agenda por ser de otro rol.
  for (const href of SOLO_AGENDA) assert.equal(hrefs(recepcion).includes(href), false, href);
});

test("ningún ítem visible en un mostrador está marcado como `agendaOnly` (ni al revés)", () => {
  for (const item of menuItemsParaTenant(ctxHoy(MAGRA))) {
    assert.notEqual(item.agendaOnly, true, `${item.href} es de agenda y se coló`);
  }
  for (const item of menuItemsParaTenant(ctxHoy(BEAUTY))) {
    assert.notEqual(item.retailOnly, true, `${item.href} es de mostrador y se coló en servicios`);
  }
});

test("rubroGateAllows: los tres casos, uno por uno", () => {
  const mostrador = { isRetail: true, carniceriaReady: false };
  const servicios = { isRetail: false, carniceriaReady: false };
  assert.equal(rubroGateAllows({ retailOnly: true }, mostrador), true);
  assert.equal(rubroGateAllows({ retailOnly: true }, servicios), false);
  assert.equal(rubroGateAllows({ carniceriaOnly: true }, mostrador), false, "sin schema, no");
  assert.equal(rubroGateAllows({ carniceriaOnly: true }, { isRetail: true, carniceriaReady: true }), true);
  assert.equal(rubroGateAllows({ agendaOnly: true }, mostrador), false);
  assert.equal(rubroGateAllows({ agendaOnly: true }, servicios), true);
  assert.equal(rubroGateAllows({}, mostrador), true, "un ítem sin marca de rubro se ve siempre");
});
