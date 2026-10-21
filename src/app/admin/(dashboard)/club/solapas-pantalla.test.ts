// ============================================================================
// CLIENTES Y TABLERO DEL DUEÑO en un navegador de verdad — clic por clic, en la tablet y en el celular.
// ============================================================================
//
// Hermano de club-pantalla.test.ts (mismo armado: ClubDemo REAL con esbuild, el CSS REAL de la app y el Chromium
// de Playwright; sin Next ni base). Se prueba:
//   · recepción: buscar, abrir la ficha (el foco va a la ficha; Escape vuelve al cliente), el estado de cuenta,
//     cobrar una parte de la deuda con «Deshacer», el WhatsApp sin número en la demo; el alta (sin repetir
//     teléfono) y pedir la cuenta corriente → «Esperando al dueño» → aprobar con el código;
//   · el dueño: la solapa Tablero (que recepción no ve), autorizar con el monto cambiado, dar acceso con el PIN a la
//     vista una sola vez (no va al aviso), y configurar la cuenta corriente desde la ficha;
//   · 768 y 390 px: sin scroll de costado en la página, objetivos táctiles de 44 px y contraste AA de cada texto.
// Con CAPTURAS_SOLAPAS=<carpeta> deja capturas. Sin Chromium o sin esbuild, se saltea con el motivo.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";
import { irASolapa, tieneSolapa } from "./solapas-e2e";

const RAIZ = fileURLToPath(new URL("../../../../../", import.meta.url));
const ORIGEN = "http://localhost:3999/admin/club";
const CAPTURAS = process.env.CAPTURAS_SOLAPAS ?? "";

const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import ClubDemo from "@/app/admin/(dashboard)/club/ClubDemo";
import AprobadorDelDuenio from "@/app/admin/(dashboard)/club/aprobar/AprobadorDelDuenio";
window.__montar = (negocio, usuario, rol) =>
  createRoot(document.getElementById("root")).render(createElement(ClubDemo, { negocio, usuario, rol }));
window.__aprobar = (negocio, usuario) =>
  createRoot(document.getElementById("root")).render(createElement(AprobadorDelDuenio, { negocio, usuario, modo: "demo" }));
`;

type Ventana = { __montar: (negocio: string, usuario: string, rol: string) => void; __aprobar: (negocio: string, usuario: string) => void };

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

/** Lo que mide la página (corre en el navegador): objetivos de menos de 44 px y textos bajo AA dentro de la solapa. */
const MEDIR = (donde?: string) => {
  const panel = document.querySelector(donde ?? "[role=tabpanel]")!;
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && s.visibility !== "hidden" && s.clip !== "rect(0px, 0px, 0px, 0px)";
  };
  const chicos = [...panel.querySelectorAll("button, select, input:not([type=radio]):not([type=checkbox]), label:has(input[type=radio]), label:has(input[type=checkbox]), a[href], summary")]
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
    const s = getComputedStyle(el);
    const fondo = fondoDe(el);
    const texto = sobre(rgba(s.color), fondo);
    const [a, b] = [lum(texto), lum(fondo)].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    const px = parseFloat(s.fontSize);
    const grande = px >= 24 || (px >= 18.66 && Number(s.fontWeight) >= 700);
    if (ratio < (grande ? 3 : 4.5)) bajos.push(`«${el.textContent!.trim().slice(0, 30)}» ${ratio.toFixed(2)}:1`);
  }
  return { chicos, bajos, corre: document.documentElement.scrollWidth - document.documentElement.clientWidth };
};

describe("Clientes y Tablero del dueño en el navegador", { timeout: 240_000 }, () => {
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
      loader: { ".css": "empty" }, // la piel (piel/*.css) entra por el CSS de la página, no por el paquete
      stdin: { contents: ENTRADA, loader: "tsx", resolveDir: RAIZ },
      bundle: true,
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

  /** `guardado`: lo que ya hay en este equipo para la demo del dueño (p. ej. tres semanas de club, para archivar). */
  async function montar(rol: "OWNER" | "RECEPTION", viewport = { width: 1024, height: 768 }, guardado?: string): Promise<{ page: Page; errores: string[] }> {
    const p = await browser!.newPage({ viewport, locale: "es-AR", acceptDownloads: true });
    if (guardado) {
      await p.addInitScript(([clave, texto]) => {
        try {
          if (!localStorage.getItem(clave)) localStorage.setItem(clave, texto);
        } catch {
          // sin localStorage la demo arranca de cero y el test lo dice
        }
      }, [`gsg-club:demo-club:u_${rol.toLowerCase()}:v1`, guardado] as const);
    }
    const errores: string[] = [];
    p.on("pageerror", (e) => errores.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errores.push(m.text());
    });
    const html = `<!doctype html><html lang="es"><head><style>${css}</style></head><body class="bg-surface text-body"><main id="root" class="p-4"></main></body></html>`;
    await p.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html }));
    // `MEDIR` viaja como texto al navegador: tsx le agrega `__name(...)` a sus funciones internas.
    await p.addInitScript({ content: "window.__name = (f) => f;" });
    await p.goto(ORIGEN);
    await p.addScriptTag({ content: bundle });
    await p.evaluate((r) => (window as unknown as Ventana).__montar("demo-club", `u_${r.toLowerCase()}`, r), rol);
    await p.getByRole("heading", { name: "Agenda de canchas" }).waitFor();
    return { page: p, errores };
  }

  const capturar = async (page: Page, nombre: string) => {
    if (CAPTURAS) await page.screenshot({ path: join(CAPTURAS, `${nombre}.png`), fullPage: true });
  };
  const aviso = (page: Page, texto: string | RegExp) => page.getByRole("status").filter({ hasText: texto }).waitFor();
  const alerta = (page: Page, texto: string | RegExp) => page.getByRole("alert").filter({ hasText: texto }).waitFor();

  test("recepción: buscar, la ficha con su estado de cuenta, cobrar una parte con «Deshacer» y volver con Escape", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("RECEPTION");
    assert.equal(await tieneSolapa(page, "Tablero"), false, "recepción no ve el Tablero");
    await irASolapa(page, "Clientes");
    await page.getByRole("heading", { name: /^Clientes \(\d+\)$/ }).waitFor();
    // La que debe va primero y en rojo con la palabra.
    const primera = page.getByRole("list", { name: "Clientes del club" }).getByRole("button").first();
    assert.match((await primera.textContent())!, /^Agustina Romero.*⚠ Debe \$ 21\.000/);

    await page.getByLabel("Buscar por nombre o teléfono").fill("agus");
    await page.getByRole("heading", { name: /^Clientes \(1 de \d+\)$/ }).waitFor();
    await page.getByRole("button", { name: /^Agustina Romero/ }).click();
    const ficha = page.getByRole("region", { name: "Agustina Romero" });
    await ficha.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Agustina Romero", "el foco va a la ficha");
    const tabla = ficha.getByRole("table", { name: /Movimientos de la cuenta corriente/ });
    assert.ok((await tabla.getByRole("row").count()) >= 2);
    const wa = ficha.getByRole("link", { name: "Recordar por WhatsApp" });
    assert.match((await wa.getAttribute("href"))!, /^https:\/\/wa\.me\/\?text=/, "en la demo, sin número (los teléfonos de ejemplo podrían ser de alguien real)");
    assert.equal(await ficha.getByRole("button", { name: /^Dar de baja/ }).count(), 0, "con deuda no se da de baja");
    await ficha.getByText(/primero tiene que saldar la cuenta/).waitFor();
    assert.equal(await ficha.getByRole("button", { name: "Habilitar" }).count(), 0, "recepción no configura la cuenta corriente");

    await ficha.getByText("Mercado Pago (QR)").click();
    await ficha.getByLabel(/^Monto/).fill("1000");
    await ficha.getByRole("button", { name: "Cobrar", exact: true }).click();
    await aviso(page, "Cobrado $ 1.000 de la cuenta de Agustina Romero (Mercado Pago (QR)). Saldo: $ 20.000.");
    await ficha.getByText("⚠ Debe $ 20.000").first().waitFor();
    await page.getByRole("button", { name: "Deshacer" }).click();
    await aviso(page, /^Listo, se deshizo: Cobrado \$ 1\.000/);
    await ficha.getByText("⚠ Debe $ 21.000").first().waitFor();

    await ficha.getByRole("button", { name: "Cerrar la ficha" }).focus();
    await page.keyboard.press("Escape");
    await ficha.waitFor({ state: "detached" });
    const fila = (await page.getByRole("button", { name: /^Agustina Romero/ }).getAttribute("id"))!;
    await page.waitForFunction((id) => document.activeElement?.id === id, fila, { timeout: 2000 }); // el foco vuelve al cliente
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("recepción: alta sin repetir teléfono, pedir la cuenta corriente, «Esperando al dueño» y aprobar con el código", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("RECEPTION");
    await irASolapa(page, "Clientes");
    await page.getByRole("button", { name: "+ Alta de cliente" }).click();
    const alta = page.getByRole("region", { name: "Alta de cliente" });
    await alta.getByLabel("Nombre y apellido").fill("Paula Nieto");
    await alta.getByLabel(/^Teléfono/).fill("5491100000001");
    await alta.getByRole("button", { name: "Dar de alta" }).click();
    await alerta(page, "Ya hay un cliente con ese teléfono.");
    await alta.getByLabel(/^Teléfono/).fill("11 5555-1234");
    await alta.getByLabel(/^Nivel/).fill("6ta");
    await alta.getByRole("button", { name: "Dar de alta" }).click();
    await aviso(page, "Listo: Paula Nieto ya es cliente del club.");
    const ficha = page.getByRole("region", { name: "Paula Nieto" });
    await ficha.waitFor();

    await ficha.getByLabel("Límite que pedís").fill("40000");
    await ficha.getByLabel(/^Por qué/).fill("Juega los martes");
    await ficha.getByRole("button", { name: "Pedir la autorización al dueño" }).click();
    await aviso(page, /^Pedido enviado: cuenta corriente para Paula Nieto hasta \$ 40\.000/);
    await ficha.getByRole("heading", { name: "Esperando al dueño" }).waitFor();
    // Un aviso por dueño, con el link al aprobador del ERP; en la demo, sin número.
    const avisar = ficha.getByRole("link", { name: "Avisar a Rober por WhatsApp" });
    assert.match((await avisar.getAttribute("href"))!, /^https:\/\/wa\.me\/\?text=/);
    assert.match(decodeURIComponent((await avisar.getAttribute("href"))!), /http:\/\/localhost:3999\/admin\/club\/aprobar#aprobar&id=/);
    await ficha.getByRole("link", { name: "Avisar a Majo por WhatsApp" }).waitFor();
    await ficha.getByLabel(/^Código del dueño/).fill("AAA-AAA");
    await ficha.getByRole("button", { name: "Aprobar con el código" }).click();
    await alerta(page, "(1 de 5)");
    await ficha.getByText("Quedan 4 intentos.").waitFor();
    await ficha.getByRole("button", { name: /^Ver el código que le llega al dueño/ }).click();
    const codigo = (await ficha.locator("strong.tabular-nums").textContent())!;
    await ficha.getByLabel(/^Código del dueño/).fill(codigo);
    await ficha.getByRole("button", { name: "Aprobar con el código" }).click();
    await aviso(page, /^Aprobado por .*: cuenta corriente habilitada hasta \$ 40\.000\./);
    await ficha.getByText("Hasta $ 40.000").first().waitFor();
    await ficha.getByRole("button", { name: "Dar de baja a Paula Nieto" }).click();
    await aviso(page, "Paula Nieto quedó dado de baja.");
    await ficha.waitFor({ state: "detached" });
    assert.equal(await page.getByRole("button", { name: /^Paula Nieto/ }).count(), 0);
    // «Deshacer» la baja la devuelve a la lista.
    await page.getByRole("button", { name: "Deshacer" }).click();
    await page.getByRole("button", { name: /^Paula Nieto/ }).waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("el dueño: Tablero con el monto cambiado, dar acceso con el PIN una sola vez, y la cuenta corriente desde la ficha", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("OWNER");
    await irASolapa(page, "Tablero");
    await page.getByRole("heading", { name: "Novedades para autorizar" }).waitFor();
    await capturar(page, "tablero-1024");
    const pedido = page.getByRole("article", { name: /^Cuenta corriente · / });
    await pedido.getByText("pide cuenta corriente hasta $ 60.000", { exact: false }).waitFor();
    await pedido.getByLabel("Límite de la cuenta").fill("45.000");
    await pedido.getByRole("button", { name: "Autorizar" }).click();
    await aviso(page, /habilitada hasta \$ 45\.000\.$/);
    assert.equal(await page.getByRole("article", { name: /^Cuenta corriente · / }).count(), 0);

    const acceso = page.getByRole("article", { name: "Acceso al sistema · Juli (recepción finde)" });
    await acceso.getByLabel("Qué puede hacer").selectOption("recepcion");
    await acceso.getByRole("button", { name: "Dar acceso" }).click();
    const pin = page.getByRole("region", { name: /^✔ Acceso otorgado a Juli/ });
    await pin.waitFor();
    assert.match(await page.evaluate(() => document.activeElement?.textContent ?? ""), /^✔ Acceso otorgado/, "el foco va al PIN");
    const numero = (await pin.locator("p.text-4xl").textContent())!;
    assert.match(numero, /^\d{2}$/);
    const textoAviso = (await page.getByRole("status").filter({ hasText: "Acceso otorgado a Juli" }).textContent()) ?? "";
    assert.ok(!textoAviso.includes(numero), "el PIN no va en el aviso");
    assert.equal(await page.getByRole("region", { name: "Qué pasó hoy" }).getByText(numero, { exact: true }).count(), 0, "ni en «qué pasó hoy»");
    await capturar(page, "tablero-pin-1024");
    await pin.getByRole("button", { name: "Listo, ya se lo di" }).click();
    await pin.waitFor({ state: "detached" });
    await page.getByText("Nada espera tu OK.", { exact: false }).waitFor();
    // Indicadores, mapa de calor (con su tabla) y platos.
    await page.getByText("Ocupación de hoy").waitFor();
    await page.getByRole("img", { name: /Ocupación de los últimos 7 días/ }).waitFor();
    await page.getByText("Ver como tabla").click();
    await page.getByRole("table", { name: "Ocupación por día y hora, en porcentaje" }).waitFor();
    assert.ok((await page.getByRole("table", { name: /Platos más vendidos/ }).getByRole("row").count()) > 1);

    // En la ficha, el dueño configura la cuenta corriente.
    await irASolapa(page, "Clientes");
    await page.getByLabel("Buscar por nombre o teléfono").fill("lucas");
    await page.getByRole("button", { name: /^Lucas Fernández/ }).click();
    const ficha = page.getByRole("region", { name: "Lucas Fernández" });
    await ficha.getByLabel("Hasta cuánto le fiamos").fill("120000");
    await ficha.getByRole("button", { name: "Cambiar el límite" }).click();
    await aviso(page, "Cuenta corriente de Lucas Fernández: hasta $ 120.000.");
    await ficha.getByRole("button", { name: "Cortar la cuenta corriente" }).click();
    await aviso(page, "Cuenta corriente de Lucas Fernández cortada: no se le suma más.");
    await ficha.getByText("No habilitada").waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("tablet (768 px) y celular (390 px): sin scroll de costado, objetivos de 44 px y contraste AA", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    if (!css) return t.skip("no se pudo compilar el CSS de la app");
    const revisar = async (page: Page, que: string) => {
      const m = await page.evaluate(MEDIR, undefined);
      assert.deepEqual(m.chicos, [], `${que}: objetivos de menos de 44 px`);
      assert.deepEqual(m.bajos, [], `${que}: textos bajo AA`);
      const anchos = m.corre > 0
        ? await page.evaluate(() => {
            const w = document.documentElement.clientWidth;
            const out: string[] = [];
            const recorrer = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            for (let n = recorrer.nextNode(); n; n = recorrer.nextNode()) {
              const r = document.createRange();
              r.selectNodeContents(n);
              const b = r.getBoundingClientRect();
              if (b.right > w + 0.5) out.push(`${Math.round(b.right)} «${(n.textContent ?? "").trim().slice(0, 40)}» en ${n.parentElement?.tagName.toLowerCase()}.${String(n.parentElement?.className).slice(0, 50)}`);
            }
            return out.slice(0, 4);
          })
        : [];
      assert.ok(m.corre <= 0, `${que}: la página se corre de costado ${m.corre} px (${anchos.join(" | ")})`);
    };
    for (const viewport of [{ width: 768, height: 1024 }, { width: 390, height: 844 }]) {
      const w = viewport.width;
      // El dueño: Clientes con la ficha de quien debe (cobrar, configurar) y el Tablero entero.
      let { page, errores } = await montar("OWNER", viewport);
      await irASolapa(page, "Clientes");
      await page.getByRole("heading", { name: /^Clientes/ }).waitFor();
      await revisar(page, `Clientes a ${w} px`);
      await page.getByRole("button", { name: /^Agustina Romero/ }).click();
      await page.getByRole("region", { name: "Agustina Romero" }).waitFor();
      await revisar(page, `Ficha (dueño) a ${w} px`);
      await capturar(page, `clientes-ficha-duenio-${w}`);
      await page.getByRole("button", { name: "Cerrar la ficha" }).click();
      await page.getByRole("button", { name: "+ Alta de cliente" }).click();
      await page.getByRole("region", { name: "Alta de cliente" }).waitFor();
      await revisar(page, `Alta a ${w} px`);
      await irASolapa(page, "Tablero");
      await page.getByRole("heading", { name: "Novedades para autorizar" }).waitFor();
      await page.getByText("Ver como tabla").click();
      await revisar(page, `Tablero a ${w} px`);
      await capturar(page, `tablero-${w}`);
      // El medidor mide: un texto tenue sobre el fondo hundido (≈4,2:1, lo que ya avisó la Caja) tiene que saltar.
      const testigo = await page.evaluate((medir) => {
        const p = document.createElement("p");
        p.className = "bg-surface-sunken text-muted text-sm";
        p.textContent = "testigo de contraste";
        document.querySelector("[role=tabpanel]")!.append(p);
        const m = (0, eval)(`(${medir})`)() as { bajos: string[] };
        p.remove();
        return m.bajos;
      }, MEDIR.toString());
      assert.ok(testigo.some((b) => b.startsWith("«testigo de contraste»")), `el medidor no detectó el testigo: ${JSON.stringify(testigo)}`);
      assert.deepEqual(errores, []);
      await page.close();

      // Recepción: la ficha con el pedido esperando al dueño.
      ({ page, errores } = await montar("RECEPTION", viewport));
      await irASolapa(page, "Clientes");
      await page.getByRole("button", { name: /Pedida al dueño/ }).first().click();
      await page.getByRole("heading", { name: "Esperando al dueño" }).waitFor();
      await page.getByRole("button", { name: /^Ver el código que le llega al dueño/ }).click();
      await revisar(page, `Ficha (recepción, esperando al dueño) a ${w} px`);
      await capturar(page, `clientes-esperando-${w}`);
      assert.deepEqual(errores, []);
      await page.close();
    }
  });

  // ── Stock y Proveedores (ola 3) ──

  /** Lo mismo que mide la prueba de 768/390 de arriba, para las solapas de stock y proveedores. */
  const revisarSolapa = async (page: Page, que: string, donde?: string) => {
    const m = await page.evaluate(MEDIR, donde);
    assert.deepEqual(m.chicos, [], `${que}: objetivos de menos de 44 px`);
    assert.deepEqual(m.bajos, [], `${que}: textos bajo AA`);
    assert.ok(m.corre <= 0, `${que}: la página se corre de costado ${m.corre} px`);
  };

  test("el dueño, Stock: lo que falta con su WhatsApp, editar con el conteo y «Deshacer», el alta y el precio por % sobre costo", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("OWNER");
    await irASolapa(page, "Stock");
    await page.getByRole("heading", { name: /^Stock y productos \(\d+\)$/ }).waitFor();
    const reponer = page.getByRole("region", { name: /^⚠ Para reponer \(\d+\)$/ });
    await reponer.getByText(/^Remera técnica del club: hay 0, el mínimo es 5 → pedir 10$/).waitFor();
    assert.match((await reponer.getByRole("link", { name: "Pedir lo que falta por WhatsApp" }).getAttribute("href"))!, /^https:\/\/wa\.me\/\?text=/);
    await capturar(page, "stock-1024");

    // Editar con el conteo: el foco va a la ficha; guardar; «Deshacer»; Escape vuelve al producto.
    await page.getByRole("button", { name: /^Muñequera/ }).click();
    const ficha = page.getByRole("region", { name: "Muñequera" });
    await ficha.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Muñequera", "el foco va a la ficha");
    await ficha.getByLabel("Stock actual (conteo)").fill("20");
    await ficha.getByLabel("Mínimo de stock").fill("8");
    await ficha.getByRole("button", { name: "Guardar", exact: true }).click();
    await aviso(page, /^Muñequera guardado\. Stock: \d+ → 20\.$/);
    await page.getByRole("button", { name: /^Muñequera.*Stock 20 · mín\. 8/ }).waitFor();
    await capturar(page, "stock-ficha-1024");
    await page.getByRole("button", { name: "Deshacer" }).click();
    await aviso(page, /^Listo, se deshizo: Muñequera guardado/);
    await ficha.getByText("⚠ Reponer").waitFor();
    await ficha.getByLabel("Stock actual (conteo)").fill("x");
    await ficha.getByRole("button", { name: "Guardar", exact: true }).click();
    await alerta(page, /^En «Stock actual» poné cuántas hay/);
    await ficha.getByRole("button", { name: "Cerrar" }).focus();
    await page.keyboard.press("Escape");
    await ficha.waitFor({ state: "detached" });
    const fila = (await page.getByRole("button", { name: /^Muñequera/ }).getAttribute("id"))!;
    await page.waitForFunction((id) => document.activeElement?.id === id, fila, { timeout: 2000 });

    // El alta de un plato abre su ficha (sin stock); la baja y volver a activar.
    await page.getByRole("button", { name: "+ Producto o plato" }).click();
    const alta = page.getByRole("region", { name: "Nuevo producto o plato" });
    await alta.getByLabel("Nombre").fill("Tostado de jamón y queso");
    await alta.getByLabel("Precio de venta").fill("7.500");
    await alta.getByLabel("Costo").fill("3000");
    await alta.getByText("Es un plato de cocina", { exact: false }).click();
    assert.equal(await alta.getByLabel("Stock inicial").count(), 0, "un plato no lleva stock");
    await alta.getByRole("button", { name: "Dar de alta" }).click();
    await aviso(page, "Listo: Tostado de jamón y queso ya está en la carta, a $ 7.500.");
    const plato = page.getByRole("region", { name: "Tostado de jamón y queso" });
    await plato.waitFor();
    assert.equal(await plato.getByLabel("Stock actual (conteo)").count(), 0);
    await plato.getByRole("button", { name: "Dar de baja Tostado de jamón y queso" }).click();
    await aviso(page, "Tostado de jamón y queso dado de baja: ya no se vende.");
    await page.getByText("Dados de baja (1)").click();
    await page.getByRole("button", { name: "Volver a activar", exact: true }).click();
    await aviso(page, "Tostado de jamón y queso está activo otra vez.");

    // Precios y rentabilidad: el % sobre costo recalcula el precio (redondeado a $ 50) con Enter, sin perder el foco.
    await page.getByText("Precios y rentabilidad", { exact: true }).click();
    await page.getByRole("table", { name: /Precios y rentabilidad por producto/ }).waitFor();
    const markup = page.getByLabel("Porcentaje sobre el costo de Agua 500 ml", { exact: true });
    await markup.fill("100");
    await markup.press("Enter");
    await aviso(page, "Agua 500 ml: precio $ 1.400 · margen 50 %.");
    const precio = page.getByLabel("Precio de Agua 500 ml", { exact: true });
    assert.equal(await precio.inputValue(), "1400");
    assert.equal(await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.labels?.[0]?.textContent), "Porcentaje sobre el costo de Agua 500 ml", "el foco se queda en la celda");
    await precio.fill("");
    await precio.press("Enter");
    await alerta(page, "Ese campo no puede quedar vacío: no se cambió nada.");
    assert.equal(await precio.inputValue(), "1400", "vuelve a lo guardado");
    await capturar(page, "stock-precios-1024");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("el dueño, Proveedores: el total igual al Tablero, pagar en efectivo con PIN (sin «Deshacer») y un remito con el lector", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("OWNER");
    await irASolapa(page, "Tablero");
    const total = (await page.locator("[data-ui=kpi]").filter({ hasText: "Le debemos a proveedores" }).locator("[data-parte=valor]").textContent())!;
    assert.match(total, /^\$ [\d.]+$/);
    await irASolapa(page, "Proveedores");
    await page.getByText(`Le debemos en total ${total}`).waitFor();
    await capturar(page, "proveedores-1024");

    await page.getByRole("button", { name: /^Pádel Sur Insumos/ }).click();
    const ficha = page.getByRole("region", { name: "Pádel Sur Insumos" });
    await ficha.waitFor();
    assert.ok((await ficha.getByRole("table", { name: /Cuenta con Pádel Sur Insumos/ }).getByRole("row").count()) >= 2);
    await ficha.getByText("Efectivo (sale del cajón)").click();
    await ficha.getByLabel("Monto").fill("10.000");
    await ficha.getByLabel("PIN de Rober").fill("9999");
    await ficha.getByRole("button", { name: "Registrar pago" }).click();
    await alerta(page, "PIN incorrecto.");
    assert.equal(await ficha.getByLabel("PIN de Rober").inputValue(), "", "el PIN se borra después de cada intento");
    await ficha.getByLabel("PIN de Rober").fill("1111");
    await ficha.getByRole("button", { name: "Registrar pago" }).click();
    await aviso(page, /^Pago de \$ 10\.000 a Pádel Sur Insumos en efectivo: sale del cajón/);
    assert.equal(await page.getByRole("button", { name: "Deshacer" }).count(), 0, "un pago con PIN no se deshace");
    await ficha.getByRole("cell", { name: "− $ 10.000" }).waitFor();
    await ficha.locator("summary").filter({ hasText: "Remito 0003-00000871" }).click();
    await ficha.getByText("24 × Tubo de pelotas (3) a $ 7.800 = $ 187.200").waitFor();
    await capturar(page, "proveedores-ficha-1024");
    await ficha.getByRole("button", { name: "Cerrar", exact: true }).click();

    // El remito: el lector suma de a 1 (y el foco se queda ahí), el buscador también; registra y suma la deuda.
    await page.getByRole("button", { name: "Registrar remito" }).click();
    const remito = page.getByRole("region", { name: "Registrar remito" });
    await remito.getByLabel("Proveedor").selectOption({ label: "Distribuidora Ezeiza Bebidas" });
    await remito.getByLabel("Número de remito").fill("0001-00009999");
    const lector = remito.getByLabel(/^Lector/);
    await lector.fill("7790000000028");
    await lector.press("Enter");
    await aviso(page, "+1 Agua 500 ml");
    await lector.fill("7790000000028");
    await lector.press("Enter");
    assert.equal(await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.value), "", "el foco queda en el lector, vacío");
    await remito.getByLabel("O buscalo por nombre o código").fill("gaseosa");
    await remito.getByRole("button", { name: /^\+ Gaseosa 500 ml/ }).click();
    assert.equal(await remito.getByRole("group", { name: "Agua 500 ml" }).getByLabel("Cantidad").inputValue(), "2");
    await remito.getByRole("group", { name: "Gaseosa 500 ml" }).getByLabel("Cantidad").fill("12");
    await remito.getByText("Total del remito $ 14.600").waitFor();
    await capturar(page, "remito-1024");
    await remito.getByRole("button", { name: "Registrar remito" }).click();
    await aviso(page, "Remito 0001-00009999 de Distribuidora Ezeiza Bebidas cargado: $ 14.600. Ya suma al stock.");
    await remito.waitFor({ state: "detached" });
    await page.getByText(`Le debemos en total ${comoPesos(Number(total.replace(/\D/g, "")) - 10000 + 14600)}`).waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("recepción: no ve Stock ni Proveedores; carga el remito desde la Caja", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("RECEPTION");
    assert.equal(await tieneSolapa(page, "Stock"), false, "recepción no ve Stock");
    assert.equal(await tieneSolapa(page, "Proveedores"), false, "recepción no ve Proveedores");
    await irASolapa(page, "Caja");
    await page.getByText("Registrar un remito", { exact: true }).click();
    const remito = page.getByRole("region", { name: "Registrar remito" });
    await remito.waitFor();
    assert.equal(await page.getByText(/Le debemos/).count(), 0, "recepción no ve lo que se debe");
    await remito.getByLabel("Número de remito").fill("0003-00000999");
    await remito.getByLabel("O buscalo por nombre o código").fill("milanesa");
    await remito.getByText("No hay productos con eso (los platos no entran por remito).").waitFor();
    await remito.getByLabel("O buscalo por nombre o código").fill("overgrip");
    await remito.getByRole("button", { name: /^\+ Overgrip/ }).click();
    await remito.getByRole("button", { name: "Registrar remito" }).click();
    await aviso(page, /^Remito 0003-00000999 de Distribuidora Ezeiza Bebidas cargado: \$ 2\.100\./);
    await remito.waitFor({ state: "detached" });
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("Stock y Proveedores a 1024, 768 y 390 px: sin scroll de costado, objetivos de 44 px y contraste AA", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    if (!css) return t.skip("no se pudo compilar el CSS de la app");
    for (const viewport of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
      const w = viewport.width;
      let { page, errores } = await montar("OWNER", viewport);
      await irASolapa(page, "Stock");
      await page.getByRole("heading", { name: /^Stock y productos/ }).waitFor();
      await revisarSolapa(page, `Stock a ${w} px`);
      if (w !== 1024) await capturar(page, `stock-${w}`);
      await page.getByRole("button", { name: /^Muñequera/ }).click();
      await page.getByRole("region", { name: "Muñequera" }).waitFor();
      await revisarSolapa(page, `Ficha de producto a ${w} px`);
      if (w !== 1024) await capturar(page, `stock-ficha-${w}`);
      await page.getByRole("button", { name: "Cerrar", exact: true }).click();
      await page.getByRole("button", { name: "+ Producto o plato" }).click();
      await page.getByRole("region", { name: "Nuevo producto o plato" }).waitFor();
      await revisarSolapa(page, `Alta de producto a ${w} px`);
      await page.getByText("Precios y rentabilidad", { exact: true }).click();
      await page.getByRole("table", { name: /Precios y rentabilidad por producto/ }).waitFor();
      await revisarSolapa(page, `Precios a ${w} px`);
      if (w !== 1024) await capturar(page, `stock-precios-${w}`);

      await irASolapa(page, "Proveedores");
      await page.getByRole("heading", { name: /^Proveedores \(\d+\)$/ }).waitFor();
      await revisarSolapa(page, `Proveedores a ${w} px`);
      if (w !== 1024) await capturar(page, `proveedores-${w}`);
      await page.getByRole("button", { name: /^Pádel Sur Insumos/ }).click();
      const ficha = page.getByRole("region", { name: "Pádel Sur Insumos" });
      await ficha.locator("summary").filter({ hasText: "Remito 0003-00000871" }).click();
      await ficha.getByText("¿Probando la demo? Ver los PIN de ejemplo").click();
      await revisarSolapa(page, `Ficha de proveedor a ${w} px`);
      if (w !== 1024) await capturar(page, `proveedores-ficha-${w}`);
      await ficha.getByRole("button", { name: "Cerrar", exact: true }).click();
      await page.getByRole("button", { name: "Registrar remito" }).click();
      const remito = page.getByRole("region", { name: "Registrar remito" });
      await remito.getByLabel("O buscalo por nombre o código").fill("agua");
      await remito.getByRole("button", { name: /^\+ Agua 500 ml/ }).click();
      await remito.getByLabel("O buscalo por nombre o código").fill("tubo");
      await remito.getByRole("button", { name: /^\+ Tubo de pelotas/ }).click();
      await revisarSolapa(page, `Remito a ${w} px`);
      if (w !== 1024) await capturar(page, `remito-${w}`);
      assert.deepEqual(errores, []);
      await page.close();

      // Recepción: el remito desde la Caja.
      ({ page, errores } = await montar("RECEPTION", viewport));
      await irASolapa(page, "Caja");
      await page.getByText("Registrar un remito", { exact: true }).click();
      await page.getByRole("region", { name: "Registrar remito" }).waitFor();
      await revisarSolapa(page, `Remito desde la Caja (recepción) a ${w} px`);
      await capturar(page, `remito-caja-recepcion-${w}`);
      assert.deepEqual(errores, []);
      await page.close();
    }
  });

  // ───────────── Configuración (dueños) ─────────────

  /** Tres semanas y media de club cerrado, guardadas en este equipo como la demo de HOY: hay días para archivar. */
  async function clubConDiasParaArchivar(): Promise<string> {
    const { armarMesCargado } = await import("@/lib/club/fixtures/armar-respaldo");
    const { fechaLocal } = await import("./reloj-del-club");
    const hoy = fechaLocal(new Date());
    return JSON.stringify({ ...armarMesCargado(hoy, 24), hoy, guardado: Date.now() });
  }

  test("el dueño, Configuración: respaldo, archivar en DOS pasos (descarga + elegir el archivo) y restaurar con su fecha", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("OWNER", undefined, await clubConDiasParaArchivar());
    assert.equal(await tieneSolapa(page, "Configuración"), true);
    await irASolapa(page, "Configuración");
    await page.getByRole("heading", { name: "Jornada", exact: true }).waitFor();
    await capturar(page, "config-1024");

    // Descargar respaldo: el sobre v1 de siempre.
    const [respaldo] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Descargar respaldo", exact: true }).click()]);
    assert.match(respaldo.suggestedFilename(), /^breakpoint-jornada-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
    await page.getByText(`Se pidió la descarga de ${respaldo.suggestedFilename()}`).waitFor();

    // Archivar: sin el paso 1 no hay paso 2; con el archivo bajado se elige y recién ahí se achica.
    await page.getByRole("button", { name: "Archivar días cerrados" }).click();
    const archivar = page.getByRole("group", { name: "Archivar días cerrados" });
    assert.equal(await archivar.getByRole("button", { name: "Ya lo guardé: achicar" }).isDisabled(), true, "sin descargar no se confirma");
    await archivar.getByRole("button", { name: "Descargar el respaldo para archivar" }).click();
    await alerta(page, "Poné tu PIN (4 números).");
    // El ejemplo deja al dueño con el PIN viejo de 2 (como main): con ése entra, pero no archiva (no firma).
    await archivar.getByLabel("PIN de Dueño").fill("11");
    await archivar.getByRole("button", { name: "Descargar el respaldo para archivar" }).click();
    await alerta(page, "Ese es tu PIN viejo: entrá a la compu con él y elegí uno de 4.");
    // «Cambiar mi PIN» acepta el viejo como actual; uno fácil no pasa.
    const miPin = page.getByRole("form", { name: "Cambiar mi PIN" });
    const cambiarMiPin = async (nuevo: string) => {
      await miPin.getByLabel("Tu PIN actual").fill("11");
      await miPin.getByLabel("PIN nuevo (4 números)").fill(nuevo);
      await miPin.getByLabel("Repetí el nuevo").fill(nuevo);
      await miPin.getByRole("button", { name: "Cambiar mi PIN" }).click();
    };
    await cambiarMiPin("1234");
    await alerta(page, "Una escalera (como 1234 o 4321) se adivina fácil: elegí otro.");
    await cambiarMiPin("5757");
    await aviso(page, "Tu PIN cambió. Desde ahora entrás con el nuevo.");
    await archivar.getByLabel("PIN de Dueño").fill("5757");
    const [paquete] = await Promise.all([page.waitForEvent("download"), archivar.getByRole("button", { name: "Descargar el respaldo para archivar" }).click()]);
    assert.match(paquete.suggestedFilename(), /^breakpoint-respaldo-y-archivo-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
    await archivar.getByText(`Se pidió la descarga de ${paquete.suggestedFilename()}`).waitFor();
    // Paso 2 sin elegir el archivo: no se achica nada.
    await archivar.getByRole("button", { name: "Ya lo guardé: achicar" }).click();
    await alerta(page, "Elegí el archivo que descargaste (paso 2): sin eso no se achica nada.");
    await capturar(page, "config-archivar-1024");
    const rutaPaquete = await paquete.path();
    await archivar.getByLabel("Archivo descargado").setInputFiles(rutaPaquete);
    await archivar.getByRole("button", { name: "Ya lo guardé: achicar" }).click();
    await page.getByText(/^Archivo verificado: achicado\. Quedó archivado hasta el \d+\/\d+: \d+ turnos/).waitFor();
    await aviso(page, /^Archivado hasta el \d+\/\d+: \d+ turnos/);
    const dias = page.locator("summary").filter({ hasText: /^Días archivados \(\d+\)/ });
    await dias.click();
    await page.getByText(/^\d+\/\d+ · \d+ turnos? · cobrado \$/).first().waitFor();
    await capturar(page, "config-archivado-1024");

    // Restaurar: el anexo suelto no es un respaldo (se explica); el archivo para archivar devuelve la jornada de antes.
    const { readFileSync: leer, writeFileSync: escribir, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const anexo = join(mkdtempSync(join(tmpdir(), "club-anexo-")), "breakpoint-archivo.json");
    escribir(anexo, JSON.stringify(JSON.parse(leer(rutaPaquete, "utf8")).anexo));
    await page.getByLabel("Elegí el respaldo").setInputFiles(anexo);
    await alerta(page, /archivo de los días archivados/);
    await page.getByLabel("Elegí el respaldo").setInputFiles(rutaPaquete);
    const restaurar = page.getByRole("form", { name: "Restaurar este respaldo" });
    await restaurar.getByText(/^Respaldo del \p{L}+ \d+\/\d+\/\d{4} a las \d\d:\d\d$/u).waitFor(); // con su `guardado`: la fecha real (con el día), no «cuando se preparó»
    await restaurar.getByText(/Reemplaza la jornada de ahora \(\d+ turnos\)/).waitFor();
    await capturar(page, "config-restaurar-1024");
    await restaurar.getByLabel("PIN de Dueño").fill("12");
    await restaurar.getByRole("button", { name: "Restaurar este respaldo" }).click();
    await alerta(page, "PIN incorrecto (1 de 5)."); // cuenta en el tope del equipo (el del bloqueo, SEC-5)
    await restaurar.getByLabel("PIN de Dueño").fill("5757");
    await restaurar.getByRole("button", { name: "Restaurar este respaldo" }).click();
    await aviso(page, "Listo: se restauró la jornada de antes de archivar (lo de antes quedó copiado en este equipo). Si avisa que se llena, archivá de nuevo.");
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes(":antes-de-restaurar:")).length), 1, "la copia de lo de antes quedó en el equipo");
    assert.equal(await page.locator("summary").filter({ hasText: /^Días archivados/ }).count(), 0, "volvió la jornada de antes de archivar");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("el dueño, Configuración: alta con el PIN una sola vez, reglas validadas, avisos y la limpieza que pide el respaldo", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("OWNER");
    await irASolapa(page, "Configuración");
    await page.getByRole("heading", { name: "Usuarios y accesos" }).waitFor();
    // Alta de recepción: el PIN se ve UNA vez, a la vista, y no va al aviso.
    const alta = page.getByRole("form", { name: "Dar de alta a alguien" });
    await alta.getByLabel("Nombre").fill("Nico noche");
    await alta.getByLabel("PIN de Rober").fill("1111");
    await alta.getByRole("button", { name: "Dar de alta" }).click();
    const pin = page.getByRole("group", { name: /^✔ Nico noche · Recepción/ });
    await pin.waitFor();
    const elPin = (await pin.locator("p.text-4xl").textContent())!.trim();
    assert.match(elPin, /^\d{2}$/);
    await aviso(page, /^Nico noche ya tiene acceso/);
    assert.ok(!(await page.getByRole("status").filter({ hasText: "Nico noche" }).first().textContent())!.includes(elPin), "el aviso no dice el PIN");
    await capturar(page, "config-pin-1024");
    await pin.getByRole("button", { name: "Listo, ya se lo di" }).click();
    assert.equal(await page.getByText(elPin, { exact: true }).count(), 0, "el PIN no se vuelve a mostrar");

    // Reglas: lo que no entra se dice y no se cambia nada.
    const reglas = page.getByRole("form", { name: "Reglas y precios" });
    await reglas.getByLabel("Seña (% del turno)").fill("150");
    await reglas.getByRole("button", { name: "Guardar reglas y precios" }).click();
    await alerta(page, /Seña \(% del turno\)».*entre 0 y 100/);
    await reglas.getByLabel("Seña (% del turno)").fill("30");
    await reglas.getByRole("button", { name: "Guardar reglas y precios" }).click();
    await aviso(page, "Reglas y precios guardados. Los precios valen para los turnos nuevos.");

    // Avisos: el WhatsApp del club va al link para clientes.
    const avisos = page.getByRole("form", { name: "Avisos por WhatsApp" });
    await avisos.getByLabel("WhatsApp del club (recepción)").fill("11 2345-6789");
    await avisos.getByRole("button", { name: "Guardar avisos" }).click();
    await aviso(page, "Avisos guardados: celulares y alias para la seña.");
    const link = await page.getByLabel("Link del turnero para mandar a los clientes").inputValue();
    assert.match(link, /\/turnero\?modo=pedido&wa=1123456789&tar=/);
    // En la demo el WhatsApp abre sin número (como en el resto del club).
    const prueba = (await page.getByRole("link", { name: /Probar el WhatsApp del club/ }).getAttribute("href"))!;
    assert.ok(!prueba.includes("1123456789"), `en la demo, sin número: ${prueba}`);

    // Limpieza: la demo tiene canchas en juego y cuentas abiertas → lo lista; el paso 2 no anda sin el paso 1.
    await page.getByText("Antes de limpiar hay que resolver:").waitFor();
    await page.getByRole("button", { name: "Hacer la limpieza para el go-live" }).click();
    const limpieza = page.getByRole("group", { name: "Limpieza para el go-live" });
    assert.equal(await limpieza.getByRole("button", { name: "Ya lo guardé: limpiar" }).isDisabled(), true);
    await limpieza.getByLabel("PIN de Rober").fill("1111");
    const [bajado] = await Promise.all([page.waitForEvent("download"), limpieza.getByRole("button", { name: "Descargar el respaldo de antes de limpiar" }).click()]);
    assert.match(bajado.suggestedFilename(), /^breakpoint-jornada-antes-golive-/);
    await limpieza.getByLabel("Respaldo descargado").setInputFiles(await bajado.path());
    await limpieza.getByRole("button", { name: "Ya lo guardé: limpiar" }).click();
    await alerta(page, /^Antes de limpiar hay que resolver:/);
    await capturar(page, "config-golive-1024");
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("Configuración a 1024, 768 y 390 px: sin scroll de costado, objetivos de 44 px y contraste AA", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    if (!css) return t.skip("no se pudo compilar el CSS de la app");
    for (const w of [1024, 768, 390]) {
      const { page, errores } = await montar("OWNER", { width: w, height: w === 390 ? 844 : 1024 });
      await irASolapa(page, "Configuración");
      await page.getByRole("heading", { name: "Jornada", exact: true }).waitFor();
      await revisarSolapa(page, `Configuración a ${w} px`);
      await capturar(page, `config-${w}`);
      await page.getByRole("button", { name: "Archivar días cerrados" }).click();
      await page.getByRole("button", { name: /^PIN nuevo para Lu/ }).click();
      await page.getByRole("button", { name: "Hacer la limpieza para el go-live" }).click();
      await revisarSolapa(page, `Configuración con lo abierto a ${w} px`);
      await capturar(page, `config-abierto-${w}`);
      assert.deepEqual(errores, []);
      await page.close();
    }
  });

  // ───────────── Novedades y redes (dueños) y el aprobador del dueño ─────────────

  test("el dueño, Novedades: armar, preparar, uno por uno (queda tildado), copiar, CSV, la BAJA con «Deshacer» y el calendario", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("OWNER");
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:3999" });
    await page.context().route("https://wa.me/**", (r) => r.fulfill({ contentType: "text/html", body: "<title>WhatsApp</title>" }));
    await irASolapa(page, "Novedades y redes");
    await page.getByRole("heading", { name: "Novedades del club · difusión por WhatsApp" }).waitFor();
    await page.getByLabel("Tipo").selectOption("torneo");
    await page.getByLabel("Título", { exact: true }).fill("Torneo de categorías el sábado 25");
    await page.getByLabel("Texto", { exact: true }).fill("Anotate en recepción.");
    await page.getByText(/^Le llega a \d+ clientes con celular/).waitFor();
    await page.getByText("¡Hola Juan! *Torneo de categorías el sábado 25*", { exact: false }).waitFor();
    await page.getByText("respondé BAJA", { exact: false }).first().waitFor();
    await page.getByText("Studio de redes", { exact: false }).first().waitFor();
    await page.getByRole("button", { name: "Preparar el envío" }).click();
    await aviso(page, /^Listo para mandar a \d+ cliente\(s\)\.$/);
    const envio = page.getByRole("region", { name: /^Mandar «Torneo de categorías el sábado 25» · \d+ de \d+$/ });
    await envio.waitFor();
    assert.match(await page.evaluate(() => document.activeElement?.textContent ?? ""), /^Mandar «Torneo/, "el foco va al envío");
    await capturar(page, "novedades-envio-1024");

    // Uno por uno: el link abre WhatsApp (otra pestaña) y queda tildado.
    const uno = envio.getByRole("list", { name: "Uno por uno" }).getByRole("link").first();
    const nombre = (await uno.textContent())!;
    assert.match((await uno.getAttribute("href"))!, /^https:\/\/wa\.me\/\?text=/, "en la demo, sin número");
    const [popup] = await Promise.all([page.waitForEvent("popup"), uno.click()]);
    await popup.close();
    await aviso(page, new RegExp(`^Anotado: le mandaste a ${nombre.split(" ")[0]}\\. Faltan \\d+\\.$`));
    await envio.getByRole("link", { name: `${nombre}: ya le mandaste` }).waitFor();
    await page.getByRole("region", { name: /^Mandar «Torneo.*» · 1 de \d+$/ }).waitFor();

    // La lista de difusión: copiar y descargar.
    await envio.getByRole("button", { name: "Copiar el mensaje" }).click();
    await aviso(page, "Mensaje copiado: pegalo en la lista de difusión.");
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /^¡Hola! \*Torneo de categorías el sábado 25\*/);
    const [descarga] = await Promise.all([page.waitForEvent("download"), envio.getByRole("button", { name: "Descargar contactos (CSV)" }).click()]);
    assert.match(descarga.suggestedFilename(), /^novedades-del-club-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = readFileSync((await descarga.path())!, "utf8");
    assert.match(csv, /^﻿Nombre,Celular\r\n"[^"]+","\+\d{8,}"/);
    await envio.getByRole("button", { name: "Listo" }).click();
    await envio.waitFor({ state: "detached" });
    const historial = page.getByRole("region", { name: "Lo que se mandó" });
    await historial.getByText("«Torneo de categorías el sábado 25»").waitFor();
    await historial.getByText(/^1 de \d+ enviados$/).waitFor();
    await historial.getByRole("button", { name: "Seguir mandando «Torneo de categorías el sábado 25»" }).click();
    await page.getByRole("region", { name: /^Mandar «Torneo/ }).waitFor();

    // «Respondé BAJA»: se le da la baja, figura en la lista del envío y se deshace.
    const bajas = page.getByRole("region", { name: "¿Alguien respondió BAJA?" });
    await bajas.getByLabel("Buscar al cliente (nombre o teléfono)").fill(nombre.split(" ")[0]);
    await bajas.getByRole("button", { name: `Darle de baja a ${nombre}` }).click();
    await aviso(page, `${nombre} no recibe más novedades: ya no le llega.`);
    await bajas.getByRole("heading", { name: "No reciben novedades (1)" }).waitFor();
    await page.getByRole("list", { name: "Uno por uno" }).getByText(`${nombre} · pidió la baja`).waitFor();
    await page.getByRole("button", { name: "Deshacer" }).click();
    await bajas.getByRole("heading", { name: "No reciben novedades (0)" }).waitFor();

    // El calendario: agendar, abrir y borrar.
    const cal = page.getByRole("region", { name: /^Contenido · \S+ de \d{4}$/ });
    await cal.getByRole("list", { name: /^Días de / }).waitFor();
    await cal.getByRole("button", { name: "+ Publicación" }).click();
    const editor = cal.getByRole("region", { name: "Nueva publicación" });
    await editor.waitFor();
    assert.equal(await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.placeholder), "Ej.: Torneo relámpago del sábado", "el foco va al título");
    await editor.getByLabel("De qué se trata").fill("Reel del torneo");
    await editor.getByLabel("Canal").selectOption("reel");
    await editor.getByLabel("Estado").selectOption("programado");
    await editor.getByRole("button", { name: "Guardar" }).click();
    await aviso(page, /^Publicación agendada para el \d+\/\d+\.$/);
    await editor.waitFor({ state: "detached" });
    // Sin el CSS de la app se ven la agenda del celular y el calendario a la vez: la primera alcanza.
    const pub = cal.getByRole("button", { name: /^19:00 · Reel del torneo · Instagram · reel · Programado$/ }).first();
    await pub.click();
    const edicion = cal.getByRole("region", { name: "Publicación" });
    await edicion.getByRole("button", { name: "Borrar" }).click();
    await aviso(page, "Publicación borrada: «Reel del torneo».");
    assert.equal(await pub.count(), 0);
    // Escape cierra el editor y el foco vuelve a quien lo abrió.
    await cal.getByRole("button", { name: "+ Publicación" }).click();
    await cal.getByRole("region", { name: "Nueva publicación" }).waitFor();
    await page.keyboard.press("Escape");
    await cal.getByRole("region", { name: "Nueva publicación" }).waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.textContent === "+ Publicación", null, { timeout: 2000 });
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("recepción no ve Novedades y redes", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("RECEPTION");
    assert.equal(await tieneSolapa(page, "Novedades y redes"), false);
    assert.deepEqual(errores, []);
    await page.close();
  });

  /** El aprobador del dueño, montado como lo abre el link (el fragmento #aprobar&… en la barra). */
  async function montarAprobador(enlace: string, viewport = { width: 390, height: 844 }): Promise<{ page: Page; errores: string[] }> {
    const p = await browser!.newPage({ viewport, locale: "es-AR" });
    const errores: string[] = [];
    p.on("pageerror", (e) => errores.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errores.push(m.text());
    });
    const html = `<!doctype html><html lang="es"><head><style>${css}</style></head><body class="bg-surface text-body"><main id="root" class="p-4"></main></body></html>`;
    await p.route(`${ORIGEN}/aprobar`, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html }));
    await p.addInitScript({ content: "window.__name = (f) => f;" });
    await p.goto(enlace);
    await p.addScriptTag({ content: bundle });
    await p.evaluate(() => (window as unknown as Ventana).__aprobar("demo-club", "u_owner"));
    return { page: p, errores };
  }

  test("el aprobador: recepción avisa a Rober, Rober abre el link en el celular, PIN mal (1 de 5), PIN bien → código → recepción aprueba", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar("RECEPTION");
    await irASolapa(page, "Clientes");
    await page.getByRole("button", { name: "+ Alta de cliente" }).click();
    const alta = page.getByRole("region", { name: "Alta de cliente" });
    await alta.getByLabel("Nombre y apellido").fill("Paula Nieto");
    await alta.getByLabel(/^Teléfono/).fill("11 5555-1234");
    await alta.getByRole("button", { name: "Dar de alta" }).click();
    const ficha = page.getByRole("region", { name: "Paula Nieto" });
    await ficha.getByLabel("Límite que pedís").fill("40000");
    await ficha.getByRole("button", { name: "Pedir la autorización al dueño" }).click();
    const texto = new URL((await ficha.getByRole("link", { name: "Avisar a Rober por WhatsApp" }).getAttribute("href"))!).searchParams.get("text")!;
    assert.match(texto, /^Hola Rober, soy .+ del club\. Paula Nieto pide cuenta corriente hasta \$ 40\.000\. Si lo aprobás, abrí este link, poné tu PIN y mandame el código: /);
    const enlace = texto.slice(texto.indexOf("http://"));
    assert.deepEqual([...new URLSearchParams(enlace.split("#aprobar&")[1]).keys()], ["id", "c", "n", "m", "t", "p", "f"], "el link lleva sólo lo del vanilla");

    // El celular de Rober.
    const cel = await montarAprobador(enlace);
    const p = cel.page;
    await p.getByText("pide cuenta corriente para Paula Nieto hasta $ 40.000", { exact: false }).waitFor();
    assert.equal(await p.evaluate(() => location.hash), "", "el pedido sale de la barra apenas se lee");
    assert.equal(await p.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type), "password", "el foco va al PIN");
    await p.getByText("En la demo, los PIN de ejemplo son:", { exact: false }).waitFor();
    await p.getByRole("radio", { name: "Rober" }).check();
    await p.getByLabel("Tu PIN").fill("9999");
    await p.getByRole("button", { name: "Aprobar y ver el código" }).click();
    await p.getByRole("alert").filter({ hasText: "PIN incorrecto (1 de 5)." }).waitFor();
    assert.equal(await p.getByLabel("Tu PIN").inputValue(), "", "el PIN malo se borra");
    if (css) await revisarSolapa(p, "Aprobador con el PIN mal a 390 px", "#root");
    await capturar(p, "aprobar-pin-mal-390");
    await p.getByLabel("Tu PIN").fill("1111");
    await p.getByRole("button", { name: "Aprobar y ver el código" }).click();
    await p.getByRole("region", { name: /^Mandale este código a / }).waitFor();
    const codigo = (await p.locator("p.text-4xl").textContent())!;
    assert.match(codigo, /^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
    await p.getByText("Lo aprobás como Rober.", { exact: false }).waitFor();
    const mandar = p.getByRole("link", { name: "Mandar el código por WhatsApp" });
    assert.equal(new URL((await mandar.getAttribute("href"))!).searchParams.get("text"), `Aprobado: Paula Nieto $ 40.000. Código ${codigo}`);
    if (css) await revisarSolapa(p, "Aprobador con el código a 390 px", "#root");
    await capturar(p, "aprobar-codigo-390");
    await p.setViewportSize({ width: 1024, height: 768 });
    await capturar(p, "aprobar-codigo-1024");
    assert.deepEqual(cel.errores, []);
    await p.close();

    // Recepción tipea el código que le mandó Rober.
    await ficha.getByLabel(/^Código del dueño/).fill(codigo);
    await ficha.getByRole("button", { name: "Aprobar con el código" }).click();
    await aviso(page, /^Aprobado por Rober: cuenta corriente habilitada hasta \$ 40\.000\./);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("el aprobador sin pedido (link roto o perdido al entrar con la clave): lo dice y lleva al club", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montarAprobador(`${ORIGEN}/aprobar#aprobar&id=x&m=-1`);
    await page.getByRole("alert").filter({ hasText: "No hay un pedido para aprobar en este link." }).waitFor();
    await page.getByRole("link", { name: "Ir al club" }).waitFor();
    assert.equal(await page.getByLabel("Tu PIN").count(), 0);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("Novedades a 1024, 768 y 390 px: sin scroll de costado, objetivos de 44 px y contraste AA", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    if (!css) return t.skip("no se pudo compilar el CSS de la app");
    for (const w of [1024, 768, 390]) {
      const { page, errores } = await montar("OWNER", { width: w, height: w === 390 ? 844 : 1024 });
      await irASolapa(page, "Novedades y redes");
      await page.getByRole("heading", { name: "Novedades del club · difusión por WhatsApp" }).waitFor();
      await page.getByLabel("Título", { exact: true }).fill("Turnos libres el martes");
      await revisarSolapa(page, `Novedades a ${w} px`);
      await capturar(page, `novedades-${w}`);
      await page.getByRole("button", { name: "Preparar el envío" }).click();
      await page.getByRole("region", { name: /^Mandar «Turnos libres el martes»/ }).waitFor();
      await page.getByRole("region", { name: "¿Alguien respondió BAJA?" }).getByLabel("Buscar al cliente (nombre o teléfono)").fill("a");
      await page.getByRole("button", { name: "+ Publicación" }).click();
      await page.getByRole("region", { name: "Nueva publicación" }).waitFor();
      await revisarSolapa(page, `Novedades con el envío y el editor a ${w} px`);
      await capturar(page, `novedades-envio-${w}`);
      assert.deepEqual(errores, []);
      await page.close();
    }
  });
});

/** «$ 1.234», como `pesos` del motor (que no se importa acá: la página lo trae en su bundle). */
function comoPesos(n: number): string {
  return `$ ${Math.round(n).toLocaleString("es-AR")}`;
}
