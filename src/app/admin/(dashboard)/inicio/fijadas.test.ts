// "Mis apps" y la barra de abajo del celular, ejecutadas con el registro REAL y la decisión REAL
// de quién ve qué (`appsVisibles`): qué se puede fijar, el tope de 8, que la cookie de otra
// persona no se hereda, que una app que se dejó de ver desaparece, y qué espacios van abajo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogo } from "@/modules/catalog";
import type { Role } from "@/lib/capabilities";
import { appsVisibles, resolverContextoApps, type NegocioApps } from "@/apps/visibles";
import { REGISTRO_APPS } from "@/apps/registro";
import { appDeRuta } from "@/apps/rutas";
import {
  aplicarCambio,
  APP_QUE_NO_VES,
  escribirFijadas,
  fijadasVisibles,
  leerFijadas,
  MAX_FIJADAS,
  YA_TENES_EL_MAXIMO,
} from "@/lib/apps-fijadas";
import { ESPACIOS_EN_LA_BARRA, enOrdenDePantalla, espacioDeRuta, espaciosDeLaBarra, seccionesDelInicio } from "./secciones";

const MODULOS_MAGRA = ["pos", "catalog", "clients", "reports", "arca", "inventario"];

function magra(role: Role): NegocioApps {
  const contexto = resolverContextoApps(
    { id: "t-magra", slug: "magra", blueprintId: "carniceria", modules: MODULOS_MAGRA },
    { registroGlobal: false, enInicioPorApps: true },
    catalogo(),
  );
  return { role, contexto, modulosAsignados: MODULOS_MAGRA, perfil: null, esMostrador: true, carniceriaLista: false };
}

const ids = (apps: readonly { id: string }[]) => apps.map((a) => a.id);

test("fijar 'Vender': queda guardada para esa persona y aparece en Mis apps", () => {
  const visibles = appsVisibles(magra("OWNER"));
  const r = aplicarCambio([], { accion: "fijar", appId: "vender" }, visibles);
  assert.ok(r.ok);
  assert.deepEqual(r.ids, ["vender"]);
  const cookie = escribirFijadas("u_duenia", r.ids);
  // "Recargar": el Inicio lee la cookie y la cruza con lo que ve.
  assert.deepEqual(ids(fijadasVisibles(leerFijadas(cookie, "u_duenia"), visibles)), ["vender"]);
});

test("la cookie es de UNA persona: si en la misma computadora entra otra, no hereda las fijadas", () => {
  const cookie = escribirFijadas("u_duenia", ["vender", "caja-del-dia"]);
  assert.deepEqual(leerFijadas(cookie, "u_duenia"), ["vender", "caja-del-dia"]);
  assert.deepEqual(leerFijadas(cookie, "u_cajera"), []);
  // Un prefijo no alcanza: "u_due" no es "u_duenia".
  assert.deepEqual(leerFijadas(cookie, "u_due"), []);
  // Un id de persona con puntos también se lee.
  assert.deepEqual(leerFijadas(escribirFijadas("demo.owner", ["vender"]), "demo.owner"), ["vender"]);
  assert.deepEqual(leerFijadas(escribirFijadas("demo.owner", ["vender"]), "owner"), []);
});

test("sin cookie (otro navegador de la misma persona) no hay fijadas: es lo esperado", () => {
  assert.deepEqual(leerFijadas(undefined, "u_duenia"), []);
  assert.deepEqual(leerFijadas("", "u_duenia"), []);
});

test("una cookie editada a mano no hace aparecer apps que la persona no ve", () => {
  const recepcion = appsVisibles(magra("RECEPTION"));
  // Facturación es de la dueña: la recepción no la ve aunque la escriba en la cookie.
  const cookie = escribirFijadas("u_cajera", ["facturacion", "vender", "no-existe", "<script>", "VENDER", "a--b"]);
  const leidas = leerFijadas(cookie, "u_cajera");
  assert.deepEqual(leidas, ["facturacion", "vender", "no-existe"], "sólo ids con forma de id");
  // Un punto en la parte de las ids (edición a mano) invalida la cookie entera.
  assert.deepEqual(leerFijadas("u_cajera.vender,../admin", "u_cajera"), []);
  assert.deepEqual(ids(fijadasVisibles(leidas, recepcion)), ["vender"]);
  // Y tampoco se puede fijar por la action.
  const r = aplicarCambio([], { accion: "fijar", appId: "facturacion" }, recepcion);
  assert.deepEqual(r, { ok: false, error: APP_QUE_NO_VES });
});

test("las pantallas que no se ofrecen (App no disponible) no se pueden fijar", () => {
  const visibles = appsVisibles(magra("OWNER"));
  assert.deepEqual(aplicarCambio([], { accion: "fijar", appId: "app-no-disponible" }, visibles), {
    ok: false,
    error: APP_QUE_NO_VES,
  });
});

test(`tope de ${MAX_FIJADAS}: la novena no entra y el mensaje dice cómo seguir`, () => {
  const visibles = appsVisibles(magra("OWNER"));
  assert.ok(visibles.length > MAX_FIJADAS, "MAGRA tiene más apps que el tope");
  const ocho = ids(visibles.slice(0, MAX_FIJADAS));
  const r = aplicarCambio(ocho, { accion: "fijar", appId: visibles[MAX_FIJADAS].id }, visibles);
  assert.deepEqual(r, { ok: false, error: YA_TENES_EL_MAXIMO });
  assert.match(YA_TENES_EL_MAXIMO, /Quitá una/);
  // Una cookie con más de 8 (editada) se lee con el tope.
  assert.equal(leerFijadas(escribirFijadas("u", ids(visibles)), "u").length, MAX_FIJADAS);
});

test("fijar dos veces no duplica, y quitar la saca aunque ya no se vea", () => {
  const visibles = appsVisibles(magra("OWNER"));
  const dos = aplicarCambio(["vender"], { accion: "fijar", appId: "vender" }, visibles);
  assert.ok(dos.ok);
  assert.deepEqual(dos.ids, ["vender"]);
  const recepcion = appsVisibles(magra("RECEPTION"));
  const sin = aplicarCambio(["vender", "facturacion"], { accion: "quitar", appId: "facturacion" }, recepcion);
  assert.ok(sin.ok);
  assert.deepEqual(sin.ids, ["vender"]);
});

test("una app que se dejó de ver sale de Mis apps y libera su lugar en el tope", () => {
  const duenia = appsVisibles(magra("OWNER"));
  const recepcion = appsVisibles(magra("RECEPTION"));
  // Era dueña, fijó 8 (entre ellas Facturación); ahora es recepción.
  const ocho = ["facturacion", ...ids(recepcion).filter((id) => id !== "vender").slice(0, MAX_FIJADAS - 1)];
  assert.equal(ocho.length, MAX_FIJADAS);
  assert.ok(ocho.every((id) => duenia.some((a) => a.id === id)));
  assert.ok(!ids(fijadasVisibles(ocho, recepcion)).includes("facturacion"));
  const r = aplicarCambio(ocho, { accion: "fijar", appId: "vender" }, recepcion);
  assert.ok(r.ok, "Facturación ya no cuenta: hay lugar");
  assert.ok(!r.ids.includes("facturacion"));
  assert.equal(r.ids.at(-1), "vender");
});

test("los números se piden en orden de pantalla: Mis apps primero, sin repetir", () => {
  const n = magra("OWNER");
  const visibles = appsVisibles(n);
  const secciones = seccionesDelInicio(visibles, { esMostrador: true });
  const mis = fijadasVisibles(["inventario", "vender"], visibles);
  const orden = ids(enOrdenDePantalla(mis, secciones, visibles));
  assert.deepEqual(orden.slice(0, 2), ["inventario", "vender"]);
  assert.equal(new Set(orden).size, orden.length, "sin repetidos");
  assert.equal(orden.length, visibles.length, "están todas las visibles");
});

test("barra de abajo: los 4 primeros espacios de la persona, con rótulo corto, y el buscador aparte", () => {
  const duenia = espaciosDeLaBarra(appsVisibles(magra("OWNER")), { esMostrador: true });
  assert.equal(duenia.length, ESPACIOS_EN_LA_BARRA);
  assert.deepEqual(
    duenia.map((e) => [e.id, e.rotulo]),
    [
      ["mostrador", "Mostrador"],
      ["caja", "Caja"],
      ["clientes", "Clientes"],
      ["precios", "Catálogo"],
    ],
  );
  // El nombre entero queda para la hoja y para el lector de pantalla, y contiene el rótulo.
  assert.ok(duenia.every((e) => e.nombre.toLowerCase().includes(e.rotulo.toLowerCase())));
  // Cada espacio lleva sus apps, en el orden del Inicio.
  assert.deepEqual(ids(duenia[1].apps).slice(0, 1), ["caja-del-dia"]);

  const recepcion = espaciosDeLaBarra(appsVisibles(magra("RECEPTION")), { esMostrador: true });
  assert.deepEqual(
    recepcion.map((e) => e.rotulo),
    ["Mostrador", "Caja", "Clientes", "Stock"],
    "la recepción no ve Catálogo y precios: su cuarto espacio es Stock",
  );
  assert.ok(recepcion.flatMap((e) => ids(e.apps)).every((id) => id !== "facturacion"));
});

test("barra de abajo en una estética: el primero es Recepción, con la agenda de ícono", () => {
  const n: NegocioApps = { role: "OWNER", contexto: null, modulosAsignados: [], perfil: null, esMostrador: false, carniceriaLista: false };
  const [primero] = espaciosDeLaBarra(appsVisibles(n), { esMostrador: false });
  assert.equal(primero.nombre, "Recepción");
  assert.equal(primero.icono, "agenda");
});

test("la barra marca el espacio de la pantalla actual; el Inicio no marca ninguno", () => {
  const visibles = appsVisibles(magra("OWNER"));
  assert.equal(espacioDeRuta("/admin/caja", visibles), "caja");
  assert.equal(espacioDeRuta("/admin/caja/cierre", visibles), "caja");
  assert.equal(espacioDeRuta("/admin/caja/", visibles), "caja");
  assert.equal(espacioDeRuta("/admin/clientes/abc123?tab=ventas", visibles), "clientes");
  assert.equal(espacioDeRuta("/admin/cajas", visibles), null, "por segmento: /admin/cajas no es Caja");
  assert.equal(espacioDeRuta("/admin", visibles), null);
  assert.equal(espacioDeRuta("/admin/no-disponible", visibles), null);
});

test("la barra busca el espacio igual que appDeRuta, sin llevar el registro al navegador", () => {
  // Con el registro entero tienen que dar lo mismo, en la raíz de cada app y un nivel abajo.
  for (const app of REGISTRO_APPS) {
    for (const p of [app.ruta, `${app.ruta}/x1`, `${app.ruta}?q=1`]) {
      const esperado = appDeRuta(p)?.espacio;
      assert.equal(
        espacioDeRuta(p, REGISTRO_APPS),
        esperado === undefined || esperado === "plataforma" ? null : esperado,
        p,
      );
    }
  }
});
