// ============================================================================
// INGRESO en un navegador de verdad — la clave equivocada, tecleada.
// ============================================================================
//
// Los formularios REALES del ingreso (el de la vista de siempre, que usa CH, y el del diseño
// nuevo) armados con esbuild y montados en el Chromium de Playwright, con `login()` reemplazado
// por un doble que anota lo que viaja. `login()` de verdad redirige a `?error=1` y la página se
// arma de nuevo: acá eso es volver a montar el formulario con otra `key` y `conError`. Cuando la
// dirección no cambia (segunda clave equivocada), Next no lo rearma: queda montado y React 19
// vacía el formulario al terminar la acción; eso es enviar sin volver a montar.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";

const RAIZ = fileURLToPath(new URL("../../../../", import.meta.url));
const ORIGEN = "http://localhost:3998/admin/login";

const LOGIN_FALSO = `
export async function login(fd) {
  window.__envios.push({ email: String(fd.get("email")), password: String(fd.get("password")), next: String(fd.get("next")) });
  // «Entrando…» que no termina: la respuesta todavía no volvió.
  if (window.__colgado) return new Promise(() => {});
}
`;

// El barril de componentes arrastra <Link> y el router de Next: acá alcanza con un <a> y un router
// que no navega (el ingreso no los usa).
const NEXT_FALSO = `
import { createElement } from "react";
export default function Link({ href, prefetch, ...resto }) { return createElement("a", { href: String(href), ...resto }); }
export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }
export function usePathname() { return "/admin/login"; }
export function useSearchParams() { return new URLSearchParams(); }
`;

const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import FormularioDeSiempre from "@/app/admin/login/FormularioDeSiempre";
import LoginRenglon from "@/app/admin/login/LoginRenglon";
import { avisoDeIngreso } from "@/app/admin/login/login-core";
window.__envios = [];
const raiz = createRoot(document.getElementById("root"));
window.__montar = (vista, conError, clave) =>
  raiz.render(
    vista === "renglon"
      ? createElement(LoginRenglon, { key: clave, marcaNombre: "CH Estética", marcaMonograma: "CH", hoy: "jueves 25 de septiembre", titulo: "Ingresá a tu panel", subtitulo: "Con el email y la contraseña de tu cuenta.", aviso: conError ? avisoDeIngreso("1") : null, next: "/admin", mostrarAyudaClave: false })
      : createElement(FormularioDeSiempre, { key: clave, next: "/admin", conError }),
  );
`;

type Vista = "siempre" | "renglon";
type Ventana = {
  __envios: { email: string; password: string; next: string }[];
  __colgado?: boolean;
  __montar: (vista: Vista, conError: boolean, clave: number) => void;
};

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

describe("Ingreso en el navegador", { timeout: 120_000 }, () => {
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
            b.onResolve({ filter: /^@\/lib\/auth-actions$/ }, () => ({ path: "login", namespace: "falso" }));
            b.onResolve({ filter: /^next\/(link|navigation)$/ }, () => ({ path: "next", namespace: "falso" }));
            b.onLoad({ filter: /.*/, namespace: "falso" }, (a) => ({
              contents: a.path === "login" ? LOGIN_FALSO : NEXT_FALSO,
              loader: "js",
              resolveDir: RAIZ,
            }));
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

  async function abrir(vista: Vista, conError = false): Promise<{ page: Page; errores: string[] }> {
    const page = await browser!.newPage({ viewport: { width: 412, height: 915 }, locale: "es-AR" });
    page.setDefaultTimeout(5_000);
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    // Un origen de verdad: en about:blank el navegador no deja usar el sessionStorage.
    await page.route(ORIGEN, (r) =>
      r.fulfill({ contentType: "text/html; charset=utf-8", body: '<!doctype html><html lang="es"><body><div id="root"></div></body></html>' }),
    );
    await page.goto(ORIGEN);
    await page.addScriptTag({ content: bundle });
    await montar(page, vista, conError, 1);
    return { page, errores };
  }

  const montar = (page: Page, vista: Vista, conError: boolean, clave: number) =>
    page.evaluate(([v, e, c]) => (window as unknown as Ventana).__montar(v as Vista, e as boolean, c as number), [vista, conError, clave] as const);
  const enviados = (page: Page) => page.evaluate(() => (window as unknown as Ventana).__envios.length);
  const conFoco = (page: Page) => page.evaluate(() => document.activeElement?.id ?? "");
  const guardadoEnLaPestana = (page: Page) =>
    page.evaluate(() => Object.keys(sessionStorage).map((k) => `${k}=${sessionStorage.getItem(k)}`).join("\n"));

  for (const vista of ["siempre", "renglon"] as const) {
    const nombre = vista === "siempre" ? "vista de siempre" : "diseño nuevo";

    test(`${nombre}: clave equivocada → vuelve el email, la clave vuelve vacía y el cursor está en la contraseña`, async (t) => {
      if (sinNavegador) return t.skip(sinNavegador);
      const { page, errores } = await abrir(vista);
      await page.locator("#login-email").fill("ana@chestetica.com");
      await page.locator("#login-password").fill("clave-mala");
      await page.getByRole("button", { name: "Ingresar" }).click();
      await page.waitForFunction(() => (window as unknown as Ventana).__envios.length === 1);
      // `login()` redirige a ?error=1: la página se arma de nuevo.
      await montar(page, vista, true, 2);
      await page.waitForFunction(() => (document.getElementById("login-email") as HTMLInputElement).value !== "");
      assert.equal(await page.inputValue("#login-email"), "ana@chestetica.com", "antes volvía vacío");
      assert.equal(await page.inputValue("#login-password"), "");
      assert.equal(await conFoco(page), "login-password");
      assert.doesNotMatch(await guardadoEnLaPestana(page), /clave-mala/, "la clave no se guarda nunca");
      assert.deepEqual(errores, []);
      await page.close();
    });
  }

  test("vista de siempre: lo que se tipea mientras espera la respuesta no se pierde al volver con el error", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await abrir("siempre");
    await page.evaluate(() => {
      (window as unknown as Ventana).__colgado = true;
    });
    await page.locator("#login-email").fill("ana@chestetica.co");
    await page.locator("#login-password").fill("clave-mala");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForFunction(() => (window as unknown as Ventana).__envios.length === 1);
    // Se da cuenta del error de tipeo y lo corrige mientras la respuesta no vuelve.
    await page.locator("#login-email").press("End");
    await page.keyboard.type("m");
    await montar(page, "siempre", true, 2);
    await page.waitForFunction(() => (document.getElementById("login-email") as HTMLInputElement).value !== "");
    assert.equal(await page.inputValue("#login-email"), "ana@chestetica.com", "lo corregido queda");
    assert.equal(await page.inputValue("#login-password"), "");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("vista de siempre: segunda clave equivocada (la pantalla no se rearma) → el email queda, la clave se vacía", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await abrir("siempre");
    await page.locator("#login-email").fill("ana@chestetica.com");
    await page.locator("#login-password").fill("clave-mala");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForFunction(() => (window as unknown as Ventana).__envios.length === 1);
    await montar(page, "siempre", true, 2);
    await page.locator("#login-password").fill("otra-mala");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForFunction(() => (window as unknown as Ventana).__envios.length === 2);
    // Termina la acción y React vacía el formulario: el email tiene que quedar.
    await page.waitForFunction(() => (document.getElementById("login-password") as HTMLInputElement).value === "");
    assert.equal(await page.inputValue("#login-email"), "ana@chestetica.com", "antes se vaciaba también");
    const envios = await page.evaluate(() => (window as unknown as Ventana).__envios);
    assert.equal(envios[1].email, "ana@chestetica.com");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("vista de siempre: entrando sin error, el email no aparece solo (se borra lo guardado)", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await abrir("siempre");
    await page.locator("#login-email").fill("ana@chestetica.com");
    // Otra entrada, sin error (salió y volvió a la pantalla de ingreso).
    await montar(page, "siempre", false, 2);
    assert.equal(await page.inputValue("#login-email"), "");
    assert.equal(await conFoco(page), "login-email");
    assert.equal(await guardadoEnLaPestana(page), "");
    assert.equal(await enviados(page), 0);
    assert.deepEqual(errores, []);
    await page.close();
  });
});
