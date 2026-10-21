// ============================================================================
// STUDIO DE REDES Y CÁMARAS DE LA DEMO en un navegador de verdad — clic por clic, en la PC y en el celular.
// ============================================================================
//
// Hermano de solapas-pantalla.test.ts (mismo armado: ClubDemo REAL con esbuild, el CSS REAL de la app y el Chromium
// de Playwright; sin Next ni base). Se prueba:
//   · el Studio desde el calendario: abre como diálogo con el foco en «Plantilla», la placa se dibuja, el caption se
//     rearma al escribir, editarlo a mano y «Volver al sugerido», historia = lienzo de 1080 × 1920, copiar, bajar el
//     PNG, el caption vacío no se guarda, «Guardar en el calendario» agenda la publicación programada y el foco vuelve;
//   · el Studio desde la novedad que se arma (tipo, título y texto pasan a la placa) y Escape para cerrar;
//   · las cámaras en el Tablero de la demo: una por cancha y tres generales, ampliar en la hoja, la imagen se mueve
//     (y con «menos movimiento», queda quieta);
//   · 1024 y 390 px: sin scroll de costado, objetivos de 44 px y contraste AA dentro del Studio y del Tablero.
// Con CAPTURAS_STUDIO=<carpeta> deja capturas. Sin Chromium o sin esbuild, se saltea con el motivo.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";
import { irASolapa } from "./solapas-e2e";
import CamarasDeLaDemo from "./camaras-de-la-demo";
import type { Almacen } from "./almacen";

const RAIZ = fileURLToPath(new URL("../../../../../", import.meta.url));
const ORIGEN = "http://localhost:3999/admin/club";
const CAPTURAS = process.env.CAPTURAS_STUDIO ?? "";

const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import ClubDemo from "@/app/admin/(dashboard)/club/ClubDemo";
window.__montar = (negocio, usuario, rol) =>
  createRoot(document.getElementById("root")).render(createElement(ClubDemo, { negocio, usuario, rol }));
`;

type Ventana = { __montar: (negocio: string, usuario: string, rol: string) => void };

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

/** Lo que mide la página (corre en el navegador): objetivos de menos de 44 px y textos bajo AA dentro de `donde`. */
const MEDIR = (donde: string) => {
  const panel = document.querySelector(donde)!;
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && s.visibility !== "hidden" && s.clip !== "rect(0px, 0px, 0px, 0px)";
  };
  const chicos = [...panel.querySelectorAll("button, select, input:not([type=radio]):not([type=checkbox]), textarea, a[href], summary")]
    .filter(visible)
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.height < 44 || r.width < 44)
    .map(({ el, r }) => `${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)} (${Math.round(r.width)}×${Math.round(r.height)})`);

  const lienzo = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  const rgba = (css: string): [number, number, number, number] => {
    lienzo.clearRect(0, 0, 1, 1);
    lienzo.fillStyle = "#000";
    lienzo.fillStyle = css;
    lienzo.fillRect(0, 0, 1, 1);
    const d = lienzo.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const sobre = (a: [number, number, number, number], b: [number, number, number]): [number, number, number] => [0, 1, 2].map((i) => a[i] * a[3] + b[i] * (1 - a[3])) as [number, number, number];
  const fondoDe = (el: Element | null): [number, number, number] => {
    const capas: [number, number, number, number][] = [];
    for (let x = el; x; x = x.parentElement) {
      const c = rgba(getComputedStyle(x).backgroundColor);
      if (c[3] > 0) capas.push(c);
      if (c[3] >= 1) break;
    }
    let base: [number, number, number] = [255, 255, 255];
    for (const c of capas.reverse()) base = sobre(c, base);
    return base;
  };
  const lum = ([r, g, b]: number[]) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const bajos: string[] = [];
  for (const el of panel.querySelectorAll("*")) {
    const tieneTexto = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
    if (!tieneTexto || !visible(el) || (el as HTMLElement).closest("[disabled]")) continue;
    if (el.tagName === "TEXTAREA" || el.tagName === "OPTION") continue; // el texto que escribió la persona (el control ya se mide)
    const s = getComputedStyle(el);
    const fondo = fondoDe(el);
    const texto = sobre(rgba(s.color), fondo);
    const [a, b] = [lum(texto), lum(fondo)].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    const px = parseFloat(s.fontSize);
    const grande = px >= 24 || (px >= 18.66 && Number(s.fontWeight) >= 700);
    if (ratio < (grande ? 3 : 4.5)) bajos.push(`«${el.textContent!.trim().slice(0, 30)}» ${ratio.toFixed(2)}:1`);
  }
  const caja = panel.getBoundingClientRect();
  return { chicos, bajos, corre: Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, panel.scrollWidth - panel.clientWidth, caja.right - window.innerWidth) };
};

test("las cámaras sólo existen en la demo: en la jornada real no pintan nada", () => {
  assert.equal(CamarasDeLaDemo({ almacen: { modo: () => "real" } as unknown as Almacen }), null);
});

describe("Studio de redes y cámaras de la demo en el navegador", { timeout: 240_000 }, () => {
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
      loader: { ".css": "empty" },
      write: false,
      format: "iife",
      jsx: "automatic",
      tsconfig: join(RAIZ, "tsconfig.json"),
      define: { "process.env.NODE_ENV": '"production"' },
      loader: { ".css": "empty" }, // la piel (piel/*.css) la pone la página, no el bundle
      logLevel: "silent",
      // Las pieles de cada pantalla (piel/*.css) las sirve Next; acá alcanza con el CSS de la app.
    });
    bundle = r.outputFiles[0].text;
    css = await cssDeLaApp();
    browser = await playwright.chromium.launch({ executablePath: chrome });
    if (CAPTURAS) mkdirSync(CAPTURAS, { recursive: true });
  });

  after(async () => {
    await browser?.close();
  });

  async function montar(viewport = { width: 1024, height: 768 }, movimiento: "reduce" | "no-preference" = "no-preference"): Promise<{ page: Page; errores: string[] }> {
    const p = await browser!.newPage({ viewport, locale: "es-AR", acceptDownloads: true, reducedMotion: movimiento });
    const errores: string[] = [];
    p.on("pageerror", (e) => errores.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errores.push(m.text());
    });
    const html = `<!doctype html><html lang="es"><head><style>${css}</style></head><body class="bg-surface text-body"><main id="root" class="p-4"></main></body></html>`;
    await p.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html }));
    // Las tipografías de la placa vienen de Google Fonts: acá, sin red, una hoja vacía (la placa usa las de respaldo).
    await p.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
    await p.addInitScript({ content: "window.__name = (f) => f;" });
    await p.goto(ORIGEN);
    await p.addScriptTag({ content: bundle });
    await p.evaluate(() => (window as unknown as Ventana).__montar("demo-club", "u_owner", "OWNER"));
    await p.getByRole("heading", { name: "Agenda de canchas" }).waitFor();
    return { page: p, errores };
  }

  const capturar = async (page: Page, nombre: string) => {
    if (CAPTURAS) await page.screenshot({ path: join(CAPTURAS, `${nombre}.png`), fullPage: true });
  };
  const aviso = (page: Page, texto: string | RegExp) => page.getByRole("status").filter({ hasText: texto }).waitFor();
  const revisar = async (page: Page, que: string, donde: string) => {
    const m = await page.evaluate(MEDIR, donde);
    assert.deepEqual(m.chicos, [], `${que}: objetivos de menos de 44 px`);
    assert.deepEqual(m.bajos, [], `${que}: textos bajo AA`);
    assert.ok(m.corre <= 0, `${que}: se corre de costado ${m.corre} px`);
  };
  /** Un hash del lienzo (para saber si cambió lo dibujado). */
  const huella = (page: Page, selector: string) =>
    page.evaluate((s) => {
      const cv = document.querySelector<HTMLCanvasElement>(s)!;
      const d = cv.getContext("2d")!.getImageData(0, 0, cv.width, cv.height).data;
      let h = 0;
      for (let i = 0; i < d.length; i += 1) h = (h * 31 + d[i]) | 0;
      return h;
    }, selector);

  test("el Studio desde el calendario: placa, caption, historia, copiar, PNG, caption vacío y «Guardar en el calendario»", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:3999" });
    await irASolapa(page, "Novedades y redes");
    const abrir = page.getByRole("button", { name: "Abrir el Studio de redes (imágenes y textos)" });
    await abrir.click();
    const studio = page.getByRole("dialog", { name: "Studio de redes" });
    await studio.waitFor();
    await page.waitForFunction(() => document.activeElement?.tagName === "SELECT", undefined, { timeout: 3000 });
    assert.equal(await page.evaluate(() => (document.activeElement as HTMLSelectElement).value), "torneo", "el foco va a «Plantilla», con el torneo de ejemplo");
    const placa = studio.getByRole("img", { name: /^Vista previa: Torneo, post cuadrado, Torneo relámpago de primavera$/ });
    await placa.waitFor();
    assert.notEqual(await huella(page, "dialog canvas"), 0, "la placa está dibujada");
    const caption = studio.getByLabel("Caption sugerido (lo podés editar)");
    assert.match(await caption.inputValue(), /^🏆 Torneo relámpago de primavera\n\n🎾 Categorías: 4ta, 5ta y 6ta/);
    if (CAPTURAS) await page.screenshot({ path: join(CAPTURAS, "studio-torneo-1024.png") }); // el diálogo es fijo: sin fullPage

    // Otra plantilla: sus campos con sus etiquetas, y lo que se escribe va a la placa y al caption.
    await studio.getByLabel("Plantilla").selectOption("buffet");
    await studio.getByLabel("Plato").fill("Tostado de jamón y queso");
    await studio.getByLabel("Precio", { exact: true }).fill("$6.500");
    assert.equal(await studio.getByLabel("Categorías").count(), 0, "los campos del torneo no están");
    await studio.getByRole("img", { name: /Buffet · Delicias, post cuadrado, Tostado de jamón y queso$/ }).waitFor();
    assert.match(await caption.inputValue(), /^🍽️ Tostado de jamón y queso · \$6\.500/);

    // El caption a mano deja de rearmarse hasta «Volver al sugerido».
    await caption.fill("Hoy tostados 🥪");
    await studio.getByLabel("Plato").fill("Tostado mixto");
    assert.equal(await caption.inputValue(), "Hoy tostados 🥪");
    await studio.getByRole("button", { name: "Volver al sugerido" }).click();
    assert.match(await caption.inputValue(), /^🍽️ Tostado mixto · \$6\.500/);
    assert.equal(await studio.getByRole("button", { name: "Volver al sugerido" }).count(), 0);

    // Historia: el lienzo toma 1080 × 1920.
    await studio.getByLabel("Formato").selectOption("historia");
    await studio.getByRole("img", { name: /historia, Tostado mixto$/ }).waitFor();
    await page.waitForFunction(() => document.querySelector<HTMLCanvasElement>("dialog canvas")?.height === 1920, undefined, { timeout: 3000 });

    await studio.getByRole("button", { name: "Copiar caption" }).click();
    await studio.getByRole("status").filter({ hasText: "Caption copiado: pegalo en Instagram." }).waitFor();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /^🍽️ Tostado mixto/);

    const [descarga] = await Promise.all([page.waitForEvent("download"), studio.getByRole("button", { name: "Descargar imagen (PNG)" }).click()]);
    const fecha = await studio.getByLabel("Día de publicación").inputValue();
    assert.match(fecha, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(descarga.suggestedFilename(), `breakpoint-buffet-${fecha}.png`);

    // Sin caption no se guarda: el motivo, y el Studio sigue abierto.
    await caption.fill("   ");
    await studio.getByRole("button", { name: "Guardar en el calendario" }).click();
    await studio.getByRole("alert").filter({ hasText: "El caption está vacío" }).waitFor();
    await studio.getByRole("button", { name: "Volver al sugerido" }).click();

    await studio.getByLabel("Hora").fill("12:30");
    await studio.getByRole("button", { name: "Guardar en el calendario" }).click();
    await studio.waitFor({ state: "detached" });
    const [a, m, d] = fecha.split("-").map(Number);
    await aviso(page, `Publicación agendada para el ${d}/${m}.`);
    assert.ok(a > 2000);
    // En el calendario (agenda del celular o grilla del mes: alguna de las dos está a la vista).
    const pub = page.getByRole("button", { name: "12:30 · Tostado mixto · Instagram · historia · Programado" });
    assert.ok((await pub.count()) >= 1, "la publicación quedó programada en el calendario");
    await page.waitForFunction(() => document.activeElement?.textContent?.includes("Abrir el Studio de redes"), undefined, { timeout: 3000 });
    // «Deshacer» la saca, como cualquier publicación.
    await page.getByRole("button", { name: "Deshacer" }).click();
    await aviso(page, /^Listo, se deshizo/);
    assert.equal(await pub.count(), 0);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("el Studio desde la novedad que se arma: el tipo, el título y el texto pasan a la placa; Escape cierra", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    await irASolapa(page, "Novedades y redes");
    await page.getByRole("heading", { name: "Novedades del club · difusión por WhatsApp" }).waitFor();
    await page.getByLabel("Tipo").selectOption("promo");
    await page.getByLabel("Título", { exact: true }).fill("2x1 en turnos de valle");
    await page.getByLabel("Texto", { exact: true }).fill("De lunes a viernes, de 10 a 16.");
    const boton = page.getByRole("button", { name: "Hacer la imagen en el Studio" });
    await boton.click();
    const studio = page.getByRole("dialog", { name: "Studio de redes" });
    await studio.waitFor();
    assert.equal(await studio.getByLabel("Plantilla").inputValue(), "promo");
    assert.equal(await studio.getByLabel("Título", { exact: true }).inputValue(), "2x1 en turnos de valle");
    assert.equal(await studio.getByLabel("Detalle (opcional)").inputValue(), "De lunes a viernes, de 10 a 16.");
    assert.equal(await studio.getByLabel("Precio o descuento").inputValue(), "", "lo que no trajo queda vacío");
    assert.match(await studio.getByLabel("Caption sugerido (lo podés editar)").inputValue(), /^🔥 2x1 en turnos de valle\n\nDe lunes a viernes/);
    // Lo de atrás queda inerte mientras está abierto (modal).
    assert.equal(await page.evaluate(() => document.querySelector("dialog")?.matches(":modal")), true);
    await page.keyboard.press("Escape");
    await studio.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.textContent === "Hacer la imagen en el Studio", undefined, { timeout: 3000 });
    // No se guardó nada: el borrador sigue.
    assert.equal(await page.getByLabel("Título", { exact: true }).inputValue(), "2x1 en turnos de valle");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("las cámaras en el Tablero de la demo: una por cancha y tres generales, ampliar, se mueven; con menos movimiento, quietas", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    for (const movimiento of ["no-preference", "reduce"] as const) {
      const { page, errores } = await montar(undefined, movimiento);
      await irASolapa(page, "Tablero");
      const camaras = page.getByRole("list", { name: "Cámaras del club" });
      await camaras.waitFor();
      const teclas = camaras.getByRole("button");
      assert.equal(await teclas.count(), 7, "4 canchas + recepción, bar y estacionamiento");
      assert.match((await teclas.first().getAttribute("aria-label"))!, /^Cámara Cancha 1: .+\. Ampliar$/);
      assert.equal(await teclas.last().getAttribute("aria-label"), "Cámara Estacionamiento: General. Ampliar");
      await page.getByText("Simulación de demo.", { exact: false }).waitFor();
      // Fuera de pantalla no se dibuja: se lleva a la vista y se espera un par de cuadros.
      await camaras.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const h1 = await huella(page, "canvas[data-cam='0']");
      await page.waitForTimeout(400);
      const h2 = await huella(page, "canvas[data-cam='0']");
      if (movimiento === "reduce") assert.equal(h1, h2, "con menos movimiento la imagen queda quieta");
      else assert.notEqual(h1, h2, "la imagen se mueve");

      await teclas.first().click();
      const hoja = page.getByRole("dialog", { name: "CAM 01 · Cancha 1" });
      await hoja.waitFor();
      await hoja.getByRole("img", { name: /^Vista ampliada de la cámara Cancha 1: / }).waitFor();
      if (movimiento === "no-preference" && CAPTURAS) await page.screenshot({ path: join(CAPTURAS, "camaras-ampliada-1024.png") });
      await page.keyboard.press("Escape");
      await hoja.waitFor({ state: "detached" });
      assert.deepEqual(errores, []);
      await page.close();
    }
  });

  test("Studio y cámaras a 1024 y 390 px: sin scroll de costado, objetivos de 44 px y contraste AA", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    if (!css) return t.skip("no se pudo compilar el CSS de la app");
    for (const w of [1024, 390]) {
      const { page, errores } = await montar({ width: w, height: w === 390 ? 844 : 768 });
      await irASolapa(page, "Tablero");
      await page.getByRole("list", { name: "Cámaras del club" }).waitFor();
      await revisar(page, `Tablero con las cámaras a ${w} px`, "[role=tabpanel]");
      await capturar(page, `camaras-tablero-${w}`);

      await irASolapa(page, "Novedades y redes");
      await page.getByRole("button", { name: "Hacer la imagen en el Studio" }).click();
      const studio = page.getByRole("dialog", { name: "Studio de redes" });
      await studio.waitFor();
      await studio.getByLabel("Título", { exact: true }).fill("Escuelita de pádel: arrancan grupos nuevos");
      await studio.getByLabel("Texto", { exact: true }).fill("Martes y jueves de 18 a 19, para chicos de 7 a 14.");
      await studio.getByRole("img", { name: /Escuelita/ }).waitFor();
      await revisar(page, `Studio a ${w} px`, "dialog[open]");
      // El caption a mano, para medir también «Volver al sugerido».
      await studio.getByLabel("Caption sugerido (lo podés editar)").fill("Arrancan los grupos nuevos.");
      await studio.getByRole("button", { name: "Copiar caption" }).click();
      await revisar(page, `Studio con el caption a mano a ${w} px`, "dialog[open]");
      if (CAPTURAS) {
        await page.evaluate(() => document.querySelector("dialog")!.scrollTo(0, 0));
        await page.screenshot({ path: join(CAPTURAS, `studio-${w}.png`) });
        // El diálogo scrollea por dentro: la segunda pantalla, con la placa y las acciones.
        await studio.getByRole("button", { name: "Guardar en el calendario" }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(CAPTURAS, `studio-${w}-acciones.png`) });
      }
      assert.deepEqual(errores, []);
      await page.close();
    }
  });
});
