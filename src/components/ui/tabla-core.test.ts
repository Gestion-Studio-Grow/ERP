// La tabla densa sin DOM: orden y filtros en la URL, página por cursor, selección y teclado.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accionDeTecla,
  aperturaDeFila,
  alternarSeleccion,
  estadoDeTodas,
  hrefConParametros,
  moverFoco,
  ordenAUrl,
  ordenDesdeUrl,
  paginaConCursor,
  seleccionarRango,
  siguienteOrden,
} from "./tabla-core";

test("orden en la URL: `total` sube, `-total` baja, lo que no es ordenable no ordena", () => {
  assert.deepEqual(ordenDesdeUrl("total", ["total", "cliente"]), { key: "total", direction: "asc" });
  assert.deepEqual(ordenDesdeUrl("-total", ["total"]), { key: "total", direction: "desc" });
  assert.equal(ordenDesdeUrl("-createdAt; drop", ["total"]), null);
  assert.equal(ordenDesdeUrl(undefined, ["total"]), null);
  assert.equal(ordenAUrl({ key: "total", direction: "desc" }), "-total");
  assert.equal(ordenAUrl(null), null);
  // Ciclo: sube → baja → sin orden; otra columna arranca subiendo.
  assert.deepEqual(siguienteOrden(null, "total"), { key: "total", direction: "asc" });
  assert.deepEqual(siguienteOrden({ key: "total", direction: "asc" }, "total"), { key: "total", direction: "desc" });
  assert.equal(siguienteOrden({ key: "total", direction: "desc" }, "total"), null);
  assert.deepEqual(siguienteOrden({ key: "total", direction: "desc" }, "cliente"), { key: "cliente", direction: "asc" });
});

test("filtros en la URL: se cambian sin perder los otros, y un filtro nuevo vuelve a la primera página", () => {
  const actuales = { estado: "pendiente", canal: "tienda", cursor: "ord_50" };
  assert.equal(hrefConParametros("/admin/pedidos", actuales, { estado: "preparado" }), "/admin/pedidos?canal=tienda&estado=preparado");
  assert.equal(hrefConParametros("/admin/pedidos", actuales, { canal: null }), "/admin/pedidos?estado=pendiente");
  // Pasar de página conserva los filtros.
  assert.equal(hrefConParametros("/admin/pedidos", { estado: "pendiente" }, { cursor: "ord_50" }), "/admin/pedidos?estado=pendiente&cursor=ord_50");
  assert.equal(hrefConParametros("/admin/pedidos", {}, { estado: "" }), "/admin/pedidos");
  // También desde un URLSearchParams (el cliente) y con valores repetidos.
  const sp = new URLSearchParams("etiqueta=a&etiqueta=b&q=bife");
  assert.equal(hrefConParametros("/x", sp, { q: "vacío" }), "/x?etiqueta=a&etiqueta=b&q=vac%C3%ADo");
});

test("página por cursor: se piden N+1; si vino una de más hay siguiente y su cursor es la última mostrada", () => {
  const filas = Array.from({ length: 51 }, (_, i) => ({ id: `o${i}` }));
  const p = paginaConCursor(filas, 50, (f) => f.id);
  assert.equal(p.filas.length, 50);
  assert.equal(p.siguiente, "o49");
  const ultima = paginaConCursor(filas.slice(0, 12), 50, (f) => f.id);
  assert.equal(ultima.filas.length, 12);
  assert.equal(ultima.siguiente, null);
  assert.equal(paginaConCursor([], 50, (f: { id: string }) => f.id).siguiente, null);
});

test("selección: alternar, rango con Mayúsculas en el orden de la pantalla, y la casilla de todas", () => {
  const orden = ["a", "b", "c", "d", "e"];
  let sel = alternarSeleccion(new Set(), "b");
  assert.deepEqual([...sel], ["b"]);
  sel = seleccionarRango(sel, orden, "b", "d");
  assert.deepEqual([...sel].sort(), ["b", "c", "d"]);
  // El rango toma el estado de la tocada: si ya estaba marcada, saca el rango.
  sel = seleccionarRango(sel, orden, "d", "c");
  assert.deepEqual([...sel], ["b"]);
  // Sin «desde», es un toque común.
  assert.deepEqual([...seleccionarRango(new Set(), orden, null, "e")], ["e"]);
  assert.equal(estadoDeTodas(new Set(), orden), "ninguna");
  assert.equal(estadoDeTodas(new Set(["a"]), orden), "algunas");
  assert.equal(estadoDeTodas(new Set(orden), orden), "todas");
  // Lo seleccionado que ya no está en la pantalla (otro filtro) no cuenta para la casilla.
  assert.equal(estadoDeTodas(new Set(["z"]), orden), "ninguna");
});

test("teclado: j/k y flechas mueven, x selecciona, Enter abre, ⇧A todo, Esc limpia, la letra de contexto ejecuta", () => {
  assert.deepEqual(accionDeTecla({ key: "j" }), { tipo: "mover", delta: 1 });
  assert.deepEqual(accionDeTecla({ key: "ArrowUp" }), { tipo: "mover", delta: -1 });
  assert.deepEqual(accionDeTecla({ key: "x" }), { tipo: "seleccionar" });
  assert.deepEqual(accionDeTecla({ key: "Enter" }), { tipo: "abrir" });
  assert.deepEqual(accionDeTecla({ key: "A", shiftKey: true }), { tipo: "todas" });
  assert.deepEqual(accionDeTecla({ key: "Escape" }), { tipo: "limpiar" });
  assert.deepEqual(accionDeTecla({ key: "p" }, ["p"]), { tipo: "tecla", letra: "p" });
  // Lo que no es de la tabla pasa de largo: Ctrl/⌘K, F2, una letra sin tecla de contexto.
  assert.equal(accionDeTecla({ key: "k", ctrlKey: true }), null);
  assert.equal(accionDeTecla({ key: "k", metaKey: true }), null);
  assert.equal(accionDeTecla({ key: "F2" }), null);
  assert.equal(accionDeTecla({ key: "p" }), null);
  assert.equal(moverFoco(-1, 1, 5), 0);
  assert.equal(moverFoco(-1, -1, 5), 4);
  assert.equal(moverFoco(4, 1, 5), 4);
  assert.equal(moverFoco(0, -1, 5), 0);
  assert.equal(moverFoco(2, 1, 0), -1);
});

test("abrir una fila: con ficha va a la ficha; sin ficha, la abre en el cajón de la pantalla; sin ninguna de las dos, nada", () => {
  assert.deepEqual(aperturaDeFila("/admin/clientes/c1", false), { tipo: "enlace", href: "/admin/clientes/c1" });
  // La ficha gana aunque la pantalla también sepa abrir el cajón.
  assert.deepEqual(aperturaDeFila("/admin/clientes/c1", true), { tipo: "enlace", href: "/admin/clientes/c1" });
  assert.deepEqual(aperturaDeFila(null, true), { tipo: "cajon" });
  assert.deepEqual(aperturaDeFila(undefined, true), { tipo: "cajon" });
  assert.deepEqual(aperturaDeFila("", true), { tipo: "cajon" });
  assert.equal(aperturaDeFila(null, false), null);
});
