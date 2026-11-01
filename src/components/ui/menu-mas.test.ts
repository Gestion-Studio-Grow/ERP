// «Más»: el menú se ubica arriba del botón si abajo no entra. En un navegador, un popover cerrado
// es `display: none` y mide 0: el doble de jsdom mide igual, así la prueba cae si se mide cerrado.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { after, before, test } from "node:test";

const requerir = createRequire(join(process.cwd(), "package.json"));
const { JSDOM } = requerir("jsdom");
const dom = new JSDOM('<!doctype html><body><div id="r"></div></body>', { url: "http://x.test/" });
const g = globalThis as unknown as Record<string, unknown>;
for (const k of ["window", "document", "HTMLElement", "Element", "Node", "Event", "MouseEvent"]) {
  Object.defineProperty(g, k, { value: k === "window" ? dom.window : dom.window[k], configurable: true, writable: true });
}
Object.defineProperty(g, "navigator", { value: dom.window.navigator, configurable: true });
g.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.innerHeight = 844; // Un celular de 390 × 844.
dom.window.innerWidth = 390;

/* eslint-disable @typescript-eslint/no-explicit-any */
let React: any, act: any, MenuMas: any, raiz: any;
before(async () => {
  React = await import("react");
  act = React.act;
  ({ MenuMas } = await import("./MenuMas"));
  const { createRoot } = await import("react-dom/client");
  raiz = createRoot(dom.window.document.getElementById("r"));
  await act(async () => raiz.render(React.createElement(MenuMas, { etiqueta: "Más" }, React.createElement("button", null, "Anular…"))));
});
after(async () => {
  await act(async () => raiz.unmount());
  dom.window.close();
});

async function abrirConElBotonEn(bottom: number) {
  const doc = dom.window.document;
  const menu = doc.querySelector('[data-ui="menu"]') as HTMLElement;
  const boton = doc.querySelector('[data-ui="mas"]') as HTMLElement;
  boton.getBoundingClientRect = () => ({ top: bottom - 44, bottom, right: 380, left: 336 }) as DOMRect;
  Object.defineProperty(menu, "offsetHeight", { configurable: true, get: () => (menu.style.display === "block" ? 120 : 0) });
  const e = new dom.window.Event("beforetoggle");
  e.newState = "open";
  await act(async () => void menu.dispatchEvent(e));
  return menu;
}

test("en la última fila el menú abre para arriba y entra en la pantalla", async () => {
  const menu = await abrirConElBotonEn(800);
  assert.equal(menu.style.top, `${800 - 44 - 4 - 120}px`);
  assert.ok(parseFloat(menu.style.top) + 120 <= 844);
});

test("con lugar abajo abre abajo, y medir no le deja estilos pegados", async () => {
  const menu = await abrirConElBotonEn(100);
  assert.equal(menu.style.top, "104px");
  assert.equal(menu.style.display, "");
  assert.equal(menu.style.visibility, "");
});
