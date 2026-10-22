// El atajo «/» del buscador global (reingeniería CH, Tanda 2): nunca le roba la barra a quien escribe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { comandosDelMenu, esAtajoDeBuscar, escribiendoEn, veLaAgenda } from "./buscar-global";

/** Un elemento de mentira: `closest` contesta como el DOM según en qué está metido. */
const el = (dentroDe: string[], editable = false) => ({
  isContentEditable: editable,
  closest: (sel: string) => (dentroDe.some((t) => sel.split(",").some((s) => s.trim().startsWith(t))) ? {} : null),
});
const tecla = (key: string, target: unknown, o: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; defaultPrevented: boolean; isComposing: boolean }> = {}) => ({
  key,
  target,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...o,
});

test("«/» suelta, sobre la página, abre el buscador", () => {
  assert.equal(esAtajoDeBuscar(tecla("/", el([]))), true);
  assert.equal(esAtajoDeBuscar(tecla("/", null)), true, "sin destino (window): también");
});

test("en un campo, un área de texto, un desplegable o algo editable, «/» se escribe", () => {
  for (const dentro of [["input"], ["textarea"], ["select"], ["[contenteditable]"]]) {
    assert.equal(esAtajoDeBuscar(tecla("/", el(dentro))), false, dentro[0]);
    assert.equal(escribiendoEn(el(dentro)), true);
  }
  assert.equal(esAtajoDeBuscar(tecla("/", el([], true))), false, "isContentEditable");
});

test("con Ctrl/⌘/Alt, si otro ya la atendió o mientras se compone un acento, no es nuestra", () => {
  for (const o of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { defaultPrevented: true }, { isComposing: true }]) {
    assert.equal(esAtajoDeBuscar(tecla("/", el([]), o)), false, JSON.stringify(o));
  }
  assert.equal(esAtajoDeBuscar(tecla("k", el([]))), false);
  assert.equal(esAtajoDeBuscar(tecla("?", el([]))), false);
});

test("sólo quien ve la agenda tiene clientas y turnos para buscar", () => {
  assert.equal(veLaAgenda(["/admin", "/admin/turnos", "/admin/caja"]), true);
  assert.equal(veLaAgenda(["/admin/turnos/lista"]), true);
  assert.equal(veLaAgenda(["/admin", "/admin/vender", "/admin/turnosx"]), false);
  assert.equal(veLaAgenda([]), false);
});

test("el menú de la persona viaja como apps de la paleta (lo que ya puede abrir, nada más)", () => {
  const c = comandosDelMenu([
    { href: "/admin/turnos", label: "Agenda" },
    { href: "/admin/caja", label: "Caja" },
  ]);
  assert.deepEqual(c, [
    { id: "menu-/admin/turnos", grupo: "apps", nombre: "Agenda", href: "/admin/turnos" },
    { id: "menu-/admin/caja", grupo: "apps", nombre: "Caja", href: "/admin/caja" },
  ]);
});
