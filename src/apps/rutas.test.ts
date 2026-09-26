// ============================================================================
// RUTA → APP: la misma respuesta que hoy, salvo donde hoy estaba mal.
// ============================================================================
//
// `appDeRuta` reemplaza a `navItemForPath`. Para cada pantalla de la barra de hoy y sus
// sub-rutas, las dos tienen que elegir la misma pantalla, con tres diferencias escritas:
//   · /admin/facturacion/bancos es su propia app (módulo bancos), no Facturación (arca);
//   · las pantallas de edición (Libros, Fiado, Cuentas a pagar, Devoluciones) no estaban en
//     ALL_ITEMS, así que `navItemForPath` no las encontraba; ahora sí;
//   · /admin/modulos salió del registro y se borró (nadie tenía `modules:manage`).

import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_ITEMS, navItemForPath, rutaPermitidaParaModulos } from "@/lib/admin-nav-items";
import { appDeRuta, normalizarRuta, rutaDeAppDelNegocio } from "./rutas";
import { PLAN_IDS, planPorId } from "@/planes/catalogo";

const id = (path: string) => appDeRuta(path)?.id;

test("para cada pantalla de la barra de hoy y sus sub-rutas, la misma pantalla que navItemForPath", () => {
  for (const item of ALL_ITEMS) {
    const variantes = item.exact
      ? [item.href, `${item.href}/`, `${item.href}?x=1`, `${item.href}#y`]
      : [item.href, `${item.href}/`, `${item.href}/abc`, `${item.href}/abc/def?x=1`, `${item.href}#y`];
    for (const path of variantes) {
      if (path.startsWith("/admin/facturacion/bancos")) continue;
      assert.equal(appDeRuta(path)?.ruta, navItemForPath(path)?.href, path);
    }
  }
});

test("Facturación automática es su propia app, con todo lo que cuelga de ella", () => {
  assert.equal(id("/admin/facturacion/bancos"), "facturacion-automatica");
  assert.equal(id("/admin/facturacion/bancos/configuracion"), "facturacion-automatica");
  assert.equal(id("/admin/facturacion/bancos#cola-revision"), "facturacion-automatica");
  assert.equal(id("/admin/facturacion"), "facturacion");
  assert.equal(id("/admin/facturacion/123"), "facturacion");
});

test("match por segmento, el Inicio sólo exacto, y lo que no es de nadie da undefined", () => {
  assert.equal(id("/admin"), "inicio");
  assert.equal(id("/admin/"), "inicio");
  assert.equal(id("/admin?foo=1"), "inicio");
  assert.equal(id("/admin/facturacionX"), undefined);
  assert.equal(id("/admin/inexistente"), undefined);
  assert.equal(id("/admin/modulos"), undefined);
  assert.equal(id("/adminx"), undefined);
  assert.equal(id("/tienda"), undefined);
});

test("sub-rutas de hoy caen en su app", () => {
  assert.equal(id("/admin/turnos/lista"), "agenda");
  assert.equal(id("/admin/clientes/c-123"), "clientes");
  assert.equal(id("/admin/caja/libro"), "libro-de-caja");
  assert.equal(id("/admin/caja/cierre?dia=2026-09-22"), "cierre-del-dia");
  assert.equal(id("/admin/caja"), "caja-del-dia");
  assert.equal(id("/admin/cuentas-a-cobrar/r-1"), "cuentas-a-cobrar");
  assert.equal(id("/admin/cuentas-a-pagar/p-1"), "cuentas-a-pagar");
  assert.equal(id("/admin/libros"), "libro-iva");
  assert.equal(id("/admin/devoluciones-proveedor"), "devoluciones-a-proveedor");
  assert.equal(id("/admin/no-disponible?app=facturacion"), "app-no-disponible");
});

test("normalizarRuta saca query, hash y la barra final", () => {
  assert.equal(normalizarRuta("/admin/caja/?x=1#y"), "/admin/caja");
  assert.equal(normalizarRuta("/admin/"), "/admin");
  assert.equal(normalizarRuta("/"), "/");
});

// ── El gate por URL del Comerciante (layout.tsx) y las apps nuevas del registro ─

/** El gate tal como lo arma layout.tsx para un producto con tienda. */
const pasaElGate = (path: string, modules: readonly string[]) =>
  rutaPermitidaParaModulos(path, modules) || rutaDeAppDelNegocio(path, modules);

const COMERCIANTE = ["arca", "bancos", "mercadopago", "clients", "reports"];

test("Comerciante con `pos`: Vender y Ventas del día pasan; sin `pos`, rebotan como antes", () => {
  for (const p of ["/admin/vender", "/admin/ventas", "/admin/ventas?dia=2026-09-22"]) {
    assert.equal(rutaPermitidaParaModulos(p, [...COMERCIANTE, "pos"]), false, `${p}: la barra de hoy no la conoce`);
    assert.equal(pasaElGate(p, [...COMERCIANTE, "pos"]), true, p);
    assert.equal(pasaElGate(p, COMERCIANTE), false, p);
  }
});

test("una casa Comerciante con `multilocal`: Mis locales y sus sub-apps pasan; sin el módulo, no", () => {
  const casa = [...COMERCIANTE, "multilocal"];
  for (const p of ["/admin/locales", "/admin/locales/ventas", "/admin/locales/cajas", "/admin/locales/stock"]) {
    assert.equal(pasaElGate(p, casa), true, p);
    assert.equal(pasaElGate(p, COMERCIANTE), false, p);
  }
});

test("el gate no se afloja con lo que el Comerciante no tiene, ni con rutas que no son de nadie", () => {
  for (const p of ["/admin/turnos", "/admin/pedidos", "/admin/catalogo", "/admin/inventario", "/admin/libros", "/admin/inexistente"]) {
    assert.equal(pasaElGate(p, COMERCIANTE), false, p);
  }
});

// QA 26/09, bloqueante 1: en Comerciante y PyME, /admin/cierre-mes rebotaba al Inicio sin aviso
// y la bandeja del estudio mandaba a congelar el mes ahí. Cierre del mes es del núcleo: pasa el
// gate con los módulos REALES de cada plan (y la página sigue con su `requireApp`).
test("Cierre del mes (app del núcleo) pasa el gate por URL en todos los planes con tienda", () => {
  for (const plan of PLAN_IDS) {
    const modulos = planPorId(plan).modulos;
    for (const p of ["/admin/cierre-mes", "/admin/cierre-mes?mes=2026-08", "/admin/cierre-mes/paquete?mes=2026-08"]) {
      assert.equal(pasaElGate(p, modulos), true, `${plan}: ${p}`);
    }
  }
  assert.equal(rutaDeAppDelNegocio("/admin/cierre-mes", COMERCIANTE), true);
  // Las apps con módulo siguen exigiéndolo: aflojar el núcleo no abre lo que no se vendió.
  assert.equal(rutaDeAppDelNegocio("/admin/vender", COMERCIANTE), false);
  assert.equal(rutaDeAppDelNegocio("/admin/inexistente", COMERCIANTE), false);
});

test("el layout del panel arma el gate del Comerciante con las dos reglas", async () => {
  const { readFileSync } = await import("node:fs");
  const layout = readFileSync("src/app/admin/(dashboard)/layout.tsx", "utf8");
  assert.match(
    layout,
    /!rutaPermitidaParaModulos\(pathname, productoCtx\.modules\) &&\s*!rutaDeAppDelNegocio\(pathname, productoCtx\.modules\)/,
    "el gate por URL tiene que dejar pasar las apps del registro con su módulo asignado",
  );
});
