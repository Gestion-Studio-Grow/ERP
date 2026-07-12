// Tests del NÚCLEO POR PRODUCTO (ADR-089): el set instalado de fábrica se DERIVA del campo
// `nucleoPara` de los descriptores (única fuente de verdad), no de una lista hardcodeada.

import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogo } from "./catalog";
import { nucleoParaProducto } from "./nucleo";
import { derivarProducto } from "@/lib/producto-identidad";
import { defaultModulesForBlueprint } from "@/blueprints/presets-meta";

// Réplica pura de `modulosBaseParaAlta` (src/lib/provisioning/adapters.ts) — la misma regla
// de composición, sin importar el adapter (que arrastra dotenv/Prisma). Mantener en sync.
function modulosBaseParaAltaPuro(blueprintId: string): string[] {
  const producto = derivarProducto({ blueprintId, modules: [] });
  const nucleo = nucleoParaProducto(producto, catalogo());
  return nucleo.length > 0 ? nucleo : defaultModulesForBlueprint(blueprintId);
}

test("nucleoParaProducto('comerciante') = núcleo de facturación (bancos/arca/mercadopago/clients/reports)", () => {
  const nucleo = new Set(nucleoParaProducto("comerciante", catalogo()));
  for (const id of ["bancos", "arca", "mercadopago", "clients", "reports"]) {
    assert.ok(nucleo.has(id), `el núcleo del Comerciante debería incluir "${id}"`);
  }
  // NO trae agenda/pos/catalog/stock (la deuda que motivó ADR-089: nada de "Agregar turno").
  for (const id of ["agenda", "pos", "catalog", "waitlist", "commissions", "cartera"]) {
    assert.ok(!nucleo.has(id), `el núcleo del Comerciante NO debería incluir "${id}"`);
  }
});

test("nucleoParaProducto('contador') incluye cartera (su discriminador) + arca/clients/reports", () => {
  const nucleo = new Set(nucleoParaProducto("contador", catalogo()));
  for (const id of ["cartera", "arca", "clients", "reports"]) {
    assert.ok(nucleo.has(id), `el núcleo del Contador debería incluir "${id}"`);
  }
});

test("nucleoParaProducto('vertical') = [] → el llamador cae al default legado por blueprint", () => {
  assert.deepEqual(nucleoParaProducto("vertical", catalogo()), []);
  assert.deepEqual(nucleoParaProducto("facturita", catalogo()), []);
});

// ── El FIX del default de altas (ADR-089), sin romper verticales ─────────────

test("alta de un COMERCIANTE (blueprint 'generico') nace con el núcleo, NO con 'Agregar turno'", () => {
  const modules = new Set(modulosBaseParaAltaPuro("generico"));
  for (const id of ["bancos", "arca", "mercadopago", "clients", "reports"]) {
    assert.ok(modules.has(id), `el alta del Comerciante debería traer "${id}"`);
  }
  assert.ok(!modules.has("agenda"), "el alta del Comerciante NO debe traer agenda (la deuda de ADR-089)");
  assert.ok(!modules.has("pos"), "el alta del Comerciante NO debe traer pos");
});

test("alta de un VERTICAL cae al default legado por blueprint (byte-idéntico, no se toca)", () => {
  for (const bp of ["servicios", "carniceria", "velas", "peluqueria", "rubro-desconocido"]) {
    assert.deepEqual(
      modulosBaseParaAltaPuro(bp),
      defaultModulesForBlueprint(bp),
      `el alta del vertical "${bp}" no debe cambiar respecto del default legado`,
    );
  }
});

test("el default PURO de 'generico' NO se toca (sigue sirviendo al comodín de rubro)", () => {
  // La deuda se arregla en el wiring del alta (por producto), no reescribiendo el default:
  // así el comodín de rubro para verticales genéricos queda intacto.
  assert.deepEqual(
    defaultModulesForBlueprint("generico"),
    ["catalog", "clients", "pos", "agenda", "reports"],
  );
});
