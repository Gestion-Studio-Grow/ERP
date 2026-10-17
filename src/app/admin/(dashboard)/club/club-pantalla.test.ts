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

const RAIZ = fileURLToPath(new URL("../../../../../", import.meta.url));
const ORIGEN = "http://localhost:3999/admin/club";

const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import ClubDemo from "@/app/admin/(dashboard)/club/ClubDemo";
window.__montar = (negocio, usuario) =>
  createRoot(document.getElementById("root")).render(createElement(ClubDemo, { negocio, usuario, rol: "RECEPTION" }));
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
      write: false,
      format: "iife",
      jsx: "automatic",
      tsconfig: join(RAIZ, "tsconfig.json"),
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "silent",
    });
    bundle = r.outputFiles[0].text;
    css = await cssDeLaApp();
    browser = await playwright.chromium.launch({ executablePath: chrome });
  });

  after(async () => {
    await browser?.close();
  });

  async function montar(viewport = { width: 1024, height: 768 }, page?: Page): Promise<{ page: Page; errores: string[] }> {
    const p = page ?? (await browser!.newPage({ viewport, locale: "es-AR" }));
    const errores: string[] = [];
    p.on("pageerror", (e) => errores.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errores.push(m.text());
    });
    const html = `<!doctype html><html lang="es"><head><style>${css}</style><script>${CONTADOR}</script></head><body class="bg-surface text-body"><main id="root" class="p-4"></main></body></html>`;
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
    await page.getByRole("status").filter({ hasText: "Cancha cerrada y libre (cobrados $ 21.000). La mesa sigue abierta" }).waitFor();
    await cuenta.getByText("Cancha cerrada · la mesa sigue").waitFor();
    await cuenta.getByRole("button", { name: "Cobrar y cerrar los cargos $ 11.000" }).click();
    await page.getByRole("status").filter({ hasText: "Cargos cerrados: cobrados $ 11.000." }).waitFor();
    await page.getByRole("button", { name: /^Martín Ríos, Cancha 1,.*Cancha cerrada\./ }).waitFor();

    await page.keyboard.press("Escape");
    await page.getByText("Tocá un turno de la agenda para ver su cuenta").waitFor();
    assert.match((await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))) ?? "", /^Martín Ríos, Cancha 1/, "el foco vuelve al turno");
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
      for (const solapa of ["Fijos y espera", "Mantenimiento y lluvia", "Buffet", "Caja"]) {
        await page.getByRole("tab", { name: solapa }).click();
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
  test("dar un turno: «+ Turno», la previa con precio y seña, reservar abre su cuenta, cobrar la seña y «Deshacer»", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    await page.getByRole("button", { name: "+ Turno" }).click();
    const alta = page.getByRole("region", { name: "Dar un turno" });
    await alta.waitFor();
    await alta.getByLabel("Cancha").selectOption({ label: "Cancha 4 (descubierta)" });
    await alta.getByLabel("Cuánto juegan").selectOption({ label: "1 hora" });
    await alta.getByLabel("A nombre de").fill("Turno de prueba");
    await alta.getByRole("status").filter({ hasText: /\$ [\d.]+ · horario (pico|valle) · pide seña de \$/ }).waitFor();
    assert.equal(await page.getByRole("button", { name: /^Turno de prueba, / }).count(), 0);
    await alta.getByRole("button", { name: "Reservar el turno" }).click();
    await page.getByRole("status").filter({ hasText: /^Turno de Turno de prueba en Cancha 4, .* Pide seña de/ }).waitFor();
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
    await cuenta.getByLabel("Para quién").selectOption({ label: "Tomás Medina" });
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
    await page.getByRole("tab", { name: "Buffet" }).click();
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

    await page.getByRole("tab", { name: "Caja" }).click();
    const efectivo = async () => (await page.getByText("Efectivo en el cajón").locator("xpath=following-sibling::dd").textContent())!;
    const antes = await efectivo();
    await page.getByLabel("Monto").fill("2500");
    await page.getByLabel(/^Concepto/).fill("Hielo");
    await page.getByRole("button", { name: "Anotar el egreso" }).click();
    await page.getByRole("status").filter({ hasText: "Egreso de $ 2.500 (Hielo) anotado" }).waitFor();
    const numero = (x: string) => Number(x.replace(/\D/g, ""));
    assert.equal(numero(await efectivo()), numero(antes) - 2500);
    await page.getByLabel("Efectivo contado", { exact: true }).fill(String(numero(await efectivo()) + 500));
    await page.getByRole("button", { name: "Cerrar la caja" }).click();
    await page.getByRole("status").filter({ hasText: /^Caja del .* cerrada: sobran \$ 500\./ }).waitFor();
    // Las de días anteriores que quedaron sin cerrar se avisan en rojo y se cierran eligiendo el día.
    const aviso = page.getByRole("alert").filter({ hasText: /cajas? sin cerrar/ });
    if (await aviso.count()) {
      await page.getByLabel(/^Efectivo contado de la caja del/).fill("0");
      await page.getByRole("button", { name: "Cerrar esa caja" }).click();
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
    await page.getByRole("button", { name: /^Agustina Romero, Cancha 4/ }).click();
    const agus = page.getByRole("region", { name: "Agustina Romero" });
    await agus.getByRole("button", { name: "Cancelar el turno" }).first().click();
    await agus.getByRole("status").filter({ hasText: /No pagó nada|en suspenso|crédito/ }).waitFor();
    await agus.getByLabel("Cancela el club (lo pagado vuelve siempre)").check();
    await agus.getByRole("button", { name: "Cancelar el turno" }).last().click();
    await page.getByRole("status").filter({ hasText: /^Turno de Agustina Romero cancelado\./ }).waitFor();
    await page.getByText(/Cancelados, suspendidos y faltas de este día \(1\)/).waitFor();

    // Plan lluvia: la previa y aplicarlo.
    await page.getByRole("tab", { name: "Mantenimiento y lluvia" }).click();
    await page.getByLabel("Llueve desde").selectOption({ label: "19:30" });
    await page.getByRole("button", { name: "Ver qué pasa con cada turno" }).click();
    await page.getByRole("list", { name: "Qué pasa con cada turno" }).getByText(/Grupo de Bruno/).waitFor();
    await page.getByRole("button", { name: "Aplicar el plan lluvia" }).click();
    await page.getByRole("status").filter({ hasText: /^Plan lluvia: \d+ movidos a techada/ }).waitFor();

    // Turno fijo nuevo y lista de espera.
    await page.getByRole("tab", { name: "Fijos y espera" }).click();
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
});
