// ============================================================================
// CAJA DEL DÍA (diseño nuevo «Renglón») con el día ABIERTO, en un navegador de verdad.
// ============================================================================
//
// La pantalla real (CajaRenglon) armada con esbuild y montada en el Chromium de Playwright, con
// las Server Actions reemplazadas por dobles (el mismo molde que caja-teclado.test.ts). Hace falta
// porque el día abierto no siempre se puede mirar en el laboratorio: pasada la hora del cierre,
// todos los negocios del laboratorio tienen el día cerrado hasta la medianoche.
//
// Los números NO son inventados: son filas del laboratorio (magra-lomas, 24/09/2026): el fondo de
// $25.000 del turno, las ventas #822 (efectivo $29.165), #823 (MP $32.856) y #824 (efectivo
// $7.900), y el turno anterior que cerró contando $299.220 sobre $299.220,30. El turno siguiente
// del laboratorio abrió con $62.065 = 25.000 + 29.165 + 7.900: lo mismo que acá tiene que dar el
// efectivo. Lo único puesto a mano es el saldo al abrir: el fondo de $25.000 que ya estaba en el
// cajón (así el efectivo del día y el del turno cuentan lo mismo). El resumen por medio lo arma
// buildCierreDiario, la misma cuenta que usa la pantalla.
//
// Con CAJA_FOTOS=<carpeta> deja las fotos del día abierto a 412 y a 1440 px en esa carpeta.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";
import { buildCierreDiario, type CierreMovement } from "../../../../lib/caja/cierre-diario";

const RAIZ = fileURLToPath(new URL("../../../../../", import.meta.url));

const ACCIONES_FALSAS = `
const anotar = (accion, fd) => { (window.__enviado ??= []).push({ accion, ...Object.fromEntries(fd.entries()) }); return { ok: true }; };
export async function openCashSession(_prev, fd) { return anotar("abrir", fd); }
export async function closeCashSession(_prev, fd) { return anotar("cerrar", fd); }
export async function addLibroEntry() { return { ok: true, message: "Guardado." }; }
export async function deleteLibroEntry() { return { ok: true }; }
export async function cerrarDia() { return { ok: true }; }`;
const NAVEGACION_FALSA = `
export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }
export function usePathname() { return "/admin/caja"; }
export function useSearchParams() { return new URLSearchParams(); }`;
const LINK_FALSO = `
import { createElement } from "react";
export default function Link({ href, prefetch, ...resto }) { return createElement("a", { href: String(href), ...resto }); }`;

const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import ToastProvider from "@/app/admin/(dashboard)/ToastProvider";
import CajaRenglon from "@/app/admin/(dashboard)/caja/CajaRenglon";
window.__montar = (dia, caja) => {
  const fecha = (d) => (d ? new Date(d) : null);
  const turno = caja && {
    open: caja.open && { ...caja.open, openedAt: fecha(caja.open.openedAt) },
    recentClosed: caja.recentClosed.map((s) => ({ ...s, closedAt: fecha(s.closedAt) })),
    esperadoEnElCajon: caja.esperadoEnElCajon ?? null,
  };
  createRoot(document.getElementById("root")).render(createElement(ToastProvider, null, createElement(CajaRenglon, { dia, caja: turno })));
};
`;

// ── El día del laboratorio ──────────────────────────────────────────────────

const DIA = "2026-09-24";
const aLas = (hhmm: string) => new Date(`${DIA}T${hhmm}:00-03:00`);
const FILAS: (CierreMovement & { origin: "manual" | "pos" | "turno" })[] = [
  { id: "m1", occurredAt: aLas("15:05"), type: "APERTURA", method: "EFECTIVO", amount: 25000, detail: "Fondo inicial de caja", origin: "manual" },
  { id: "m2", occurredAt: aLas("15:12"), type: "VENTA", method: "EFECTIVO", amount: 29165, detail: "Venta #822", origin: "pos" },
  { id: "m3", occurredAt: aLas("18:15"), type: "VENTA", method: "MP", amount: 32856, detail: "Venta #823", origin: "pos" },
  { id: "m4", occurredAt: aLas("18:19"), type: "VENTA", method: "EFECTIVO", amount: 7900, detail: "Venta #824", origin: "pos" },
];
const DIA_ABIERTO = {
  day: DIA,
  today: DIA,
  lastClosedDay: "2026-09-23",
  since: DIA,
  preview: buildCierreDiario({
    day: DIA,
    since: DIA,
    previous: [
      { id: "prev-0", occurredAt: aLas("00:00"), type: "INGRESO", method: "EFECTIVO", amount: 25000, detail: "" },
      // Lo que MP juntó en meses sin que nadie anotara el pase al banco (el caso de MAGRA en el laboratorio).
      { id: "prev-1", occurredAt: aLas("00:00"), type: "INGRESO", method: "MP", amount: 20654998.99, detail: "" },
    ],
    movements: FILAS,
    declared: { EFECTIVO: null, MP: null, TARJETA: null },
  }),
  movements: FILAS.map((m) => ({ id: m.id, day: DIA, type: m.type, method: m.method, amount: m.amount, detail: m.detail, origin: m.origin })),
  yaCerrado: false,
  enElFuturo: false,
  registro: null,
  turnosSinCerrar: null,
};
const TURNO = {
  open: {
    id: "s2",
    openedAt: "2026-09-24T18:05:21.388Z",
    openingFloat: 25000,
    movements: [
      { id: "m2", type: "VENTA", amount: 29165, method: "EFECTIVO" },
      { id: "m4", type: "VENTA", amount: 7900, method: "EFECTIVO" },
    ],
  },
  recentClosed: [{ id: "s1", closedAt: "2026-09-24T18:04:13.736Z", closingCounted: 299220, closingExpected: 299220.3, closingDiff: -0.3 }],
  // `getCajaData().esperadoEnElCajon`: el saldo en efectivo del libro (ADR-101). Acá coincide con el turno.
  esperadoEnElCajon: 62065,
};

// El mismo día con una devolución de $200 en efectivo que NO pasó por el turno (sin `sessionId`):
// el libro espera $61.865; el turno solo ve $62.065. Es el caso en que la pantalla hacía confirmar
// un número y el servidor asentaba otro.
const FILAS_CON_DEVOLUCION = [
  ...FILAS,
  { id: "m5", occurredAt: aLas("18:30"), type: "EGRESO" as const, method: "EFECTIVO" as const, amount: 200, detail: "Devolución de la venta #822", origin: "manual" as const },
];
const DIA_CON_DEVOLUCION = {
  ...DIA_ABIERTO,
  preview: buildCierreDiario({
    day: DIA,
    since: DIA,
    previous: [{ id: "prev-0", occurredAt: aLas("00:00"), type: "INGRESO", method: "EFECTIVO", amount: 25000, detail: "" }],
    movements: FILAS_CON_DEVOLUCION,
    declared: { EFECTIVO: null, MP: null, TARJETA: null },
  }),
  movements: FILAS_CON_DEVOLUCION.map((m) => ({ id: m.id, day: DIA, type: m.type, method: m.method, amount: m.amount, detail: m.detail, origin: m.origin })),
};
const TURNO_CON_DEVOLUCION = { ...TURNO, esperadoEnElCajon: 61865 };

// ── El navegador ────────────────────────────────────────────────────────────

type Ventana = { __montar: (dia: unknown, caja: unknown) => void; __enviado?: Record<string, string>[] };

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

/** El CSS de la app (globals.css con el Tailwind del build) más la hoja de la piel «Renglón». */
async function cssDeLaApp(): Promise<string> {
  try {
    const postcss = (await import("postcss")).default;
    const tailwind = (await import("@tailwindcss/postcss")).default as unknown as (o: { base: string }) => import("postcss").AcceptedPlugin;
    const archivo = join(RAIZ, "src", "app", "globals.css");
    const app = (await postcss([tailwind({ base: RAIZ })]).process(readFileSync(archivo, "utf8"), { from: archivo })).css;
    return app + readFileSync(join(RAIZ, "public", "diseno", "renglon.css"), "utf8");
  } catch {
    return "";
  }
}

describe("Caja del día abierta, en el navegador", { timeout: 180_000 }, () => {
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
      "@/lib/cierre-diario-actions": ACCIONES_FALSAS,
      "@/lib/caja-actions": ACCIONES_FALSAS,
      "@/lib/libro-caja-actions": ACCIONES_FALSAS,
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

  async function montar(ancho: number, conCss: boolean, turno: unknown = TURNO, dia: unknown = DIA_ABIERTO): Promise<{ page: Page; errores: string[] }> {
    const movil = ancho < 600;
    const page = await browser!.newPage({ viewport: { width: ancho, height: movil ? 915 : 900 }, deviceScaleFactor: movil ? 2 : 1, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" });
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.setContent(
      `<!doctype html><html lang="es"><head>${conCss ? `<style>${css}</style>` : ""}</head><body><div id="root" data-skin="fable" data-diseno="renglon" data-theme="light" data-density="lite" class="min-h-dvh bg-surface"></div></body></html>`,
    );
    await page.addScriptTag({ content: bundle });
    await page.evaluate(([d, c]) => (window as unknown as Ventana).__montar(d, c), [JSON.parse(JSON.stringify(dia)), turno] as const);
    await page.getByRole("heading", { name: "Caja del día" }).waitFor();
    return { page, errores };
  }

  test("el día abierto dice cuánto hay por medio, sólo de los medios que se movieron, y lo que entró hoy", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar(1440, false);
    const cabeza = await page.locator("header").innerText();
    assert.match(cabeza, /Jueves 24 de septiembre/);
    assert.match(cabeza, /día abierto/);
    assert.match(cabeza, /4 movimientos hoy/);
    // La tabla de lo que hay ahora: Efectivo y MP (la tarjeta no se movió y no ocupa un renglón en cero).
    // (Sin el CSS, la línea «entró · salió» del celular también se lee: se toma el nombre del medio.)
    const filas = await page
      .locator('section[aria-labelledby="hay-ahora"] tbody th[scope="row"]')
      .evaluateAll((ths) => ths.map((th) => th.firstChild?.textContent?.trim()));
    assert.deepEqual(filas, ["Efectivo", "MP / Transf."]);
    assert.match(await page.locator('section[aria-labelledby="hay-ahora"]').innerText(), /Tarjeta: sin movimientos\./);
    const seccion = (await page.locator('section[aria-labelledby="hay-ahora"]').innerText()).replace(/\s+/g, " ");
    // El saldo acumulado de MP no se suma al cajón ni se muestra como «lo que hay»: va al Libro.
    assert.doesNotMatch(seccion, /20\.65|20\.7\d\d\./, `el acumulado de MP no aparece en la caja del día: ${seccion}`);
    assert.match(seccion, /saldo acumulado de MP.*Libro de caja/);
    const total = await page.locator('section[aria-labelledby="hay-ahora"] tfoot').innerText();
    // El pie suma lo que entró en el período (29.165 + 32.856 + 7.900), no mezcla el cajón con el banco.
    assert.match(total.replace(/\s+/g, " "), /Entró en total.*\$ ?69\.921/, `lo que entró: ${total}`);
    const [efectivo, mp] = (await page.locator('section[aria-labelledby="hay-ahora"] tbody tr').allInnerTexts()).map((x) => x.replace(/\s+/g, " "));
    assert.match(efectivo, /según el libro del día.*\$ ?62\.065/, "efectivo: 25.000 al abrir + 29.165 + 7.900");
    assert.match(mp, /neto, va al banco.*\$ ?32\.856/, "MP: sólo lo que entró en el período");
    // Lo que se movió hoy: un renglón por movimiento, con su medio y su origen.
    const movs = await page.locator('section[aria-labelledby="movimientos-hoy"] [data-ui="renglon"]').allInnerTexts();
    assert.equal(movs.length, 4);
    assert.match(movs[2].replace(/\s+/g, " "), /Venta #823.*MP \/ Transf\. · venta del mostrador/);
    assert.match(movs[0].replace(/\s+/g, " "), /Fondo inicial de caja.*no suma: ya estaba en el cajón/, "el fondo no se lee como un ingreso");
    assert.doesNotMatch(movs[0], /−/);
    // Las dos teclas del día.
    assert.equal(await page.getByRole("link", { name: "Cerrar el día" }).getAttribute("href"), "/admin/caja/cierre");
    await page.getByRole("button", { name: "Cargar un gasto o retiro" }).click();
    await page.locator("dialog[open]").getByRole("heading", { name: "Cargar un gasto, retiro o ingreso" }).waitFor();
    assert.equal(await page.locator("dialog[open] form").count(), 1, "el cajón trae el formulario de siempre del libro");
    await page.keyboard.press("Escape");
    // El turno de cajero: fondo + ventas en efectivo = lo esperado en el cajón.
    const turno = (await page.locator('section[aria-labelledby="turno-cajero"]').innerText()).replace(/\s+/g, " ");
    assert.match(turno, /Fondo inicial.*\$ ?25\.000/);
    assert.match(turno, /Efectivo esperado en el cajón ?\$ ?62\.065/, "el turno y el día cuentan el mismo efectivo");
    assert.doesNotMatch(turno, /Efectivo que no pasó por el turno/, "si el libro y el turno coinciden, no hay renglón aparte");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("con una devolución que no pasó por el turno, se muestra, se confirma y se manda el esperado del libro", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar(1440, false, TURNO_CON_DEVOLUCION, DIA_CON_DEVOLUCION);
    const turno = (await page.locator('section[aria-labelledby="turno-cajero"]').innerText()).replace(/\s+/g, " ");
    assert.match(turno, /Efectivo que no pasó por el turno.*una devolución.*−\$ ?200/, "lo que el turno no vio va en su renglón");
    assert.match(turno, /Efectivo esperado en el cajón ?\$ ?61\.865/, "el total es el del libro, no fondo + turno (62.065)");
    assert.doesNotMatch(turno, /62\.065/, "el número del turno solo no aparece como esperado");
    const efectivo = (await page.locator('section[aria-labelledby="hay-ahora"] tbody tr').first().innerText()).replace(/\s+/g, " ");
    assert.match(efectivo, /según el libro del día.*\$ ?61\.865/, "el libro del día y el turno dicen lo mismo");
    // Cierra contando $61.365: la pantalla hace confirmar un faltante de $500 contra $61.865…
    await page.getByRole("button", { name: "Cerrar el turno" }).click();
    const dialogo = page.locator("dialog[open]");
    await dialogo.getByLabel("Efectivo contado").fill("61.365");
    await dialogo.getByRole("button", { name: "Cerrar caja" }).click();
    const pregunta = (await dialogo.locator("#cerrar-caja-titulo").innerText()).replace(/\s+/g, " ");
    assert.match(pregunta, /Contaste \$ ?61\.365,00 y se esperaba \$ ?61\.865,00: faltante \$ ?500,00\./);
    await dialogo.getByRole("button", { name: "Sí, cerrar caja" }).click();
    // …y manda ESE esperado: el servidor arquea contra él o no cierra (un-solo-esperado-pantalla-postgres.test.ts).
    await page.waitForFunction(() => ((window as unknown as Ventana).__enviado ?? []).length > 0);
    const enviado = await page.evaluate(() => (window as unknown as Ventana).__enviado);
    assert.deepEqual(enviado, [{ accion: "cerrar", counted: "61.365", note: "", esperadoConfirmado: "61865" }]);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("sin turno abierto, el fondo se cuenta contra el libro y una diferencia se muestra antes de abrir", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const sinTurno = { open: null, recentClosed: TURNO.recentClosed, esperadoEnElCajon: 25000 };
    const { page, errores } = await montar(1440, false, sinTurno);
    const seccion = page.locator('section[aria-labelledby="turno-cajero"]');
    assert.match((await seccion.innerText()).replace(/\s+/g, " "), /Según el libro tendría que haber \$ ?25\.000,00/);
    await seccion.getByLabel("Fondo inicial").fill("24.000");
    await seccion.getByRole("button", { name: "Abrir caja" }).click();
    const pregunta = (await seccion.locator("#abrir-caja-titulo").innerText()).replace(/\s+/g, " ");
    assert.match(pregunta, /¿Abrir con \$ ?24\.000,00\? Según el libro tendría que haber \$ ?25\.000,00: queda asentado un faltante de \$ ?1\.000,00 al abrir el turno\./);
    assert.equal(await page.evaluate(() => (window as unknown as Ventana).__enviado ?? null), null, "no se abrió sin confirmar");
    await seccion.getByRole("button", { name: "Sí, abrir caja" }).click();
    await page.waitForFunction(() => ((window as unknown as Ventana).__enviado ?? []).length > 0);
    assert.deepEqual(await page.evaluate(() => (window as unknown as Ventana).__enviado), [
      { accion: "abrir", openingFloat: "24.000", esperadoConfirmado: "25000" },
    ]);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("sin turno abierto, un fondo que coincide con el libro abre sin preguntar", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar(1440, false, { open: null, recentClosed: [], esperadoEnElCajon: 25000 });
    const seccion = page.locator('section[aria-labelledby="turno-cajero"]');
    await seccion.getByLabel("Fondo inicial").fill("25.000");
    await seccion.getByRole("button", { name: "Abrir caja" }).click();
    await page.waitForFunction(() => ((window as unknown as Ventana).__enviado ?? []).length > 0);
    assert.deepEqual(await page.evaluate(() => (window as unknown as Ventana).__enviado), [
      { accion: "abrir", openingFloat: "25.000", esperadoConfirmado: "25000" },
    ]);
    assert.equal(await seccion.locator("#abrir-caja-titulo").count(), 0);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("412 px con el CSS real y la piel: sin scroll horizontal y las teclas de 44 px", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    if (!css) return t.skip("no se pudo compilar el CSS de la app");
    const { page, errores } = await montar(412, true);
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(ancho <= 412, `sin scroll horizontal (${ancho})`);
    for (const tecla of [page.getByRole("link", { name: "Cerrar el día" }), page.getByRole("button", { name: "Cargar un gasto o retiro" }), page.getByRole("button", { name: "Cerrar el turno" })]) {
      const caja = await tecla.boundingBox();
      assert.ok(caja && caja.height >= 44, `${await tecla.innerText()}: ${caja?.height}px`);
    }
    const fotos = process.env.CAJA_FOTOS;
    if (fotos) {
      await page.screenshot({ path: join(fotos, "caja-abierta-412.png"), fullPage: true });
      const pc = await montar(1440, true);
      await pc.page.screenshot({ path: join(fotos, "caja-abierta-1440.png"), fullPage: true });
      await pc.page.close();
    }
    assert.deepEqual(errores, []);
    await page.close();
  });
});
