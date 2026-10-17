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

const RAIZ = fileURLToPath(new URL("../../../../../", import.meta.url));
const ORIGEN = "http://localhost:3999/admin/club";
const CAPTURAS = process.env.CAPTURAS_SOLAPAS ?? "";

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

/** Lo que mide la página (corre en el navegador): objetivos de menos de 44 px y textos bajo AA dentro de la solapa. */
const MEDIR = () => {
  const panel = document.querySelector("[role=tabpanel]")!;
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
    if (CAPTURAS) mkdirSync(CAPTURAS, { recursive: true });
  });

  after(async () => {
    await browser?.close();
  });

  async function montar(rol: "OWNER" | "RECEPTION", viewport = { width: 1024, height: 768 }): Promise<{ page: Page; errores: string[] }> {
    const p = await browser!.newPage({ viewport, locale: "es-AR" });
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
    assert.equal(await page.getByRole("tab", { name: "Tablero" }).count(), 0, "recepción no ve el Tablero");
    await page.getByRole("tab", { name: "Clientes" }).click();
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
    await page.getByRole("tab", { name: "Clientes" }).click();
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
    assert.match((await ficha.getByRole("link", { name: "Avisar al dueño por WhatsApp" }).getAttribute("href"))!, /^https:\/\/wa\.me\/\?text=/);
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
    await page.getByRole("tab", { name: "Tablero" }).click();
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
    await page.getByRole("tab", { name: "Clientes" }).click();
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
      const m = await page.evaluate(MEDIR);
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
      await page.getByRole("tab", { name: "Clientes" }).click();
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
      await page.getByRole("tab", { name: "Tablero" }).click();
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
      await page.getByRole("tab", { name: "Clientes" }).click();
      await page.getByRole("button", { name: /Pedida al dueño/ }).first().click();
      await page.getByRole("heading", { name: "Esperando al dueño" }).waitFor();
      await page.getByRole("button", { name: /^Ver el código que le llega al dueño/ }).click();
      await revisar(page, `Ficha (recepción, esperando al dueño) a ${w} px`);
      await capturar(page, `clientes-esperando-${w}`);
      assert.deepEqual(errores, []);
      await page.close();
    }
  });
});
