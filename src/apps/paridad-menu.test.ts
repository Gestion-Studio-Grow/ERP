// ============================================================================
// PARIDAD DORADA — la barra que sale del registro es LA MISMA que la de hoy.
// ============================================================================
//
// Mientras conviven el menú viejo (`menuItemsParaTenant`, src/lib/admin-nav-items.ts) y el
// registro de apps, la barra se puede armar desde cualquiera de los dos y tiene que dar
// exactamente lo mismo: mismos href, en el mismo orden, con el mismo rótulo, ícono, alias
// y grupo. CH (beauty-spa) está vivo: si esto se rompe, su barra cambia sin que nadie lo
// haya decidido.
//
// Se ejecutan las dos funciones REALES sobre las listas REALES y los roles REALES
// (ROLE_CAPABILITIES), en todos los casos que hoy existen: servicios, mostrador con y sin
// migración cárnica, Comerciante (con su núcleo y con otras asignaciones) y perfiles
// Comercio/Empresa, para los tres roles. La única diferencia es la del piloto, buscada y
// escrita en el último test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { menuItemsParaTenant, type MenuCtx, type ShellItem } from "@/lib/admin-nav-items";
import { NAV_ITEM_GROUPS } from "@/modules/nav-groups";
import { nucleoParaProducto } from "@/modules/nucleo";
import { catalogo } from "@/modules/catalog";
import type { Role } from "@/lib/capabilities";
import type { Perfil } from "@/modules/perfil";
import {
  appsVisibles,
  proyectarMenuDeHoy,
  resolverContextoApps,
  type ItemMenuDeHoy,
  type NegocioApps,
} from "./visibles";

const ROLES: Role[] = ["OWNER", "RECEPTION", "PROFESSIONAL"];
const PERFILES: (Perfil | null)[] = [null, "lite", "enterprise"];
const RUBROS = [
  { nombre: "servicios", isRetail: false, carniceriaReady: false },
  { nombre: "mostrador sin migración cárnica", isRetail: true, carniceriaReady: false },
  { nombre: "mostrador con migración cárnica", isRetail: true, carniceriaReady: true },
  // No debería existir (migración cárnica en un negocio de servicios), pero si pasa, las
  // dos barras tienen que coincidir igual.
  { nombre: "servicios con migración cárnica", isRetail: false, carniceriaReady: true },
];

/** El ítem de la barra de hoy, en la forma que pinta AdminShell (incluido el grupo). */
function comparableHoy(items: ShellItem[]) {
  return items.map((it) => ({
    href: it.href,
    label: it.label,
    icon: it.icon,
    exact: it.exact === true,
    alias: [...(it.alias ?? [])],
    // AdminShell agrupa con `NAV_ITEM_GROUPS[it.href] ?? it.grupo` (NavGroups).
    grupo: NAV_ITEM_GROUPS[it.href] ?? it.grupo,
  }));
}

function comparableRegistro(items: ItemMenuDeHoy[]) {
  return items.map((it) => ({
    href: it.href,
    label: it.label,
    icon: it.icon as string,
    exact: it.exact === true,
    alias: [...(it.alias ?? [])],
    grupo: it.grupo,
  }));
}

function negocio(ctx: MenuCtx, contexto: NegocioApps["contexto"] = null): NegocioApps {
  return {
    role: ctx.role,
    contexto,
    modulosAsignados: [],
    perfil: ctx.activeProfile,
    esMostrador: ctx.isRetail,
    carniceriaLista: ctx.carniceriaReady,
  };
}

test("sin gate (CH y todo negocio fuera del piloto): misma barra en los 3 roles × 4 rubros × 3 perfiles", () => {
  let casos = 0;
  for (const role of ROLES) {
    for (const rubro of RUBROS) {
      for (const perfil of PERFILES) {
        const ctx: MenuCtx = {
          role,
          activeModules: null,
          activeProfile: perfil,
          isRetail: rubro.isRetail,
          carniceriaReady: rubro.carniceriaReady,
        };
        const hoy = comparableHoy(menuItemsParaTenant(ctx));
        const registro = comparableRegistro(proyectarMenuDeHoy(appsVisibles(negocio(ctx))));
        assert.deepEqual(registro, hoy, `${role} · ${rubro.nombre} · perfil ${perfil ?? "apagado"}`);
        casos++;
      }
    }
  }
  assert.equal(casos, 36);
});

/**
 * Asignaciones de módulos de un Comerciante: su núcleo real y las que cambian algo en la
 * barra (el filtro de hoy por `catalog` frente a `inventario`, y las pantallas de edición,
 * que la barra de hoy no filtra por módulo). También la asignación vacía.
 */
const NUCLEO_COMERCIANTE = nucleoParaProducto("comerciante");
const ASIGNACIONES_COMERCIANTE: { nombre: string; modules: string[] }[] = [
  { nombre: "núcleo", modules: NUCLEO_COMERCIANTE },
  { nombre: "vacía", modules: [] },
  { nombre: "núcleo + catalog (sin inventario)", modules: [...NUCLEO_COMERCIANTE, "catalog"] },
  { nombre: "núcleo + catalog + inventario", modules: [...NUCLEO_COMERCIANTE, "catalog", "inventario"] },
  { nombre: "núcleo + inventario (sin catalog)", modules: [...NUCLEO_COMERCIANTE, "inventario"] },
  {
    nombre: "núcleo + módulos de edición",
    modules: [...NUCLEO_COMERCIANTE, "cuentas-a-pagar", "cuentas-a-cobrar", "libros", "devoluciones-proveedor"],
  },
  {
    nombre: "todo el catálogo de módulos",
    modules: catalogo()
      .listar()
      .map((d) => d.id),
  },
];

test("Comerciante (y perfil Comercio/Empresa): misma barra en roles × asignaciones × perfiles × rubros", () => {
  let casos = 0;
  for (const asignacion of ASIGNACIONES_COMERCIANTE) {
    // El contexto se calcula con la regla REAL, no a mano: Comerciante = producto con tienda.
    const contexto = resolverContextoApps(
      { id: "t-comerciante", slug: "kiosco-prueba", blueprintId: "generico", modules: asignacion.modules },
      { registroGlobal: false, enInicioPorApps: false },
      catalogo(),
    );
    assert.equal(contexto?.origen, "producto", asignacion.nombre);
    for (const role of ROLES) {
      for (const perfil of PERFILES) {
        for (const rubro of RUBROS) {
          const ctx: MenuCtx = {
            role,
            // Lo mismo que el layout de hoy: `new Set(t.modules)` para un producto con tienda.
            activeModules: new Set(asignacion.modules),
            activeProfile: perfil,
            isRetail: rubro.isRetail,
            carniceriaReady: rubro.carniceriaReady,
          };
          const hoy = comparableHoy(menuItemsParaTenant(ctx));
          const registro = comparableRegistro(proyectarMenuDeHoy(appsVisibles(negocio(ctx, contexto))));
          assert.deepEqual(
            registro,
            hoy,
            `Comerciante · ${asignacion.nombre} · ${role} · perfil ${perfil ?? "apagado"} · ${rubro.nombre}`,
          );
          casos++;
        }
      }
    }
  }
  assert.equal(casos, ASIGNACIONES_COMERCIANTE.length * 3 * 3 * 4);
});

test("CH hoy: la barra del OWNER de beauty-spa, ítem por ítem", () => {
  // Foto explícita, no sólo "igual a la función vieja": si las dos cambiaran juntas, esto
  // lo marca. Son las 20 pantallas que CH ve hoy.
  const contexto = resolverContextoApps(
    { id: "t-ch", slug: "beauty-spa", blueprintId: null, modules: [] },
    // Aun con su interruptor "Trabaja por apps" prendido, CH no tiene asignación → sin gate.
    { registroGlobal: false, enInicioPorApps: true },
    catalogo(),
  );
  assert.equal(contexto, null);
  const barra = proyectarMenuDeHoy(
    appsVisibles({ role: "OWNER", contexto, modulosAsignados: [], perfil: null, esMostrador: false, carniceriaLista: false }),
  );
  assert.deepEqual(
    barra.map((i) => `${i.href} ${i.label}`),
    [
      "/admin Inicio",
      "/admin/turnos Agenda",
      "/admin/clientes Clientes",
      "/admin/espera Lista de espera",
      "/admin/pedidos Pedidos",
      "/admin/caja Caja",
      "/admin/caja/libro Libro de caja",
      "/admin/caja/cierre Cierre del día",
      "/admin/catalogo Catálogo",
      "/admin/compras Compras",
      "/admin/ajustes Ajustes",
      "/admin/resenas Reseñas",
      "/admin/recordatorios Recordatorios",
      "/admin/facturacion Facturación",
      "/admin/reportes Reportes",
      "/admin/campania Campañas",
      "/admin/auditoria Auditoría",
      "/admin/usuarios Usuarios",
      "/admin/localizacion Localización",
      "/admin/apariencia Apariencia",
    ],
  );
});

test("diferencia BUSCADA, sólo en el piloto: manda el módulo de la app, no el de la barra de hoy", () => {
  // En los negocios con "Trabaja por apps" prendido la barra deja de ser la de hoy a propósito:
  // Stock, Compras y Ajustes cuelgan de `inventario` (no de `catalog`) y las pantallas de
  // edición, de su módulo (no del perfil). Esto deja escrita la diferencia para que nadie
  // la "arregle" copiando la regla del Comerciante. CH y el Comerciante no la tienen: los
  // cubren los tests de arriba.
  const modules = ["pos", "catalog", "clients", "reports", "arca", "cuentas-a-cobrar"];
  const contexto = resolverContextoApps(
    { id: "t-piloto", slug: "magra", blueprintId: "carniceria", modules },
    { registroGlobal: false, enInicioPorApps: true },
    catalogo(),
  );
  assert.equal(contexto?.origen, "piloto");
  const ctx: MenuCtx = {
    role: "OWNER",
    activeModules: new Set(modules),
    activeProfile: null,
    isRetail: true,
    carniceriaReady: true,
  };
  const hoy = menuItemsParaTenant(ctx).map((i) => i.href);
  const registro = proyectarMenuDeHoy(appsVisibles(negocio(ctx, contexto))).map((i) => i.href);
  // Sin `inventario` asignado, el piloto pierde lo de stock que hoy colgaba de `catalog`.
  assert.deepEqual(
    hoy.filter((h) => !registro.includes(h)),
    ["/admin/compras", "/admin/inventario", "/admin/lotes", "/admin/despiece", "/admin/ajustes"],
  );
  // Y con `cuentas-a-cobrar` asignado ve Fiado aunque el motor de perfiles esté apagado.
  assert.deepEqual(registro.filter((h) => !hoy.includes(h)), ["/admin/cuentas-a-cobrar"]);
});
