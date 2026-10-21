// ============================================================================
// LAS CANCHAS DEL CLUB en un navegador de verdad — la cuenta del turno, tocada clic por clic.
// ============================================================================
//
// La pantalla REAL (ClubDemo con su agenda y su cuenta del turno) armada con esbuild y montada en el Chromium de
// Playwright, con el CSS REAL de la app (globals.css + Tailwind, como en el build). Sin Next ni base: es lo mismo
// que corre en /admin/club, porque la demo no habla con el servidor. Se prueba:
//   · el recorrido de recepción: tocar el turno, «a cargo de», cobrar a un jugador, cobrar todo y que la cuenta
//     cierre en cero, «cobrar la cancha y cerrarla · la mesa sigue»;
//   · que se guarda en el equipo con la clave del negocio y la persona, y «Volver a la demo»;
//   · el teclado (flechas en la grilla, Escape vuelve al turno) y los objetivos táctiles de 44 px en la tablet;
//   · y CUÁNTO SE REPINTA: un gancho como el de las DevTools de React cuenta qué componentes se volvieron a
//     renderizar en cada acción (la agenda no se repinta por un «a cargo de»; cobrar repinta sólo SU turno).
// Sin Chromium o sin esbuild, los tests se saltean con el motivo.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";
import { irASolapa } from "./solapas-e2e";
import * as M from "@/lib/club/motor.mjs";
import { claveDeLaJornada, textoDeLaDemo, textoDelEstado } from "./almacen";

const RAIZ = fileURLToPath(new URL("../../../../../", import.meta.url));
const ORIGEN = "http://localhost:3999/admin/club";

const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import ClubDemo from "@/app/admin/(dashboard)/club/ClubDemo";
window.__montar = (negocio, usuario) =>
  createRoot(document.getElementById("root")).render(createElement(ClubDemo, { negocio, usuario, rol: "RECEPTION" }));
`;

// La jornada real (Ola 0): el mismo ClubDemo con `reloj: "real"`. Las piezas globales se reemplazan (plugin de esbuild)
// por una SONDA que deja el almacén a mano del test y cuenta cuántas veces se montó.
const ENTRADA_REAL = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import ClubDemo from "@/app/admin/(dashboard)/club/ClubDemo";
window.__montarReal = (negocio, usuario) =>
  createRoot(document.getElementById("root")).render(createElement(ClubDemo, { negocio, usuario, rol: "RECEPTION", reloj: "real" }));
`;
const SOLAPAS_CON_SONDA = `
import { useEffect } from "react";
function Sonda({ almacen, irASolapa }) {
  window.__almacen = almacen;
  window.__irASolapa = irASolapa;
  useEffect(() => { window.__montajes = (window.__montajes || 0) + 1; }, []);
  return null;
}
export const SOLAPAS_DEL_CLUB = [];
export const PIEZAS_GLOBALES_DEL_CLUB = [{ id: "sonda", cargar: () => Promise.resolve({ default: Sonda }) }];
`;

// Un gancho con la forma del de las DevTools de React: en cada commit recorre el árbol y anota qué componentes
// con nombre corrieron su render. Un fiber que ya estaba en el árbol anterior no se tocó (React reusó el
// subárbol); uno nuevo corrió si se montó o si tiene la marca PerformedWork (1).
const CONTADOR = `
(() => {
  window.__renders = {};
  let previo = new WeakSet();
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject() { return 1; },
    checkDCE() {},
    onScheduleFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onCommitFiberRoot(_id, root) {
      const actual = new WeakSet();
      const pila = [root.current];
      while (pila.length) {
        const f = pila.pop();
        actual.add(f);
        // esbuild renombra las funciones que chocan con otra del paquete (BloqueTurno → BloqueTurno2).
        const nombre = typeof f.type === "function" ? f.type.name.replace(/\\d+$/, "") : null;
        if (nombre && !previo.has(f) && (f.alternate === null || (f.flags & 1) === 1)) {
          window.__renders[nombre] = (window.__renders[nombre] || 0) + 1;
        }
        if (f.sibling) pila.push(f.sibling);
        if (f.child) pila.push(f.child);
      }
      previo = actual;
    },
  };
})();
`;

type Ventana = { __montar: (negocio: string, usuario: string) => void; __renders: Record<string, number> };

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

/** El CSS de la app, compilado como en el build (globals.css + Tailwind). "" si no se pudo. */
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

describe("Canchas del club en el navegador", { timeout: 180_000 }, () => {
  let browser: Browser | null = null;
  let bundle = "";
  let bundleReal = "";
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
      loader: { ".css": "empty" }, // la piel (piel/*.css) entra por el CSS de la página, no por el paquete
      stdin: { contents: ENTRADA, loader: "tsx", resolveDir: RAIZ },
      bundle: true,
      loader: { ".css": "empty" },
      write: false,
      format: "iife",
      jsx: "automatic",
      tsconfig: join(RAIZ, "tsconfig.json"),
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "silent",
      // Las pieles de cada pantalla (piel/*.css) las sirve Next; acá alcanza con el CSS de la app.
    });
    bundle = r.outputFiles[0].text;
    const rr = await esbuild.build({
      loader: { ".css": "empty" }, // la piel (piel/*.css) entra por el CSS de la página, no por el paquete
      stdin: { contents: ENTRADA_REAL, loader: "tsx", resolveDir: RAIZ },
      bundle: true,
      loader: { ".css": "empty" },
      write: false,
      format: "iife",
      jsx: "automatic",
      tsconfig: join(RAIZ, "tsconfig.json"),
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "silent",
      // Las pieles de cada pantalla (piel/*.css) las sirve Next; acá alcanza con el CSS de la app.
      plugins: [
        {
          name: "sonda",
          setup(b) {
            b.onResolve({ filter: /^\.\/solapas-club$/ }, () => ({ path: "solapas-con-sonda", namespace: "sonda" }));
            b.onLoad({ filter: /.*/, namespace: "sonda" }, () => ({ contents: SOLAPAS_CON_SONDA, loader: "js", resolveDir: RAIZ }));
          },
        },
      ],
    });
    bundleReal = rr.outputFiles[0].text;
    css = await cssDeLaApp();
    browser = await playwright.chromium.launch({ executablePath: chrome });
  });

  after(async () => {
    await browser?.close();
  });

  /** La piel de la agenda de Break Point (AgendaCanchas la importa; en el paquete del test el CSS va vacío). */
  const PIEL_AGENDA = readFileSync(join(RAIZ, "src", "app", "admin", "(dashboard)", "club", "piel", "agenda.css"), "utf8");

  async function montar(viewport = { width: 1024, height: 768 }, page?: Page, piel = false): Promise<{ page: Page; errores: string[] }> {
    let p = page;
    if (!p) {
      p = await browser!.newPage({ viewport, locale: "es-AR" });
      // Un sábado fijo: la demo arma el día con la fecha del equipo y el domingo cierra a las 23 (sin el hueco de las 23:30).
      await p.clock.install({ time: new Date(2026, 9, 17, 12, 0, 0) });
    }
    const errores: string[] = [];
    p.on("pageerror", (e) => errores.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errores.push(m.text());
    });
    // Con `piel`, como en /admin/club de Break Point: la estética en la raíz y la piel de la agenda después del CSS de la app.
    const raiz = piel ? ` data-estetica="breakpoint"` : "";
    const html = `<!doctype html><html lang="es"${raiz}><head><style>${css}</style>${piel ? `<style>${PIEL_AGENDA}</style>` : ""}<script>${CONTADOR}</script></head><body class="bg-surface text-body"><main id="root" class="p-4"></main></body></html>`;
    await p.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html }));
    await p.goto(ORIGEN);
    await p.addScriptTag({ content: bundle });
    await p.evaluate(() => (window as unknown as Ventana).__montar("demo-club", "u_recepcion"));
    await p.getByRole("heading", { name: "Agenda de canchas" }).waitFor();
    return { page: p, errores };
  }

  const renders = (page: Page) => page.evaluate(() => ({ ...(window as unknown as Ventana).__renders }));
  const resta = (a: Record<string, number>, b: Record<string, number>) =>
    Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v - (b[k] ?? 0)]).filter(([, v]) => (v as number) > 0));

  /** El turno en juego de la demo: Martín Ríos en la Cancha 1, debe la cancha y tiene cargos. */
  const turnoDeMartin = (page: Page) => page.getByRole("button", { name: /^Martín Ríos, Cancha 1,.*En cancha, debe/ });

  test("recepción: tocar el turno, «a cargo de», cobrar a un jugador y cobrar todo → la cuenta cierra en cero", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    await page.getByText("Datos de ejemplo — no se guarda nada en el sistema").waitFor();

    await turnoDeMartin(page).click();
    const cuenta = page.getByRole("region", { name: "Martín Ríos" });
    await cuenta.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Martín Ríos", "el foco va a la cuenta");
    const totales = cuenta.getByLabel("Totales del turno");
    await totales.getByText("$ 32.000").waitFor();

    // «A cargo de»: la parte de Tomás la paga Sofía. La agenda no se repinta (la grilla no cambió).
    let antes = await renders(page);
    // «Quién paga» va plegado en cada jugador (como el club de hoy): se abre.
    await cuenta.locator('[data-cuenta="detalle"]').evaluateAll((ds) => ds.forEach((d) => ((d as HTMLDetailsElement).open = true)));
    await cuenta.getByLabel("Parte de la cancha de Tomás Medina").selectOption({ label: "A cargo de Sofía Gómez" });
    await page.getByRole("status").filter({ hasText: "esa parte de la cancha la paga otro jugador" }).waitFor();
    const porACargo = resta(await renders(page), antes);
    t.diagnostic(`renders por «a cargo de»: ${JSON.stringify(porACargo)}`);
    assert.equal(porACargo.AgendaCanchas, undefined, "la agenda no se repinta por un «a cargo de»");
    assert.equal(porACargo.BloqueTurno, undefined, "ningún turno de la grilla se repinta");
    assert.ok((porACargo.CuentaDelTurno ?? 0) >= 1, "la cuenta sí");
    await cuenta.getByRole("button", { name: "Cobrar $ 14.000 a Sofía Gómez" }).waitFor();
    assert.equal(await cuenta.getByText("lo paga Sofía Gómez").count(), 1);

    // Cobrar a Sofía con Mercado Pago: su parte y la de Tomás.
    await cuenta.getByText("Mercado Pago (QR)").click();
    antes = await renders(page);
    const t0 = await page.evaluate(() => performance.now());
    await cuenta.getByRole("button", { name: "Cobrar $ 14.000 a Sofía Gómez" }).click();
    await page.getByRole("status").filter({ hasText: "Cobrado $ 14.000 a Sofía Gómez, con lo de Tomás Medina." }).waitFor();
    const msCobro = (await page.evaluate(() => performance.now())) - t0;
    const porCobro = resta(await renders(page), antes);
    t.diagnostic(`renders por cobrar a un jugador: ${JSON.stringify(porCobro)} · ${msCobro.toFixed(1)} ms del clic al aviso`);
    assert.equal(porCobro.BloqueTurno ?? 0, 1, "se repinta sólo el turno que cambió de señal");
    await totales.getByText("$ 18.000").waitFor();

    // Cobrar todo: la cuenta queda en cero, sin botones de cobro, y el turno de la grilla deja de deber.
    await cuenta.getByRole("button", { name: "Cobrar todo $ 18.000" }).click();
    await page.getByRole("status").filter({ hasText: "Cobrado todo el turno: $ 18.000" }).waitFor();
    await totales.getByText("$ 0").last().waitFor();
    assert.equal(await cuenta.getByRole("button", { name: /^Cobrar/ }).count(), 0, "no queda nada por cobrar");
    assert.equal(await page.getByRole("button", { name: /^Martín Ríos, Cancha 1,.*En cancha, debe/ }).count(), 0);
    await page.getByRole("button", { name: /^Martín Ríos, Cancha 1,.*En cancha\./ }).waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("«Cobrar la cancha y cerrarla · la mesa sigue» y después los cargos; Escape vuelve al turno", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    await turnoDeMartin(page).click();
    const cuenta = page.getByRole("region", { name: "Martín Ríos" });
    await cuenta.getByRole("button", { name: "Cobrar la cancha $ 21.000 y cerrarla · la mesa sigue" }).click();
    await page.getByRole("status").filter({ hasText: "Cancha cerrada y libre (cobrados $ 21.000). La mesa sigue en Buffet" }).waitFor();
    await cuenta.getByText("Cancha cerrada · la mesa sigue").waitFor();
    await cuenta.getByRole("button", { name: "Cobrar y cerrar los cargos $ 11.000" }).click();
    await page.getByRole("status").filter({ hasText: "Cargos cerrados: cobrados $ 11.000." }).waitFor();
    await page.getByRole("button", { name: /^Martín Ríos, Cancha 1,.*Cancha cerrada\./ }).waitFor();

    await page.keyboard.press("Escape");
    await page.getByText("Tocá un turno de la agenda para ver su cuenta").waitFor();
    // El foco vuelve en el cuadro siguiente (requestAnimationFrame): con la máquina cargada, se espera ese cuadro.
    await page.waitForFunction(() => /^Martín Ríos, Cancha 1/.test(document.activeElement?.getAttribute("aria-label") ?? ""), undefined, { timeout: 5000 }).catch(() => undefined);
    assert.match((await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))) ?? "", /^Martín Ríos, Cancha 1/, "el foco vuelve al turno");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("atajos del club de hoy: 2 va a la segunda solapa, T vuelve a la agenda de hoy, N da un turno; escribiendo no", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("2");
    assert.equal(await page.getByRole("tab", { name: "Buffet" }).getAttribute("aria-selected"), "true");
    await page.keyboard.press("t");
    assert.equal(await page.getByRole("tab", { name: "Agenda" }).getAttribute("aria-selected"), "true");
    await page.keyboard.press("n");
    await page.getByRole("region", { name: "Dar un turno" }).waitFor();
    // Escribiendo en un campo, la tecla es texto: no cambia de solapa.
    await page.getByRole("region", { name: "Dar un turno" }).getByRole("textbox").first().fill("");
    await page.getByRole("region", { name: "Dar un turno" }).getByRole("textbox").first().press("2");
    assert.equal(await page.getByRole("tab", { name: "Agenda" }).getAttribute("aria-selected"), "true");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("paleta (Ctrl+K): buscar un cliente que debe, verlo en rojo y abrir su ficha; Escape la cierra", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    const deudor = await page.evaluate(() => {
      const e = (window as unknown as { __estado?: () => { clientes: { nombre: string; deuda: number }[] } }).__estado?.();
      return e?.clientes.find((c) => c.deuda > 0)?.nombre ?? "Agustina Romero";
    });
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Control+k");
    const paleta = page.getByRole("dialog", { name: "Buscar o hacer" });
    await paleta.waitFor();
    await paleta.getByRole("combobox").fill(deudor.split(" ")[0]);
    const opcion = paleta.getByRole("option").filter({ hasText: deudor }).filter({ hasText: /^Cliente/i }).first();
    await opcion.waitFor();
    assert.match(await opcion.innerText(), /debe \$/);
    await page.keyboard.press("Escape");
    await paleta.waitFor({ state: "detached" });
    await page.keyboard.press("/");
    await paleta.getByRole("combobox").fill(deudor.split(" ")[0]);
    await paleta.getByRole("option").filter({ hasText: deudor }).filter({ hasText: /^Cliente/i }).first().click();
    assert.equal(await page.getByRole("tab", { name: "Clientes" }).getAttribute("aria-selected"), "true");
    await page.getByRole("region", { name: deudor }).first().waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("menú rápido del turno: clic derecho sobre Martín (debe) → «Cobrar · $…» abre su cuenta; Escape cierra el menú", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    await turnoDeMartin(page).click({ button: "right" });
    const menu = page.getByRole("menu", { name: "Acciones rápidas del turno" });
    await menu.waitFor();
    assert.equal(await menu.getByRole("menuitem", { name: "Cerrar cancha" }).count(), 0, "debe plata: no se cierra");
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "detached" });
    await turnoDeMartin(page).click({ button: "right" });
    await menu.getByRole("menuitem", { name: /^Cobrar · \$/ }).click();
    await page.getByRole("region", { name: "Martín Ríos" }).first().waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("menú rápido: «Mover…» y «Marcar falta…» abren la cuenta con ESE formulario desplegado (el mismo del pie de la cuenta)", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar({ width: 1366, height: 900 });
    const menu = page.getByRole("menu", { name: "Acciones rápidas del turno" });
    // Martín está jugando: se mueve (a otra cancha), la falta no se ofrece.
    await turnoDeMartin(page).click({ button: "right" });
    await menu.waitFor();
    assert.equal(await menu.getByRole("menuitem", { name: "Marcar falta…" }).count(), 0, "jugando no hay falta");
    await menu.getByRole("menuitem", { name: "Mover…" }).click();
    const cuenta = page.locator('[data-ui="hoja-del-turno"]');
    await cuenta.getByRole("button", { name: "Mover", expanded: true }).waitFor();
    await page.waitForFunction(() => (document.activeElement as HTMLElement | null)?.closest("label, div")?.textContent?.includes("A la cancha"));
    assert.ok((await page.evaluate(() => document.activeElement?.tagName)) === "SELECT", "el foco queda en «A la cancha»");
    await page.keyboard.press("Escape");
    await cuenta.waitFor({ state: "detached" });
    // Lucas está reservado: «Marcar falta…» abre «No vino» con a quién se le cobra (y la previa con las reglas del motor).
    const lucas = page.getByRole("button", { name: /^Lucas Fernández, Cancha 1, de 20:30/ });
    await lucas.scrollIntoViewIfNeeded();
    await lucas.click({ button: "right" });
    await menu.getByRole("menuitem", { name: "Marcar falta…" }).click();
    await cuenta.getByRole("button", { name: "No vino", expanded: true }).waitFor();
    await cuenta.getByRole("group", { name: "A quién se le cobra el turno" }).waitFor();
    assert.equal(await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type), "radio", "el foco queda en a quién se le cobra");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("piel de Break Point: franjas de 30 px con turnos y raya de ahora alineados, lamparita y botones de 32 px con toque de 44, y el arrastre corre la grilla", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    if (!css) return t.skip("no se pudo compilar el CSS de la app");
    const { page, errores } = await montar({ width: 1366, height: 768 }, undefined, true);
    const medidas = await page.evaluate(() => {
      const g = document.querySelector<HTMLElement>('[aria-describedby="club-agenda-ayuda"] > div')!;
      const pistas = getComputedStyle(g).gridTemplateRows.split(" ").map(parseFloat);
      const top = g.getBoundingClientRect().top + pistas[0];
      // (Sin funciones con nombre adentro: tsx les agrega un `__name` que el navegador no tiene.)
      const [luz, chapa, turno, dia] = ['[data-agenda="luz"]', '[data-agenda="luz-chapa"]', '[data-agenda="acciones"] [data-ui="button"]', '[data-agenda="dias"] button']
        .map((sel) => document.querySelector(sel)!.getBoundingClientRect())
        .map((r) => ({ w: Math.round(r.width), h: Math.round(r.height) }));
      // La raya de ahora y los turnos en la misma regla: desde el turno de Lucas (20:30; su <li> tiene 2 px de margen),
      // la raya cae (20:30 − ahora) / 30 franjas más arriba.
      const [hh, mm] = document.querySelector('[data-agenda="ahora-hora"]')!.textContent!.split(":").map(Number);
      const lucas = [...document.querySelectorAll("[data-turno]")].find((b) => b.getAttribute("aria-label")!.startsWith("Lucas Fernández, Cancha 1, de 20:30"))!;
      const esperada = lucas.closest("li")!.getBoundingClientRect().top - 2 - ((20 * 60 + 30 - (hh * 60 + mm)) / 30) * pistas[1];
      const ahora = document.querySelector('[data-agenda="ahora"]')!.getBoundingClientRect().top;
      return { fila: pistas[1], top, esperada, ahora, luz, chapa, turno, dia };
    });
    assert.equal(medidas.fila, 30, "30 px por media hora, como el club de hoy");
    assert.ok(Math.abs(medidas.ahora - medidas.esperada) <= 1, `la raya de ahora (${medidas.ahora}) alineada con los turnos (${medidas.esperada})`);
    assert.deepEqual([medidas.luz.w, medidas.luz.h, medidas.chapa.w, medidas.chapa.h], [44, 44, 32, 32], "la lamparita se ve de 32 y se toca en 44");
    assert.equal(medidas.turno.h, 32, "«+ Turno» se ve de 32 px");
    assert.equal(medidas.dia.h, 32, "los días se ven de 32 px");
    // El turno mide lo que dura: Lucas (90 min) son 3 franjas, menos el margen.
    const lucas = page.getByRole("button", { name: /^Lucas Fernández, Cancha 1, de 20:30/ });
    const [, h1, m1, h2, m2] = (await lucas.getAttribute("aria-label"))!.match(/de (\d+):(\d+) a (\d+):(\d+)/)!.map(Number);
    const duracion = h2 * 60 + m2 - (h1 * 60 + m1);
    assert.equal(Math.round((await lucas.boundingBox())!.height), (duracion / 30) * 30 - 4);
    // El área de toque de 44: 5 px arriba de «+ Turno» y de un día sigue siendo el botón.
    const tocaArriba = (sel: string) =>
      page.evaluate((s) => {
        const b = document.querySelector<HTMLElement>(s)!;
        const r = b.getBoundingClientRect();
        return document.elementFromPoint(r.left + r.width / 2, r.top - 5)?.closest("button") === b;
      }, sel);
    assert.ok(await tocaArriba('[data-agenda="acciones"] [data-ui="button"]'), "«+ Turno» se toca 6 px por fuera");
    assert.ok(await tocaArriba('[data-agenda="dias"] button'), "el día se toca 6 px por fuera");
    const corre = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(corre <= 0, `la página se corre de costado ${corre} px`);
    // Arrastrar hasta el borde de arriba (justo debajo de la cabecera fija) corre la grilla sola; Escape cancela y el turno
    // queda donde estaba. Lucas juega tarde: la grilla está corrida hasta abajo y tiene para subir.
    const marco = page.locator('[aria-describedby="club-agenda-ayuda"]');
    await lucas.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const b = (await lucas.boundingBox())!;
    const m = (await marco.boundingBox())!;
    const antes = await marco.evaluate((el) => el.scrollTop);
    await page.mouse.move(b.x + b.width / 2, b.y + 6);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + 30, { steps: 3 });
    await page.mouse.move(b.x + b.width / 2, m.y + 52, { steps: 4 });
    await page.waitForFunction((a) => document.querySelector('[aria-describedby="club-agenda-ayuda"]')!.scrollTop < a - 30, antes);
    await page.locator('[data-agenda="previa"]').waitFor();
    await page.keyboard.press("Escape");
    await page.locator('[data-agenda="previa"]').waitFor({ state: "detached" });
    await page.mouse.up();
    assert.equal(await page.getByRole("status").filter({ hasText: /pasó a/ }).count(), 0, "cancelado con Escape: no se movió");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("atajos apagados desde la paleta: la tecla 2 ya no cambia de solapa; Ctrl+K sigue", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Control+k");
    const paleta = page.getByRole("dialog", { name: "Buscar o hacer" });
    await paleta.getByRole("combobox").fill("atajos");
    await paleta.getByRole("option", { name: /Apagar los atajos de una tecla/ }).click();
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("2");
    assert.equal(await page.getByRole("tab", { name: "Agenda" }).getAttribute("aria-selected"), "true");
    assert.equal(await page.getByRole("tab", { name: "Agenda" }).getAttribute("aria-keyshortcuts"), null);
    await page.keyboard.press("Control+k");
    await paleta.waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("agenda interactiva: arrastrar un turno a otra cancha (con su previa), Alt+↑ lo corre media hora y la manija de abajo lo alarga", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar({ width: 1366, height: 900 });
    // Lucas Fernández (Cancha 1, 20:30): la Cancha 2 está libre de 20:00 a 22:30.
    const id = await page.getByRole("button", { name: /^Lucas Fernández, Cancha 1, de 20:30/ }).getAttribute("id");
    const lucas = () => page.locator(`[id="${id}"]`);
    await lucas().scrollIntoViewIfNeeded();
    const b = (await lucas().boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + 10);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width, b.y + 10, { steps: 4 });
    await page.mouse.move(b.x + b.width * 1.5, b.y + 10, { steps: 4 });
    const previa = page.locator('[data-agenda="previa"]');
    await previa.waitFor();
    assert.equal(await previa.getAttribute("data-ok"), "si", await previa.innerText());
    await page.mouse.up();
    await page.getByRole("status").filter({ hasText: /^Lucas Fernández pasó a Cancha 2, 20:30/ }).waitFor();
    assert.equal(await previa.count(), 0);
    // Teclado: Alt + ↑ media hora antes (20:00, libre en la Cancha 2); el foco queda en el turno.
    await lucas().focus();
    await page.keyboard.press("Alt+ArrowUp");
    await page.getByRole("status").filter({ hasText: /^Lucas Fernández pasó a Cancha 2, 20:00/ }).waitFor();
    // Estirar: la manija de abajo, una franja hacia abajo (hasta las 22:00, libre).
    await lucas().scrollIntoViewIfNeeded();
    const h = page.locator("li").filter({ has: lucas() }).locator('[data-agenda="estirar"]');
    // Al centro: abajo de todo queda el aviso de lo último que se hizo (con «Deshacer»), encima de la grilla.
    await h.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const hb = (await h.boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + 50, { steps: 5 });
    await page.mouse.up();
    await page.getByRole("status").filter({ hasText: /^Extendido 30 min/ }).waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("teclado: las flechas recorren la grilla (misma cancha arriba/abajo, la de al lado con ←/→) y Enter abre la cuenta", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    const etiqueta = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
    await turnoDeMartin(page).focus();
    // Turnos y huecos libres son celdas de la misma grilla: abajo de Martín (hasta las 19:00) está el hueco de las 19:00.
    await page.keyboard.press("ArrowDown");
    assert.equal(await etiqueta(), "Cancha 1, 19:00, libre: reservar");
    await page.keyboard.press("ArrowUp");
    assert.match(await etiqueta(), /^Martín Ríos, Cancha 1/);
    await page.keyboard.press("ArrowRight");
    assert.equal(await etiqueta(), "Cancha 2, 18:00, libre: reservar", "lo de la Cancha 2 a la misma altura");
    await page.keyboard.press("ArrowDown");
    assert.match(await etiqueta(), /^Julieta Acosta, Cancha 2, de 18:30/);
    await page.keyboard.press("Enter");
    await page.getByRole("region", { name: "Julieta Acosta" }).waitFor();
    // Enter en un hueco libre da un turno ahí.
    await page.getByRole("button", { name: "Cancha 3, 23:30, libre: reservar" }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("region", { name: "Dar un turno" }).waitFor();
    assert.equal(await page.getByRole("region", { name: "Dar un turno" }).getByLabel("Cancha").inputValue(), "c3");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("tablet (768 px) y celular (390 px): sin scroll de costado en la página y objetivos táctiles de 44 px", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    if (!css) return t.skip("no se pudo compilar el CSS de la app");
    for (const viewport of [{ width: 768, height: 1024 }, { width: 390, height: 844 }]) {
      const { page, errores } = await montar(viewport);
      await turnoDeMartin(page).click();
      const cuenta = page.getByRole("region", { name: "Martín Ríos" });
      await cuenta.waitFor();
      const chicos = await page.evaluate(() =>
        [...document.querySelectorAll("button, select, label:has(input[type=radio])")]
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 0 && (r.height < 44 || r.width < 44))
          .map(({ el, r }) => `${(el.getAttribute("aria-label") ?? el.textContent ?? "").slice(0, 40)} (${Math.round(r.width)}×${Math.round(r.height)})`),
      );
      assert.deepEqual(chicos, [], `a ${viewport.width} px hay objetivos de menos de 44 px`);
      // La cuenta es una hoja encima de la agenda (como el club de hoy): se cierra para ir a otra solapa.
      await page.keyboard.press("Escape");
      for (const solapa of ["Fijos y espera", "Mantenimiento y lluvia", "Buffet", "Caja"]) {
        await irASolapa(page, solapa);
        const chicosSolapa = await page.evaluate(() =>
          [...document.querySelectorAll("[role=tabpanel] button, [role=tabpanel] select, [role=tabpanel] input:not([type=radio]):not([type=checkbox]), [role=tabpanel] label:has(input[type=radio]), [role=tabpanel] label:has(input[type=checkbox])")]
            .map((el) => ({ el, r: el.getBoundingClientRect() }))
            .filter(({ r }) => r.width > 0 && (r.height < 44 || r.width < 44))
            .map(({ el, r }) => `${(el.getAttribute("aria-label") ?? el.textContent ?? "").slice(0, 40)} (${Math.round(r.width)}×${Math.round(r.height)})`),
        );
        assert.deepEqual(chicosSolapa, [], `${solapa} a ${viewport.width} px`);
        const corre = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(corre <= 0, `${solapa} a ${viewport.width} px se corre ${corre} px`);
      }
      const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(desborde <= 0, `a ${viewport.width} px la página se corre de costado ${desborde} px`);
      assert.deepEqual(errores, []);
      await page.close();
    }
  });

  test("se guarda en ESTE equipo con la clave del negocio y la persona; al volver sigue igual; «Volver a la demo» la rearma", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    await turnoDeMartin(page).click();
    const cuenta = page.getByRole("region", { name: "Martín Ríos" });
    await cuenta.getByRole("button", { name: "Cobrar todo $ 32.000" }).click();
    await page.getByRole("status").filter({ hasText: "Cobrado todo el turno" }).waitFor();
    await page.waitForFunction(() => localStorage.getItem("gsg-club:demo-club:u_recepcion:v1") !== null);
    const claves = await page.evaluate(() => Object.keys(localStorage));
    assert.deepEqual(claves, ["gsg-club:demo-club:u_recepcion:v1"], "una sola clave, del negocio y la persona");

    // Recargar: sigue donde la dejó.
    await page.reload();
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => (window as unknown as Ventana).__montar("demo-club", "u_recepcion"));
    await page.getByText("Seguís donde la dejaste.", { exact: false }).waitFor();
    assert.equal(await page.getByRole("button", { name: /^Martín Ríos, Cancha 1,.*En cancha, debe/ }).count(), 0);

    await page.getByRole("button", { name: "Volver a la demo" }).click();
    await page.getByRole("status").filter({ hasText: "volviste a la demo de hoy" }).waitFor();
    await turnoDeMartin(page).waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });
  test("dar un turno: «+ Turno», la previa con precio y seña, reservar muestra la confirmación por WhatsApp, «Abrir el turno», cobrar la seña y «Deshacer»", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    await page.getByRole("button", { name: "+ Turno" }).click();
    const alta = page.getByRole("region", { name: "Dar un turno" });
    await alta.waitFor();
    await alta.getByLabel("Cancha").selectOption({ label: "Cancha 4" });
    await alta.getByLabel("Cuánto juegan").selectOption({ label: "1 hora" });
    await alta.getByLabel("A nombre de").fill("Turno de prueba");
    await alta.getByRole("status").filter({ hasText: /\$ [\d.]+ · horario (pico|valle) · pide seña \(\d+ %\)/ }).waitFor();
    assert.equal(await page.getByRole("button", { name: /^Turno de prueba, / }).count(), 0);
    await alta.getByRole("button", { name: "Reservar", exact: true }).click();
    await page.getByRole("status").filter({ hasText: /^Turno de Turno de prueba en Cancha 4, .* Pide seña de/ }).waitFor();
    // «Turno reservado ✔» del vanilla: el mensaje de confirmación con la seña y el código, y el link que abre WhatsApp
    // (en la demo, sin número: se elige el chat). Nada se manda solo.
    const reservado = page.getByRole("region", { name: "Turno reservado" });
    await reservado.waitFor();
    const mensaje = (await reservado.locator("blockquote").textContent())!;
    assert.match(mensaje, /^¡Hola Turno! Te confirmamos el turno en Break Point Pádel: Cancha 4, .* Para dejarlo firme falta la seña de \$ [\d.]+: transferí al alias .* y poné el código BP-\w+ en el concepto/);
    const wa = reservado.getByRole("link", { name: "Mandar por WhatsApp" });
    assert.equal(await wa.getAttribute("href"), `https://wa.me/?text=${encodeURIComponent(mensaje)}`);
    assert.equal(await wa.getAttribute("target"), "_blank");
    await reservado.getByText(/En la demo WhatsApp abre sin número/).waitFor();
    await reservado.getByRole("button", { name: "Abrir el turno" }).click();
    const cuenta = page.getByRole("region", { name: "Turno de prueba" });
    await cuenta.waitFor();
    await page.getByRole("button", { name: /^Turno de prueba, Cancha 4/ }).waitFor();

    await cuenta.getByRole("button", { name: /^Cobrar la seña \$/ }).click();
    await page.getByRole("status").filter({ hasText: /^Seña cobrada: \$ [\d.]+\. Ya se puede abrir la cancha\./ }).waitFor();
    await cuenta.getByText("✔ pagada").waitFor();

    // Deshacer la seña: vuelve a pendiente. (Sólo la última acción.)
    await page.getByRole("button", { name: "Deshacer" }).click();
    await page.getByRole("status").filter({ hasText: /^Listo, se deshizo: Seña cobrada/ }).waitFor();
    await cuenta.getByText("pendiente").waitFor();
    assert.equal(await page.getByRole("button", { name: "Deshacer" }).count(), 0);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("cargar del buffet a un jugador NO repinta la agenda; con «Créditos del cliente» aparece la confirmación y no quedan negativos", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    await turnoDeMartin(page).click();
    const cuenta = page.getByRole("region", { name: "Martín Ríos" });
    await cuenta.getByRole("group", { name: "Para quién" }).getByRole("radio", { name: "Tomás Medina" }).check();
    const antes = await renders(page);
    await cuenta.getByLabel(/^Código o producto/).fill("bp-002");
    await cuenta.getByLabel(/^Código o producto/).press("Enter");
    await page.getByRole("status").filter({ hasText: "1 × Agua 500 ml a la cuenta de Tomás Medina." }).waitFor();
    const porCargo = resta(await renders(page), antes);
    t.diagnostic(`renders por cargar un producto: ${JSON.stringify(porCargo)}`);
    assert.equal(porCargo.AgendaCanchas, undefined, "la agenda no se repinta por un cargo");
    assert.equal(porCargo.BloqueTurno, undefined);
    await cuenta.getByLabel("Totales del turno").getByText("$ 13.000").waitFor();

    // Martín tiene $ 15.000 de créditos: cobrarle sus cargos ($ 11.000) con créditos pide el paso previo.
    await cuenta.getByText("Créditos del cliente ($ 15.000)").click();
    await cuenta.getByRole("button", { name: "Cobrar $ 11.000 a Martín Ríos" }).click();
    const conf = cuenta.getByRole("group", { name: "¿Usamos los créditos de Martín Ríos?" });
    await conf.getByText("$ 4.000").waitFor();
    await conf.getByRole("button", { name: "Sí, usar $ 11.000 de créditos" }).click();
    await page.getByRole("status").filter({ hasText: "Cobrado $ 11.000 a Martín Ríos con sus créditos." }).waitFor();
    // Le quedan $ 4.000: no alcanzan para la parte de nadie de $ 7.000 → la confirmación no aparece y avisa.
    assert.equal(await cuenta.getByText("Créditos del cliente ($ 4.000)").count(), 1);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("buffet: fiar con el OK del dueño (código de 6 letras) y pasar a cuenta corriente; caja: egreso y cierre con diferencia", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    await irASolapa(page, "Buffet");
    // Julieta ya tiene un pedido de cuenta corriente esperando (viene en la demo); Federico no tiene ninguno.
    await page.getByRole("article", { name: "Julieta Acosta" }).getByText("habilitarle la cuenta corriente hasta $ 60.000", { exact: false }).first().waitFor();
    const tarjeta = page.getByRole("article", { name: "Federico Luna" });
    await tarjeta.getByRole("button", { name: "Pedir OK para fiar $ 22.100" }).click();
    await page.getByRole("status").filter({ hasText: "Pedido enviado: fiarle $ 22.100 a Federico Luna." }).waitFor();
    await tarjeta.getByLabel(/^Código del dueño/).fill("AAA-AAA");
    await tarjeta.getByRole("button", { name: "Aprobar" }).click();
    await page.getByRole("alert").filter({ hasText: "(1 de 5)" }).waitFor();
    await tarjeta.getByText("Quedan 4 intentos.").waitFor();
    await tarjeta.getByRole("button", { name: /^Ver el código que le llega al dueño/ }).click();
    const codigo = (await tarjeta.locator("strong.tabular-nums").textContent())!;
    assert.match(codigo, /^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
    await tarjeta.getByLabel(/^Código del dueño/).fill(codigo);
    await tarjeta.getByRole("button", { name: "Aprobar" }).click();
    await page.getByRole("status").filter({ hasText: /^Aprobado por .*: ya podés pasar \$ 22\.100/ }).waitFor();
    await tarjeta.getByRole("button", { name: "A su cuenta corriente" }).click();
    await page.getByRole("status").filter({ hasText: "$ 22.100 a la cuenta corriente de Federico Luna. Cuenta cerrada." }).waitFor();
    assert.equal(await page.getByRole("article", { name: "Federico Luna" }).count(), 0);

    await irASolapa(page, "Caja");
    const efectivo = async () => (await page.getByText("Efectivo en el cajón").locator("xpath=following-sibling::dd").textContent())!;
    const antes = await efectivo();
    // El egreso pide el PIN de quien opera (Lu, recepción, en la demo): sin PIN o con uno equivocado no pasa.
    const egreso = page.getByRole("region", { name: "Anotar un egreso en efectivo" });
    const pinEgreso = egreso.getByLabel("PIN de Lu");
    assert.equal(await pinEgreso.getAttribute("type"), "password");
    assert.equal(await pinEgreso.getAttribute("inputmode"), "numeric");
    assert.equal(await pinEgreso.getAttribute("autocomplete"), "off");
    await egreso.getByLabel("Monto").fill("2500");
    await egreso.getByLabel(/^Concepto/).fill("Hielo");
    await egreso.getByRole("button", { name: "Anotar el egreso" }).click();
    await page.getByRole("alert").filter({ hasText: /^Poné tu PIN/ }).waitFor();
    await pinEgreso.fill("99");
    await egreso.getByRole("button", { name: "Anotar el egreso" }).click();
    // Suma al tope compartido de todo PIN del equipo (el del bloqueo): el aviso dice cuántos van.
    await page.getByRole("alert").filter({ hasText: "PIN incorrecto (1 de 5)." }).waitFor();
    assert.equal(await pinEgreso.inputValue(), "", "el PIN se borra después de cada intento");
    assert.equal(await efectivo(), antes, "sin el PIN no salió nada del cajón");
    await pinEgreso.fill("33");
    await egreso.getByRole("button", { name: "Anotar el egreso" }).click();
    await page.getByRole("status").filter({ hasText: "Egreso de $ 2.500 (Hielo) anotado" }).waitFor();
    const numero = (x: string) => Number(x.replace(/\D/g, ""));
    assert.equal(numero(await efectivo()), numero(antes) - 2500);
    // El cierre también pide el PIN: sin él no cierra.
    const cierre = page.getByRole("region", { name: "Cerrar la caja" });
    await cierre.getByLabel("Efectivo contado", { exact: true }).fill(String(numero(await efectivo()) + 500));
    await cierre.getByRole("button", { name: "Cerrar la caja" }).click();
    await page.getByRole("alert").filter({ hasText: /^Poné tu PIN/ }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Cierres" }).count(), 0, "sin PIN no quedó ningún cierre");
    await cierre.getByLabel("PIN de Lu").fill("33");
    await cierre.getByRole("button", { name: "Cerrar la caja" }).click();
    await page.getByRole("status").filter({ hasText: /^Caja del .* cerrada: sobran \$ 500\./ }).waitFor();
    // Las de días anteriores que quedaron sin cerrar se avisan en rojo y se cierran eligiendo el día.
    const aviso = page.getByRole("alert").filter({ hasText: /cajas? sin cerrar/ });
    if (await aviso.count()) {
      const atrasada = page.getByRole("region", { name: /cajas? sin cerrar/ });
      await atrasada.getByLabel(/^Efectivo contado de la caja del/).fill("0");
      await atrasada.getByLabel("PIN de Lu").fill("33");
      await atrasada.getByRole("button", { name: "Cerrar esa caja" }).click();
      await page.getByRole("status").filter({ hasText: /^Caja del .* cerrada/ }).waitFor();
    }
    await page.getByRole("heading", { name: "Cierres" }).waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });
  test("ciclo del turno: mover (repinta sólo lo que cambió), cancelar con su previa, plan lluvia, turno fijo y lista de espera", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    // Mover a Gonzalo Vera (Cancha 4, 22:30) a otra hora de la misma cancha.
    await page.getByRole("button", { name: /^Gonzalo Vera, Cancha 4, de 22:30/ }).click();
    const cuenta = page.getByRole("region", { name: "Gonzalo Vera" });
    await cuenta.getByRole("button", { name: "Mover" }).click();
    await cuenta.getByLabel("A la cancha").selectOption({ label: "Cancha 2" });
    const antes = await renders(page);
    await cuenta.getByRole("button", { name: "Pasar el turno ahí" }).click();
    await page.getByRole("status").filter({ hasText: /^Gonzalo Vera pasó a Cancha 2/ }).waitFor();
    const porMover = resta(await renders(page), antes);
    t.diagnostic(`renders por mover un turno: ${JSON.stringify(porMover)}`);
    assert.equal(porMover.BloqueTurno ?? 0, 1, "se repinta sólo el turno movido");
    assert.ok((porMover.Franja ?? 0) <= 12, `huecos repintados: ${porMover.Franja}`);

    // Cancelar a Agustina Romero (con ficha, faltan menos de 12 h): la previa dice qué pasa con lo pagado.
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Agustina Romero, Cancha 4/ }).click();
    const agus = page.getByRole("region", { name: "Agustina Romero" });
    await agus.getByRole("button", { name: "Cancelar el turno" }).first().click();
    await agus.getByRole("status").filter({ hasText: /No pagó nada|en suspenso|crédito/ }).waitFor();
    // «Cancela el club» (devolver todo aunque sea tarde) es de un dueño: recepción no lo ve (21/10).
    assert.equal(await agus.getByLabel(/^Cancela el club/).count(), 0, "recepción no puede cancelar «por el club»");
    await agus.getByRole("button", { name: "Cancelar el turno" }).last().click();
    await page.getByRole("status").filter({ hasText: /^Turno de Agustina Romero cancelado\./ }).waitFor();
    // El turno salió de la grilla: el foco no cae al principio de la página (Gate 21/10, B3).
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => document.activeElement === document.body), false, "el foco no se pierde al cancelar");
    if (await page.getByRole("button", { name: "Ahora no" }).count()) {
      await page.getByRole("button", { name: "Ahora no" }).click();
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => document.activeElement === document.body), false, "ni al cerrar el ofrecimiento del hueco");
    }
    await page.getByText(/Cancelados, suspendidos y faltas de este día \(1\)/).waitFor();

    // Break Point tiene las 4 techadas: no hay plan lluvia (el flujo de lluvia se prueba en canchas-core y ciclo-core
    // con una descubierta). Marcar el techo es del dueño: recepción no lo ve.
    await irASolapa(page, "Mantenimiento y lluvia");
    await page.getByText("Todas las canchas son techadas: la lluvia no mueve turnos.").waitFor();
    assert.equal(await page.getByLabel("Llueve desde").count(), 0);
    assert.equal(await page.getByRole("button", { name: /^Marcar Cancha/ }).count(), 0, "recepción no cambia el techo");

    // Turno fijo nuevo y lista de espera.
    await irASolapa(page, "Fijos y espera");
    const fijo = page.getByRole("region", { name: "Nuevo turno fijo" });
    await fijo.getByLabel("A nombre de").fill("Fijo de prueba");
    await fijo.getByLabel("Día").selectOption({ label: "Martes" });
    await fijo.getByLabel("Hora").selectOption({ label: "09:00" });
    await fijo.getByRole("button", { name: "Crear el turno fijo" }).click();
    await page.getByRole("status").filter({ hasText: /^Turno fijo de Fijo de prueba los martes a las 09:00\./ }).waitFor();
    await page.getByText(/Fijo de prueba · martes 09:00/).waitFor();
    const daniela = page.getByRole("group", { name: /^Huecos que le sirven a Daniela Navarro/ });
    await daniela.getByRole("button").first().click();
    await page.getByRole("status").filter({ hasText: /^Turno para Daniela Navarro .* Salió de la lista de espera\./ }).waitFor();
    await page.getByRole("region", { name: "Daniela Navarro" }).waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("jornada real: una pestaña por equipo con «Usar acá», el latido no repinta la agenda y cambiar de operador tampoco", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const contexto = await browser!.newContext({ viewport: { width: 1024, height: 768 }, locale: "es-AR" });
    await contexto.clock.install({ time: new Date(2026, 9, 17, 20, 0, 5) });
    const errores: string[] = [];
    const html = `<!doctype html><html lang="es"><head><style>${css}</style><script>${CONTADOR}</script></head><body class="bg-surface text-body"><main id="root" class="p-4"></main></body></html>`;
    await contexto.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html }));
    // Lo que ya hay guardado en este equipo: una jornada con turnos (la demo del día, como si se hubiera cargado).
    const guardado = textoDeLaDemo(textoDelEstado(M.generarDemo("2026-10-17")), "2026-10-17", 1);
    const abrir = async (sembrar: boolean) => {
      const p = await contexto.newPage();
      p.on("pageerror", (e) => errores.push(e.message));
      p.on("console", (m) => {
        if (m.type() === "error") errores.push(m.text());
      });
      await p.goto(ORIGEN);
      if (sembrar) await p.evaluate(([k, v]) => localStorage.setItem(k, v), [claveDeLaJornada("demo-club"), guardado]);
      await p.addScriptTag({ content: bundleReal });
      await p.evaluate(() => (window as unknown as { __montarReal: (n: string, u: string) => void }).__montarReal("demo-club", "u_recepcion"));
      // Sin nadie que haya entrado con su PIN no se ve nada del club: sólo «Bloqueado» (y la cinta de estado).
      await p.getByText("Entrá con tu PIN para ver y operar el club.").waitFor();
      assert.equal(await p.getByRole("heading", { name: "Agenda de canchas" }).count(), 0, "sin PIN no se ve la agenda");
      assert.equal(await p.getByRole("tablist", { name: "Recepción del club" }).count(), 0, "ni las solapas");
      if (!sembrar) return p; // la segunda pestaña queda en «Usar acá» (sólo lectura): no entra nadie todavía
      // Entra Lu (recepción) con su PIN: recién ahí aparece la recepción.
      await p.evaluate(() => {
        const a = (window as unknown as { __almacen: import("./almacen").Almacen }).__almacen;
        const u = a.estado().usuarios.find((x) => x.id === "u-lu")!;
        a.cambiarOperador(u, { usuarioId: u.id, pin: u.pin });
      });
      await p.getByRole("heading", { name: "Agenda de canchas" }).waitFor();
      return p;
    };
    const p1 = await abrir(true);
    await p1.getByText("Guardado en este equipo").waitFor();
    await p1.getByText(/Jornada real · Hora: 20:00/).waitFor();
    assert.equal(await p1.getByText("Datos de ejemplo — no se guarda nada en el sistema").count(), 0);
    assert.equal(await p1.evaluate(() => (window as unknown as { __montajes: number }).__montajes), 1, "la pieza global se monta una vez");

    // Latido sin cambio de minuto: nadie se repinta. Con cambio de minuto: la cinta y la raya de «ahora», no los turnos.
    let antes = await renders(p1);
    await p1.clock.runFor(15_000);
    const porLatido = resta(await renders(p1), antes);
    t.diagnostic(`renders por un latido sin cambio de minuto: ${JSON.stringify(porLatido)}`);
    assert.deepEqual(porLatido, {});
    antes = await renders(p1);
    await p1.clock.runFor(45_000);
    await p1.getByText(/Jornada real · Hora: 20:01/).waitFor();
    const porMinuto = resta(await renders(p1), antes);
    t.diagnostic(`renders por el cambio de minuto: ${JSON.stringify(porMinuto)}`);
    assert.equal(porMinuto.BloqueTurno, undefined, "ningún turno se repinta por el minuto");
    assert.equal(porMinuto.ClubDemo, undefined, "la recepción tampoco (el día no cambió)");

    // Cambiar de operador (lo que hará el PIN): la agenda no se entera; la caja dice quién opera.
    antes = await renders(p1);
    await p1.evaluate(() => {
      const a = (window as unknown as { __almacen: import("./almacen").Almacen }).__almacen;
      const u = a.estado().usuarios.find((x) => x.rol === "duenio" && x.pin)!;
      a.cambiarOperador(u, { usuarioId: u.id, pin: u.pin });
    });
    const porOperador = resta(await renders(p1), antes);
    t.diagnostic(`renders por cambiar de operador: ${JSON.stringify(porOperador)}`);
    // Pasa a operar un dueño: la bandeja «Para resolver ahora» suma lo que es SÓLO de un dueño (como el vanilla,
    // `!a.paraDuenio || esDuenio()`) y pinta sólo esas alertas nuevas; la agenda y los turnos no se enteran.
    // La compuerta «sólo con operador» (ClubDemo) se entera, una vez, y no repinta a sus hijos.
    // «Bloquear» de la cinta (escucha al operador) y su tecla, también una vez.
    const { BandejaDelClub, Badge, ItemDeLaBandeja = 0, Button = 0, Marca = 0, Forma = 0, SoloConOperador = 0, BloquearDesdeLaCinta = 0, Kbd = 0, TiraDeSolapas = 0, ...resto } = porOperador;
    assert.ok(SoloConOperador <= 1, "la compuerta se repinta a lo sumo una vez");
    // De Lu (recepción) a un dueño cambian las solapas que se ven (siguen a quien opera): se repinta SÓLO la tira, una vez.
    assert.ok(TiraDeSolapas <= 1, "la tira de solapas se repinta a lo sumo una vez");
    assert.ok(BloquearDesdeLaCinta <= 1 && Kbd <= 1, "«Bloquear» se repinta a lo sumo una vez");
    assert.deepEqual(resto, {}, "con la Agenda a la vista, cambiar de operador no repinta la agenda ni los turnos");
    const deDuenio = await p1.evaluate(() => {
      const e = (window as unknown as { __almacen: import("./almacen").Almacen }).__almacen.estado();
      return e.novedades.filter((n) => n.estado === "pendiente").length + (e.solicitudesAcceso as { estado: string }[]).filter((x) => x.estado === "pendiente").length;
    });
    assert.equal(ItemDeLaBandeja, deDuenio, "en la bandeja se pintan sólo las alertas del dueño que aparecieron");
    assert.ok(Button <= deDuenio + BloquearDesdeLaCinta && Marca <= deDuenio && Forma <= deDuenio, "y sólo sus botones y marcas (más «Bloquear»)");
    assert.ok((BandejaDelClub ?? 0) <= 1 && (Badge ?? 0) <= 1);
    await p1.evaluate(() => (window as unknown as { __irASolapa: (id: string) => void }).__irASolapa("caja"));
    await p1.getByText(/^Operás como /).waitFor();
    assert.equal(await p1.getByRole("tab", { name: "Caja" }).getAttribute("aria-selected"), "true", "irASolapa lleva a la solapa");

    // Otra pestaña del mismo equipo: sólo para mirar, con «Usar acá».
    const p2 = await abrir(false);
    await p2.getByText("La jornada está abierta en otra pestaña de este equipo").waitFor();
    await p2.getByRole("button", { name: "Usar acá" }).click();
    await p2.getByText("Guardado en este equipo").waitFor();
    await p1.getByText("La jornada está abierta en otra pestaña de este equipo").waitFor();
    const claves = await p2.evaluate(() => Object.keys(localStorage));
    assert.deepEqual(claves, ["gsg-club:demo-club:jornada:v1"], "la jornada del negocio, sin claves de la demo");
    assert.deepEqual(errores, []);
    await contexto.close();
  });
});
