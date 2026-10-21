// ============================================================================
// CUENTA Y BUFFET (ola 1 de paridad) en un navegador de verdad — clic por clic, y cuánto se repinta.
// ============================================================================
//
// El mismo armado que club-pantalla.test.ts (ClubDemo REAL con esbuild, el CSS real de la app y un gancho como el de
// las DevTools de React que cuenta los renders por componente). Se prueba lo que suma la ola 1:
//   · la cuenta del turno: sumar un jugador (por nombre y con su ficha), cobrar una parte de la cancha, cerrar la
//     cancha a cuenta corriente; sumar un jugador o un cargo NO repinta la grilla (salvo el «x/4» de ESE turno);
//   · el buffet: la venta rápida de mostrador (tipear no repinta las cuentas), pasar un cargo a otra cuenta y un
//     descuento con el PIN del dueño (con los PIN de ejemplo rotulados en la demo);
//   · 44 px y sin scroll de costado a 390 px con la mesa compleja abierta, y el teclado en la mesa compleja;
//   · la piel de Break Point (piel/buffet.css): tarjetas resumidas por cuenta con «Cargar / cobrar», que despliega el
//     − / + y los «+ Plato» (con el teclado), contraste AA y 44 px a 390 px.
// El CSS que importan las pantallas (la piel) no entra al bundle: lo pone la página, como en la app.
// Sin Chromium o sin esbuild, se saltea con el motivo.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";
import { irASolapa } from "./solapas-e2e";

const RAIZ = fileURLToPath(new URL("../../../../../", import.meta.url));
const ORIGEN = "http://localhost:3998/admin/club";

const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import ClubDemo from "@/app/admin/(dashboard)/club/ClubDemo";
window.__montar = () =>
  createRoot(document.getElementById("root")).render(createElement(ClubDemo, { negocio: "demo-club", usuario: "u_recepcion", rol: "RECEPTION" }));
`;

// El mismo contador de club-pantalla.test.ts: en cada commit, qué componentes con nombre corrieron su render.
const CONTADOR = `
(() => {
  window.__renders = {};
  let previo = new WeakSet();
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, renderers: new Map(), inject() { return 1; }, checkDCE() {},
    onScheduleFiberRoot() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
    onCommitFiberRoot(_id, root) {
      const actual = new WeakSet();
      const pila = [root.current];
      while (pila.length) {
        const f = pila.pop();
        actual.add(f);
        const nombre = typeof f.type === "function" ? f.type.name.replace(/\\d+$/, "") : (f.type && typeof f.type === "object" && f.type.type && f.type.type.name ? f.type.type.name.replace(/\\d+$/, "") : null);
        if (nombre && !previo.has(f) && (f.alternate === null || (f.flags & 1) === 1)) window.__renders[nombre] = (window.__renders[nombre] || 0) + 1;
        if (f.sibling) pila.push(f.sibling);
        if (f.child) pila.push(f.child);
      }
      previo = actual;
    },
  };
})();
`;

type Ventana = { __montar: () => void; __renders: Record<string, number> };

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

describe("Cuenta y buffet (ola 1) en el navegador", { timeout: 180_000 }, () => {
  let browser: Browser | null = null;
  let bundle = "";
  let css = "";
  let piel = "";
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
      write: false,
      format: "iife",
      jsx: "automatic",
      tsconfig: join(RAIZ, "tsconfig.json"),
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "silent",
      // Las pieles de cada pantalla (piel/*.css) las sirve Next; acá alcanza con el CSS de la app.
    });
    bundle = r.outputFiles[0].text;
    css = await cssDeLaApp();
    piel = readFileSync(join(RAIZ, "src", "app", "admin", "(dashboard)", "club", "piel", "buffet.css"), "utf8");
    browser = await playwright.chromium.launch({ executablePath: chrome });
  });

  after(async () => {
    await browser?.close();
  });

  /** `conPiel`: la raíz con la estética de Break Point (como la pone el layout del backoffice) y la piel del buffet. */
  async function montar(viewport = { width: 1024, height: 768 }, conPiel = false): Promise<{ page: Page; errores: string[] }> {
    const page = await browser!.newPage({ viewport, locale: "es-AR" });
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errores.push(m.text());
    });
    const raiz = conPiel ? ' data-skin="fable" data-estetica="breakpoint"' : "";
    const html = `<!doctype html><html lang="es"${raiz}><head><style>${css}${conPiel ? piel : ""}</style><script>${CONTADOR}</script></head><body class="bg-surface text-body"><main id="root" class="p-4"></main></body></html>`;
    await page.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html }));
    await page.goto(ORIGEN);
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => (window as unknown as Ventana).__montar());
    await page.getByRole("heading", { name: "Agenda de canchas" }).waitFor();
    return { page, errores };
  }

  const renders = (page: Page) => page.evaluate(() => ({ ...(window as unknown as Ventana).__renders }));
  const resta = (a: Record<string, number>, b: Record<string, number>) =>
    Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v - (b[k] ?? 0)]).filter(([, v]) => (v as number) > 0));
  /** Del clic al aviso (el aviso sale en el mismo commit que la acción). */
  async function medir(page: Page, accion: () => Promise<void>, aviso: string | RegExp) {
    const antes = await renders(page);
    const t0 = await page.evaluate(() => performance.now());
    await accion();
    await page.getByRole("status").filter({ hasText: aviso }).waitFor();
    const ms = (await page.evaluate(() => performance.now())) - t0;
    return { ms, porComponente: resta(await renders(page), antes) };
  }

  test("cuenta: sumar un jugador (nombre y ficha), cobrar una parte de la cancha y cerrarla a cuenta corriente", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    await page.getByRole("button", { name: /^Lucas Fernández, Cancha/ }).click();
    const cuenta = page.getByRole("region", { name: "Lucas Fernández", exact: true });
    await cuenta.waitFor();

    // Sumar por nombre: se repinta la cuenta y, en la grilla, SÓLO el turno de Lucas (su «1/4» pasa a «2/4»).
    const campo = cuenta.getByLabel("Nombre, o buscá su ficha");
    await campo.fill("Pedro");
    const porJugador = await medir(page, () => campo.press("Enter"), "Pedro sumado al turno.");
    t.diagnostic(`sumar un jugador: ${porJugador.ms.toFixed(1)} ms · renders ${JSON.stringify(porJugador.porComponente)}`);
    assert.ok((porJugador.porComponente.BloqueTurno ?? 0) <= 1, "en la grilla, a lo sumo el turno que cambió de «x/4»");
    assert.ok((porJugador.porComponente.CuentaDelTurno ?? 0) >= 1);
    assert.equal(await campo.inputValue(), "", "el campo queda listo para el siguiente");

    // Con su ficha: desde 2 letras aparecen las fichas que coinciden.
    await campo.fill("Mart");
    await cuenta.getByRole("button", { name: /^Sumar a Martín Ríos/ }).click();
    await page.getByRole("status").filter({ hasText: "Martín Ríos sumado al turno con su ficha." }).waitFor();

    // Un cargo a un jugador NO repinta la grilla (nada de lo que muestra cambió).
    await cuenta.getByRole("group", { name: "Para quién" }).getByRole("radio", { name: "Pedro" }).check();
    const producto = cuenta.getByLabel(/^Código o producto/);
    await producto.fill("bp-002");
    const porCargo = await medir(page, () => producto.press("Enter"), "1 × Agua 500 ml a la cuenta de Pedro.");
    t.diagnostic(`cargar a un jugador: ${porCargo.ms.toFixed(1)} ms · renders ${JSON.stringify(porCargo.porComponente)}`);
    assert.equal(porCargo.porComponente.AgendaCanchas, undefined, "la agenda no se repinta por un cargo");
    assert.equal(porCargo.porComponente.BloqueTurno, undefined);

    // Cobrar una parte de la cancha: $ 10.000 en efectivo.
    const monto = cuenta.getByLabel("Cobrar una parte (monto)");
    await monto.fill("10000");
    const porParcial = await medir(page, () => cuenta.getByRole("button", { name: "Cobrar $ 10.000 de la cancha" }).click(), /^Cobrado \$ 10\.000 de cancha \(Efectivo\)\. A la cancha le quedan \$ 32\.000\./);
    t.diagnostic(`cobro parcial: ${porParcial.ms.toFixed(1)} ms · renders ${JSON.stringify(porParcial.porComponente)}`);
    await cuenta.getByRole("heading", { name: /le quedan \$ 32\.000/ }).waitFor();
    assert.equal(await monto.inputValue(), "32000", "sugiere lo que falta");
    await monto.fill("99999");
    assert.equal(await cuenta.getByRole("button", { name: /de la cancha$/ }).isDisabled(), true, "de más, no se puede");

    // Cerrar la cancha pasando lo que falta a su cuenta corriente.
    await cuenta.getByRole("button", { name: "Cerrar la cancha y pasar $ 32.000 a la cuenta corriente de Lucas Fernández" }).click();
    await page.getByRole("status").filter({ hasText: "Cancha cerrada: $ 32.000 a la cuenta corriente de Lucas Fernández." }).waitFor();
    await cuenta.getByText("Cancha cerrada · la mesa sigue").waitFor();
    assert.equal(await cuenta.getByLabel("Nombre, o buscá su ficha").count(), 0, "con la cancha cerrada no se suman jugadores");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("buffet: venta rápida de mostrador (tipear no repinta las cuentas), pasar un cargo y descuento con el PIN del dueño", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    await irASolapa(page, "Buffet");
    const venta = page.getByRole("region", { name: "Venta rápida de mostrador" });
    await venta.waitFor();

    const antes = await renders(page);
    await venta.getByLabel(/^Código o producto/).pressSequentially("agua");
    const porTipear = resta(await renders(page), antes);
    t.diagnostic(`tipear 4 letras en la venta: renders ${JSON.stringify(porTipear)}`);
    assert.equal(porTipear.TarjetaCuenta, undefined, "las cuentas no se repintan");
    assert.equal(porTipear.BuffetDelClub, undefined);
    await venta.getByRole("button", { name: /^\+ Agua 500 ml/ }).click();
    await venta.getByRole("button", { name: "Uno más de Agua 500 ml" }).click();
    await venta.getByText("Mercado Pago (QR)").click();
    const porVenta = await medir(page, () => venta.getByRole("button", { name: "Cobrar $ 4.000" }).click(), "Venta cobrada: $ 4.000 (Mercado Pago (QR)).");
    t.diagnostic(`venta de mostrador: ${porVenta.ms.toFixed(1)} ms · renders ${JSON.stringify(porVenta.porComponente)}`);
    assert.equal(porVenta.porComponente.TarjetaCuenta, undefined, "vender no repinta las cuentas abiertas");
    await venta.getByText("Buscá y sumá productos.").waitFor();

    // Mesa compleja de Martín: pasarle un cargo a Federico.
    const martin = page.getByRole("article", { name: "Martín Ríos" });
    const federico = page.getByRole("article", { name: "Federico Luna" });
    await martin.getByText("Mesa compleja: repartir o cargar a mano").click();
    const pasar = martin.getByRole("form", { name: /^Pasar un cargo de Martín Ríos/ });
    await pasar.getByLabel("A la cuenta de").selectOption({ label: "Federico Luna" });
    const textoFede = await federico.locator("header p.text-lg").textContent();
    const porPase = await medir(page, () => pasar.getByRole("button", { name: "Pasar el cargo" }).click(), /pasó a la cuenta de Federico Luna\./);
    t.diagnostic(`pasar un cargo: ${porPase.ms.toFixed(1)} ms · renders ${JSON.stringify(porPase.porComponente)}`);
    assert.notEqual(await federico.locator("header p.text-lg").textContent(), textoFede, "la cuenta de Federico sube");
    assert.ok((porPase.porComponente.TarjetaCuenta ?? 0) <= 2, "se repintan las dos cuentas que cambiaron, nada más");
    await federico.getByText("de Martín Ríos", { exact: false }).first().waitFor();

    // Descuento: con el PIN de recepción no; con el de un dueño (rotulado como de ejemplo) sí.
    const manual = martin.getByRole("form", { name: "Cargo manual a Martín Ríos" });
    await manual.getByLabel("Concepto").fill("Cortesía de la casa");
    await manual.getByLabel("Tipo").selectOption("descuento");
    await manual.getByText("Sólo en la demo:").waitFor();
    await manual.getByText(/Rober 1111 · Majo 2222/).waitFor();
    await manual.getByLabel("Monto").fill("1000");
    await manual.getByLabel("PIN del dueño").fill("33");
    await manual.getByRole("button", { name: "Aplicar el descuento" }).click();
    // El PIN mal suma al tope compartido del equipo (el del bloqueo) y el aviso dice cuántos van.
    await page.getByRole("alert").filter({ hasText: "Un descuento lo autoriza el dueño con su PIN (1 de 5)." }).waitFor();
    assert.equal(await manual.getByLabel("PIN del dueño").inputValue(), "", "el PIN no queda escrito");
    await manual.getByLabel("PIN del dueño").fill("1111");
    await manual.getByRole("button", { name: "Aplicar el descuento" }).click();
    await page.getByRole("status").filter({ hasText: "Descuento de $ 1.000 aplicado (lo autorizó Rober)." }).waitFor();
    await martin.getByText("descuento de Rober", { exact: false }).waitFor();
    // «Deshacer» el descuento (está en el DESHACIBLES del vanilla).
    await page.getByRole("button", { name: "Deshacer" }).click();
    await page.getByRole("status").filter({ hasText: /^Listo, se deshizo: Descuento/ }).waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("celular (390 px): la venta y la mesa compleja abierta sin objetivos de menos de 44 px ni scroll de costado; teclado", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    if (!css) return t.skip("no se pudo compilar el CSS de la app");
    const { page, errores } = await montar({ width: 390, height: 844 });
    await page.getByRole("button", { name: /^Lucas Fernández, Cancha/ }).click();
    await page.getByRole("region", { name: "Lucas Fernández", exact: true }).getByLabel("Nombre, o buscá su ficha").fill("Ma");
    const chicos = () =>
      page.evaluate(() =>
        [...document.querySelectorAll("button, select, summary, input:not([type=radio]):not([type=checkbox]), label:has(input[type=radio])")]
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 0 && (r.height < 44 || r.width < 44))
          .map(({ el, r }) => `${(el.getAttribute("aria-label") ?? el.textContent ?? "").slice(0, 40)} (${Math.round(r.width)}×${Math.round(r.height)})`),
      );
    const corre = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.deepEqual(await chicos(), [], "la cuenta con sumar jugador y cobro de la cancha");
    assert.ok((await corre()) <= 0);

    await irASolapa(page, "Buffet");
    const venta = page.getByRole("region", { name: "Venta rápida de mostrador" });
    await venta.getByLabel(/^Código o producto/).fill("agua");
    await venta.getByRole("button", { name: /^\+ Agua 500 ml/ }).click();
    // Teclado: Tab hasta el resumen de la mesa compleja y Enter la abre (es un <details> nativo).
    const resumen = page.getByRole("article", { name: "Martín Ríos" }).locator("summary");
    await resumen.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("article", { name: "Martín Ríos" }).getByRole("button", { name: "Pasar el cargo" }).waitFor();
    await page.getByRole("article", { name: "Martín Ríos" }).getByLabel("Tipo").selectOption("descuento");
    assert.deepEqual(await chicos(), [], "el buffet con la venta y la mesa compleja abiertas");
    assert.ok((await corre()) <= 0, `se corre ${await corre()} px`);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("piel de Break Point: tarjetas resumidas con «Cargar / cobrar» (− / + y «+ Plato» con el teclado), AA y 44 px a 390 px", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    if (!css) return t.skip("no se pudo compilar el CSS de la app");
    const { page, errores } = await montar({ width: 390, height: 844 }, true);
    await irASolapa(page, "Buffet");
    const martin = page.getByRole("article", { name: "Martín Ríos" });
    await martin.waitFor();
    assert.equal(await martin.getAttribute("data-buffet"), "cuenta");

    // Resumida: quién, cuánto y qué lleva; sin el − / + ni los platos. Cobrar y la mesa compleja, a la vista.
    assert.equal(await martin.getByRole("button", { name: /^Uno (más|menos) de/ }).count(), 0, "resumida no muestra el − / +");
    assert.equal(await martin.getByRole("group", { name: /^Cargar un plato/ }).count(), 0, "resumida no muestra los platos");
    assert.ok((await martin.getByRole("list", { name: "Cargos de Martín Ríos" }).getByRole("listitem").count()) > 0);
    await martin.getByRole("button", { name: /^Cobrar \$/ }).waitFor();
    await martin.getByText("Mesa compleja: repartir o cargar a mano").waitFor();

    // «Cargar / cobrar» con el teclado: despliega el − / + y los «+ Plato»; un plato se carga a ESA cuenta.
    const boton = martin.getByRole("button", { name: "Cargar / cobrar a Martín Ríos" });
    assert.equal(await boton.getAttribute("aria-expanded"), "false");
    await boton.focus();
    await page.keyboard.press("Enter");
    assert.equal(await boton.getAttribute("aria-expanded"), "true");
    const controla = await boton.getAttribute("aria-controls");
    assert.ok(controla && (await page.locator(`[id="${controla}"]`).count()) === 1, "aria-controls apunta al detalle");
    await martin.getByRole("button", { name: /^Uno más de/ }).first().waitFor();
    const platos = martin.getByRole("group", { name: "Cargar un plato a Martín Ríos" }).getByRole("button");
    assert.ok((await platos.count()) > 0, "están los «+ Plato»");
    const total = martin.locator('[data-buffet="total"]');
    const antes = await total.textContent();
    await platos.first().click();
    await page.getByRole("status").filter({ hasText: "a la cuenta de Martín Ríos." }).waitFor();
    assert.notEqual(await total.textContent(), antes, "el plato suma a lo que debe");

    // La piel está puesta (la tarjeta de papel con la raya azul de la que se carga) y el contraste es AA.
    // En texto: tsx le agrega `__name` a las funciones con nombre y en el navegador no existe.
    const medidas: { raya: string; tenue: number; boton: number } = await page.evaluate(`(() => {
      const rgb = (c) => {
        const m = c.match(/color\\(srgb ([\\d.]+) ([\\d.]+) ([\\d.]+)/);
        if (m) return [m[1], m[2], m[3]].map((x) => Number(x) * 255);
        return (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
      };
      const lum = (c) => c.map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      const ratio = (a, b) => {
        const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p);
        return (x + 0.05) / (y + 0.05);
      };
      const tarjeta = [...document.querySelectorAll('[data-buffet="cuenta"]')].find((el) => el.textContent.includes("Martín Ríos"));
      const fondo = getComputedStyle(tarjeta).backgroundColor;
      const tenue = tarjeta.querySelector("header p.text-xs");
      const boton = tarjeta.querySelector('[data-buffet="cargar-cobrar"]');
      return {
        raya: getComputedStyle(tarjeta).borderLeftWidth,
        tenue: ratio(getComputedStyle(tenue).color, fondo),
        boton: ratio(getComputedStyle(boton).color, getComputedStyle(boton).backgroundColor),
      };
    })()`);
    t.diagnostic(`piel: ${JSON.stringify(medidas)}`);
    assert.equal(medidas.raya, "3px", "la tarjeta que se carga lleva la raya de la piel");
    assert.ok(medidas.tenue >= 4.5, `texto tenue sobre la tarjeta: ${medidas.tenue.toFixed(2)}:1`);
    assert.ok(medidas.boton >= 4.5, `«Cargar / cobrar»: ${medidas.boton.toFixed(2)}:1`);

    // 44 px en todo lo tocable del buffet (la tarjeta desplegada y la venta) y sin scroll de costado.
    const chicos = await page.evaluate(() =>
      [...document.querySelectorAll('[data-buffet="cuenta"], [data-buffet="mostrador"]')]
        .flatMap((raiz) => [...raiz.querySelectorAll("button, select, summary, input:not([type=radio]):not([type=checkbox]), label:has(input[type=radio])")])
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && (r.height < 44 || r.width < 44))
        .map(({ el, r }) => `${(el.getAttribute("aria-label") ?? el.textContent ?? "").slice(0, 40)} (${Math.round(r.width)}×${Math.round(r.height)})`),
    );
    assert.deepEqual(chicos, []);
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);

    // Se vuelve a plegar: queda el resumen.
    await boton.click();
    assert.equal(await boton.getAttribute("aria-expanded"), "false");
    assert.equal(await martin.getByRole("button", { name: /^Uno más de/ }).count(), 0);
    assert.deepEqual(errores, []);
    await page.close();
  });
});
