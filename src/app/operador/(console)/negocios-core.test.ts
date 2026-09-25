// La lista de negocios de la consola GSG, ejecutada con datos: vista, búsqueda, orden, palabras y
// la bandeja «Para atender». Sin base: negocios-core.ts es puro.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { ItemApertura, ResultadoApertura } from "@/lib/operador/checklist-apertura";
import {
  bandejaDeNegocios,
  coincideNegocio,
  contarVistas,
  filtrarNegocios,
  leerPestana,
  leerVista,
  ordenarNegocios,
  pestanaQueResuelve,
  planEnPalabras,
  rielDeApertura,
  rubroEnPalabras,
  estadoEnPalabras,
  type NegocioParaLista,
} from "./negocios-core";

const item = (id: ItemApertura["id"], label: string, ok: boolean | null, detalle = ""): ItemApertura => ({
  id,
  label,
  ok,
  detalle,
  porQue: "",
});
const apertura = (items: ItemApertura[]): ResultadoApertura => {
  const pendientes = items.filter((i) => i.ok === false).length;
  return { items, pendientes, listo: pendientes === 0 };
};

const LISTO = apertura([
  item("precios", "Precios propios", true),
  item("direccion", "Dirección del local", true),
  item("instagram", "Instagram", true),
  item("facturacion", "Listo para facturar", true),
  item("subdominio", "Link propio (subdominio)", true),
  item("usuarios", "Más de un usuario", true),
]);

const negocio = (p: Partial<NegocioParaLista> & Pick<NegocioParaLista, "id" | "nombre">): NegocioParaLista => ({
  slug: p.id,
  subdominio: p.id,
  estado: "TRIAL",
  plan: null,
  rubro: null,
  modulos: [],
  personas: 1,
  operaciones: 0,
  apertura: LISTO,
  conCandado: false,
  ...p,
});

const CH = negocio({ id: "beauty-spa", nombre: "CH Estética", subdominio: "chestetica", estado: "ACTIVE", personas: 4, operaciones: 544, conCandado: true });
const MAGRA = negocio({
  id: "magra",
  nombre: "MAGRA",
  plan: "pyme",
  rubro: "Retail · Carnicería boutique",
  modulos: ["pos", "multilocal"],
  personas: 2,
  operaciones: 483,
  apertura: apertura([
    item("precios", "Precios propios", true),
    item("direccion", "Dirección del local", false, "todavía la provisional"),
    item("instagram", "Instagram", false, "todavía el placeholder"),
    item("facturacion", "Listo para facturar", false, "falta el certificado ARCA"),
    item("subdominio", "Link propio (subdominio)", true),
    item("usuarios", "Más de un usuario", true),
  ]),
});
const SHINE = negocio({
  id: "shinevelas",
  nombre: "Shine Velas",
  rubro: "Retail · Velas & deco",
  personas: 2,
  operaciones: 298,
  apertura: apertura([item("precios", "Precios propios", null), item("facturacion", "Listo para facturar", false, "falta el CUIT del emisor"), item("usuarios", "Más de un usuario", true)]),
});
const ESTUDIO = negocio({ id: "estudio-lanus", nombre: "Estudio Lanús", modulos: ["cartera"], plan: "estudio" });
const PAUSADO = negocio({ id: "viejo", nombre: "Kiosco viejo", estado: "SUSPENDED", apertura: apertura([item("usuarios", "Más de un usuario", false)]) });
const TODOS = [CH, MAGRA, SHINE, ESTUDIO, PAUSADO];

test("las vistas cuentan cada estado y los pendientes para abrir", () => {
  assert.deepEqual(contarVistas(TODOS), { todos: 5, produccion: 1, prueba: 3, suspendidos: 1, pendientes: 3, estudios: 1 });
});

test("una vista que no existe cae en «Todos»; una pestaña que no existe, en «Puesta en marcha»", () => {
  assert.equal(leerVista("produccion"), "produccion");
  assert.equal(leerVista("cualquiera"), null);
  assert.equal(leerVista(undefined), null);
  assert.equal(leerPestana(["fiscal"]), "fiscal");
  assert.equal(leerPestana("../../etc"), "puesta");
});

test("la vista «en producción» deja sólo los negocios vivos", () => {
  assert.deepEqual(filtrarNegocios(TODOS, "produccion", "").map((n) => n.id), ["beauty-spa"]);
});

test("la vista «con pendientes» deja los que no están listos para abrir", () => {
  assert.deepEqual(filtrarNegocios(TODOS, "pendientes", "").map((n) => n.id), ["magra", "shinevelas", "viejo"]);
});

test("buscar encuentra por nombre, slug o link sin mayúsculas ni acentos", () => {
  assert.deepEqual(filtrarNegocios(TODOS, null, "estetica").map((n) => n.id), ["beauty-spa"]);
  assert.deepEqual(filtrarNegocios(TODOS, null, "CHESTE").map((n) => n.id), ["beauty-spa"]);
  assert.deepEqual(filtrarNegocios(TODOS, null, "lanús").map((n) => n.id), ["estudio-lanus"]);
  assert.deepEqual(filtrarNegocios(TODOS, "estudios", "magra"), []);
});

test("el buscador de la lista en el celular usa la misma regla que el servidor", () => {
  // Lo que la tabla filtra mientras se escribe tiene que dar lo mismo que la búsqueda con Enter.
  for (const q of ["", "  ", "estetica", "CHESTE", "lanús", "magra", "no-existe"]) {
    assert.deepEqual(
      TODOS.filter((n) => coincideNegocio(n, q)).map((n) => n.id),
      filtrarNegocios(TODOS, null, q).map((n) => n.id),
      `con «${q}»`,
    );
  }
  // Alcanza con nombre, slug y link: la fila de la tabla no trae más.
  assert.equal(coincideNegocio({ nombre: "CH Estética", slug: "beauty-spa", subdominio: null }, "ch est"), true);
  assert.equal(coincideNegocio({ nombre: "CH Estética", slug: "beauty-spa", subdominio: null }, "BEAUTY"), true);
  assert.equal(coincideNegocio({ nombre: "CH Estética", slug: "beauty-spa", subdominio: null }, "velas"), false);
});

test("ordenar por actividad de mayor a menor pone arriba al que más operó", () => {
  assert.deepEqual(ordenarNegocios(TODOS, "-actividad").map((n) => n.id).slice(0, 2), ["beauty-spa", "magra"]);
  assert.deepEqual(ordenarNegocios(TODOS, "-pendientes")[0].id, "magra");
  assert.deepEqual(ordenarNegocios(TODOS, "nombre").map((n) => n.nombre)[0], "CH Estética");
});

test("un orden que no se entiende no reordena", () => {
  assert.deepEqual(ordenarNegocios(TODOS, "-plata").map((n) => n.id), TODOS.map((n) => n.id));
});

test("el estado se dice en palabras, con su forma", () => {
  assert.deepEqual(estadoEnPalabras("ACTIVE"), { texto: "En producción", marca: "hecho" });
  assert.deepEqual(estadoEnPalabras("TRIAL"), { texto: "En prueba", marca: "pendiente" });
  assert.deepEqual(estadoEnPalabras("SUSPENDED"), { texto: "Suspendido", marca: "anulado" });
});

test("el plan sale del catálogo nuevo (provisional), de uno viejo, o dice «Sin plan»", () => {
  assert.deepEqual(planEnPalabras("pyme"), { texto: "PyME", nota: "provisional" });
  assert.deepEqual(planEnPalabras("trial"), { texto: "Prueba", nota: "plan viejo" });
  assert.deepEqual(planEnPalabras(null), { texto: "Sin plan", nota: null });
  assert.deepEqual(planEnPalabras("  "), { texto: "Sin plan", nota: null });
  assert.deepEqual(planEnPalabras("a medida"), { texto: "a medida", nota: null });
});

test("el rubro se lee sin el prefijo del blueprint", () => {
  assert.equal(rubroEnPalabras("Retail · Carnicería boutique"), "Carnicería boutique");
  assert.equal(rubroEnPalabras(null), "Sin rubro cargado");
});

test("cada pendiente abre la pestaña de la ficha que lo resuelve", () => {
  assert.equal(pestanaQueResuelve({ id: "facturacion" }), "fiscal");
  assert.equal(pestanaQueResuelve({ id: "usuarios" }), "personas");
  assert.equal(pestanaQueResuelve({ id: "direccion" }), "puesta");
});

test("la bandeja pone primero al que más debe y no pide nada a un suspendido", () => {
  const b = bandejaDeNegocios(TODOS);
  assert.deepEqual(b.map((r) => r.id), ["magra", "shinevelas"]);
  assert.equal(b[0].negocio, "MAGRA");
  assert.equal(b[0].pendientes, 3);
  assert.equal(b[0].detalle, "Falta: Dirección del local · Instagram · Listo para facturar");
  assert.deepEqual(b[0].tecla, { etiqueta: "Puesta en marcha", href: "/operador/tenants/magra?pestana=puesta" });
});

test("con un solo pendiente la bandeja dice cuál y su dato", () => {
  const [shine] = bandejaDeNegocios([SHINE]);
  assert.equal(shine.pendientes, 1);
  assert.equal(shine.detalle, "Todavía no puede facturar: falta el CUIT del emisor");
  assert.equal(shine.tecla.href, "/operador/tenants/shinevelas?pestana=fiscal");
});

test("el riel de «listo para abrir» cuenta sólo lo que aplica, los listos primero", () => {
  assert.deepEqual(rielDeApertura(SHINE.apertura), { hechos: 1, total: 2, pasos: ["Más de un usuario", "Listo para facturar"] });
  assert.equal(rielDeApertura(null), null);
});
