import { test } from "node:test";
import assert from "node:assert/strict";
import { MODULES, MODULE_IDS, isModuleId } from "./operator-config";
import { DESCRIPTORES_CATALOGO } from "@/modules/catalog";

// Guarda anti-drift (mismo espíritu que FU1): la lista de módulos de la CONSOLA deriva del
// catálogo canónico (src/modules), no es una 2ª fuente a mano. Si alguien vuelve a hacer una
// lista paralela, esto rompe.

test("MODULES deriva 1:1 del catálogo canónico (mismos ids, mismo orden)", () => {
  assert.deepEqual(
    MODULES.map((m) => m.id),
    DESCRIPTORES_CATALOGO.map((d) => d.id),
  );
});

test("cada ModuleDef proyecta su descriptor (label=nombre, description=descripcion, plugin=kind)", () => {
  const byId = new Map(DESCRIPTORES_CATALOGO.map((d) => [d.id, d]));
  for (const m of MODULES) {
    const d = byId.get(m.id);
    assert.ok(d, `${m.id} debe existir en el catálogo`);
    assert.equal(m.label, d.nombre);
    assert.equal(m.description, d.descripcion);
    assert.equal(!!m.plugin, d.kind === "plugin");
  }
});

test("el catálogo de la consola incluye reviews (drift viejo) + los 5 módulos Empresa de ADR-060", () => {
  for (const id of ["reviews", "inventario", "cuentas-a-pagar", "cuentas-a-cobrar", "libros", "devoluciones-proveedor"]) {
    assert.ok(isModuleId(id), `la consola debería ofrecer "${id}"`);
    assert.ok(MODULE_IDS.includes(id));
  }
});

test("los plugins (integraciones externas) quedan marcados", () => {
  const plugins = MODULES.filter((m) => m.plugin).map((m) => m.id).sort();
  assert.deepEqual(plugins, ["arca", "mercadopago"]);
});
