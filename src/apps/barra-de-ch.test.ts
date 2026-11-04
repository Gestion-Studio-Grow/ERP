// La barra de CH (orden del dueño, 01/11): Comisiones entra, Pedidos se llama «Vender», salen Campañas
// y Recordatorios. Stock, Compras, Facturación y los números no se tocan; cada rol ve sólo lo suyo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appsVisibles, barraDeCH, proyectarMenuDeHoy } from "./visibles";
import { espaciosDelMenu } from "@/app/admin/(dashboard)/armazon/navegacion";
import type { Role } from "@/lib/capabilities";

const paraRol = (role: Role) => {
  const visibles = appsVisibles({ role, contexto: null, modulosAsignados: [], perfil: null, esMostrador: false, carniceriaLista: false });
  const hoy = proyectarMenuDeHoy(visibles);
  return { visibles, hoy, barra: barraDeCH(hoy, visibles) };
};
const rutas = (m: readonly { href: string }[]) => m.map((i) => i.href);

test("dueña: Comisiones entra detrás de Reportes, Vender en lugar de Pedidos, sin Campañas ni Recordatorios", () => {
  const { barra, hoy } = paraRol("OWNER");
  const vender = barra.find((i) => i.href === "/admin/pedidos");
  assert.equal(vender?.label, "Vender");
  assert.ok(vender?.alias?.includes("pedidos"), "quien busca «pedidos» lo sigue encontrando");
  assert.ok(!barra.some((i) => i.label === "Pedidos"));

  const r = rutas(barra);
  assert.equal(r[r.indexOf("/admin/reportes") + 1], "/admin/comisiones");
  assert.equal(barra.find((i) => i.href === "/admin/comisiones")?.label, "Comisiones");
  assert.ok(!r.includes("/admin/campania"));
  assert.ok(!r.includes("/admin/recordatorios"));

  // Lo demás, tal cual: mismas rutas, mismo rótulo, mismo orden.
  const fuera = new Set(["/admin/campania", "/admin/recordatorios"]);
  const resto = (m: typeof barra) => m.filter((i) => i.href !== "/admin/pedidos" && i.href !== "/admin/comisiones" && !fuera.has(i.href));
  assert.deepEqual(resto(barra), resto(hoy));
});

test("los permisos no cambian: un rol sin `reports:read` no ve Comisiones, y las pantallas siguen abriendo", () => {
  for (const role of ["RECEPTION", "PROFESSIONAL"] as const) {
    const { barra, visibles } = paraRol(role);
    assert.ok(!rutas(barra).includes("/admin/comisiones"), role);
    assert.ok(!visibles.some((a) => a.id === "comisiones"), role);
    for (const href of rutas(barra)) assert.ok(visibles.some((a) => a.ruta === href), `${role} ${href}: entrada sin permiso`);
  }
  assert.ok(rutas(paraRol("RECEPTION").barra).includes("/admin/pedidos"));
  assert.equal(paraRol("RECEPTION").barra.find((i) => i.href === "/admin/pedidos")?.label, "Vender");
  assert.ok(!rutas(paraRol("PROFESSIONAL").barra).includes("/admin/pedidos"), "la profesional no vende");
  // Sacarlas de la barra no les saca el permiso.
  assert.ok(paraRol("OWNER").visibles.some((a) => a.ruta === "/admin/campania"));
  assert.ok(paraRol("OWNER").visibles.some((a) => a.ruta === "/admin/recordatorios"));
});

test("en el armazón nuevo: Vender no se describe como «pesar», y Comisiones cae en su espacio", () => {
  const { barra } = paraRol("OWNER");
  const apps = espaciosDelMenu(barra, false).flatMap((e) => e.apps);
  const vender = apps.find((a) => a.ruta === "/admin/pedidos");
  assert.equal(vender?.nombre, "Vender");
  assert.doesNotMatch(vender?.descripcion ?? "", /pesar/);
  assert.ok(apps.some((a) => a.ruta === "/admin/comisiones"));
});

test("sólo CH pasa por esta barra", () => {
  assert.match(readFileSync(new URL("../app/admin/(dashboard)/layout.tsx", import.meta.url), "utf8"), /esEstetica\(slugDelNegocio\) \? barraDeCH\(barra, visibles, user\.role\) : barra/);
});

test("recepción de CH (04/11): Agenda primero, sólo el día a día, sin Libro de caja; la dueña igual que antes", () => {
  const visibles = appsVisibles({ role: "RECEPTION", contexto: null, modulosAsignados: [], perfil: null, esMostrador: false, carniceriaLista: false });
  const barra = barraDeCH(proyectarMenuDeHoy(visibles), visibles, "RECEPTION");
  assert.deepEqual(rutas(barra), ["/admin/turnos", "/admin/clientes", "/admin/pedidos", "/admin/caja", "/admin/caja/cierre", "/admin/espera", "/admin"]);
  assert.ok(visibles.some((a) => a.ruta === "/admin/caja/libro"), "el Libro de caja sigue abriendo: la barra no es el permiso");
  const duenia = paraRol("OWNER");
  const vis = appsVisibles({ role: "OWNER", contexto: null, modulosAsignados: [], perfil: null, esMostrador: false, carniceriaLista: false });
  assert.deepEqual(rutas(barraDeCH(proyectarMenuDeHoy(vis), vis, "OWNER")), rutas(duenia.barra));
});
