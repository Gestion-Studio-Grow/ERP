// ============================================================================
// TEST del motor de perfiles (ADR-058/059) — INVARIANTE DE NAV `enterprise ⊇ lite`.
// ============================================================================
//
// ⚠️ ALCANCE (ADR-059 D2, fix Challenger #2): esto es la valla del invariante de
// NAVEGACIÓN — que el set de ítems visibles en `lite` sea SUBCONJUNTO del de
// `enterprise`. NO es la valla de "crecé sin migrar SIN PERDER UN DATO": ese es el
// invariante de DATO (persistencia/pasos/campos), OTRA valla a construir cuando exista
// `Tenant.profile` (§C). No confundir un test verde de nav con el dato blindado (DX-6/DX-7).

import { test } from "node:test";
import assert from "node:assert/strict";
import { perfilGateAllows, visibleNavItems, type NavGateItem, type Perfil } from "./perfil";
import type { Role } from "@/lib/capabilities";

const ROLES: Role[] = ["OWNER", "RECEPTION", "PROFESSIONAL"];

// Ítems de muestra que cubren las combinaciones que importan: core/lite, con módulo,
// y enterprise-only (con y sin módulo). Caps reales del sistema.
const SAMPLE: NavGateItem[] = [
  { href: "/admin", cap: "dashboard:read" }, // core, lite
  { href: "/admin/caja", cap: "orders:read", module: "pos" }, // lite + módulo
  { href: "/admin/facturacion", cap: "billing:manage", module: "arca" }, // lite + módulo
  { href: "/admin/reportes", cap: "reports:read", module: "reports", perfilMin: "enterprise" }, // ent + módulo
  { href: "/admin/usuarios", cap: "users:manage", perfilMin: "enterprise" }, // ent, core
  { href: "/admin/auditoria", cap: "audit:read", perfilMin: "enterprise" }, // ent, core
];

// Subsets de módulos a probar, incluyendo null (flag de módulos OFF) y varios parciales.
const MODULE_SETS: (ReadonlySet<string> | null)[] = [
  null,
  new Set<string>(),
  new Set(["pos"]),
  new Set(["pos", "arca"]),
  new Set(["pos", "arca", "reports"]),
];

test("perfilGateAllows: flag OFF (null) deja pasar todo (legado)", () => {
  for (const min of [undefined, "lite", "enterprise"] as const) {
    assert.equal(perfilGateAllows(min, null), true);
  }
});

test("perfilGateAllows: ítems lite se ven en ambos perfiles; enterprise-only solo en enterprise", () => {
  assert.equal(perfilGateAllows(undefined, "lite"), true);
  assert.equal(perfilGateAllows("lite", "lite"), true);
  assert.equal(perfilGateAllows("enterprise", "lite"), false); // el candado del lite
  assert.equal(perfilGateAllows("enterprise", "enterprise"), true);
});

test("INVARIANTE (predicado): si algo se ve en lite, se ve en enterprise", () => {
  for (const min of [undefined, "lite", "enterprise"] as const) {
    if (perfilGateAllows(min, "lite")) {
      assert.equal(perfilGateAllows(min, "enterprise"), true, `perfilMin=${min} rompe ⊇`);
    }
  }
});

test("INVARIANTE de NAV `enterprise ⊇ lite`: ∀ rol × módulos, visible(lite) ⊆ visible(enterprise)", () => {
  for (const role of ROLES) {
    for (const mods of MODULE_SETS) {
      const lite = new Set(
        visibleNavItems(SAMPLE, { role, activeModules: mods, activeProfile: "lite" }).map((i) => i.href),
      );
      const ent = new Set(
        visibleNavItems(SAMPLE, { role, activeModules: mods, activeProfile: "enterprise" }).map((i) => i.href),
      );
      for (const href of lite) {
        assert.ok(ent.has(href), `rol=${role} mods=${mods && [...mods]} : "${href}" en lite pero no en enterprise`);
      }
    }
  }
});

test("flag OFF (activeProfile null): la nav es idéntica a no gatear por perfil (legado)", () => {
  for (const role of ROLES) {
    for (const mods of MODULE_SETS) {
      const conNull = visibleNavItems(SAMPLE, { role, activeModules: mods, activeProfile: null }).map((i) => i.href);
      // "legado" = solo rol × módulo (perfil no filtra). Se emula quitando perfilMin.
      const sinPerfil = visibleNavItems(
        SAMPLE.map(({ perfilMin: _omit, ...rest }) => rest),
        { role, activeModules: mods, activeProfile: "lite" },
      ).map((i) => i.href);
      assert.deepEqual(conNull, sinPerfil, `rol=${role}: flag OFF debe igualar al legado`);
    }
  }
});
