// Las piezas de siempre, con la piel de siempre: MISMAS clases y mismo árbol que antes del diseño
// nuevo (HTML de HEAD 3a96b52, copiado acá). Lo único que se agregó son los atributos data-* que la
// piel «Renglón» usa para vestirlas; sin `data-diseno` en la raíz no pintan nada. Si alguien
// cambia una clase de una pieza compartida, CH cambia: este test lo frena.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Badge, Button, Card, Input } from "./index";

const sinPiel = (html: string) => html.replace(/ data-(ui|variant|size|tone|parte|interactive|estado|tono|importe)="[^"]*"/g, "");

const ANTES = {
  button:
    '<button type="button" class="inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap rounded-md transition-colors duration-150 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50 disabled:cursor-not-allowed bg-accent text-on-accent hover:bg-accent-hover active:translate-y-px shadow-xs disabled:opacity-100 disabled:bg-surface-sunken disabled:text-faint disabled:shadow-none h-11 px-5 text-sm tracking-wide">Cobrar</button>',
  danger:
    '<button type="button" class="inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap rounded-md transition-colors duration-150 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50 disabled:cursor-not-allowed bg-danger text-on-accent hover:opacity-90 active:translate-y-px shadow-xs h-11 sm:h-9 px-3 text-sm">Eliminar</button>',
  badge:
    '<span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium leading-5 tracking-wide tabular-nums bg-success-soft text-success"><span class="size-1.5 rounded-full bg-current opacity-70" aria-hidden="true"></span>Cobrado</span>',
  input:
    '<input class="w-full h-11 rounded-md border border-line-strong bg-surface-raised px-3 text-sm text-strong placeholder:text-faint transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-invalid:border-danger disabled:opacity-60 disabled:bg-surface-sunken" id="n"/>',
  card: '<div class="bg-surface-raised border border-line rounded-lg shadow-card p-5 sm:p-6">x</div>',
};

test("sin la piel nueva, las piezas rinden el HTML de siempre (más sus data-*)", () => {
  assert.equal(sinPiel(renderToStaticMarkup(h(Button, null, "Cobrar"))), ANTES.button);
  assert.equal(sinPiel(renderToStaticMarkup(h(Button, { variant: "danger", size: "sm" }, "Eliminar"))), ANTES.danger);
  assert.equal(sinPiel(renderToStaticMarkup(h(Badge, { tone: "success", dot: true }, "Cobrado"))), ANTES.badge);
  assert.equal(sinPiel(renderToStaticMarkup(h(Input, { id: "n" }))), ANTES.input);
  assert.equal(sinPiel(renderToStaticMarkup(h(Card, null, "x"))), ANTES.card);
});

test("los data-* que agrega la piel son los que la hoja espera", () => {
  const html = renderToStaticMarkup(h(Button, { variant: "outline", size: "lg" }, "Ver"));
  assert.match(html, /data-ui="button" data-variant="outline" data-size="lg"/);
  assert.match(renderToStaticMarkup(h(Badge, { tone: "warning" }, "Por cobrar")), /data-ui="badge" data-tone="warning"/);
});

test("lo nuevo del botón es opcional: sin usarlo, `children` va directo (sin envolturas)", () => {
  const html = renderToStaticMarkup(h(Button, null, "Cobrar"));
  assert.ok(!html.includes("data-parte"), html);
  const listo = renderToStaticMarkup(h(Button, { estado: "listo" }, "Guardar"));
  assert.match(listo, /data-estado="listo"/);
  assert.match(listo, /data-parte="listo"[^>]*>.*Listo/);
  const error = renderToStaticMarkup(h(Button, { estado: "error", motivo: "Sin señal" }, "Cobrar"));
  assert.match(error, /role="alert"[^>]*>.*Sin señal/);
  const cargando = renderToStaticMarkup(h(Button, { estado: "cargando" }, "Guardar"));
  assert.match(cargando, /aria-busy="true"/);
  assert.match(cargando, />Guardar<\/button>$/, "la palabra se queda");
});

test("SubmitButton sin la piel nueva: el botón de siempre, sin un atributo de más", async () => {
  const { default: SubmitButton } = await import("../SubmitButton");
  // HTML de HEAD: `<button type="submit" disabled={pending} className={`${className ?? ""} disabled:opacity-50`}>`.
  assert.equal(
    renderToStaticMarkup(h(SubmitButton, { className: "px-4", children: "Guardar" })),
    '<button type="submit" class="px-4 disabled:opacity-50">Guardar</button>',
  );
  // Aunque el llamador ya pase `variant` (lo nuevo), apagado no escribe nada de la piel.
  assert.equal(
    renderToStaticMarkup(h(SubmitButton, { className: "px-4", variant: "solid", size: "lg", children: "Guardar" })),
    '<button type="submit" class="px-4 disabled:opacity-50">Guardar</button>',
  );
});
