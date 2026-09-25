import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { esCampo, hayAlgoEncima, teclaDeLaPantalla } from "./tecla-de-pantalla";

// Sin navegador: un HTMLElement y un document mínimos, con lo que la regla mira (tagName,
// isContentEditable, querySelector). Cada prueba decide qué hay abierto encima.
class ElementoFalso {
  constructor(
    public tagName: string,
    public isContentEditable = false,
  ) {}
}
let abierto: string | null = null;
let sinPopover = false;
const g = globalThis as unknown as { HTMLElement?: unknown; document?: unknown };
g.HTMLElement = ElementoFalso;
g.document = {
  querySelector(sel: string) {
    if (sel === ":popover-open" && sinPopover) throw new SyntaxError("selector desconocido");
    return sel === abierto ? {} : null;
  },
};
afterEach(() => {
  abierto = null;
  sinPopover = false;
});

const tecla = (target: unknown, mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey", boolean>> = {}) =>
  teclaDeLaPantalla({ ctrlKey: false, metaKey: false, altKey: false, target: target as EventTarget, ...mods });

test("escribir en un campo no es un atajo: input, textarea, select y texto editable", () => {
  for (const t of ["INPUT", "TEXTAREA", "SELECT"]) assert.equal(esCampo(new ElementoFalso(t) as unknown as EventTarget), true);
  assert.equal(esCampo(new ElementoFalso("DIV", true) as unknown as EventTarget), true);
  assert.equal(esCampo(new ElementoFalso("BUTTON") as unknown as EventTarget), false);
  assert.equal(esCampo(null), false);
});

test("con un diálogo o un desplegable abierto, las teclas son de él", () => {
  assert.equal(hayAlgoEncima(), false);
  abierto = "dialog[open]";
  assert.equal(hayAlgoEncima(), true);
  abierto = ":popover-open";
  assert.equal(hayAlgoEncima(), true);
});

test("un navegador sin :popover-open no rompe: sin diálogo, no hay nada encima", () => {
  sinPopover = true;
  assert.equal(hayAlgoEncima(), false);
});

test("la tecla es de la pantalla sólo sin modificadores, fuera de un campo y sin nada encima", () => {
  const boton = new ElementoFalso("BUTTON");
  assert.equal(tecla(boton), true);
  assert.equal(tecla(boton, { ctrlKey: true }), false, "Ctrl/⌘K es del buscador");
  assert.equal(tecla(boton, { metaKey: true }), false);
  assert.equal(tecla(boton, { altKey: true }), false);
  assert.equal(tecla(new ElementoFalso("INPUT")), false);
  abierto = "dialog[open]";
  assert.equal(tecla(boton), false);
});
