// ============================================================================
// RECUENTO en un navegador de verdad, a 412 px — el criterio de la ola 4, tecleado.
// ============================================================================
//
// "Contar una góndola de 20 productos en el celular sin perder lo cargado al bloquear la
// pantalla." El formulario REAL (RecuentoForm) armado con esbuild y montado en el Chromium de
// Playwright con el CSS REAL (globals.css compilado con el Tailwind del build), dentro del
// mismo armado del shell de un negocio por apps: la raíz con `--alto-barra-inferior`
// (layout.tsx), el contenido con su padding de abajo (AdminShell) y una barra fija abajo del
// alto de la barra de espacios. La acción del servidor se reemplaza por un doble que anota lo
// que viaja. Sin Next ni base: la pantalla entera con el shell la mide el gate visual.
//
// El bloqueo de pantalla con la pestaña descartada (lo que hace Android para liberar memoria)
// se reproduce cerrando la página y abriendo otra en el mismo navegador: lo único que
// sobrevive es lo que la página dejó anotado en el teléfono.
//
// El doble de la acción también hace de "servidor" en lo que le importa a la planilla: anota
// en `qa.servidor` (del mismo navegador) cuándo se recontó cada producto, y la planilla de la
// próxima apertura lo trae como `ultimoRecuento`, igual que getRecuentoData. Con eso se prueba
// el Guardar que entró pero no respondió (`window.__cortar`).

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, BrowserContext, Page } from "playwright";

const RAIZ = fileURLToPath(new URL("../../../../../../", import.meta.url));
const ORIGEN = "http://magra.recuento.test";
const CLAVE = "gsg.recuento.v1.t_magra.u_encargado";

const ACCION_FALSA = `
export async function registrarRecuento(_prev, fd) {
  const o = {};
  for (const k of new Set(fd.keys())) o[k] = fd.getAll(k).map(String);
  window.__envios.push(o);
  if (window.__rechazo) return { ok: false, error: window.__rechazo };
  // "llega": se guarda y la respuesta se pierde. "no-llega": se corta antes de guardar.
  if (window.__cortar !== "llega" && window.__cortar) throw new TypeError("Failed to fetch");
  const servidor = JSON.parse(localStorage.getItem("qa.servidor") || "{}");
  for (const id of o.productId) servidor[id] = new Date().toISOString();
  localStorage.setItem("qa.servidor", JSON.stringify(servidor));
  if (window.__cortar === "llega") throw new TypeError("Failed to fetch");
  return { ok: true, mensaje: "Recuento guardado: " + o.productId.length + " productos.", recuento: [] };
}
export async function createStockAdjustment() { return null; }
`;

const ENTRADA = `
import { createElement } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import RecuentoForm from "@/app/admin/(dashboard)/ajustes/recuento/RecuentoForm";
window.__envios = [];
const vaca = [
  "Asado", "Bife ancho", "Bife angosto", "Colita de cuadril", "Cuadrada", "Entraña", "Falda", "Lomo",
  "Matambre", "Nalga", "Ojo de bife", "Osobuco", "Paleta", "Palomita", "Peceto", "Picaña",
  "Roast beef", "Tapa de asado", "Tapa de nalga", "Vacío",
].map((nombre, i) => ({
  id: "v" + i, nombre, unidad: "kg", kilo: true, stock: 5 + i, costo: 9000, ultimoRecuento: null,
}));
const gondolas = [
  { id: "vaca", nombre: "Vaca", productos: vaca },
  { id: "cerdo", nombre: "Cerdo", productos: [
    { id: "c0", nombre: "Bondiola", unidad: "kg", kilo: true, stock: 3, costo: 7000, ultimoRecuento: null },
    { id: "c1", nombre: "Pechito", unidad: "kg", kilo: true, stock: 2, costo: 6000, ultimoRecuento: null },
  ] },
];
// Lo que el "servidor" tiene anotado como último recuento de cada producto.
const conUltimoRecuento = () => {
  const servidor = JSON.parse(localStorage.getItem("qa.servidor") || "{}");
  return gondolas.map((g) => ({
    ...g,
    productos: g.productos.map((p) => ({ ...p, ultimoRecuento: servidor[p.id] ?? null })),
  }));
};
const planilla = () =>
  createElement(RecuentoForm, {
    gondolas: conUltimoRecuento(), conCostos: true, ahoraServidor: Date.now(), productoInicial: null, conTope: true,
    claveBorrador: ${JSON.stringify(CLAVE)},
  });
// "cliente": se arma en el navegador (navegar dentro del panel). "servidor": el HTML llega armado
// sin el almacenamiento del teléfono y React lo hidrata (abrir la página, o volver a una pestaña
// descartada), como hace Next.
window.__montar = (modo) => {
  const raiz = document.getElementById("root");
  if (modo === "servidor") {
    raiz.innerHTML = renderToString(planilla());
    window.__htmlDelServidor = raiz.innerHTML;
    hydrateRoot(raiz, planilla(), { onRecoverableError: (e) => window.__erroresDeHidratacion.push(String(e)) });
  } else {
    createRoot(raiz).render(planilla());
  }
};
window.__erroresDeHidratacion = [];
`;

type Envio = Record<string, string[]>;
type Modo = "cliente" | "servidor";
type Ventana = { __envios: Envio[]; __rechazo?: string; __cortar?: "llega" | "no-llega"; __montar: (modo: Modo) => void; __erroresDeHidratacion: string[]; __htmlDelServidor?: string };

// Las mismas medidas que el shell de un negocio por apps (layout.tsx y AdminShell.tsx): la barra
// de espacios del celular mide 3.5rem + 1px; acá la ocupa un bloque fijo de ese alto.
const BARRA_PX = 57;

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

describe("Recuento en el celular", { timeout: 120_000 }, () => {
  let browser: Browser | null = null;
  let html = "";
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
      // `next/navigation` (unstable_rethrow) lee variables que el build de Next reemplaza.
      banner: { js: "var process = { env: {} };" },
      logLevel: "silent",
      plugins: [
        {
          name: "falsos",
          setup(b) {
            b.onResolve({ filter: /^@\/lib\/stock-adjustment-actions$/ }, () => ({ path: "acciones", namespace: "falso" }));
            b.onLoad({ filter: /.*/, namespace: "falso" }, () => ({ contents: ACCION_FALSA, loader: "js", resolveDir: RAIZ }));
          },
        },
      ],
    });
    const postcss = (await import("postcss")).default;
    const tailwind = (await import("@tailwindcss/postcss")).default as unknown as (o: { base: string }) => import("postcss").AcceptedPlugin;
    const archivo = join(RAIZ, "src", "app", "globals.css");
    const css = (await postcss([tailwind({ base: RAIZ })]).process(readFileSync(archivo, "utf8"), { from: archivo })).css;
    // El recuento vive en /admin/ajustes/recuento: <main class="mx-auto max-w-3xl px-4 ...">.
    html =
      `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>` +
      `<body class="bg-surface"><div class="min-h-screen bg-surface text-body [--alto-barra-inferior:calc(3.5rem_+_1px_+_env(safe-area-inset-bottom))] lg:[--alto-barra-inferior:0px]">` +
      `<div id="contenido" class="flex-1 pb-[var(--alto-barra-inferior,0px)]"><div style="height:140px">encabezado y título</div>` +
      `<main class="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8"><div id="root"></div></main></div>` +
      `<div id="barra" style="position:fixed;left:0;right:0;bottom:0;height:${BARRA_PX}px;background:#222;z-index:40"></div></div>` +
      `<script>${r.outputFiles[0].text.replace(/<\/script/g, "<\\/script")}</script></body></html>`;
    browser = await playwright.chromium.launch({ executablePath: chrome });
  });

  after(async () => {
    await browser?.close();
  });

  async function contexto(): Promise<BrowserContext> {
    const ctx = await browser!.newContext({ viewport: { width: 412, height: 915 }, locale: "es-AR", hasTouch: true, isMobile: true });
    // Un origen de verdad (el almacenamiento del teléfono es por sitio): la misma página siempre.
    await ctx.route(`${ORIGEN}/**`, (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }));
    return ctx;
  }

  async function abrir(ctx: BrowserContext, modo: Modo = "cliente"): Promise<{ page: Page; errores: string[] }> {
    const page = await ctx.newPage();
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("dialog", (d) => void d.accept());
    await page.goto(`${ORIGEN}/admin/ajustes/recuento`);
    await page.evaluate((m) => (window as unknown as Ventana).__montar(m), modo);
    await page.locator("#cont-v0").waitFor();
    if (modo === "servidor") {
      // La hidratación no se quejó: la primera pintura del teléfono es la del servidor.
      assert.deepEqual(await page.evaluate(() => (window as unknown as Ventana).__erroresDeHidratacion), []);
    }
    return { page, errores };
  }

  /** El campo con el foco se ve: no quedó debajo del pie pegado (avance + Guardar). */
  async function focoALaVista(page: Page) {
    const m = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const r = el.getBoundingClientRect();
      const pie = document.getElementById("recuento-pie")!.getBoundingClientRect();
      return { id: el.id, arriba: r.top, abajo: r.bottom, pie: pie.top };
    });
    assert.ok(m.arriba >= 0 && m.abajo <= m.pie + 0.5, `${m.id} queda a la vista (${Math.round(m.arriba)}–${Math.round(m.abajo)}, el pie arranca en ${Math.round(m.pie)})`);
  }

  /** Guardar se ve entero y no queda tapado por la barra de espacios de abajo. */
  async function guardarAlAlcance(page: Page) {
    const caja = await page.locator("#recuento-guardar").boundingBox();
    assert.ok(caja, "Guardar está en la pantalla");
    assert.ok(caja.y >= 0, "Guardar no quedó arriba, fuera de la pantalla");
    assert.ok(caja.y + caja.height <= 915 - BARRA_PX + 0.5, `Guardar queda por encima de la barra (${caja.y + caja.height} > ${915 - BARRA_PX})`);
    assert.ok(caja.height >= 44, "Guardar mide 44 px o más");
  }

  test("20 productos de una góndola con el teclado; se bloquea la pantalla a la mitad y no se pierde nada", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const ctx = await contexto();
    const { page, errores } = await abrir(ctx);

    // Primera mitad: sólo teclado, "Siguiente" salta al de abajo.
    await page.locator("#cont-v0").focus();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.type(`${i + 1},5`);
      await page.keyboard.press("Enter");
      await focoALaVista(page);
    }
    assert.equal(await page.evaluate(() => document.activeElement?.id), "cont-v12", "Enter pasa al producto de abajo");
    await guardarAlAlcance(page);
    await page.getByText("12 de 20").waitFor();
    const antes = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), CLAVE)) ?? "null");
    assert.equal(Object.keys(antes.conteos).length, 12, "los 12 quedaron anotados en el teléfono");
    const horaDelV0 = antes.conteos.v0.contadoA as number;

    // La pantalla se bloquea y el navegador descarta la pestaña: se cierra sin avisar. Al volver,
    // la página se pide de nuevo: llega armada del servidor (sin el borrador) y se hidrata.
    await page.close({ runBeforeUnload: false });
    const vuelta = await abrir(ctx, "servidor");
    const p2 = vuelta.page;
    await p2.getByText("Seguís donde habías dejado: 12 conteos anotados").waitFor();
    // El HTML del servidor venía vacío: lo recuperado lo puso el teléfono, sin pisar el borrador.
    assert.ok(!(await p2.evaluate(() => (window as unknown as Ventana).__htmlDelServidor ?? "")).includes("Seguís donde"));
    assert.equal(await p2.inputValue("#cont-v0"), "1,5");
    assert.equal(await p2.inputValue("#cont-v11"), "12,5");
    assert.equal(await p2.inputValue("#cont-v12"), "");
    await p2.getByText("12 de 20").waitFor();

    // Segunda mitad, desde donde quedó. Al terminar la góndola, el foco va a "Seguir con Cerdo".
    await p2.locator("#cont-v12").focus();
    for (let i = 12; i < 20; i++) {
      await p2.keyboard.type(`${i + 1}`);
      await p2.keyboard.press("Enter");
      await focoALaVista(p2);
    }
    assert.equal(await p2.evaluate(() => document.activeElement?.id), "recuento-proxima", "al final de la góndola se ofrece la próxima");
    await p2.getByText("20 de 20").waitFor();
    await guardarAlAlcance(p2);

    // Guardar: viajan los 20, con la forma canónica y la hora ORIGINAL de cada conteo (la de
    // antes del bloqueo, no la de cuando se volvió a abrir).
    await p2.getByRole("button", { name: "Guardar recuento (20)" }).click();
    await p2.waitForFunction(() => (window as unknown as Ventana).__envios.length === 1);
    const envio = await p2.evaluate(() => (window as unknown as Ventana).__envios[0]);
    assert.equal(envio.productId.length, 20);
    assert.equal(envio.value[envio.productId.indexOf("v0")], "1.5");
    assert.equal(envio.value[envio.productId.indexOf("v19")], "20");
    assert.equal(Number(envio.contadoA[envio.productId.indexOf("v0")]), horaDelV0);
    assert.ok(Number(envio.enviadoA[0]) >= horaDelV0);

    // Guardado: la planilla vuelve a empezar y el borrador se borra.
    await p2.getByText("Recuento guardado: 20 productos.").waitFor();
    assert.equal(await p2.evaluate((k) => localStorage.getItem(k), CLAVE), null);
    assert.equal(await p2.inputValue("#cont-v0"), "");
    assert.deepEqual([...errores, ...vuelta.errores], []);
    await ctx.close();
  });

  test("si el servidor rechaza el recuento, lo contado sigue cargado y anotado", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const ctx = await contexto();
    const { page, errores } = await abrir(ctx);
    await page.evaluate(() => {
      (window as unknown as Ventana).__rechazo = "El faltante pasa tu tope por carga: lo guarda la dueña o el dueño.";
    });
    await page.locator("#cont-v0").fill("1");
    await page.locator("#cont-v1").fill("2");
    await page.getByRole("button", { name: "Guardar recuento (2)" }).click();
    await page.getByText("No se guardó el recuento").waitFor();
    await page.getByText("Lo que contaste sigue cargado.").waitFor();
    assert.equal(await page.inputValue("#cont-v1"), "2");
    const borrador = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), CLAVE)) ?? "null");
    assert.deepEqual(Object.keys(borrador.conteos).sort(), ["v0", "v1"]);
    assert.deepEqual(errores, []);
    await ctx.close();
  });

  test("un Guardar que entró pero no respondió: no se puede volver a guardar y al recargar no vuelve", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const ctx = await contexto();
    const { page, errores } = await abrir(ctx);
    await page.locator("#cont-v0").fill("8");
    await page.locator("#cont-v1").fill("3");
    await page.locator("#cont-v2").fill("4");
    await page.evaluate(() => {
      (window as unknown as Ventana).__cortar = "llega";
    });
    await page.getByRole("button", { name: "Guardar recuento (3)" }).click();
    await page.getByText("No sabemos si se guardó").waitFor();
    // Lo contado sigue a la vista, pero Guardar queda trabado hasta recargar.
    assert.equal(await page.inputValue("#cont-v0"), "8");
    assert.equal(await page.locator("#recuento-guardar").isDisabled(), true);
    await page.getByRole("button", { name: "Recargar" }).waitFor();
    const borrador = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), CLAVE)) ?? "null");
    assert.equal(typeof borrador.enviadoA, "number", "el borrador sabe que se estaba guardando");

    // Se recarga (o la pestaña se había descartado): la planilla trae el último recuento de esos
    // tres, posterior a sus conteos. No vuelven, y se dice por qué.
    await page.close({ runBeforeUnload: false });
    const vuelta = await abrir(ctx, "servidor");
    const p2 = vuelta.page;
    await p2.getByText("El último Guardar se cortó pero llegó: 3 conteos ya estaban guardados").waitFor();
    assert.equal(await p2.inputValue("#cont-v0"), "");
    assert.equal(await p2.inputValue("#cont-v2"), "");
    assert.equal(await p2.locator("#recuento-guardar").isDisabled(), true, "no hay nada para volver a mandar");
    assert.equal(await p2.evaluate((k) => localStorage.getItem(k), CLAVE), null, "el borrador ya no guarda esos conteos");
    assert.equal(await p2.evaluate(() => (window as unknown as Ventana).__envios.length), 0);
    assert.deepEqual([...errores, ...vuelta.errores], []);
    await ctx.close();
  });

  test("un Guardar que se cortó antes de llegar: al recargar lo contado vuelve y se puede guardar", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const ctx = await contexto();
    const { page, errores } = await abrir(ctx);
    await page.locator("#cont-v0").fill("8");
    await page.locator("#cont-v1").fill("3");
    await page.evaluate(() => {
      (window as unknown as Ventana).__cortar = "no-llega";
    });
    await page.getByRole("button", { name: "Guardar recuento (2)" }).click();
    await page.getByText("No sabemos si se guardó").waitFor();
    await page.close({ runBeforeUnload: false });
    const vuelta = await abrir(ctx, "servidor");
    const p2 = vuelta.page;
    await p2.getByText("Seguís donde habías dejado: 2 conteos anotados").waitFor();
    await p2.getByText("no figura guardado").waitFor();
    assert.equal(await p2.inputValue("#cont-v0"), "8");
    // Ya se sabe qué pasó: la marca de "se estaba guardando" se saca del borrador.
    const borrador = JSON.parse((await p2.evaluate((k) => localStorage.getItem(k), CLAVE)) ?? "null");
    assert.equal(borrador.enviadoA, undefined);
    await p2.getByRole("button", { name: "Guardar recuento (2)" }).click();
    await p2.getByText("Recuento guardado: 2 productos.").waitFor();
    assert.deepEqual([...errores, ...vuelta.errores], []);
    await ctx.close();
  });

  test("reabrir la pantalla no rejuvenece el borrador: la regla de un día vale también para la nota", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const ctx = await contexto();
    const primera = await abrir(ctx);
    await primera.page.locator("#cont-v3").fill("7");
    const antes = JSON.parse((await primera.page.evaluate((k) => localStorage.getItem(k), CLAVE)) ?? "null");
    await primera.page.close({ runBeforeUnload: false });
    await new Promise((r) => setTimeout(r, 50));
    const { page, errores } = await abrir(ctx, "servidor");
    await page.getByText("1 conteo anotado").waitFor();
    const despues = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), CLAVE)) ?? "null");
    assert.equal(despues.guardadoA, antes.guardadoA);
    // Un cambio de verdad sí lo actualiza.
    await page.locator("#cont-v4").fill("2");
    const cambiado = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), CLAVE)) ?? "null");
    assert.ok(cambiado.guardadoA > antes.guardadoA);
    assert.deepEqual([...primera.errores, ...errores], []);
    await ctx.close();
  });

  test("'Empezar de cero' tira el borrador recuperado", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const ctx = await contexto();
    const primera = await abrir(ctx);
    await primera.page.locator("#cont-v3").fill("7");
    await primera.page.close({ runBeforeUnload: false });
    const { page, errores } = await abrir(ctx, "servidor");
    await page.getByText("1 conteo anotado").waitFor();
    await page.getByRole("button", { name: "Empezar de cero" }).click();
    assert.equal(await page.inputValue("#cont-v3"), "");
    assert.equal(await page.evaluate((k) => localStorage.getItem(k), CLAVE), null);
    assert.deepEqual([...primera.errores, ...errores], []);
    await ctx.close();
  });

  test("a 412 px: nada se sale de la pantalla y todo lo que se toca mide 44 px o más", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const ctx = await contexto();
    const { page, errores } = await abrir(ctx);
    // Con algo cargado aparecen las diferencias y el total, que son las líneas más largas.
    await page.locator("#cont-v0").fill("4,350");
    await page.getByRole("button", { name: /^Cerdo/ }).click();
    await page.locator("#cont-c0").fill("1");
    const medida = await page.evaluate(() => {
      const chicos: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("#root button, #root input:not([type=checkbox]):not([type=hidden]), #root select, #root textarea")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (Math.min(r.width, r.height) < 44) chicos.push(`${el.tagName} "${(el.textContent || el.id).trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
      return { ancho: document.documentElement.scrollWidth, chicos };
    });
    assert.ok(medida.ancho <= 412, `sin scroll horizontal (mide ${medida.ancho})`);
    assert.deepEqual(medida.chicos, []);
    assert.deepEqual(errores, []);
    await ctx.close();
  });
});
