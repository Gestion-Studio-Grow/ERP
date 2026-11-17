// Etapa 2 de Proyectos · beauty-spa (CH) no cambia en nada (orden de la orquestadora, 09/11).
// Se compara la navegación, las apps y los módulos activos de CH con el catálogo REAL contra un
// catálogo idéntico SIN los descriptores de la Etapa 2: tienen que dar exactamente lo mismo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ModuleRegistry } from "@/modules/registry";
import { resolverActivacion } from "@/modules/activation";
import { catalogo, DESCRIPTORES_CATALOGO } from "@/modules/catalog";
import { MODULOS_PROYECTOS_ETAPA2 } from "@/modules/descriptors/proyectos-etapa2";
import { appsVisibles, proyectarMenuDeHoy, resolverContextoApps, type TenantParaApps } from "@/apps/visibles";
import { armarNavegacion } from "@/app/admin/(dashboard)/armazon/navegacion";
import { etapa2Estado } from "./etapa2-core";

const CH: TenantParaApps = { id: "t-ch", slug: "beauty-spa", blueprintId: null, modules: [] };
const IDS_E2 = new Set(MODULOS_PROYECTOS_ETAPA2.map((d) => d.id));
const sinEtapa2 = () =>
  new ModuleRegistry().registrarTodos(DESCRIPTORES_CATALOGO.filter((d) => !IDS_E2.has(d.id))).validarEstricto();

function foto(registry: ModuleRegistry) {
  const out: unknown[] = [];
  for (const registroGlobal of [false, true])
    for (const modoApps of [false, true])
      for (const role of ["OWNER", "RECEPTION", "PROFESSIONAL"] as const) {
        const contexto = resolverContextoApps(CH, { registroGlobal, enInicioPorApps: modoApps }, registry);
        const visibles = appsVisibles({ role, contexto, modulosAsignados: CH.modules, perfil: null, esMostrador: false, carniceriaLista: false });
        const menu = proyectarMenuDeHoy(visibles);
        out.push({ registroGlobal, modoApps, role, apps: visibles.map((a) => a.id), menu, nav: armarNavegacion({ visibles, menu, modoApps, esMostrador: false, role }) });
      }
  const activos = resolverActivacion({ tenantId: CH.id, blueprintId: CH.blueprintId, modules: [...CH.modules] }, registry, { enforced: true }).activos.map((d) => d.id);
  return { out, activos };
}

test("beauty-spa: navegación, apps y módulos activos idénticos con y sin la Etapa 2 en el catálogo", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(foto(catalogo()))), JSON.parse(JSON.stringify(foto(sinEtapa2()))));
});

test("beauty-spa: ninguna parte de la Etapa 2 prendida", () => {
  assert.ok(Object.values(etapa2Estado(CH.modules)).every((v) => v === false));
});
