// ============================================================================
// DESLIZAR CON EL DEDO, en un Chromium táctil de verdad (U4, UAT 3 personas).
// ============================================================================
//
// El navegador toma el arrastre para desplazar la página si la perilla no dice que el gesto es suyo:
// corta con `pointercancel`, la perilla vuelve a 0 y el día no se cierra. Con mouse nunca se ve, así
// que acá el gesto va por `Input.dispatchTouchEvent`, sobre el componente real, con el CSS real del
// build y una página más alta que la pantalla. El mismo control cierra el día y el mes y emite a los
// bancos: el trinquete del final impide que alguno se vaya a una copia sin este arreglo.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, CDPSession, Page } from "playwright";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));

const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { DeslizarParaConfirmar } from "@/components/ui/Deslizar";
window.__envios = 0;
window.__cortes = 0;
window.addEventListener("pointercancel", () => { window.__cortes += 1; }, true);
createRoot(document.getElementById("root")).render(
  createElement("form", { onSubmit: (e) => { e.preventDefault(); window.__envios += 1; } },
    createElement("div", { style: { height: "300px" } }, "Lo contado"),
    createElement(DeslizarParaConfirmar, { texto: "Deslizá para cerrar el día", etiqueta: "Cerrar el día", textoHecho: "Día cerrado", enviar: true }),
    createElement("div", { style: { height: "2000px" } }, "Más abajo"),
  ),
);
`;

type Ventana = { __envios: number; __cortes: number };

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

async function cssDeLaApp(): Promise<string> {
  const postcss = (await import("postcss")).default;
  const tailwind = (await import("@tailwindcss/postcss")).default as unknown as (o: { base: string }) => import("postcss").AcceptedPlugin;
  const archivo = join(RAIZ, "src", "app", "globals.css");
  const app = (await postcss([tailwind({ base: RAIZ })]).process(readFileSync(archivo, "utf8"), { from: archivo })).css;
  return `${app}\n${readFileSync(join(RAIZ, "public", "diseno", "renglon.css"), "utf8")}`;
}

describe("Deslizar con el dedo", { timeout: 120_000 }, () => {
  let browser: Browser | null = null;
  let bundle = "";
  let css = "";
  let sinNavegador = "";

  before(async () => {
    let esbuild: typeof import("esbuild");
    let playwright: typeof import("playwright");
    try {
      esbuild = await import("esbuild");
      playwright = await import("playwright");
    } catch {
      sinNavegador = "no están esbuild o playwright";
      return;
    }
    const chrome = rutaDeChromium(() => playwright.chromium.executablePath());
    if (!chrome) {
      sinNavegador = "no hay un Chromium instalado";
      return;
    }
    const r = await esbuild.build({
      stdin: { contents: ENTRADA, loader: "tsx", resolveDir: RAIZ },
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      tsconfig: join(RAIZ, "tsconfig.json"),
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "silent",
    });
    bundle = r.outputFiles[0].text;
    css = await cssDeLaApp();
    browser = await playwright.chromium.launch({ executablePath: chrome });
  });

  after(async () => {
    await browser?.close();
  });

  async function montar(): Promise<{ page: Page; cdp: CDPSession; desde: { x: number; y: number }; hasta: number }> {
    const contexto = await browser!.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: "es-AR" });
    const page = await contexto.newPage();
    await page.setContent(`<!doctype html><html lang="es" data-diseno="renglon"><head><style>${css}</style></head><body><div id="root" style="padding:16px"></div></body></html>`);
    await page.addScriptTag({ content: bundle });
    const perilla = page.getByRole("slider", { name: "Cerrar el día" });
    await perilla.waitFor();
    const caja = (await perilla.boundingBox())!;
    const pista = (await page.locator('[data-ui="deslizar"]').boundingBox())!;
    return {
      page,
      cdp: await contexto.newCDPSession(page),
      desde: { x: caja.x + caja.width / 2, y: caja.y + caja.height / 2 },
      hasta: pista.x + pista.width - 4,
    };
  }

  /** El dedo: apoya, se corre de a `pasos` y suelta. Con `espera`, a ritmo de persona; sin ella, un golpe. */
  async function arrastrar(cdp: CDPSession, desde: { x: number; y: number }, hastaX: number, pasos: number, espera: number) {
    const punto = (x: number) => [{ x, y: desde.y, id: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: punto(desde.x) });
    for (let i = 1; i <= pasos; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: punto(desde.x + ((hastaX - desde.x) * i) / pasos) });
      if (espera) await new Promise((r) => setTimeout(r, espera));
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }

  const estado = (page: Page) => page.locator('[data-ui="deslizar"]').getAttribute("data-estado");
  const leer = (page: Page) => page.evaluate(() => ({ envios: (window as unknown as Ventana).__envios, cortes: (window as unknown as Ventana).__cortes, scroll: window.scrollY }));

  test("con el dedo hasta el final: confirma y manda el formulario, sin que el navegador corte el gesto", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, cdp, desde, hasta } = await montar();
    await arrastrar(cdp, desde, hasta, 12, 16);
    await page.waitForFunction(() => document.querySelector('[data-ui="deslizar"]')?.getAttribute("data-estado") !== "arrastrando");
    assert.deepEqual(await leer(page), { envios: 1, cortes: 0, scroll: 0 });
    assert.equal(await estado(page), "hecho");
    await page.context().close();
  });

  test("un golpe rápido de dedo cuenta con la posición al soltar, no con el último dibujo", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, cdp, desde, hasta } = await montar();
    await arrastrar(cdp, desde, hasta, 2, 0);
    await page.waitForFunction(() => document.querySelector('[data-ui="deslizar"]')?.getAttribute("data-estado") !== "arrastrando");
    assert.equal((await leer(page)).envios, 1);
    assert.equal(await estado(page), "hecho");
    await page.context().close();
  });

  test("soltado a mitad de camino vuelve y no manda nada", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, cdp, desde, hasta } = await montar();
    await arrastrar(cdp, desde, desde.x + (hasta - desde.x) / 2, 8, 16);
    await page.waitForFunction(() => document.querySelector('[data-ui="deslizar"]')?.getAttribute("data-estado") === "quieto");
    assert.equal((await leer(page)).envios, 0);
    assert.equal(await page.getByRole("slider", { name: "Cerrar el día" }).getAttribute("aria-valuenow"), "0");
    await page.context().close();
  });

  test("se puede desplazar la página con el dedo desde la pista, fuera de la perilla", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, cdp, desde } = await montar();
    // El dedo va vertical, arrancando sobre el texto de la pista: la página no queda trabada.
    const x = desde.x + 150;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: desde.y, id: 1 }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: desde.y - i * 20, id: 1 }] });
      await new Promise((r) => setTimeout(r, 16));
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForFunction(() => window.scrollY > 0, undefined, { timeout: 3000 });
    assert.equal((await leer(page)).envios, 0);
    await page.context().close();
  });
});

test("cierre del día, cierre del mes y bancos usan este mismo control, no una copia", () => {
  for (const archivo of [
    "src/app/admin/(dashboard)/caja/cierre/ContarYCerrar.tsx",
    "src/app/admin/(dashboard)/cierre-mes/CongelarDeslizando.tsx",
    "src/app/admin/(dashboard)/facturacion/bancos/EmitirDeslizando.tsx",
  ]) {
    assert.match(readFileSync(join(RAIZ, archivo), "utf8"), /import \{ DeslizarParaConfirmar \} from "@\/components\/ui\/Deslizar"/, archivo);
  }
});
