// ============================================================================
// «CERRAR EL DÍA» EN TRES PASOS en un navegador de verdad (CH Tanda 3 · 3-C, CH-038 / CH-032).
// ============================================================================
//
// La pantalla REAL (CerrarElDia, con la bandeja CerrarPendientes y el arqueo ContarYCerrar adentro)
// armada con esbuild y montada en el Chromium de Playwright con el CSS real (globals + piel «Renglón»).
// Las Server Actions (`cerrarDia`, `cerrarTurnosEnLote`) son dobles que anotan lo que se mandó.
// Clic por clic:
//   · paso 1: los 2 turnos del día sin cerrar, en la bandeja; «✓ Vino» → Efectivo cierra uno; el
//     contador del paso; «Seguir: contar la plata»;
//   · paso 2: «hoy la tarjeta se registra como Mercado Pago» (sin M1); tipea $118.000 contra $120.000
//     → «faltan $2.000», la deslizadora no cierra sin «Qué pasó»; con la nota, se desliza con el teclado
//     (Fin) y `cerrarDia` recibe day, declarado_EFECTIVO y note;
//   · paso 3 (el día ya cerrado): el resumen y «Mandar el cierre por WhatsApp» con el texto
//     «Cierre …: Efectivo $118.000 (−$2.000), MP/Transf. …, Tarjeta … · N turnos»; sin pasos para atrás;
//   · con la tarjeta separada (M1): ni la nota ni «tarjeta» en la línea de MP;
//   · celular (390 px): sin scroll horizontal.
// Sin Chromium o sin esbuild, se saltea con el motivo.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";
import type { PropsCerrarElDia } from "./CerrarElDia";

const RAIZ = fileURLToPath(new URL("../../../../../../", import.meta.url));
const ORIGEN = "http://localhost:3997/admin/caja/cierre";
const DIA = "2030-10-24"; // jueves
const FOTOS = process.env.CIERRE_FOTOS ?? "";
const iso = (hhmm: string) => new Date(`${DIA}T${hhmm}:00-03:00`).toISOString();

const CIERRE_FALSO = `
export async function cerrarDia(fd) {
  (window.__enviado ??= []).push({ accion: "cerrarDia", ...Object.fromEntries(fd.entries()) });
  return { ok: true, message: "Día cerrado." };
}`;
const LOTE_FALSO = `
export async function cerrarTurnosEnLote(fd) {
  const pedidos = JSON.parse([...fd.values()][0]);
  (window.__enviado ??= []).push({ accion: "lote", pedidos });
  return { resultados: pedidos.map((p) => ({ id: p.id, ok: true })) };
}`;
const NAVEGACION_FALSA = `
export function useRouter() { return { refresh() { window.__refrescos = (window.__refrescos ?? 0) + 1; }, push() {}, replace() {} }; }
export function usePathname() { return location.pathname; }
export function useSearchParams() { return new URLSearchParams(location.search); }`;
const LINK_FALSO = `
import { createElement } from "react";
export default function Link({ href, prefetch, scroll, ...resto }) { return createElement("a", { href: String(href), ...resto }); }`;

const ENTRADA = `
import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import ToastProvider from "@/app/admin/(dashboard)/ToastProvider";
import CerrarElDia from "@/app/admin/(dashboard)/caja/cierre/CerrarElDia";
let raiz;
window.__montar = (p) => {
  raiz ??= createRoot(document.getElementById("root"));
  raiz.render(h(ToastProvider, null, h(CerrarElDia, { ...p, key: p.day + "-" + p.estado })));
};`;

function pendiente(id: string, clienta: string, hora: string, saldo: number) {
  return {
    id,
    clienteId: `c-${id}`,
    inicio: iso(hora),
    dia: DIA,
    clienta,
    telefono: "11 5566-7788",
    servicio: "Piernas completas",
    profesional: "Caro",
    profesionalId: "caro",
    estado: "CONFIRMED" as const,
    precio: saldo,
    cobrado: 0,
    saldo,
    veredicto: { ok: true as const },
  };
}

const medio = (m: "EFECTIVO" | "MP" | "TARJETA", etiqueta: string, esperado: number) => ({ medio: m, etiqueta, ayuda: "", esperado, seMovio: esperado !== 0 });

const ABIERTO: PropsCerrarElDia = {
  day: DIA,
  hoy: DIA,
  diaLabel: "24/10/2030",
  diaNombre: "jueves 24",
  diaLargo: "Jueves 24 de octubre",
  estado: "abierto",
  paso: 1,
  cerradoCon: null,
  pendientes: [pendiente("t1", "Laura Gómez", "10:00", 14000), pendiente("t2", "Martina Ruiz", "11:00", 8000)],
  permisosBandeja: { cobrar: true, terminar: true, cajaDeHoyCerrada: false },
  medios: [medio("EFECTIVO", "Efectivo", 120000), medio("MP", "Mercado Pago, transferencias y tarjeta", 64000), medio("TARJETA", "Tarjeta (débito y crédito)", 0)],
  notaTarjeta: "Hoy la tarjeta se registra como Mercado Pago: lo que entra por el Point está sumado en la línea de Mercado Pago.",
  comprobante: null,
  letraDelNegocio: true,
};

const MENSAJE = "Cierre jue 24: Efectivo $118.000 (−$2.000), MP/Transf. $64.000 · 12 turnos. Qué pasó: faltó cambio. Cerró Lu.";
const CERRADO: PropsCerrarElDia = {
  ...ABIERTO,
  estado: "cerrado",
  paso: 3,
  pendientes: null,
  comprobante: {
    medios: [
      { medio: "EFECTIVO", esperado: 120000, declarado: 118000, diferencia: -2000 },
      { medio: "MP", esperado: 64000, declarado: 64000, diferencia: 0 },
      { medio: "TARJETA", esperado: 0, declarado: null, diferencia: null },
    ],
    frases: [],
    nota: "faltó cambio",
    quien: "Lu",
    cerradoEl: "24/10/2030 20:14",
    turnos: 12,
    mensaje: MENSAJE,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(MENSAJE)}`,
  },
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

async function cssDeLaApp(): Promise<string> {
  const postcss = (await import("postcss")).default;
  const tailwind = (await import("@tailwindcss/postcss")).default as unknown as (o: { base: string }) => import("postcss").AcceptedPlugin;
  const archivo = join(RAIZ, "src", "app", "globals.css");
  const app = (await postcss([tailwind({ base: RAIZ })]).process(readFileSync(archivo, "utf8"), { from: archivo })).css;
  return app + readFileSync(join(RAIZ, "public", "diseno", "renglon.css"), "utf8");
}

type Ventana = Window & { __montar: (p: PropsCerrarElDia) => void; __enviado?: Record<string, unknown>[] };

describe("Cerrar el día en tres pasos (Chromium)", () => {
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
      "@/lib/turnos/cierre-lote-actions": LOTE_FALSO,
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
      loader: { ".css": "empty" },
      logLevel: "silent",
      plugins: [
        {
          name: "falsos",
          setup(b) {
            b.onResolve({ filter: /^(@\/lib\/cierre-diario-actions|@\/lib\/turnos\/cierre-lote-actions|next\/navigation|next\/link)$/ }, (a) => ({ path: a.path, namespace: "falso" }));
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

  async function montar(props: PropsCerrarElDia, ancho = 1280, esperarPasos = true): Promise<{ page: Page; errores: string[] }> {
    const contexto = await browser!.newContext({ viewport: { width: ancho, height: 1000 }, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" });
    const html = `<!doctype html><html lang="es"><head><style>${css}</style></head><body><div data-skin="fable" data-estetica="beauty-spa" data-theme="light"><div id="root" data-diseno="renglon" data-theme="light" class="min-h-dvh bg-surface p-4"></div></div></body></html>`;
    await contexto.route(/localhost:3997/, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html }));
    const page = await contexto.newPage();
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.goto(ORIGEN);
    await page.addScriptTag({ content: bundle });
    await page.evaluate((p) => (window as unknown as Ventana).__montar(p), props);
    if (esperarPasos) await page.getByRole("navigation", { name: "Pasos del cierre" }).waitFor();
    else await page.locator('[data-pantalla="cerrar-el-dia"]').waitFor();
    // Con CIERRE_FOTOS=<carpeta> deja una captura de cada montaje (para la revisión visual).
    if (FOTOS) {
      mkdirSync(FOTOS, { recursive: true });
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(FOTOS, `cierre-${props.estado}-paso${props.paso ?? 0}-${ancho}.png`), fullPage: true });
    }
    return { page, errores };
  }

  const enviado = (page: Page) => page.evaluate(() => (window as unknown as Ventana).__enviado ?? []);

  test("CH-038 · paso 1: los 2 sin cerrar se resuelven ahí mismo; después, a contar", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar(ABIERTO);
    const pasos = page.getByRole("navigation", { name: "Pasos del cierre" });
    assert.match(await pasos.innerText(), /Paso 1\s*Antes de contar\s*\(2\)/);
    assert.equal(await pasos.locator('[aria-current="step"]').innerText().then((x) => /Antes de contar/.test(x)), true);
    // La bandeja de «Cerrar lo pendiente», acotada al día: los dos turnos.
    await page.getByText("Laura Gómez").first().waitFor();
    await page.getByText("Martina Ruiz").first().waitFor();
    // «✓ Vino» → los medios en la línea → Efectivo: cierra y cobra con la acción de siempre.
    await page.getByRole("button", { name: /^Vino Laura Gómez: elegir cómo pagó/ }).click();
    await page.getByRole("group", { name: /Cobrar \$14\.000 a Laura Gómez con/ }).getByRole("button", { name: "Efectivo" }).click();
    await page.waitForFunction(() => ((window as unknown as Ventana).__enviado ?? []).length > 0);
    const [lote] = await enviado(page);
    assert.deepEqual(lote, { accion: "lote", pedidos: [{ id: "t1", accion: "vino", method: "EFECTIVO" }] });
    // Seguir a contar (también se podría con turnos abiertos).
    await page.getByRole("button", { name: "Seguir: contar la plata →" }).click();
    await page.getByRole("textbox", { name: /Efectivo/ }).waitFor();
    assert.match(await pasos.locator('[aria-current="step"]').innerText(), /Contá la plata/);
    assert.deepEqual(errores, []);
  });

  test("CH-038 / CH-032 · paso 2: la nota de la tarjeta, la diferencia pide «Qué pasó» y se cierra deslizando", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar({ ...ABIERTO, paso: 2 });
    // Sin M1: la caja dice dónde va la tarjeta.
    assert.match(await page.getByRole("note").innerText(), /hoy la tarjeta se registra como Mercado Pago/i);
    assert.equal(await page.getByText("Mercado Pago, transferencias y tarjeta").count(), 1);
    await page.getByRole("textbox", { name: /Efectivo/ }).fill("118.000");
    await page.getByText("faltan").first().waitFor();
    assert.match(await page.getByRole("region", { name: "Diferencia del día" }).innerText(), /Faltan \$\s?2\.000/);
    // Sin «Qué pasó» la deslizadora no cierra: lo dice al lado.
    const slider = page.getByRole("slider", { name: /Cerrar el día 24\/10\/2030/ });
    assert.equal(await slider.getAttribute("aria-disabled"), "true");
    assert.match(await page.locator("body").innerText(), /Hay diferencia: anotá qué pasó/);
    await page.getByRole("textbox", { name: /Qué pasó/ }).fill("faltó cambio");
    await page.waitForFunction(() => document.querySelector('[role="slider"]')?.getAttribute("aria-disabled") !== "true");
    await slider.focus();
    await page.keyboard.press("End");
    await page.waitForFunction(() => ((window as unknown as Ventana).__enviado ?? []).some((e) => e.accion === "cerrarDia"));
    const cierre = (await enviado(page)).find((e) => e.accion === "cerrarDia");
    assert.equal(cierre?.day, DIA);
    assert.equal(cierre?.declarado_EFECTIVO, "118.000");
    assert.equal(cierre?.note, "faltó cambio");
    assert.deepEqual(errores, []);
  });

  test("CH-038 · paso 3: el día cerrado muestra lo contado y manda el cierre por WhatsApp", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar(CERRADO);
    const pasos = page.getByRole("navigation", { name: "Pasos del cierre" });
    assert.match(await pasos.locator('[aria-current="step"]').innerText(), /Listo/);
    assert.equal(await pasos.getByRole("button").count(), 0, "un día cerrado no se vuelve a contar");
    assert.match(await page.getByText("Cerrado").first().innerText(), /Cerrado/);
    const wa = page.getByRole("link", { name: "Mandar el cierre por WhatsApp" });
    const href = (await wa.getAttribute("href"))!;
    assert.ok(href.startsWith("https://wa.me/?text="));
    const texto = decodeURIComponent(href.split("text=")[1]);
    assert.match(texto, /^Cierre jue 24: Efectivo \$118\.000 \(−\$2\.000\), MP\/Transf\. \$64\.000 · 12 turnos\./);
    assert.doesNotMatch(texto, /undefined|null|NaN/);
    assert.equal(await wa.getAttribute("target"), "_blank");
    assert.match(await page.locator("body").innerText(), /Qué pasó: «faltó cambio»/);
    assert.equal(await page.getByRole("link", { name: "Ver el libro" }).getAttribute("href"), "/admin/caja/libro?mes=2030-10");
    assert.deepEqual(errores, []);
  });

  test("CH-031 · con la tarjeta separada (M1): sin la nota de D6", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page } = await montar({
      ...ABIERTO,
      paso: 2,
      notaTarjeta: null,
      medios: [medio("EFECTIVO", "Efectivo", 120000), medio("MP", "Mercado Pago y transferencias", 64000), medio("TARJETA", "Tarjeta (débito y crédito)", 30000)],
    });
    assert.equal(await page.getByRole("note").count(), 0);
    assert.equal(await page.getByText("Tarjeta (débito y crédito)").count(), 1);
    assert.equal(await page.getByRole("textbox", { name: /Tarjeta/ }).count(), 1, "la tarjeta se movió: se cuenta");
  });

  test("celular 390 px: los tres pasos sin scroll horizontal; futuro y absorbido sin pasos", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    for (const props of [ABIERTO, { ...ABIERTO, paso: 2 as const }, CERRADO]) {
      const { page } = await montar(props, 390);
      const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(desborde <= 0, `paso ${props.paso}: ${desborde}px de más`);
      await page.context().close();
    }
    const futuro = await montar({ ...ABIERTO, estado: "futuro", paso: null, pendientes: null }, 1280, false);
    assert.match(await futuro.page.getByRole("status").first().innerText(), /todavía no pasó/);
    assert.equal(await futuro.page.getByRole("navigation", { name: "Pasos del cierre" }).count(), 0);
    const absorbido = await montar({ ...ABIERTO, estado: "absorbido", paso: null, pendientes: null, cerradoCon: "25/10" }, 1280, false);
    assert.match(await absorbido.page.getByRole("status").first().innerText(), /adentro del cierre del 25\/10/);
  });
});
