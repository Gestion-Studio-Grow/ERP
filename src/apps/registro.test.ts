// ============================================================================
// EL REGISTRO DE APPS NO SE PUEDE ROMPER EN SILENCIO.
// ============================================================================
//
// El registro es la única lista de pantallas del panel: la barra, el Inicio, el buscador y
// la guardia de cada página salen de acá. Un id repetido haría que `requireApp` proteja la
// app equivocada; una ruta repetida, que `appDeRuta` elija al azar; un módulo mal escrito,
// que en el piloto la app no aparezca nunca. Estos tests ejecutan el registro REAL contra el
// catálogo de módulos REAL.

import { test } from "node:test";
import assert from "node:assert/strict";
import { REGISTRO_APPS, appPorId, buscarApp } from "./registro";
import { ESPACIOS } from "./espacios";
import type { AppDescriptor } from "./contract";
import { catalogo } from "@/modules/catalog";

const RE_KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

test("ids únicos y en kebab-case", () => {
  const vistos = new Set<string>();
  for (const app of REGISTRO_APPS) {
    assert.match(app.id, RE_KEBAB, `id inválido: "${app.id}"`);
    assert.ok(!vistos.has(app.id), `id repetido: "${app.id}"`);
    vistos.add(app.id);
  }
});

test("rutas únicas, bajo /admin y sin barra final ni query", () => {
  const vistas = new Map<string, string>();
  for (const app of REGISTRO_APPS) {
    assert.ok(app.ruta === "/admin" || app.ruta.startsWith("/admin/"), `${app.id}: ruta fuera del panel`);
    assert.ok(!/[?#]/.test(app.ruta) && !(app.ruta.length > 1 && app.ruta.endsWith("/")), `${app.id}: ruta sin normalizar`);
    const otra = vistas.get(app.ruta);
    assert.equal(otra, undefined, `la ruta ${app.ruta} la declaran "${otra}" y "${app.id}"`);
    vistas.set(app.ruta, app.id);
  }
});

test("el módulo de cada app existe en el catálogo de módulos", () => {
  const modulos = catalogo();
  for (const app of REGISTRO_APPS) {
    if (app.modulo === null) continue;
    assert.ok(modulos.tiene(app.modulo), `${app.id}: el módulo "${app.modulo}" no existe en el catálogo`);
  }
});

test("moduloDuro exige un módulo, y toda app de Mis locales es moduloDuro", () => {
  for (const app of REGISTRO_APPS) {
    if (app.moduloDuro) assert.notEqual(app.modulo, null, `${app.id}: moduloDuro sin módulo no protege nada`);
    // Mis locales lee datos de OTRO negocio: esconderla no alcanza.
    if (app.espacio === "locales") assert.equal(app.moduloDuro, true, `${app.id}: lee otros negocios y no es moduloDuro`);
  }
});

test("ninguna app declara scopeItems ni campos fuera del contrato", () => {
  // `ScopeItem.ruta` (src/modules/contract.ts) era la sexta lista de pantallas. Una app no
  // la declara: el contrato de app es cerrado y se verifica en tiempo de ejecución, por si
  // alguien castea un objeto a AppDescriptor.
  const CAMPOS = new Set<keyof AppDescriptor>([
    "id", "nombre", "descripcion", "icono", "ruta", "exacta", "espacio", "capability", "modulo",
    "moduloDuro", "rubro", "perfilMin", "estado", "kpi", "palabras", "menuDeHoy", "enLanzador",
  ]);
  for (const app of REGISTRO_APPS) {
    for (const campo of Object.keys(app)) {
      assert.ok(CAMPOS.has(campo as keyof AppDescriptor), `${app.id}: campo "${campo}" fuera del contrato`);
    }
  }
});

test("trinquete: ningún módulo NUEVO declara scopeItems[].ruta", () => {
  // Las rutas de los descriptores de hoy quedan hasta la limpieza (ola 4). Un módulo nuevo
  // (multilocal, por ejemplo) declara sus pantallas como apps en src/apps/catalogo, nunca
  // como `scopeItems[].ruta`: sería volver a tener dos listas.
  const HOY: Record<string, readonly string[]> = {
    agenda: ["/admin/turnos"],
    pos: ["/admin/caja", "/admin/pedidos"],
    catalog: ["/admin/catalogo", "/admin/ajustes", "/admin/compras"],
    clients: ["/admin/clientes"],
    waitlist: ["/admin/espera"],
    reminders: ["/admin/recordatorios"],
    reports: ["/admin/reportes"],
    campanias: ["/obsequio", "/admin/campania"],
    reviews: ["/admin/resenas"],
    inventario: ["/admin/inventario"],
    "cuentas-a-pagar": ["/admin/cuentas-a-pagar"],
    "cuentas-a-cobrar": ["/admin/cuentas-a-cobrar"],
    libros: ["/admin/libros"],
    "devoluciones-proveedor": ["/admin/devoluciones-proveedor"],
    arca: ["/admin/facturacion"],
    bancos: ["/admin/facturacion"],
    cartera: ["/contador"],
  };
  for (const d of catalogo().listar()) {
    const rutas = (d.scopeItems ?? []).flatMap((s) => (s.ruta ? [s.ruta] : []));
    const permitidas = new Set(HOY[d.id] ?? []);
    for (const r of rutas) {
      assert.ok(permitidas.has(r), `el módulo "${d.id}" declara scopeItems.ruta "${r}": declarala como app`);
    }
  }
});

test("cada app cae en un espacio que existe, y los órdenes de espacio no repiten apps", () => {
  const ids = new Set(ESPACIOS.map((e) => e.id));
  for (const app of REGISTRO_APPS) assert.ok(ids.has(app.espacio), `${app.id}: espacio "${app.espacio}" inexistente`);
  const listadas = ESPACIOS.flatMap((e) => e.apps);
  assert.equal(new Set(listadas).size, listadas.length, "una app figura en dos espacios");
  // Si una app registrada figura en el orden de un espacio, es en el SUYO: si no, el Inicio
  // la ordenaría por un espacio y la mostraría en otro. (Una app que no figura en ninguno
  // va al final del suyo; no hace falta tocar espacios.ts para sumarla.)
  for (const app of REGISTRO_APPS) {
    const donde = ESPACIOS.find((x) => x.apps.includes(app.id));
    if (donde) assert.equal(donde.id, app.espacio, `${app.id} está ordenada en "${donde.id}" pero es de "${app.espacio}"`);
  }
});

test("menuDeHoy: posiciones únicas; kpi: ids únicos", () => {
  const ordenes = REGISTRO_APPS.flatMap((a) => (a.menuDeHoy ? [a.menuDeHoy.orden] : []));
  assert.equal(new Set(ordenes).size, ordenes.length, "dos apps en la misma posición de la barra");
  const kpis = REGISTRO_APPS.flatMap((a) => (a.kpi ? [a.kpi.id] : []));
  assert.equal(new Set(kpis).size, kpis.length, "dos apps con el mismo kpi");
});

test("sólo el Inicio es exacta, y sólo 'App no disponible' se abre con la sesión sola", () => {
  assert.deepEqual(REGISTRO_APPS.filter((a) => a.exacta).map((a) => a.id), ["inicio"]);
  assert.deepEqual(REGISTRO_APPS.filter((a) => a.capability === null).map((a) => a.id), ["app-no-disponible"]);
  // Y "App no disponible" no se ofrece en ningún lanzador: se llega por redirect.
  assert.equal(appPorId("app-no-disponible").enLanzador, false);
});

test("las 28 apps de la ola 1 están registradas con su ruta de hoy", () => {
  const esperadas: Record<string, string> = {
    "app-no-disponible": "/admin/no-disponible",
    agenda: "/admin/turnos",
    "lista-de-espera": "/admin/espera",
    pedidos: "/admin/pedidos",
    "caja-del-dia": "/admin/caja",
    "cierre-del-dia": "/admin/caja/cierre",
    "libro-de-caja": "/admin/caja/libro",
    clientes: "/admin/clientes",
    campanias: "/admin/campania",
    recordatorios: "/admin/recordatorios",
    resenas: "/admin/resenas",
    catalogo: "/admin/catalogo",
    inventario: "/admin/inventario",
    "recibir-mercaderia": "/admin/compras",
    mermas: "/admin/ajustes",
    "lotes-y-vencimientos": "/admin/lotes",
    despiece: "/admin/despiece",
    "devoluciones-a-proveedor": "/admin/devoluciones-proveedor",
    facturacion: "/admin/facturacion",
    "facturacion-automatica": "/admin/facturacion/bancos",
    reportes: "/admin/reportes",
    "libro-iva": "/admin/libros",
    "cuentas-a-cobrar": "/admin/cuentas-a-cobrar",
    "cuentas-a-pagar": "/admin/cuentas-a-pagar",
    usuarios: "/admin/usuarios",
    auditoria: "/admin/auditoria",
    "datos-del-negocio": "/admin/localizacion",
    apariencia: "/admin/apariencia",
  };
  for (const [id, ruta] of Object.entries(esperadas)) {
    assert.equal(buscarApp(id)?.ruta, ruta, `${id}`);
  }
  // Las decisiones del brief, ejecutadas: caja/libro/cierre del núcleo, stock con
  // `inventario`, facturación automática con `bancos`.
  for (const id of ["caja-del-dia", "libro-de-caja", "cierre-del-dia"]) assert.equal(buscarApp(id)?.modulo, null, id);
  for (const id of ["inventario", "recibir-mercaderia", "mermas", "lotes-y-vencimientos", "despiece"]) {
    assert.equal(buscarApp(id)?.modulo, "inventario", id);
  }
  assert.equal(buscarApp("facturacion-automatica")?.modulo, "bancos");
  assert.equal(buscarApp("facturacion")?.modulo, "arca");
});

test("buscarApp no confía en lo que llega de afuera", () => {
  assert.equal(buscarApp(undefined), undefined);
  assert.equal(buscarApp(""), undefined);
  assert.equal(buscarApp("__proto__"), undefined);
  assert.equal(buscarApp("../facturacion"), undefined);
  assert.throws(() => appPorId("no-existe" as never));
});
