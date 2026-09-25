// CH (beauty-spa) está en producción: con el interruptor «Diseño nuevo» APAGADO, el armazón del
// panel tiene que rendir EXACTAMENTE el HTML de HEAD (3a96b52). Esto lo EJECUTA: renderiza el
// AdminShell de hoy, sin el provider del diseño (como en un negocio apagado), para CH con sus tres
// roles, con la barra agrupada y para un negocio del piloto con la piel vieja, y lo compara byte a
// byte con el HTML que rindió el AdminShell de HEAD con los mismos props
// (__fixtures__/armazon-head.json, generado sacando `git show HEAD:…/AdminShell.tsx` al lado del de
// hoy y renderizándolo con escenarios-ch.ts). También con la navegación nueva pasada por error: sin
// el provider, se ignora.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import AdminShell from "../AdminShell";
import { escenarios } from "./escenarios-ch";
import { armarNavegacion } from "./navegacion";

const HEAD: Record<string, string> = JSON.parse(
  readFileSync(join(process.cwd(), "src/app/admin/(dashboard)/armazon/__fixtures__/armazon-head.json"), "utf8"),
);
const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };

function rendir(ruta: string, props: Record<string, unknown>): string {
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: router as never },
      createElement(
        SearchParamsContext.Provider,
        { value: new URLSearchParams() as never },
        createElement(
          PathnameContext.Provider,
          { value: ruta },
          createElement(AdminShell as ComponentType<Record<string, unknown>>, props, createElement("p", null, "contenido")),
        ),
      ),
    ),
  );
}

test("apagado, el armazón es el de HEAD byte a byte (CH con sus tres roles, agrupado, y el piloto)", () => {
  const todos = escenarios();
  assert.deepEqual(todos.map((e) => e.id).sort(), Object.keys(HEAD).sort(), "los mismos escenarios que el HTML de HEAD");
  for (const e of todos) assert.equal(rendir(e.ruta, e.props), HEAD[e.id], e.id);
});

test("apagado, aunque llegue la navegación nueva, se ignora: el armazón de siempre", () => {
  for (const e of escenarios()) {
    const nav = armarNavegacion({ visibles: e.props.apps, menu: e.props.menu, modoApps: e.props.modoApps, esMostrador: e.props.esMostrador, role: e.props.role });
    const html = rendir(e.ruta, { ...e.props, nav });
    assert.equal(html, HEAD[e.id], e.id);
    assert.ok(!html.includes('data-ui="cabecera"') && !html.includes('data-ui="capsula"'), `${e.id}: nada del armazón nuevo`);
  }
});
