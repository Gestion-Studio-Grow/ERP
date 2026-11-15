// UAT Magra 07-08/11 (callejón C2, fallas «Vender no está en el menú» y «el Inicio del Mostrador no
// ofrece Vender ni Ventas hoy»): Vender y Ventas del día entran a la barra al lado de Pedidos SÓLO si
// la persona ya puede abrirlas (`appsVisibles`: módulo `pos` asignado, que es duro, y su capability).
// CH (módulos sin asignar) no las ve, así que su barra queda idéntica. Y el modo simple de un
// mostrador deja Vender y Pedidos, no la Agenda que no tiene.

import { test } from "node:test";
import assert from "node:assert/strict";
import { appsVisibles, conMostradorEnLaBarra, proyectarMenuDeHoy, type NegocioApps } from "./visibles";
import { menuDeModoSimple, RUTAS_DEL_MODO_SIMPLE } from "@/lib/admin-nav-items";
import { puestoDe } from "@/app/admin/(dashboard)/armazon/armazon-core";
import type { Role } from "@/lib/capabilities";

function negocio(role: Role, modulos: string[], esMostrador: boolean): NegocioApps {
  return { role, contexto: null, modulosAsignados: modulos, perfil: null, esMostrador, carniceriaLista: esMostrador };
}

const barra = (n: NegocioApps) => {
  const visibles = appsVisibles(n);
  return conMostradorEnLaBarra(proyectarMenuDeHoy(visibles), visibles);
};
const hrefs = (items: readonly { href: string }[]) => items.map((i) => i.href);

test("carnicería con `pos`: la dueña ve Vender antes de Pedidos y Ventas del día después", () => {
  const h = hrefs(barra(negocio("OWNER", ["pos", "catalog", "clients"], true)));
  const i = h.indexOf("/admin/pedidos");
  assert.ok(i > 0, h.join(" "));
  assert.equal(h[i - 1], "/admin/vender");
  assert.equal(h[i + 1], "/admin/ventas");
});

test("el Mostrador también: y su puesto (Vender) ahora está en su navegación", () => {
  const n = negocio("RECEPTION", ["pos", "catalog", "clients"], true);
  const h = hrefs(barra(n));
  assert.ok(h.includes("/admin/vender") && h.includes("/admin/ventas"), h.join(" "));
  const enLaBarra = appsVisibles(n).filter((a) => h.includes(a.ruta));
  assert.equal(puestoDe("RECEPTION", true, enLaBarra), "/admin/vender");
});

test("CH (sin `pos` asignado): la barra no cambia en ningún rol", () => {
  for (const role of ["OWNER", "RECEPTION", "PROFESSIONAL"] as Role[]) {
    const n = negocio(role, [], false);
    const visibles = appsVisibles(n);
    assert.deepEqual(conMostradorEnLaBarra(proyectarMenuDeHoy(visibles), visibles), proyectarMenuDeHoy(visibles), role);
  }
});

test("sin repetir: si ya están en la barra no se suman de nuevo", () => {
  const n = negocio("OWNER", ["pos"], true);
  const visibles = appsVisibles(n);
  const una = conMostradorEnLaBarra(proyectarMenuDeHoy(visibles), visibles);
  assert.deepEqual(conMostradorEnLaBarra(una, visibles), una);
});

test("modo simple en un mostrador: Hoy, Vender, Pedidos, Clientes y Caja (sin Agenda)", () => {
  const menu = barra(negocio("RECEPTION", ["pos", "catalog", "clients"], true));
  assert.deepEqual(hrefs(menuDeModoSimple(menu)), ["/admin", "/admin/vender", "/admin/pedidos", "/admin/clientes", "/admin/caja"]);
});

test("modo simple de CH: igual que siempre", () => {
  const menu = barra(negocio("RECEPTION", [], false));
  assert.deepEqual(hrefs(menuDeModoSimple(menu)), RUTAS_DEL_MODO_SIMPLE.filter((r) => hrefs(menu).includes(r)));
});
