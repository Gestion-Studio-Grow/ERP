// ============================================================================
// AVISO DE PEDIDO NUEVO en un navegador de verdad (UAT MAGRA 16/10)
// ============================================================================
//
// El componente REAL (AvisoDePedidosNuevos.tsx) armado con esbuild y montado en Chromium, con un
// router falso que cuenta los `refresh()` y el reloj de Playwright para adelantar el tiempo:
// la bandeja se refresca sola a los 45 s, no con la pestaña escondida ni con alguien escribiendo,
// y cuando la vuelta trae un pedido de la tienda que no estaba, lo avisa a la vista.
// Que en CH no se monte lo decide page.tsx (`comercio && vocab.porPeso`), con su test abajo.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";
import { REFRESCO_DE_LA_BANDEJA_MS } from "./pedidos-core";

const RAIZ = fileURLToPath(new URL("../../../../../", import.meta.url));
const ORIGEN = "http://localhost:3997/admin/pedidos";

const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import AvisoDePedidosNuevos from "@/app/admin/(dashboard)/pedidos/AvisoDePedidosNuevos";
let raiz;
window.__montar = (pedidosWeb) => {
  raiz ??= createRoot(document.getElementById("root"));
  raiz.render(createElement(AvisoDePedidosNuevos, { pedidosWeb }));
};
`;
const NAVEGACION_FALSA = `
window.__refrescos = 0;
const router = { refresh() { window.__refrescos++; }, push() {}, replace() {}, back() {}, prefetch() {} };
export function useRouter() { return router; }
`;

function rutaDeChromium(porDefecto: () => string): string | null {
  try {
    const p = porDefecto();
    if (existsSync(p)) return p;
  } catch {
    // sin el de Playwright: se busca en la carpeta de navegadores
  }
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  if (existsSync(join(dir, "chromium"))) return join(dir, "chromium");
  if (!existsSync(dir)) return null;
  for (const n of readdirSync(dir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
    for (const sub of ["chrome-linux64", "chrome-linux"]) {
      const p = join(dir, n, sub, "chrome");
      if (existsSync(p)) return p;
    }
  }
  return null;
}

type Ventana = { __montar: (p: { id: string; code: number }[]) => void; __refrescos: number };

describe("Aviso de pedido nuevo en el navegador", { timeout: 120_000 }, () => {
  let browser: Browser | null = null;
  let bundle = "";
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
      plugins: [
        {
          name: "falsos",
          setup(b) {
            b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navegacion", namespace: "falso" }));
            b.onLoad({ filter: /.*/, namespace: "falso" }, () => ({ contents: NAVEGACION_FALSA, loader: "js", resolveDir: RAIZ }));
          },
        },
      ],
    });
    bundle = r.outputFiles[0].text;
    browser = await playwright.chromium.launch({ executablePath: chrome });
  });

  after(async () => {
    await browser?.close();
  });

  async function montar(): Promise<{ page: Page; errores: string[] }> {
    const page = await browser!.newPage({ viewport: { width: 390, height: 844 }, locale: "es-AR" });
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errores.push(m.text());
    });
    await page.clock.install();
    await page.route(ORIGEN, (r) =>
      r.fulfill({ contentType: "text/html; charset=utf-8", body: '<!doctype html><html lang="es"><body><input id="campo"><div id="root"></div></body></html>' }),
    );
    await page.goto(ORIGEN);
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => (window as unknown as Ventana).__montar([{ id: "a", code: 10 }]));
    await page.getByRole("button", { name: /Sonido del aviso/ }).waitFor();
    return { page, errores };
  }
  const refrescos = (page: Page) => page.evaluate(() => (window as unknown as Ventana).__refrescos);

  test("se refresca sola a los 45 s y no antes; con alguien escribiendo en un campo, espera a la vuelta siguiente", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    await page.clock.runFor(REFRESCO_DE_LA_BANDEJA_MS - 1000);
    assert.equal(await refrescos(page), 0);
    await page.clock.runFor(1000);
    assert.equal(await refrescos(page), 1);
    await page.focus("#campo");
    await page.clock.runFor(REFRESCO_DE_LA_BANDEJA_MS);
    assert.equal(await refrescos(page), 1, "no le cambia la pantalla a quien está escribiendo");
    await page.locator("#campo").blur();
    await page.clock.runFor(REFRESCO_DE_LA_BANDEJA_MS);
    assert.equal(await refrescos(page), 2);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("al entrar no avisa; cuando la vuelta trae un pedido de la tienda nuevo, lo dice con su número", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    assert.equal(await page.getByText(/pedido nuevo/).count(), 0, "lo que ya estaba no es nuevo");
    await page.evaluate(() => (window as unknown as Ventana).__montar([{ id: "a", code: 10 }, { id: "b", code: 11 }]));
    const aviso = page.getByRole("status").getByText("Entró un pedido nuevo de la tienda: #11");
    await aviso.waitFor();
    // La misma vuelta otra vez (otro refresco sin novedades) no vuelve a avisar lo ya visto.
    await page.getByRole("button", { name: "Listo" }).click();
    await page.evaluate(() => (window as unknown as Ventana).__montar([{ id: "a", code: 10 }, { id: "b", code: 11 }]));
    assert.equal(await page.getByText(/pedido nuevo/).count(), 0);
    // El sonido se apaga con su tecla (y la tecla dice cómo quedó).
    await page.getByRole("button", { name: "Sonido del aviso: prendido" }).click();
    await page.getByRole("button", { name: "Sonido del aviso: apagado" }).waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });
});

test("la bandeja monta el aviso sólo en el negocio que vende por kilo: la de CH queda como estaba", () => {
  const pagina = readFileSync(fileURLToPath(new URL("./page.tsx", import.meta.url)), "utf8");
  assert.match(pagina, /const avisoDePedidos = comercio && vocab\.porPeso\s*\?/);
  assert.equal((pagina.match(/<AvisoDePedidosNuevos /g) ?? []).length, 1, "un solo lugar lo arma, con esa condición");
});
