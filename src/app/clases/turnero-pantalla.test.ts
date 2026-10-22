// ============================================================================
// EL TURNERO Y «PAGAR» en un navegador de verdad (T3C) — clic por clic, a 390 px.
// ============================================================================
//
// Mismo armado que club/bloqueo-pantalla.test.ts: el Turnero y Pagar REALES con esbuild, adentro de
// la <Piel> real, el CSS REAL de la app (Tailwind) y el Chromium de Playwright. Las acciones del
// servidor (acciones-alumno.ts) se reemplazan por dobles que anotan qué se pidió: lo que se prueba
// acá es la pantalla. Se prueba:
//   · M-089: sin scroll horizontal a 390 px y el botón fijo de abajo a la vista; áreas de 44 px+;
//   · M-091: la 1ª vez sube «¿Quién sos?» → «¡Listo! Pediste tu clase · … falta que Matías la confirme»;
//   · M-092: sin celular del profe, no hay WhatsApp roto («Matías ya lo ve en su agenda…»);
//   · M-096: «Con amigos» y 3 → «$ 12.000 c/u · total $ 36.000» antes de elegir la hora;
//   · M-097: se ocupó recién → el chip desaparece y se sugieren las 2 más cercanas;
//   · M-094/M-095: con la cookie no se tipea nada (pide por el link) y puede nacer confirmada;
//   · M-108/M-109/M-110 y PDF: copiar alias y monto, un comprobante para 2 clases, sin alias.
//   · M-052: ningún `style` con un hex en lo que pinta la pantalla.
// Con CAPTURAS_TURNERO=<carpeta> deja capturas. Sin Chromium o sin esbuild, se saltea con el motivo.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const ORIGEN = "http://localhost:3999/clases";
const CAPTURAS = process.env.CAPTURAS_TURNERO ?? "";

const ENTRADA = `
import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import Turnero from "@/app/clases/Turnero";
import { Pagar } from "@/app/alumno/_vista/Pagar";
import { marcaProfe, varsCss } from "@/lib/padel/marca";
// La piel como en <Piel> (que es de servidor e importa el kit entero): las mismas variables --padel-*.
const Piel = ({ marca, children }) => h("div", { "data-piel": "padel", style: varsCss(marca), className: "min-h-dvh bg-[var(--padel-papel)] font-body text-[var(--padel-texto)]" }, children);
const raiz = () => createRoot(document.getElementById("root"));
window.__turnero = (props) => raiz().render(h(Piel, { marca: marcaProfe("") }, h("main", { className: "mx-auto grid max-w-[35rem] grid-cols-1 gap-4 px-4 pb-44 pt-4" }, h(Turnero, props))));
window.__pagar = (props) => raiz().render(h(Piel, { marca: marcaProfe("") }, h("main", { className: "mx-auto max-w-[35rem] p-4" }, h(Pagar, props))));
`;

// Dobles de las acciones del servidor: devuelven lo que el test deja en window.__resp y anotan la llamada.
const ACCIONES_FALSAS = `
const llamar = (nombre) => async (...args) => {
  (window.__llamadas ||= []).push({ nombre, args });
  const r = (window.__resp || {})[nombre];
  return typeof r === "function" ? r(...args) : r ?? { ok: false, error: "sin respuesta de prueba" };
};
export const pedirClase = llamar("pedirClase");
export const reservarDesdeLink = llamar("reservarDesdeLink");
export const pedirMiLink = llamar("pedirMiLink");
export const dejarMensaje = llamar("dejarMensaje");
export const subirComprobanteVarias = llamar("subirComprobanteVarias");
export const cancelarDesdeLink = llamar("cancelarDesdeLink");
export const cambiarHorarioDesdeLink = llamar("cambiarHorarioDesdeLink");
export const avisarNoVoy = llamar("avisarNoVoy");
export const recordarToken = llamar("recordarToken");
`;
const NAVEGACION_FALSA = `export const useRouter = () => ({ refresh: () => { window.__refrescos = (window.__refrescos || 0) + 1; } });`;

type Ventana = {
  __turnero: (p: unknown) => void;
  __pagar: (p: unknown) => void;
  __resp: Record<string, unknown>;
  __llamadas: { nombre: string; args: unknown[] }[];
};

// Viernes 23/10/2026, horas en Buenos Aires (UTC−3).
const iso = (d: string, hh: number) => new Date(`${d}T${String(hh + 3).padStart(2, "0")}:00:00.000Z`).toISOString();
const DIAS = [
  { fecha: "2026-10-23", etiqueta: "Hoy", horas: [iso("2026-10-23", 17), iso("2026-10-23", 18), iso("2026-10-23", 19), iso("2026-10-23", 20)] },
  { fecha: "2026-10-24", etiqueta: "Mañana", horas: [iso("2026-10-24", 10), iso("2026-10-24", 11)] },
  ...["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"].map((f, i) => ({ fecha: f, etiqueta: ["lun 26", "mar 27", "mié 28", "jue 29", "vie 30", "sáb 31"][i], horas: [iso(f, 18)] })),
];
const BASE = { dias: DIAS, precioIndividual: 25000, precioGrupal: 12000, profe: "Matías", wa: null, nombreApp: "Clases con Matías" };

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

describe("El turnero y Pagar en el navegador", { timeout: 240_000 }, () => {
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
      loader: { ".css": "empty" },
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
          name: "dobles",
          setup(b) {
            b.onResolve({ filter: /^@\/lib\/padel\/acciones-alumno$/ }, () => ({ path: "acciones", namespace: "doble" }));
            b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navegacion", namespace: "doble" }));
            b.onLoad({ filter: /.*/, namespace: "doble" }, (a) => ({ contents: a.path === "acciones" ? ACCIONES_FALSAS : NAVEGACION_FALSA, loader: "js" }));
          },
        },
      ],
    });
    bundle = r.outputFiles[0].text;
    css = await cssDeLaApp();
    browser = await playwright.chromium.launch({ executablePath: chrome });
    if (CAPTURAS) mkdirSync(CAPTURAS, { recursive: true });
  });

  after(async () => {
    await browser?.close();
  });

  const html = () => `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="root"></div></body></html>`;

  async function abrir(montar: "__turnero" | "__pagar", props: unknown, resp: Record<string, unknown>, errores: string[], recuerdo?: { nombre: string; telefono: string }): Promise<Page> {
    const contexto = await browser!.newContext({ viewport: { width: 390, height: 844 }, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires", permissions: ["clipboard-read", "clipboard-write"] });
    // Lo que este teléfono ya recordaba de una visita anterior (nombre y celular).
    if (recuerdo) await contexto.addInitScript((r) => localStorage.setItem("gsg-padel-alumno", r), JSON.stringify(recuerdo));
    await contexto.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html() }));
    const p = await contexto.newPage();
    p.on("pageerror", (e) => errores.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errores.push(m.text());
    });
    await p.goto(ORIGEN);
    await p.addScriptTag({ content: bundle });
    if (errores.length) throw new Error(`el paquete no cargó: ${errores.join(" | ")}`);
    await p.evaluate(([fn, pr, rs]) => {
      const w = window as unknown as Ventana;
      w.__resp = rs as Record<string, unknown>;
      w.__llamadas = [];
      (w[fn as "__turnero"] as (x: unknown) => void)(pr);
    }, [montar, props, resp] as const);
    return p;
  }
  const llamadas = (p: Page) => p.evaluate(() => (window as unknown as Ventana).__llamadas);
  const capturar = async (page: Page, nombre: string) => {
    if (CAPTURAS) await page.screenshot({ path: join(CAPTURAS, `${nombre}.png`), fullPage: true });
  };
  /** Botones, links y campos visibles de menos de 44 px de alto (fuera de las hojas cerradas). */
  const chicos = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll("button, a, input:not([type=checkbox]), textarea")]
        .filter((el) => !el.closest("dialog:not([open])"))
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 1 && r.height > 1 && r.height < 44)
        .map(({ el, r }) => `${(el.textContent ?? "").trim().slice(0, 30)} (${Math.round(r.width)}×${Math.round(r.height)})`),
    );
  const sinHexEnStyle = (page: Page) =>
    page.evaluate(() => [...document.querySelectorAll("[style]")].map((e) => e.getAttribute("style") ?? "").filter((s) => /#[0-9a-f]{3,8}\b/i.test(s) && !/--padel-/.test(s)));

  test("M-089/M-091/M-092: a 390 px, la 1ª vez pide nombre y celular y queda «¡Listo!»", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const errores: string[] = [];
    const page = await abrir("__turnero", BASE, {
      pedirClase: { ok: true, token: "tokentokentokentoken1234", conocido: false, waProfe: null, cuando: "viernes 23/10 a las 18:00", claseId: "c1" },
    }, errores);
    const pedir = page.getByRole("button", { name: /^(Elegí día y hora|Pedir)/ });
    await pedir.waitFor();
    assert.equal(await pedir.isDisabled(), true, "sin hora elegida el botón espera");
    assert.equal(await pedir.textContent(), "Elegí día y hora");
    // M-089: el botón fijo se ve sin desplazar y no hay scroll de costado.
    const caja = (await pedir.boundingBox())!;
    assert.ok(caja.y + caja.height <= 844 && caja.y > 600, `el botón fijo está abajo a la vista (y=${caja.y})`);
    const anchos = await page.evaluate(() => ({
      pagina: document.documentElement.scrollWidth,
      ventana: window.innerWidth,
      culpables: [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest("[data-cinta]")).map((e) => `${e.tagName}.${(e.getAttribute("class") ?? "").slice(0, 60)}`).slice(0, 5),
    }));
    assert.ok(anchos.pagina <= anchos.ventana, `sin scroll horizontal a 390 px: ${JSON.stringify(anchos)}`);
    if (css) assert.deepEqual(await chicos(page), [], "áreas táctiles de 44 px o más");
    assert.deepEqual(await sinHexEnStyle(page), [], "M-052: ningún hex suelto en un style");
    await capturar(page, "390-turnero");

    await page.getByRole("button", { name: "18:00" }).click();
    assert.equal(await pedir.textContent(), "Pedir hoy · 18:00 · $ 25.000");
    await pedir.click();
    // M-091: sube «¿Quién sos?».
    const hoja = page.getByRole("dialog", { name: "¿Quién sos?" });
    await hoja.waitFor();
    await hoja.getByLabel("Nombre").fill("Lucía Gómez");
    await hoja.getByLabel("Celular (WhatsApp)").fill("+54 9 11 5555-1234");
    await hoja.getByRole("button", { name: "Pedir hoy · 18:00 · $ 25.000" }).click();
    await page.getByRole("heading", { name: "¡Listo! Pediste tu clase" }).waitFor();
    await page.getByText("Viernes 23/10 a las 18:00").waitFor();
    await page.getByText("· falta que Matías la confirme.").waitFor();
    // M-092: sin celular del profe, nada de WhatsApp roto.
    assert.equal(await page.locator('[data-qa="avisar-profe"]').count(), 0);
    await page.getByText("Matías ya lo ve en su agenda; te confirma por WhatsApp.").waitFor();
    assert.equal(await page.getByRole("link", { name: "Agregar al calendario" }).getAttribute("href"), "/alumno/tokentokentokentoken1234/calendario/c1");
    const [l] = await llamadas(page);
    assert.equal(l.nombre, "pedirClase");
    assert.deepEqual(l.args[0], { hora: iso("2026-10-23", 18), nombre: "Lucía Gómez", telefono: "+54 9 11 5555-1234", tipo: "INDIVIDUAL", personas: 2, nota: "" });
    // Este teléfono recuerda nombre y celular (nunca el link).
    const recuerdo = await page.evaluate(() => localStorage.getItem("gsg-padel-alumno"));
    assert.deepEqual(JSON.parse(recuerdo!), { nombre: "Lucía Gómez", telefono: "+54 9 11 5555-1234" });
    assert.ok(!recuerdo!.includes("token"));
    await capturar(page, "390-listo");
    assert.deepEqual(errores, []);
  });

  test("M-001: alumno conocido desde otro teléfono → «Te confirmamos por WhatsApp», sin link", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const errores: string[] = [];
    const page = await abrir("__turnero", { ...BASE, wa: "https://wa.me/5491100000000?text=hola" }, {
      pedirClase: { ok: true, token: null, conocido: true, waProfe: "https://wa.me/5491100000000", cuando: "viernes 23/10 a las 18:00", claseId: null },
    }, errores);
    await page.getByRole("button", { name: "18:00" }).click();
    await page.getByRole("button", { name: /^Pedir hoy/ }).click();
    const hoja = page.getByRole("dialog", { name: "¿Quién sos?" });
    await hoja.getByLabel("Nombre").fill("Juan");
    await hoja.getByLabel("Celular (WhatsApp)").fill("1155551234");
    await hoja.getByRole("button", { name: /^Pedir/ }).click();
    await page.getByText("Te confirmamos por WhatsApp al número que pusiste.").waitFor();
    assert.equal(await page.locator('a[href*="/alumno/"]').count(), 0, "ningún link al alumno");
    assert.equal(await page.getByRole("link", { name: "Agregar al calendario" }).count(), 0);
    assert.deepEqual(errores, []);
  });

  test("M-096/M-097: con amigos se ve el total; si se ocupa, el chip se va y se sugieren 2", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const errores: string[] = [];
    const page = await abrir("__turnero", BASE, {
      pedirClase: { ok: false, error: "Ese horario se acaba de ocupar. Elegí otro.", alternativas: [iso("2026-10-23", 17), iso("2026-10-23", 19)] },
    }, errores);
    await page.getByRole("button", { name: /^Con amigos/ }).click();
    await page.getByRole("group", { name: "¿Cuántos son?" }).getByRole("button", { name: "3" }).click();
    await page.getByText("$ 12.000 c/u · total $ 36.000").waitFor();
    await page.close();

    // Ya hay nombre y celular en este teléfono: no se pide nada.
    const page2 = await abrir("__turnero", BASE, {
      pedirClase: { ok: false, error: "Ese horario se acaba de ocupar. Elegí otro.", alternativas: [iso("2026-10-23", 17), iso("2026-10-23", 19)] },
    }, errores, { nombre: "Juan", telefono: "1155551234" });
    await page2.getByText("Pedís como").waitFor();
    await page2.getByRole("button", { name: "18:00" }).click();
    await page2.getByRole("button", { name: /^Pedir hoy · 18:00/ }).click();
    await page2.getByRole("alert").filter({ hasText: "Se ocupó recién" }).waitFor();
    assert.equal(await page2.getByRole("dialog", { name: "¿Quién sos?" }).isVisible(), false, "no hizo falta la hoja");
    assert.equal(await page2.locator(`[data-qa="hora"][data-hora="${iso("2026-10-23", 18)}"]`).count(), 0, "el chip de 18:00 se fue");
    const sugeridas = await page2.locator('[data-qa="sugerida"]').allTextContents();
    assert.deepEqual(sugeridas, ["vie 23/10 17:00", "vie 23/10 19:00"]);
    await page2.locator('[data-qa="sugerida"]').first().click();
    assert.equal(await page2.getByRole("button", { name: /^Pedir/ }).textContent(), "Pedir hoy · 17:00 · $ 25.000");
    await capturar(page2, "390-se-ocupo");
    assert.deepEqual(errores, []);
  });

  test("F-1/O-16: si la acción TIRA (corte o error nuestro), un texto honesto, nunca el error boundary, y lo tipeado queda", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const errores: string[] = [];
    // Primera vez en este teléfono: tipea nombre y celular en la hoja.
    const page = await abrir("__turnero", BASE, {}, errores);
    // La acción rechaza la promesa (como un 500 de una Server Action).
    await page.evaluate(() => {
      (window as unknown as Ventana).__resp.pedirClase = () => Promise.reject(new Error("se cortó"));
    });
    await page.getByRole("button", { name: "18:00" }).click();
    await page.getByRole("button", { name: /^Pedir hoy · 18:00/ }).click();
    const hoja = page.getByRole("dialog", { name: "¿Quién sos?" });
    await hoja.getByLabel("Nombre").fill("Lola Paz");
    await hoja.getByLabel("Celular (WhatsApp)").fill("11 5800 4242");
    await hoja.getByRole("button", { name: /^Pedir/ }).click();
    const alerta = page.getByRole("alert").filter({ hasText: "No pudimos tomar tu pedido" });
    await alerta.waitFor();
    assert.doesNotMatch((await alerta.textContent()) ?? "", /ocup/i, "no dice «se ocupó» si no sabe que se ocupó");
    // Lo tipeado no se perdió: «Pedís como Lola Paz», y la hora sigue elegida.
    await page.getByText("Pedís como").waitFor();
    await page.getByText("Lola Paz").first().waitFor();
    // Vuelve la señal: un toque y listo, sin volver a tipear.
    await page.evaluate(() => {
      (window as unknown as Ventana).__resp.pedirClase = { ok: true, token: "tokentokentokentoken1234", conocido: false, waProfe: null, cuando: "viernes 23/10 a las 18:00", claseId: "c2" };
    });
    await page.getByRole("button", { name: /^Pedir hoy · 18:00/ }).click();
    await page.getByRole("heading", { name: "¡Listo! Pediste tu clase" }).waitFor();
    assert.equal(await hoja.isVisible(), false, "no hizo falta la hoja otra vez");
    const ls = await llamadas(page);
    assert.deepEqual((ls.at(-1)!.args[0] as { nombre: string; telefono: string }).nombre, "Lola Paz");
    assert.deepEqual(errores, []);
  });

  test("M-094/M-095: con la cookie no se tipea nada, pide por el link y puede nacer confirmada", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const errores: string[] = [];
    const page = await abrir("__turnero", { ...BASE, conSesion: true, nombreAlumno: "Juan" }, {
      reservarDesdeLink: { ok: true, estado: "CONFIRMADA", cuando: "sábado 24/10 a las 10:00", claseId: "c9" },
    }, errores);
    await page.getByText("Pedís como").waitFor();
    await page.getByRole("button", { name: "Mañana" }).click();
    await page.getByRole("button", { name: "10:00" }).click();
    await page.getByLabel(/Algo que Matías tenga que saber/).fill("Llevo paleta");
    await page.getByRole("button", { name: /^Pedir mañana · 10:00/ }).click();
    await page.getByRole("heading", { name: "¡Listo! Quedó confirmada" }).waitFor();
    const [l] = await llamadas(page);
    assert.equal(l.nombre, "reservarDesdeLink");
    assert.equal(l.args[1], iso("2026-10-24", 10));
    assert.equal(l.args[0], null, "el token no viaja desde la página: lo pone la cookie");
    assert.deepEqual(l.args[3], { tipo: "INDIVIDUAL", personas: 2, nota: "Llevo paleta" });
    assert.equal(await page.getByRole("link", { name: "Agregar al calendario" }).getAttribute("href"), "/mis-clases/calendario/c9");
    assert.equal(await page.getByRole("link", { name: "Ver mis clases" }).getAttribute("href"), "/mis-clases");
    assert.deepEqual(errores, []);
  });

  test("M-098: agenda llena → siempre hay cómo hablar con el profe", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const errores: string[] = [];
    const page = await abrir("__turnero", { ...BASE, dias: [] }, { dejarMensaje: { ok: true, mensaje: "Listo, le llegó a Matías. Te contesta por WhatsApp." } }, errores);
    await page.getByRole("heading", { name: "No quedan horarios libres por ahora" }).waitFor();
    await page.getByRole("button", { name: /Dejarle un mensaje a Matías/ }).click();
    const hoja = page.getByRole("dialog", { name: "Dejale un mensaje a Matías" });
    await hoja.getByLabel("Tu nombre").fill("Ana");
    await hoja.getByLabel("Tu celular (WhatsApp)").fill("1144443333");
    await hoja.getByLabel("Mensaje").fill("¿Tenés lugar el sábado?");
    await hoja.getByRole("button", { name: "Mandar mensaje" }).click();
    await hoja.getByRole("status").filter({ hasText: "le llegó a Matías" }).waitFor();
    // Con WhatsApp del profe: link directo.
    const p2 = await abrir("__turnero", { ...BASE, dias: [], wa: "https://wa.me/5491100000000?text=hola" }, {}, errores);
    assert.equal(await p2.getByRole("link", { name: /Escribirle a Matías/ }).getAttribute("href"), "https://wa.me/5491100000000?text=hola");
    assert.deepEqual(errores, []);
  });

  test("M-108/M-109/M-110: copiar alias y monto, un comprobante para 2 clases, PDF y sin alias", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const errores: string[] = [];
    const items = [
      { id: "d1", cuando: "Jueves 16/10 18:00", precio: 25000, deuda: true, enRevision: false, nota: null },
      { id: "d2", cuando: "Martes 21/10 19:00", precio: 25000, deuda: true, enRevision: false, nota: "El monto no coincide" },
      { id: "c3", cuando: "Lunes 27/10 18:00", precio: 25000, deuda: false, enRevision: false, nota: null },
    ];
    const page = await abrir("__pagar", { token: null, items, alias: "matias.padel", titular: "Matías Consoli", profe: "Matías", waAlias: null }, {
      subirComprobanteVarias: { ok: true, clases: 2, total: 50000 },
    }, errores);
    await page.getByRole("button", { name: "Copiar alias" }).click();
    await page.getByRole("status").filter({ hasText: "Alias copiado" }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "matias.padel");
    await page.getByRole("button", { name: "Copiar monto" }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "50000", "copia lo que debe (las 2 dadas)");
    await page.getByRole("alert").filter({ hasText: "El monto no coincide" }).waitFor();
    if (css) assert.deepEqual(await chicos(page), [], "áreas táctiles de 44 px o más");

    // PDF: no se sube; se pide una captura.
    await page.locator('[data-qa="archivo-comprobante"]').setInputFiles({ name: "comprobante.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
    await page.getByRole("alert").filter({ hasText: "sacale una captura de pantalla al PDF" }).waitFor();
    assert.equal((await llamadas(page)).length, 0);

    // Una captura para las 2 que debe.
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    await page.locator('[data-qa="archivo-comprobante"]').setInputFiles({ name: "captura.png", mimeType: "image/png", buffer: png });
    await page.getByRole("status").filter({ hasText: "Tus 2 clases quedaron con el comprobante por revisar ($ 50.000)" }).waitFor();
    const [l] = await llamadas(page);
    assert.equal(l.nombre, "subirComprobanteVarias");
    assert.equal(l.args[0], null);
    assert.deepEqual(l.args[1], ["d1", "d2"]);
    assert.match(String(l.args[2]), /^data:image\/jpeg;base64,/);
    await capturar(page, "390-pagar");

    // Sin alias: «Matías te pasa el alias por WhatsApp», con el link si hay celular.
    const p2 = await abrir("__pagar", { token: "t", items: items.slice(0, 1), alias: "", titular: "", profe: "Matías", waAlias: "https://wa.me/5491100000000?text=alias" }, {}, errores);
    await p2.getByText("Matías te pasa el alias por WhatsApp.").waitFor();
    assert.equal(await p2.getByRole("link", { name: /Pedirle el alias a Matías/ }).getAttribute("href"), "https://wa.me/5491100000000?text=alias");
    assert.deepEqual(errores, []);
  });
});
