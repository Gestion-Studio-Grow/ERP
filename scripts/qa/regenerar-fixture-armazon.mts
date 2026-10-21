// Regenera armazon/__fixtures__/armazon-head.json con el AdminShell de hoy (el HTML que armazon-ch.test.ts compara byte a byte).
// Se corre a propósito cuando el armazón cambia por decisión (p. ej. tras un merge con conflicto en el fixture):
//   node --import tsx scripts/qa/regenerar-fixture-armazon.mts   y después   node --import tsx --test "src/app/admin/(dashboard)/armazon/armazon-ch.test.ts"
import { writeFileSync } from "node:fs";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
const R = "/home/user/ERP/src/app/admin/(dashboard)/";
const { default: AdminShell } = await import(R + "AdminShell.tsx");
const { escenarios } = await import(R + "armazon/escenarios-ch.ts");
const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
const out: Record<string, string> = {};
for (const e of escenarios()) {
  out[e.id] = renderToStaticMarkup(
    createElement(AppRouterContext.Provider, { value: router as never },
      createElement(SearchParamsContext.Provider, { value: new URLSearchParams() as never },
        createElement(PathnameContext.Provider, { value: e.ruta },
          createElement(AdminShell as ComponentType<Record<string, unknown>>, e.props, createElement("p", null, "contenido"))))));
}
writeFileSync(R + "armazon/__fixtures__/armazon-head.json", JSON.stringify(out, null, 1) + "\n");
console.log(Object.keys(out).length, "escenarios");
