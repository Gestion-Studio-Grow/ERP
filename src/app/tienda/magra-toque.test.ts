// ============================================================================
// LA VIDRIERA DE MAGRA SE TOCA CON EL DEDO: ningún botón por debajo de 44 px.
// ============================================================================
//
// El gate «visual-aa» (scripts/qa/visual-audit.mjs) mide también la home y /tienda del negocio
// «magra» (prisma/seed-magra.ts, slug magra-demo): su vidriera es el front editorial propio
// (MagraFront.tsx), no la genérica. Se mide igual que el gate, sin servidor: el markup real con
// react-dom/server, el CSS real (globals.css compilado con Tailwind), Chromium a 412 px y la MISMA
// función de medición (`auditInPage`, vía src/test/navegador.ts).

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Browser } from "playwright";
import { getRetailRubro } from "@/blueprints/retail/rubros";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { abrirNavegador, medirComoElGate, TOQUE_MIN } from "@/test/navegador";

let MagraFront: typeof import("./MagraFront").default;

/** Diez cortes del rubro carnicería, por kilo y por unidad, como los que siembra el gate. */
function cortes() {
  const catalogo = getRetailRubro("carniceria")?.catalog ?? [];
  return catalogo.slice(0, 10).map((it, i) => ({
    id: `p${i}`,
    name: it.name,
    saleUnit: it.sale === "kg" ? ("WEIGHT" as const) : ("UNIT" as const),
    price: it.sale === "u" ? it.price : null,
    pricePerKg: it.sale === "kg" ? it.pricePerKg : null,
    unit: it.sale === "kg" ? "kg" : "unidades",
  }));
}

/** El local que siembra prisma/seed-magra.ts (datos ficticios de QA). */
const LOCAL_DEL_SEED = {
  addressLine: "Av. Ficticia 1234, Canning",
  city: "Canning, Buenos Aires",
  hoursLabel: "Lun a Sáb 9–20h",
  whatsapp: null,
  instagram: null,
  email: null,
};

describe("La vidriera de MAGRA en el celular: todo lo que se toca mide 44 px o más", { timeout: 120_000 }, () => {
  let browser: Browser | null = null;
  let css = "";
  let sinNavegador = "";

  before(async () => {
    prepararAccionesDeServidor();
    MagraFront = (await import("./MagraFront")).default;
    const n = await abrirNavegador();
    if ("sinNavegador" in n) sinNavegador = n.sinNavegador;
    else ({ browser, css } = n);
  });

  after(async () => {
    await browser?.close();
  });

  test("magra-demo: ningún botón chico, texto legible y sin scroll de costado", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const html = renderToStaticMarkup(
      createElement(MagraFront, { products: cortes(), branding: LOCAL_DEL_SEED, tenantKey: "magra-demo" }),
    );
    const r = await medirComoElGate(browser!, css, html);
    const chicos = r.touchFails.map((f) => `${f.text || f.selector} ${f.w}×${f.h}`);
    assert.deepEqual(chicos, [], `botones de menos de ${TOQUE_MIN} px:\n${chicos.join("\n")}`);
    const ilegibles = r.contrastFails.map((c) => `${c.text} ${c.ratio}`);
    assert.deepEqual(ilegibles, [], `texto por debajo de AA:\n${ilegibles.join("\n")}`);
    assert.ok(!r.overflow || r.overflow.scrollWidth <= r.overflow.innerWidth + 2, "la vidriera no se corre de costado a 412 px");
  });
});
