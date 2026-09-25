// ============================================================================
// LA ZONA SEGURA DEL IPHONE, UNA SOLA VEZ, en los pies pegados de Vender y del Recuento.
// ============================================================================
//
// En el iPhone, abajo de todo está la rayita de volver al inicio: la "zona segura"
// (`env(safe-area-inset-bottom)`, ~34 px). En un negocio por apps, la barra de espacios del
// celular ya la deja (BarraInferior: `pb-[env(safe-area-inset-bottom)]`) y su alto entero, CON la
// zona segura, es `--alto-barra-inferior` (layout.tsx). Los pies pegados de Vender (total y
// Cobrar) y del Recuento (avance y Guardar) se apoyan encima con ese alto... y además sumaban la
// zona segura en su propio relleno: 34 px de franja vacía entre Cobrar y la barra, justo donde
// va el pulgar. Sin barra (fuera del piloto), el pie sí tiene que dejarla él.
//
// Se mide en Chromium con el CSS REAL (globals.css con el Tailwind del build) y las clases REALES
// leídas de layout.tsx, BarraInferior.tsx, VenderForm.tsx y RecuentoForm.tsx. Chromium de
// escritorio no tiene rayita (su zona segura vale 0), así que en el CSS compilado se reemplaza
// `env(safe-area-inset-bottom)` por los 34 px de un iPhone: la cuenta es la del teléfono.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser } from "playwright";

const RAIZ = fileURLToPath(new URL("../../../../", import.meta.url));
const ZONA_SEGURA_PX = 34;
const RELLENO_PX = 12; // 0.75rem: el aire de abajo del pie cuando la zona segura ya la deja otro

function leer(rel: string): string {
  return readFileSync(join(RAIZ, rel), "utf8");
}

/** La clase de un elemento, tal cual está en el código. */
function clase(rel: string, patron: RegExp): string {
  const m = leer(rel).match(patron);
  assert.ok(m, `no se encontró la clase en ${rel}`);
  return m[1];
}

const RAIZ_POR_APPS = clase("src/app/admin/(dashboard)/layout.tsx", /"(min-h-screen bg-surface text-body \[--alto-barra-inferior:[^"]+)"/);
const BARRA = clase("src/app/admin/(dashboard)/inicio/BarraInferior.tsx", /className="(fixed inset-x-0 bottom-0 z-40[^"]+)"/);
const PIES = {
  // El pie DE SIEMPRE (diseño apagado): el de `-mx-3 -mb-3`. El pie de Renglón (diseño nuevo) es
  // otro elemento de VenderForm, con su relleno en renglon.css, y se mide aparte (abajo).
  Vender: clase("src/app/admin/(dashboard)/vender/VenderForm.tsx", /className="(sticky bottom-\[var\(--alto-barra-inferior[^"]*-mx-3 -mb-3[^"]+)"/),
  Recuento: clase("src/app/admin/(dashboard)/ajustes/recuento/RecuentoForm.tsx", /id="recuento-pie" className="([^"]+)"/),
};
/** El pie de Cobrar de Renglón (diseño nuevo): su relleno lo pone renglon.css. */
const PIE_RENGLON = clase("src/app/admin/(dashboard)/vender/VenderForm.tsx", /data-vender="cobrar" className="([^"]+)"/);

function rutaDeChromium(porDefecto: () => string): string | null {
  try {
    const p = porDefecto();
    if (existsSync(p)) return p;
  } catch {
    // sin navegador registrado: se busca abajo
  }
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  if (!existsSync(dir)) return null;
  for (const n of readdirSync(dir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
    for (const sub of ["chrome-linux64", "chrome-linux"]) {
      const p = join(dir, n, sub, "chrome");
      if (existsSync(p)) return p;
    }
  }
  return null;
}

describe("Pies pegados en el iPhone: la zona segura una sola vez", { timeout: 120_000 }, () => {
  let browser: Browser | null = null;
  let css = "";
  let cssRenglon = "";
  let sinNavegador = "";

  before(async () => {
    let playwright: typeof import("playwright");
    try {
      playwright = await import("playwright");
    } catch {
      sinNavegador = "no está playwright";
      return;
    }
    const chrome = rutaDeChromium(() => playwright.chromium.executablePath());
    if (!chrome) {
      sinNavegador = "no hay un Chromium instalado";
      return;
    }
    const postcss = (await import("postcss")).default;
    const tailwind = (await import("@tailwindcss/postcss")).default as unknown as (o: { base: string }) => import("postcss").AcceptedPlugin;
    const archivo = join(RAIZ, "src", "app", "globals.css");
    const compilado = (await postcss([tailwind({ base: RAIZ })]).process(readFileSync(archivo, "utf8"), { from: archivo })).css;
    // En los selectores los paréntesis van escapados (`env\(`): sólo se tocan los valores.
    css = compilado.replaceAll("env(safe-area-inset-bottom)", `${ZONA_SEGURA_PX}px`);
    assert.ok(css !== compilado, "el CSS compilado usa la zona segura");
    const renglon = leer("public/diseno/renglon.css");
    cssRenglon = renglon.replaceAll("env(safe-area-inset-bottom)", `${ZONA_SEGURA_PX}px`);
    assert.ok(cssRenglon !== renglon, "renglon.css usa la zona segura");
    browser = await playwright.chromium.launch({ executablePath: chrome });
  });

  after(async () => {
    await browser?.close();
  });

  /** Arma la pantalla (con o sin barra de espacios) y mide el pie y la barra. */
  async function medir(pie: string, conBarra: boolean) {
    const page = await browser!.newPage({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const raiz = conBarra ? RAIZ_POR_APPS : "min-h-screen bg-surface text-body";
    await page.setContent(
      `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body class="bg-surface">` +
        `<div class="${raiz}"><div id="contenido" class="flex-1 pb-[var(--alto-barra-inferior,0px)]"><main class="px-4">` +
        `<div style="height:2000px">el ticket largo</div>` +
        `<div id="pie" class="${pie}"><button style="height:44px;width:100%">Cobrar</button></div>` +
        `</main></div>` +
        (conBarra ? `<nav id="barra" class="${BARRA}"><div style="height:3.5rem">espacios</div></nav>` : "") +
        `</div></body></html>`,
    );
    const m = await page.evaluate(() => {
      const pie = document.getElementById("pie")!;
      const barra = document.getElementById("barra");
      return {
        relleno: parseFloat(getComputedStyle(pie).paddingBottom),
        pieAbajo: pie.getBoundingClientRect().bottom,
        barraArriba: barra ? barra.getBoundingClientRect().top : null,
        botonAbajo: pie.querySelector("button")!.getBoundingClientRect().bottom,
      };
    });
    await page.close();
    return m;
  }

  /** Vender con el diseño nuevo: la raíz con la piel, el armazón y (en el celular) la cápsula. */
  async function medirRenglon(conCapsula: boolean) {
    const page = await browser!.newPage({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    await page.setContent(
      `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>${cssRenglon}</style></head><body class="bg-surface">` +
        `<div data-diseno="renglon"><div data-ui="armazon"><div id="contenido" class="flex-1 pb-[var(--alto-barra-inferior,0px)]"><main>` +
        `<div style="height:2000px">el ticket largo</div>` +
        `<div id="pie" data-vender="cobrar" class="${PIE_RENGLON}"><button style="height:44px;width:100%">Cobrar</button></div>` +
        `</main></div>` +
        (conCapsula ? `<nav id="barra" data-ui="capsula" aria-label="Espacios"><a>Vender</a></nav>` : "") +
        `</div></div></body></html>`,
    );
    const m = await page.evaluate(() => {
      const pie = document.getElementById("pie")!;
      const barra = document.getElementById("barra");
      return {
        relleno: parseFloat(getComputedStyle(pie).paddingBottom),
        pieAbajo: pie.getBoundingClientRect().bottom,
        barraArriba: barra ? barra.getBoundingClientRect().top : null,
        botonAbajo: pie.querySelector("button")!.getBoundingClientRect().bottom,
      };
    });
    await page.close();
    return m;
  }

  test("Vender con el diseño nuevo, con la cápsula: el pie se apoya en ella sin franja vacía", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const m = await medirRenglon(true);
    assert.equal(m.relleno, RELLENO_PX, `relleno de abajo del pie: ${m.relleno}px`);
    assert.ok(m.barraArriba !== null && Math.abs(m.pieAbajo - m.barraArriba) <= 0.5, `el pie se apoya en la cápsula (${m.pieAbajo} / ${m.barraArriba})`);
    assert.ok(m.barraArriba! - m.botonAbajo <= RELLENO_PX + 0.5, "entre Cobrar y la cápsula no queda una franja vacía");
  });

  test("Vender con el diseño nuevo, sin cápsula: el pie deja la zona segura una vez", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const m = await medirRenglon(false);
    assert.equal(m.relleno, ZONA_SEGURA_PX, "sin cápsula, la rayita del iPhone la deja el pie");
    assert.ok(Math.abs(m.pieAbajo - 915) <= 0.5, `el pie llega al borde de la pantalla (${m.pieAbajo})`);
  });

  for (const [pantalla, pie] of Object.entries(PIES)) {
    test(`${pantalla}, con la barra de espacios: el pie no vuelve a sumar la zona segura`, async (t) => {
      if (sinNavegador) return t.skip(sinNavegador);
      const m = await medir(pie, true);
      // La barra ya deja la rayita del iPhone: el pie sólo lleva su aire.
      assert.equal(m.relleno, RELLENO_PX, `relleno de abajo del pie: ${m.relleno}px (con la zona segura dos veces eran ${ZONA_SEGURA_PX})`);
      assert.ok(m.barraArriba !== null && Math.abs(m.pieAbajo - m.barraArriba) <= 0.5, `el pie se apoya en la barra (${m.pieAbajo} / ${m.barraArriba})`);
      assert.ok(m.barraArriba! - m.botonAbajo <= RELLENO_PX + 0.5, "entre Cobrar y la barra no queda una franja vacía");
    });

    test(`${pantalla}, sin barra (fuera del piloto): el pie deja la zona segura una vez`, async (t) => {
      if (sinNavegador) return t.skip(sinNavegador);
      const m = await medir(pie, false);
      assert.equal(m.relleno, ZONA_SEGURA_PX, "sin barra, la rayita del iPhone la deja el pie");
      assert.ok(Math.abs(m.pieAbajo - 915) <= 0.5, `el pie llega al borde de la pantalla (${m.pieAbajo})`);
    });
  }
});
