// Tests del buscador de navegación (`./nav-search.ts`). Node.js test runner —
// mismo estilo que `nav-groups.test.ts`: lógica PURA, sin render ni DOM.
//
// Lo que se blinda acá es el CONTRATO de la barra de búsqueda:
//   1. el orden (lo que arranca con lo tipeado va primero — si no, el Enter cae mal);
//   2. que no invente resultados con query vacía;
//   3. que ignore acentos (nadie los tipea buscando);
//   4. que NO decida visibilidad (buscar no puede revelar lo que el rol no ve).

import test from "node:test";
import assert from "node:assert/strict";
import { searchNavItems, normalizarBusqueda, rangoCoincidencia } from "./nav-search";
import { visibleNavItems } from "./perfil";
import { ALL_ITEMS } from "@/lib/admin-nav-items";

const ITEMS = [
  { href: "/admin", label: "Inicio" },
  { href: "/admin/turnos", label: "Agenda", alias: ["turnos", "reservas"] },
  { href: "/admin/caja", label: "Caja", alias: ["cobrar", "cierre"] },
  { href: "/admin/catalogo", label: "Catálogo", alias: ["precios", "servicios"] },
  { href: "/admin/espera", label: "Lista de espera" },
  { href: "/admin/facturacion", label: "Facturación", alias: ["arca", "afip", "factura"] },
];

test("normalizarBusqueda: minúsculas, sin acentos, sin espacios de borde", () => {
  assert.equal(normalizarBusqueda("  Facturación "), "facturacion");
  assert.equal(normalizarBusqueda("CATÁLOGO"), "catalogo");
  // La eñe TAMBIÉN se colapsa (ñ → n), a propósito: "resenas" tiene que encontrar
  // "Reseñas" y "campanas" tiene que encontrar "Campañas". Quien busca escribe
  // rápido y sin la tecla ñ; exigirla sería exigir que ya sepas cómo se escribe.
  assert.equal(normalizarBusqueda("Ñandú"), "nandu");
  assert.equal(normalizarBusqueda("Campañas"), "campanas");
});

test("query vacía devuelve [] — la barra sin texto no tapa la nav", () => {
  assert.deepEqual(searchNavItems(ITEMS, ""), []);
  assert.deepEqual(searchNavItems(ITEMS, "   "), []);
});

test("prefijo del label gana sobre coincidencia en el medio", () => {
  // "ca" arranca Caja y Catálogo; Facturación solo la contiene ("faCturaCion" no,
  // pero "buscar" sí en otros casos) → los prefijos van primero.
  const r = searchNavItems(ITEMS, "ca").map((i) => i.label);
  assert.deepEqual(r.slice(0, 2), ["Caja", "Catálogo"]);
});

test("prefijo de PALABRA interna encuentra 'Lista de espera' por 'esp'", () => {
  const r = searchNavItems(ITEMS, "esp").map((i) => i.href);
  assert.deepEqual(r, ["/admin/espera"]);
});

test("busca sin acentos: 'facturacion' encuentra 'Facturación'", () => {
  const r = searchNavItems(ITEMS, "facturacion").map((i) => i.href);
  assert.deepEqual(r, ["/admin/facturacion"]);
});

test("alias: 'afip' cae en Facturación aunque la palabra no esté en el rótulo", () => {
  const r = searchNavItems(ITEMS, "afip").map((i) => i.href);
  assert.deepEqual(r, ["/admin/facturacion"]);
});

test("el alias pierde contra el rótulo: 'cierre' no adelanta a un label que arranca igual", () => {
  const items = [
    { href: "/a", label: "Caja", alias: ["cierre"] },
    { href: "/b", label: "Cierre de mes" },
  ];
  assert.deepEqual(
    searchNavItems(items, "cierre").map((i) => i.href),
    ["/b", "/a"],
  );
});

test("empate de rango: manda el orden original de la nav, no el alfabético", () => {
  const items = [
    { href: "/z", label: "Reportes" },
    { href: "/a", label: "Recordatorios" },
  ];
  // Ambos rango 0 con "re" → sale primero el que la nav lista primero.
  assert.deepEqual(
    searchNavItems(items, "re").map((i) => i.href),
    ["/z", "/a"],
  );
});

test("sin coincidencia devuelve [] (no cae de vuelta a 'todos')", () => {
  assert.deepEqual(searchNavItems(ITEMS, "zzz"), []);
});

test("rangoCoincidencia: null cuando no matchea ni por label ni por alias", () => {
  assert.equal(rangoCoincidencia({ href: "/x", label: "Caja" }, "zzz"), null);
  assert.equal(rangoCoincidencia({ href: "/x", label: "Caja" }, ""), null);
});

test("NO decide visibilidad: buscar sobre la lista filtrada nunca revela lo del OWNER", () => {
  // El buscador se aplica SIEMPRE sobre los ítems ya filtrados por rol × módulo ×
  // perfil. Con la lista de RECEPTION, buscar "usuarios"/"auditoría" no devuelve
  // nada: esas pantallas son solo-OWNER y ni siquiera entran al índice.
  const visiblesRecepcion = visibleNavItems(ALL_ITEMS, {
    role: "RECEPTION",
    activeModules: null,
    activeProfile: null,
  });
  assert.deepEqual(searchNavItems(visiblesRecepcion, "usuarios"), []);
  assert.deepEqual(searchNavItems(visiblesRecepcion, "auditor"), []);
  // …y sobre la del OWNER sí aparecen (prueba de que el índice no está vacío).
  const visiblesOwner = visibleNavItems(ALL_ITEMS, {
    role: "OWNER",
    activeModules: null,
    activeProfile: null,
  });
  assert.deepEqual(
    searchNavItems(visiblesOwner, "usuarios").map((i) => i.href),
    ["/admin/usuarios"],
  );
});

test("todo ítem de ALL_ITEMS es alcanzable tipeando su propio rótulo", () => {
  // Valla anti-ítem-huérfano: si mañana entra un ítem con un label raro que el
  // matcher no encuentra, el buscador lo dejaría inaccesible en silencio.
  for (const item of ALL_ITEMS) {
    const encontrado = searchNavItems(ALL_ITEMS, item.label).some((i) => i.href === item.href);
    assert.ok(encontrado, `"${item.label}" (${item.href}) no se encuentra por su propio rótulo`);
  }
});
