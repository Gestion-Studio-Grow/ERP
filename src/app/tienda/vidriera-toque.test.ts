// ============================================================================
// LA VIDRIERA SE TOCA CON EL DEDO: ningún botón de la tienda por debajo de 44 px.
// ============================================================================
//
// El gate «visual-aa» (scripts/qa/visual-audit.mjs) marcó 11 botones chicos en la vidriera de
// velas en el celular (home y /tienda son la misma pantalla: la home de un negocio de mostrador
// redirige a /tienda) y lo mismo en la de pádel: el «+» de cada producto medía 34 px, el
// «WhatsApp» del pie era una línea de texto de 20 px, el «Lo quiero →» de los sets 24 px y el
// select de retiro/envío ~40 px. Quien compra desde el celular, con una mano, erra el «+».
//
// Se mide igual que el gate, sin servidor: la vidriera REAL (Storefront.tsx) renderizada con
// react-dom/server, con el CSS REAL (globals.css compilado con Tailwind), en Chromium a 412 px, y
// la MISMA función de medición del gate (`auditInPage`, vía src/test/navegador.ts).

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Browser } from "playwright";
import { getRetailRubro } from "@/blueprints/retail/rubros";
import { getStorefrontCopy } from "@/tenants/storefront";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { abrirNavegador, medirComoElGate, TOQUE_MIN } from "@/test/navegador";

// La vidriera importa las acciones del pedido (order-actions, con `server-only`): se resuelven como
// en el servidor de Next y la vidriera se importa después (en el `before`).
let Storefront: typeof import("./Storefront").default;

/** El catálogo del negocio demo del gate: los 10 primeros productos del rubro (prisma/seed-qa-tenants.ts). */
function productosDelRubro(rubro: string) {
  const catalogo = getRetailRubro(rubro)?.catalog ?? [];
  return catalogo.slice(0, 10).map((it, i) => ({
    id: `p${i}`,
    name: it.name,
    saleUnit: it.sale === "kg" ? ("WEIGHT" as const) : ("UNIT" as const),
    price: it.sale === "u" ? it.price : null,
    pricePerKg: it.sale === "kg" ? it.pricePerKg : null,
    unit: it.sale === "kg" ? "kg" : "unidades",
  }));
}

const BRANDING = {
  shortLabel: "Velas DEMO · DEMO",
  city: "Buenos Aires",
  addressLine: null,
  hoursLabel: null,
  whatsapp: null,
  instagram: null,
  email: null,
  contactNote: "DEMO — datos ficticios para QA.",
};

/** La vidriera como la sirve /tienda: markup del servidor, sin hidratar (los botones ya están). */
function vidriera(rubro: string, slug: string, acento: string): string {
  const r = getRetailRubro(rubro);
  assert.ok(r, `rubro ${rubro}`);
  return renderToStaticMarkup(
    createElement(Storefront, {
      name: `${rubro} DEMO`,
      branding: BRANDING,
      wording: r.wording,
      copy: getStorefrontCopy(slug),
      products: productosDelRubro(rubro),
      accent: acento,
      tenantKey: slug,
    }),
  );
}

describe("La vidriera en el celular: todo lo que se toca mide 44 px o más", { timeout: 120_000 }, () => {
  let browser: Browser | null = null;
  let css = "";
  let sinNavegador = "";

  before(async () => {
    prepararAccionesDeServidor();
    Storefront = (await import("./Storefront")).default;
    const n = await abrirNavegador();
    if ("sinNavegador" in n) sinNavegador = n.sinNavegador;
    else ({ browser, css } = n);
  });

  after(async () => {
    await browser?.close();
  });

  for (const [rubro, slug, acento] of [
    ["velas", "velas-demo", "#9a6a1f"],
    ["padel", "padel-demo", "#2f7d66"],
    // Con copy propio (líneas «Hacer pedido →» y sets «Lo quiero →»): la vidriera de A Dos Manos.
    ["padel", "adosmanos", "#2f7d66"],
  ] as const) {
    test(`vidriera de ${slug}: ningún botón chico, texto legible y sin scroll de costado`, async (t) => {
      if (sinNavegador) return t.skip(sinNavegador);
      const r = await medirComoElGate(browser!, css, `<div class="bg-surface">${vidriera(rubro, slug, acento)}</div>`);
      const chicos = r.touchFails.map((f) => `${f.text || f.selector} ${f.w}×${f.h}`);
      assert.deepEqual(chicos, [], `botones de menos de ${TOQUE_MIN} px:\n${chicos.join("\n")}`);
      const ilegibles = r.contrastFails.map((c) => `${c.text} ${c.ratio}`);
      assert.deepEqual(ilegibles, [], `texto por debajo de AA:\n${ilegibles.join("\n")}`);
      assert.ok(!r.overflow || r.overflow.scrollWidth <= r.overflow.innerWidth + 2, "la vidriera no se corre de costado a 412 px");
    });
  }
});
