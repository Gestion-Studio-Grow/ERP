// ============================================================================
// Probar un componente en un Chromium de verdad, sin servidor: el componente real armado con
// esbuild, el CSS real de la app (Tailwind + public/diseno/renglon.css) y el navegador de Playwright.
// ============================================================================
//
// El molde nació en caja-renglon.test.ts y se copió en varias pruebas; lo que es igual en todas
// vive acá (buscar el Chromium, armar el CSS, empaquetar con next/navigation y next/link falsos).
// Si falta esbuild, Playwright o el navegador, `prepararNavegador` devuelve el motivo y la prueba
// se salta con ese motivo a la vista, en vez de fallar por el entorno.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser } from "playwright";

export const RAIZ = fileURLToPath(new URL("../../", import.meta.url));

const NAVEGACION_FALSA = (ruta: string) => `
export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }
export function usePathname() { return ${JSON.stringify(ruta)}; }
export function useSearchParams() { return new URLSearchParams(); }`;
const LINK_FALSO = `
import { createElement } from "react";
export default function Link({ href, prefetch, scroll, ...resto }) { return createElement("a", { href: String(href), ...resto }); }`;

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
  return app + readFileSync(join(RAIZ, "public", "diseno", "renglon.css"), "utf8");
}

export type Navegador = { browser: Browser; bundle: string; css: string };

/**
 * Empaqueta `entrada` (TSX que cuelga funciones de `window`), arma el CSS y abre Chromium.
 * Devuelve el motivo (texto) si el entorno no tiene con qué.
 */
export async function prepararNavegador(entrada: string, opciones: { ruta?: string } = {}): Promise<Navegador | string> {
  let esbuild: typeof import("esbuild");
  let playwright: typeof import("playwright");
  try {
    esbuild = await import("esbuild");
    playwright = await import("playwright");
  } catch {
    return "no están esbuild o playwright";
  }
  const chrome = rutaDeChromium(() => playwright.chromium.executablePath());
  if (!chrome) return "no hay un Chromium instalado";
  const falsos: Record<string, string> = { "next/navigation": NAVEGACION_FALSA(opciones.ruta ?? "/"), "next/link": LINK_FALSO };
  const r = await esbuild.build({
    stdin: { contents: entrada, loader: "tsx", resolveDir: RAIZ },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    tsconfig: join(RAIZ, "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "silent",
    plugins: [
      {
        name: "falsos",
        setup(b) {
          b.onResolve({ filter: /^next\/(navigation|link)$/ }, (a) => ({ path: a.path, namespace: "falso" }));
          b.onLoad({ filter: /.*/, namespace: "falso" }, (a) => ({ contents: falsos[a.path], loader: "js", resolveDir: RAIZ }));
        },
      },
    ],
  });
  const css = await cssDeLaApp();
  const browser = await playwright.chromium.launch({ executablePath: chrome });
  return { browser, bundle: r.outputFiles[0].text, css };
}

/** La página mínima con el diseño «Renglón» prendido: el componente se monta en #root. */
export function paginaRenglon({ bundle, css }: Pick<Navegador, "bundle" | "css">): string {
  return `<!doctype html><html lang="es"><head><style>${css}</style></head><body><div id="root" data-skin="fable" data-diseno="renglon" data-theme="light" data-density="lite" class="min-h-dvh bg-surface"></div><script>${bundle}</script></body></html>`;
}
