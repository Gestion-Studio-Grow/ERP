// ============================================================================
// CAJA en un navegador de verdad — el cierre del día hecho ENTERO con el teclado, la
// confirmación de lo irreversible y lo que pasa cuando se corta la señal.
// ============================================================================
//
// Los formularios REALES (CerrarDiaForm, CloseCajaForm, AddLibroEntryForm) armados con esbuild
// y montados en el Chromium de Playwright, con las Server Actions reemplazadas por dobles que
// anotan lo que viaja (el mismo molde que vender/vender-pantalla.test.ts). Sin Next ni base: se
// prueba la pantalla y QUÉ manda. El recorrido del cierre no toca el mouse: Tab, tipear,
// Enter, Escape. El de 412 px carga el CSS real (globals.css compilado con el Tailwind del
// build).

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";

const RAIZ = fileURLToPath(new URL("../../../../../", import.meta.url));

const GUARDAR = `
function guardar(fd) {
  const o = {};
  for (const k of new Set(fd.keys())) o[k] = fd.getAll(k).map(String);
  window.__envios.push(o);
  return o;
}
function sinRed() {
  if (window.__sinRed) throw new TypeError("Failed to fetch");
}
`;
const CIERRE_FALSO = `${GUARDAR}
export async function cerrarDia(fd) {
  guardar(fd);
  sinRed();
  return { ok: true, message: "Día cerrado. Faltante de $1.500 asentado en el libro." };
}`;
const CAJA_FALSA = `${GUARDAR}
export async function openCashSession(_p, fd) { guardar(fd); sinRed(); return { ok: true }; }
export async function closeCashSession(_p, fd) { guardar(fd); sinRed(); return { ok: true }; }`;
const LIBRO_FALSO = `${GUARDAR}
export async function addLibroEntry(_p, fd) { guardar(fd); sinRed(); return { ok: true, message: "Guardado." }; }
export async function deleteLibroEntry(_p, fd) { guardar(fd); sinRed(); return { ok: true }; }`;
const NAVEGACION_FALSA = `export function useRouter() { return { refresh() { window.__refrescos = (window.__refrescos || 0) + 1; } }; }`;
// Los formularios no usan <Link>, pero el barril de @/components/ui lo trae (pestañas, chips): el
// next/link de verdad lee process.env al cargarse y en el navegador de la prueba no hay process.
// Alcanza con un <a>, como en vender/vender-pantalla.test.ts.
const LINK_FALSO = `
import { createElement } from "react";
export default function Link({ href, prefetch, ...resto }) { return createElement("a", { href: String(href), ...resto }); }
`;

const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import ToastProvider from "@/app/admin/(dashboard)/ToastProvider";
import { CerrarDiaForm } from "@/app/admin/(dashboard)/caja/cierre/CierreForm";
import { CloseCajaForm, OpenCajaForm } from "@/app/admin/(dashboard)/caja/CajaForms";
import { AddLibroEntryForm, IrACargarMovimiento } from "@/app/admin/(dashboard)/caja/libro/LibroForms";
window.__envios = [];
window.__montar = (cual) =>
  createRoot(document.getElementById("root")).render(
    createElement(ToastProvider, null,
      cual === "cierre"
        ? createElement(CerrarDiaForm, { day: "2026-09-23", diaLabel: "23/09/2026", esperado: { EFECTIVO: 48500, MP: 212300, TARJETA: 0 } })
        : cual === "turno"
        ? createElement(CloseCajaForm, { expected: 10000 })
        : cual === "abrir"
        ? createElement(OpenCajaForm, { esperado: 15000 })
        : createElement("div", null,
            createElement(AddLibroEntryForm, { defaultDate: "2026-09-23", viewMonth: "2026-09" }),
            // El botón del mes vacío (libro/page.tsx), debajo del formulario como en la página.
            createElement("div", { style: { marginTop: "1500px" } }, createElement(IrACargarMovimiento)),
          ),
    ),
  );
`;

type Envio = Record<string, string[]>;
type Montaje = "cierre" | "turno" | "abrir" | "libro";
type Ventana = { __envios: Envio[]; __sinRed?: boolean; __montar: (cual: Montaje) => void };

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
  try {
    const postcss = (await import("postcss")).default;
    const tailwind = (await import("@tailwindcss/postcss")).default as unknown as (o: { base: string }) => import("postcss").AcceptedPlugin;
    const archivo = join(RAIZ, "src", "app", "globals.css");
    return (await postcss([tailwind({ base: RAIZ })]).process(readFileSync(archivo, "utf8"), { from: archivo })).css;
  } catch {
    return "";
  }
}

/** Texto del elemento que tiene el foco, para seguir el recorrido sin mouse. */
const foco = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    return a ? a.id || a.textContent?.trim() || a.tagName : "";
  });

describe("Caja en el navegador", { timeout: 120_000 }, () => {
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
    const falsos: Record<string, string> = {
      "@/lib/cierre-diario-actions": CIERRE_FALSO,
      "@/lib/caja-actions": CAJA_FALSA,
      "@/lib/libro-caja-actions": LIBRO_FALSO,
      "next/navigation": NAVEGACION_FALSA,
      "next/link": LINK_FALSO,
    };
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
            b.onResolve({ filter: /^(@\/lib\/(cierre-diario-actions|caja-actions|libro-caja-actions)|next\/navigation|next\/link)$/ }, (a) => ({
              path: a.path,
              namespace: "falso",
            }));
            b.onLoad({ filter: /.*/, namespace: "falso" }, (a) => ({ contents: falsos[a.path], loader: "js", resolveDir: RAIZ }));
          },
        },
      ],
    });
    bundle = r.outputFiles[0].text;
    css = await cssDeLaApp();
    browser = await playwright.chromium.launch({ executablePath: chrome });
  });

  after(async () => {
    await browser?.close();
  });

  async function montar(cual: Montaje, conCss = false): Promise<{ page: Page; errores: string[] }> {
    const page = await browser!.newPage({ viewport: { width: 412, height: 915 }, locale: "es-AR" });
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.setContent(
      `<!doctype html><html lang="es"><head>${conCss ? `<style>${css}</style>` : ""}</head><body class="bg-surface"><div id="root" class="px-4"></div></body></html>`,
    );
    await page.addScriptTag({ content: bundle });
    await page.evaluate((c) => (window as unknown as Ventana).__montar(c as Montaje), cual);
    await page.waitForSelector("form");
    return { page, errores };
  }

  const envios = (page: Page) => page.evaluate(() => (window as unknown as Ventana).__envios);

  test("cierre del día entero con el teclado: contar, anotar la diferencia, revisar, Escape, confirmar", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("cierre");
    // Sin mouse desde acá: Tab entra al primer importe.
    await page.keyboard.press("Tab");
    assert.equal(await foco(page), "declarado-EFECTIVO");
    await page.keyboard.type("47.000");
    await page.keyboard.press("Tab");
    await page.keyboard.type("212.300");
    // Enter revisa: hay diferencia sin nota → el foco va a la nota, con el motivo escrito.
    await page.keyboard.press("Enter");
    assert.equal(await foco(page), "cierre-note");
    await page.getByRole("alert").filter({ hasText: "Hay diferencia: anotá qué pasó" }).waitFor();
    assert.equal((await envios(page)).length, 0, "revisar no manda nada");
    await page.keyboard.type("faltó cambio de la mañana");
    // En la nota, Ctrl + Enter sigue (Enter es un renglón nuevo).
    await page.keyboard.press("Control+Enter");
    await page.getByText("¿Cerrar el día 23/09/2026?").waitFor();
    assert.equal(await foco(page), "Sí, cerrar el día", "el foco queda en confirmar");
    const resumen = ((await page.getByRole("group", { name: /Cerrar el día 23\/09\/2026/ }).textContent()) ?? "").replace(/\s/g, " ");
    assert.match(resumen, /Efectivo: contaste \$47\.000,00, el libro dice \$48\.500,00\. Faltan \$1\.500,00/);
    // Escape vuelve a revisar, con el foco en el botón que la abrió.
    await page.keyboard.press("Escape");
    assert.equal(await page.getByText("¿Cerrar el día 23/09/2026?").count(), 0);
    assert.equal(await foco(page), "Cerrar el día");
    await page.keyboard.press("Enter");
    await page.getByText("¿Cerrar el día 23/09/2026?").waitFor();
    assert.equal((await envios(page)).length, 0, "nada se cierra sin confirmar");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => (window as unknown as Ventana).__envios.length >= 1);
    const [envio] = await envios(page);
    assert.deepEqual(envio, {
      day: ["2026-09-23"],
      declarado_EFECTIVO: ["47.000"],
      declarado_MP: ["212.300"],
      declarado_TARJETA: [""],
      note: ["faltó cambio de la mañana"],
    });
    await page.getByText("Día cerrado. Faltante de $1.500 asentado en el libro.").waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("cierre: sin efectivo, Enter lleva al efectivo y lo dice; lo ilegible se marca en su campo", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("cierre");
    await page.focus("#declarado-MP");
    await page.keyboard.type("doscientos");
    await page.keyboard.press("Enter");
    assert.equal(await foco(page), "declarado-MP");
    await page.getByRole("alert").filter({ hasText: "no es un importe" }).waitFor();
    await page.fill("#declarado-MP", "212.300");
    await page.keyboard.press("Enter");
    assert.equal(await foco(page), "declarado-EFECTIVO");
    await page.getByRole("alert").filter({ hasText: "Falta el efectivo contado" }).waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("cierre: se corta la señal al confirmar → lo contado queda y se dice cómo saber si se cerró", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("cierre");
    await page.fill("#declarado-EFECTIVO", "48500");
    await page.evaluate(() => {
      (window as unknown as Ventana).__sinRed = true;
    });
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Sí, cerrar el día" }).click();
    await page.getByRole("alert").filter({ hasText: "No se pudo confirmar el cierre" }).waitFor();
    assert.equal(await page.inputValue("#declarado-EFECTIVO"), "48500");
    assert.equal(await foco(page), "Cerrar el día", "el foco vuelve al botón para reintentar");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("cerrar el turno de cajero pide confirmación con el faltante; Enter confirma", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("turno");
    await page.focus("#counted");
    await page.keyboard.type("9.500");
    await page.keyboard.press("Enter");
    const pregunta = page.getByText(/¿Cerrar el turno\? Contaste \$\s?9\.500,00 y se esperaba \$\s?10\.000,00: faltante \$\s?500,00\./);
    await pregunta.waitFor();
    assert.equal(await foco(page), "Sí, cerrar caja");
    assert.equal((await envios(page)).length, 0);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => (window as unknown as Ventana).__envios.length >= 1);
    // Con el esperado que se mostró y se confirmó: el servidor no cierra si el libro ya dice otro (ADR-101).
    assert.deepEqual((await envios(page))[0], { counted: ["9.500"], note: [""], esperadoConfirmado: ["10000"] });
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("abrir la caja sin señal: se dice qué pasó y el fondo tipeado queda", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("abrir");
    await page.fill("#openingFloat", "15.000");
    await page.evaluate(() => {
      (window as unknown as Ventana).__sinRed = true;
    });
    await page.getByRole("button", { name: "Abrir caja" }).click();
    await page.getByRole("alert").filter({ hasText: "No se pudo abrir la caja" }).waitFor();
    assert.equal(await page.inputValue("#openingFloat"), "15.000");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("libro: sin señal al guardar, lo cargado queda y se dice cómo saber si se guardó", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("libro");
    await page.fill("#libro-detail", "Proveedor de bolsas");
    await page.selectOption("#libro-type", "EGRESO");
    await page.fill("#libro-amount", "8.400,50");
    await page.evaluate(() => {
      (window as unknown as Ventana).__sinRed = true;
    });
    await page.getByRole("button", { name: "Agregar movimiento" }).click();
    await page.getByRole("alert").filter({ hasText: "No se pudo confirmar si se guardó" }).waitFor();
    assert.equal(await page.inputValue("#libro-detail"), "Proveedor de bolsas");
    assert.equal(await page.inputValue("#libro-amount"), "8.400,50");
    assert.equal(await page.inputValue("#libro-type"), "EGRESO");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("libro vacío: «Cargar un movimiento» deja el foco en el Detalle, listo para tipear", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("libro");
    await page.getByRole("link", { name: "Cargar un movimiento" }).click();
    assert.equal(await page.evaluate(() => document.activeElement?.id), "libro-detail");
    await page.keyboard.type("Fondo inicial");
    assert.equal(await page.inputValue("#libro-detail"), "Fondo inicial");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("412 px con el CSS real: el cierre entra sin scroll horizontal y sus botones son de 44 px", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    if (!css) return t.skip("no se pudo compilar el CSS de la app");
    const { page, errores } = await montar("cierre", true);
    await page.fill("#declarado-EFECTIVO", "47.000");
    await page.fill("#cierre-note", "faltó cambio");
    await page.keyboard.press("Control+Enter");
    await page.getByText("¿Cerrar el día 23/09/2026?").waitFor();
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(ancho <= 412, `sin scroll horizontal (${ancho})`);
    for (const nombre of ["Sí, cerrar el día", "Volver a revisar"]) {
      const caja = await page.getByRole("button", { name: nombre }).boundingBox();
      assert.ok(caja && caja.height >= 44, `${nombre}: ${caja?.height}px`);
    }
    for (const id of ["#declarado-EFECTIVO", "#declarado-MP", "#declarado-TARJETA"]) {
      const caja = await page.locator(id).boundingBox();
      assert.ok(caja && caja.height >= 44, `${id}: ${caja?.height}px`);
      assert.equal(await page.locator(id).getAttribute("inputmode"), "decimal");
    }
    assert.deepEqual(errores, []);
    await page.close();
  });
});
