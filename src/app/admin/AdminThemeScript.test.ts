// El script anti-flash del tema: apagado (CH hoy) sale el <script> de siempre; con el diseño nuevo
// sale por ScriptDelTema, que deja el MISMO HTML del servidor (así corre antes de la primera
// pintura) y sólo cambia a `type="text/plain"` cuando el elemento nace en el navegador, que es
// cuando React avisaba «Encountered a script tag while rendering React component».

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AdminThemeScript from "./AdminThemeScript";
import { ScriptDelTema, tipoDelScriptDelTema } from "./ScriptDelTema";

test("apagado: el <script> de siempre, sin componente de cliente en el medio", () => {
  const el = AdminThemeScript({}) as ReactElement;
  assert.equal(el.type, "script");
  const el2 = AdminThemeScript({ nuevo: false }) as ReactElement;
  assert.equal(el2.type, "script");
});

test("prendido: sale por ScriptDelTema con el mismo código", () => {
  const apagado = AdminThemeScript({}) as ReactElement<{ dangerouslySetInnerHTML: { __html: string } }>;
  const prendido = AdminThemeScript({ nuevo: true }) as ReactElement<{ codigo: string }>;
  assert.equal(prendido.type, ScriptDelTema);
  assert.equal(prendido.props.codigo, apagado.props.dangerouslySetInnerHTML.__html);
});

test("el HTML del servidor es byte a byte el mismo prendido y apagado: el script corre al leerse", () => {
  const apagado = renderToStaticMarkup(AdminThemeScript({}) as ReactElement);
  const prendido = renderToStaticMarkup(createElement(AdminThemeScript, { nuevo: true }));
  assert.equal(prendido, apagado);
  assert.ok(apagado.startsWith("<script>"), apagado);
  assert.ok(!apagado.includes("type="), "sin type: el navegador lo ejecuta");
  assert.ok(apagado.includes('localStorage.getItem("gsg-admin-theme")'));
});

test("nacido en el navegador: bloque de datos (text/plain), que React no ejecuta ni avisa", () => {
  assert.equal(tipoDelScriptDelTema(true), undefined);
  assert.equal(tipoDelScriptDelTema(false), "text/plain");
});
