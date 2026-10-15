// ============================================================================
// RENDICIÓN DE GASTOS (Rendí) — declarada en preparación: no se ofrece en ningún negocio.
// ============================================================================
//
// La app se declara antes de que su motor entre al ERP (vive en C:\gsg-rendi hasta que el dueño
// apruebe el plan de integración). Estos tests atan las tres promesas de esa declaración:
//   1. no aparece en el Inicio, la barra ni el buscador de NINGÚN negocio: cualquier rol, con o
//      sin gate, con su módulo asignado o no, de servicios o de mostrador, con o sin perfil;
//   2. su ruta es suya y resuelve a «App no disponible» con el motivo `en-preparacion`;
//   3. su módulo existe, apagado: no es núcleo de nada y ningún preset lo trae en el alta.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { catalogo } from "@/modules/catalog";
import { nucleoParaProducto } from "@/modules/nucleo";
import { PRESET_META, defaultModulesForBlueprint } from "@/blueprints/presets-meta";
import type { Role } from "@/lib/capabilities";
import type { Perfil } from "@/modules/perfil";
import { appPorId } from "./registro";
import { appDeRuta } from "./rutas";
import {
  appsVisibles,
  buscarApps,
  explicarNoDisponible,
  motivoNoDisponible,
  proyectarMenuDeHoy,
  type ContextoApps,
  type NegocioApps,
} from "./visibles";

const APP = appPorId("rendicion-de-gastos");
const ROLES: readonly Role[] = ["OWNER", "RECEPTION", "PROFESSIONAL"];
const PERFILES: readonly (Perfil | null)[] = [null, "lite", "enterprise"];

/** Todos los gates posibles, con el módulo de la app asignado y sin él. */
const CONTEXTOS: readonly (ContextoApps | null)[] = [
  null,
  ...(["piloto", "producto", "registro"] as const).flatMap((origen) => [
    { origen, modulos: new Set(["rendiciones", "reports", "arca", "pos", "catalog", "clients"]) },
    { origen, modulos: new Set(["reports", "arca"]) },
  ]),
];

function* negocios(): Generator<NegocioApps> {
  for (const role of ROLES)
    for (const contexto of CONTEXTOS)
      for (const perfil of PERFILES)
        for (const esMostrador of [false, true])
          for (const modulosAsignados of [[], ["rendiciones"]])
            yield { role, contexto, perfil, esMostrador, carniceriaLista: esMostrador, modulosAsignados };
}

test("Rendición de gastos: declarada en preparación, en Finanzas, para todos los rubros", () => {
  assert.equal(APP.estado, "en-preparacion");
  assert.equal(APP.ruta, "/admin/rendiciones");
  assert.equal(APP.espacio, "finanzas");
  assert.equal(APP.modulo, "rendiciones");
  assert.equal(APP.rubro, undefined);
  assert.equal(APP.capability, "billing:manage");
  // No estaba en la barra de hoy: CH no ve ningún cambio en su menú.
  assert.equal(APP.menuDeHoy, undefined);
});

test("no aparece en el Inicio, la barra ni el buscador de ningún negocio", () => {
  let combinaciones = 0;
  for (const n of negocios()) {
    combinaciones++;
    const visibles = appsVisibles(n);
    assert.ok(!visibles.some((a) => a.id === APP.id), `visible para ${n.role} con gate ${n.contexto?.origen ?? "ninguno"}`);
    assert.ok(!proyectarMenuDeHoy(visibles).some((i) => i.href === APP.ruta), `en la barra de ${n.role}`);
    for (const q of ["rendicion", "Rendición de gastos", "rendi", "viaticos", "caja chica"]) {
      assert.ok(!buscarApps(visibles, q).some((a) => a.id === APP.id), `el buscador la encuentra con "${q}"`);
    }
    // El motivo es siempre el de la preparación, salvo que el rol ni siquiera alcance.
    const motivo = motivoNoDisponible(APP, n);
    assert.ok(motivo === "en-preparacion" || motivo === "rol", `motivo ${motivo} para ${n.role}`);
    if (n.role === "OWNER") assert.equal(motivo, "en-preparacion");
  }
  assert.equal(combinaciones, ROLES.length * CONTEXTOS.length * PERFILES.length * 2 * 2);
});

test("su ruta es suya y la página manda a «App no disponible»", () => {
  assert.equal(appDeRuta("/admin/rendiciones")?.id, APP.id);
  assert.equal(appDeRuta("/admin/rendiciones/nueva")?.id, APP.id);
  assert.notEqual(appDeRuta("/admin/rendicionesX")?.id, APP.id);

  // La página existe (sin ella la URL daría 404) y su guardia es requireApp de ESTA app, que con
  // `en-preparacion` redirige siempre a /admin/no-disponible?app=rendicion-de-gastos.
  const pagina = join(process.cwd(), "src", "app", "admin", "(dashboard)", "rendiciones", "page.tsx");
  assert.ok(existsSync(pagina), "falta src/app/admin/(dashboard)/rendiciones/page.tsx");
  assert.match(readFileSync(pagina, "utf8"), /requireApp\(\s*"rendicion-de-gastos"\s*\)/);

  // Lo que lee la dueña en «App no disponible».
  const texto = explicarNoDisponible(APP, "en-preparacion", { role: "OWNER", esMostrador: false });
  assert.equal(texto.titulo, "Rendición de gastos no está disponible");
  assert.match(texto.porque, /terminando/);
});

test("su módulo existe y está apagado: no es núcleo de nada y ningún preset lo trae", () => {
  const d = catalogo().buscar("rendiciones");
  assert.ok(d, "el módulo rendiciones no está en el catálogo");
  assert.equal(d.rubros, "todos");
  assert.equal(d.nucleoPara, undefined);
  assert.deepEqual(d.migraciones ?? [], [], "sin migraciones: el motor todavía no entró al ERP");
  for (const producto of ["comerciante", "pyme", "contador", "facturita", "vertical"]) {
    assert.ok(!nucleoParaProducto(producto).includes("rendiciones"), `núcleo de ${producto}`);
  }
  for (const bp of [null, "generico", ...Object.keys(PRESET_META)]) {
    assert.ok(!defaultModulesForBlueprint(bp).includes("rendiciones"), `el alta de ${bp} lo trae`);
  }
});
