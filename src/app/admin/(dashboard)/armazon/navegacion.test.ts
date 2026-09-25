// La navegación del armazón nuevo con el registro REAL, para las personas del laboratorio.
//   · MAGRA (piloto, «Trabaja por apps»): los espacios nuevos con las apps que ve, un nombre por app.
//   · CH (sin «Trabaja por apps»): EXACTAMENTE las pantallas y los rótulos de su barra de siempre,
//     agrupados por espacio (ARQUITECTURA §5.10, A5). Ni una más, ni una menos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogo } from "@/modules/catalog";
import { appsVisibles, proyectarMenuDeHoy, resolverContextoApps, type NegocioApps, type TenantParaApps } from "@/apps/visibles";
import type { Role } from "@/lib/capabilities";
import { armarNavegacion } from "./navegacion";

const CH: TenantParaApps = { id: "t-ch", slug: "beauty-spa", blueprintId: null, modules: [] };
const MAGRA: TenantParaApps = {
  id: "t-magra",
  slug: "magra",
  blueprintId: "carniceria",
  modules: ["pos", "catalog", "clients", "reports", "arca", "campanias", "inventario", "bancos", "multilocal"],
};

function negocio(t: TenantParaApps, role: Role, enInicioPorApps: boolean, esMostrador: boolean): NegocioApps {
  return {
    role,
    contexto: resolverContextoApps(t, { registroGlobal: false, enInicioPorApps }, catalogo()),
    modulosAsignados: t.modules,
    perfil: null,
    esMostrador,
    carniceriaLista: false,
  };
}

function nav(t: TenantParaApps, role: Role, modoApps: boolean, esMostrador: boolean) {
  const visibles = appsVisibles(negocio(t, role, modoApps, esMostrador));
  const menu = proyectarMenuDeHoy(visibles);
  return { visibles, menu, n: armarNavegacion({ visibles, menu, modoApps, esMostrador, role }) };
}

test("CH sin «Trabaja por apps»: las mismas pantallas y rótulos de su barra, agrupados", () => {
  for (const role of ["OWNER", "RECEPTION", "PROFESSIONAL"] as const) {
    const { menu, n } = nav(CH, role, false, false);
    const deLaBarra = menu.filter((m) => m.href !== "/admin").map((m) => `${m.href}|${m.label}`).sort();
    const agrupadas = n.espacios.flatMap((e) => e.apps.map((a) => `${a.ruta}|${a.nombre}`)).sort();
    assert.deepEqual(agrupadas, deLaBarra, `${role}: mismas pantallas y rótulos`);
  }
  const { n } = nav(CH, "OWNER", false, false);
  assert.equal(n.espacios[0].nombre, "Recepción");
  assert.equal(n.rubro?.palabra, "Dar un turno");
  assert.equal(n.conInicio, true);
  // Los comandos de CH son sus pantallas y sus acciones: nada de otro rubro.
  assert.ok(!n.comandos.some((c) => c.href.startsWith("/admin/vender")));
  assert.ok(n.comandos.some((c) => c.grupo === "acciones" && c.nombre === "Dar un turno"));
});

test("la recepción de CH aterriza en la Agenda; el profesional no tiene tecla del rubro", () => {
  assert.equal(nav(CH, "RECEPTION", false, false).n.conInicio, false);
  assert.equal(nav(CH, "PROFESSIONAL", false, false).n.rubro, null);
});

test("MAGRA con «Trabaja por apps»: los espacios nuevos, con el nombre del registro y sin apps ajenas", () => {
  const { visibles, n } = nav(MAGRA, "OWNER", true, true);
  const ids = n.espacios.map((e) => e.id);
  assert.deepEqual(ids.slice(0, 2), ["mostrador", "caja"]);
  assert.ok(ids.includes("compras") && ids.includes("numeros") && ids.includes("facturacion"));
  assert.ok(!ids.includes("administracion") || n.espacios.find((e) => e.id === "administracion")!.nombre === "Configuración");
  const rutas = new Set(visibles.map((a) => a.ruta));
  for (const e of n.espacios) for (const a of e.apps) assert.ok(rutas.has(a.ruta as `/admin${string}`), `${a.ruta} no es visible`);
  assert.equal(n.espacios[0].apps[0].nombre, "Vender");
  assert.equal(n.rubro?.palabra, "Vender");
  // Los comandos: acciones antes que apps, y ninguna acción de una app que no ve.
  const primeras = n.comandos.findIndex((c) => c.grupo === "apps");
  assert.ok(n.comandos.slice(0, primeras).every((c) => c.grupo === "acciones"));
  assert.ok(!n.comandos.some((c) => c.nombre === "Dar un turno"));
});

test("la cajera de MAGRA aterriza en Vender y no ve Números ni Configuración", () => {
  const { n } = nav(MAGRA, "RECEPTION", true, true);
  assert.equal(n.conInicio, false);
  const ids = n.espacios.map((e) => e.id);
  assert.ok(!ids.includes("numeros"));
  assert.ok(!ids.includes("administracion"));
});
