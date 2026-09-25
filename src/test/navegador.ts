// ============================================================================
// Chromium + el CSS real del panel, para medir pantallas en tests sin levantar Next.
// ============================================================================
// Lo usan los tests que miden lo que mide el gate «visual-aa» (scripts/qa/visual-audit.mjs):
// toque ≥ 44 px y contraste AA, con la MISMA función del gate (`auditInPage`).
// Sin playwright o sin Chromium instalado, `abrirNavegador` devuelve el motivo y el test se saltea.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";
// La misma función que mide el gate «visual-aa» en CI.
import { auditInPage, VIEWPORTS } from "../../scripts/qa/visual-audit.mjs";

export const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
export const TOQUE_MIN = 44;
export const CELULAR = VIEWPORTS[1] as { width: number; height: number };

export interface Medicion {
  touchFails: { selector: string; text: string; w: number; h: number }[];
  contrastFails: { text: string; ratio: number; fg?: string; bg?: string }[];
  overflow: { scrollWidth: number; innerWidth: number } | null;
}

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

/** Chromium + globals.css compilado con el Tailwind del proyecto, o el motivo por el que no se puede. */
export async function abrirNavegador(): Promise<{ browser: Browser; css: string } | { sinNavegador: string }> {
  let playwright: typeof import("playwright");
  try {
    playwright = await import("playwright");
  } catch {
    return { sinNavegador: "no está playwright" };
  }
  const chrome = rutaDeChromium(() => playwright.chromium.executablePath());
  if (!chrome) return { sinNavegador: "no hay un Chromium instalado" };
  const postcss = (await import("postcss")).default;
  const tailwind = (await import("@tailwindcss/postcss")).default as unknown as (o: { base: string }) => import("postcss").AcceptedPlugin;
  const archivo = join(RAIZ, "src", "app", "globals.css");
  const css = (await postcss([tailwind({ base: RAIZ })]).process(readFileSync(archivo, "utf8"), { from: archivo })).css;
  return { browser: await playwright.chromium.launch({ executablePath: chrome }), css };
}

/** Carga el HTML con el CSS en una página del ancho dado y lo mide con la función del gate. */
export async function medirComoElGate(browser: Browser, css: string, html: string, ancho = CELULAR): Promise<Medicion> {
  const page: Page = await browser.newPage({ viewport: ancho, isMobile: true, hasTouch: true });
  try {
    await page.setContent(
      `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>` +
        `<body>${html}</body></html>`,
    );
    // tsx transpila el .mjs del gate con `keepNames` (`__name(fn, "x")`): en la página no existe.
    await page.evaluate("globalThis.__name = (f) => f");
    return (await page.evaluate(auditInPage, TOQUE_MIN)) as Medicion;
  } finally {
    await page.close();
  }
}
