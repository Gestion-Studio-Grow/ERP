// ============================================================================
// «TOMAR PESO» en un navegador de verdad — con la balanza simulada por Web Serial.
// ============================================================================
//
// Mismo armado que los *-pantalla.test.ts del club: el componente REAL empaquetado con esbuild y
// el Chromium de Playwright. La balanza es la simulada (src/lib/balanza-serie/simulador.ts), que
// instala un `navigator.serial` falso antes de que cargue la página. Se prueba, clic por clic:
//   · «Conectar balanza» → busca la velocidad (la balanza sólo se entiende a 4800) → peso en vivo
//     → «Tomar peso» le pasa 1,25 kg a la pantalla;
//   · con el peso moviéndose, «Tomar peso» no pasa nada y el estado lo dice;
//   · al recargar, la balanza recordada se conecta sola;
//   · sin Web Serial: en modo compacto no aparece nada; en modo completo, el aviso;
//   · el asistente de configuración: conectar → crudo + cómo habla → «Listo, guardar en esta PC»;
//   · la búsqueda encuentra una balanza «a pedido» (Toledo 8217: 9600 7E1, contesta a «W»).
// Sin Chromium o sin esbuild, se saltea con el motivo.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, BrowserContext, Page } from "playwright";
import { scriptDeBalanzaSimulada, scriptSinWebSerial, type OpcionesBalanzaSimulada } from "@/lib/balanza-serie/simulador";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const ORIGEN = "http://localhost:3999/admin/vender";

const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { TomarPesoDeBalanza } from "@/components/balanza/TomarPesoDeBalanza";
import { ProbarBalanzaPorCable } from "@/components/balanza/ProbarBalanzaPorCable";
import { detectarEnPuerto } from "@/lib/balanza-serie/puerto";
window.__tomados = [];
window.__montarAsistente = () =>
  createRoot(document.getElementById("root")).render(createElement(ProbarBalanzaPorCable, { negocio: "carniceria-x" }));
window.__montar = (modo) =>
  createRoot(document.getElementById("root")).render(
    createElement(TomarPesoDeBalanza, { negocio: "carniceria-x", modo, alTomar: (kg) => window.__tomados.push(kg) }),
  );
window.__detectar = async (tiempos) => {
  const puerto = await navigator.serial.requestPort();
  const r = await detectarEnPuerto(puerto, tiempos);
  return r.eleccion.configuracion;
};
`;
type Ventana = { __montar: (modo: string) => void; __tomados: number[]; __detectar: (t: object) => Promise<unknown> };

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

describe("«Tomar peso» con la balanza por cable", { timeout: 120_000 }, () => {
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

  const html = () =>
    `<!doctype html><html lang="es"><head><style>${css}</style></head><body class="bg-surface text-body"><main id="root" class="p-4"></main></body></html>`;

  async function contexto(script: string): Promise<BrowserContext> {
    const c = await browser!.newContext({ viewport: { width: 1024, height: 768 }, locale: "es-AR" });
    await c.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html() }));
    await c.addInitScript(script);
    return c;
  }

  async function abrir(c: BrowserContext, errores: string[], modo: "compacto" | "completo" = "compacto"): Promise<Page> {
    const p = await c.newPage();
    p.on("pageerror", (e) => errores.push(e.message));
    await p.goto(ORIGEN);
    await p.addScriptTag({ content: bundle });
    await p.evaluate((m) => (window as unknown as Ventana).__montar(m), modo);
    return p;
  }

  const balanza = (o: Partial<OpcionesBalanzaSimulada>) =>
    scriptDeBalanzaSimulada({ protocolo: "cas", peso: 1.25, estable: true, velocidad: 4800, usbVendorId: 0x0403, usbProductId: 0x6001, ...o });
  const tomados = (p: Page) => p.evaluate(() => (window as unknown as Ventana).__tomados);

  test("conectar → busca la velocidad → peso quieto → «Tomar peso» pasa 1,25 kg", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const c = await contexto(balanza({}));
    const errores: string[] = [];
    const p = await abrir(c, errores);
    await p.getByRole("button", { name: "Conectar balanza" }).click();
    await p.getByText("Peso quieto: listo para tomar").waitFor({ timeout: 15_000 });
    assert.equal(await p.getByLabel("Peso de la balanza").textContent(), "1,250 kg");
    // La búsqueda pasó por 9600 (basura) antes de encontrar 4800.
    const aperturas = await p.evaluate(() => (window as unknown as { __balanzaSimulada: { aperturas: { baudRate: number }[] } }).__balanzaSimulada.aperturas);
    assert.equal(aperturas[0].baudRate, 9600);
    assert.ok(aperturas.some((a) => a.baudRate === 4800));
    const boton = p.getByRole("button", { name: "Tomar peso" });
    const alto = (await boton.boundingBox())!.height;
    assert.ok(alto >= 44, `el botón mide ${alto} px`);
    await boton.focus();
    await p.keyboard.press("Enter");
    assert.deepEqual(await tomados(p), [1.25]);
    // Quedó recordada en esta PC, por negocio.
    const guardada = await p.evaluate(() => localStorage.getItem("gsg-balanza-serie:carniceria-x:v1"));
    assert.deepEqual(JSON.parse(guardada!), {
      velocidad: 4800,
      bits: "8N1",
      modo: "continuo",
      protocolo: "cas",
      usbVendorId: 0x0403,
      usbProductId: 0x6001,
    });
    assert.deepEqual(errores, []);
    await c.close();
  });

  test("con el peso moviéndose, «Tomar peso» no toma nada y dice que espera", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const c = await contexto(balanza({ estable: false, velocidad: 9600 }));
    const p = await abrir(c, []);
    await p.getByRole("button", { name: "Conectar balanza" }).click();
    await p.getByRole("status").filter({ hasText: "Esperando que el peso se quede quieto" }).waitFor({ timeout: 15_000 });
    const boton = p.getByRole("button", { name: "Tomar peso" });
    assert.equal(await boton.getAttribute("aria-disabled"), "true");
    // `force`: Playwright no toca un aria-disabled, pero una persona sí puede tocarlo (el botón
    // sigue enfocable a propósito, para no perder el foco mientras el peso se mueve).
    await boton.click({ force: true });
    assert.deepEqual(await tomados(p), []);
    // Se queda quieto: ahora sí.
    await p.evaluate(() => (window as unknown as { __balanzaSimulada: { fijarPeso: (k: number, e: boolean) => void } }).__balanzaSimulada.fijarPeso(0.8, true));
    await p.getByText("Peso quieto: listo para tomar").waitFor();
    await boton.click();
    assert.deepEqual(await tomados(p), [0.8]);
    await c.close();
  });

  test("con el peso en cero no se toma", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const c = await contexto(balanza({ peso: 0, velocidad: 9600 }));
    const p = await abrir(c, []);
    await p.getByRole("button", { name: "Conectar balanza" }).click();
    await p.getByRole("status").filter({ hasText: "Peso en cero" }).waitFor({ timeout: 15_000 });
    await p.getByRole("button", { name: "Tomar peso" }).click({ force: true });
    assert.deepEqual(await tomados(p), []);
    await c.close();
  });

  test("al recargar, la balanza recordada se conecta sola; desenchufada avisa y vuelve sola", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const c = await contexto(balanza({ velocidad: 9600, autorizado: true }));
    const p = await abrir(c, []);
    await p.getByRole("button", { name: "Conectar balanza" }).click();
    await p.getByText("Peso quieto: listo para tomar").waitFor({ timeout: 15_000 });
    await p.reload();
    await p.addScriptTag({ content: bundle });
    await p.evaluate(() => (window as unknown as Ventana).__montar("compacto"));
    await p.getByText("Peso quieto: listo para tomar").waitFor({ timeout: 5_000 });
    assert.equal(await p.getByRole("button", { name: "Conectar balanza" }).count(), 0);

    await p.evaluate(() => (window as unknown as { __balanzaSimulada: { desenchufar: () => void } }).__balanzaSimulada.desenchufar());
    await p.getByRole("alert").filter({ hasText: "Se desconectó la balanza" }).waitFor();
    await p.evaluate(() => (window as unknown as { __balanzaSimulada: { enchufar: () => void } }).__balanzaSimulada.enchufar());
    await p.getByText("Peso quieto: listo para tomar").waitFor({ timeout: 5_000 });
    await c.close();
  });

  test("si la persona cierra la ventanita sin elegir puerto, se lo dice claro", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const c = await contexto(balanza({ sinPuerto: true }));
    const p = await abrir(c, []);
    await p.getByRole("button", { name: "Conectar balanza" }).click();
    await p.getByRole("alert").filter({ hasText: "No elegiste ningún puerto" }).waitFor();
    await c.close();
  });

  test("con el puerto ocupado por otro programa, se lo dice claro", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const c = await contexto(balanza({ ocupado: true }));
    const p = await abrir(c, []);
    await p.getByRole("button", { name: "Conectar balanza" }).click();
    await p.getByRole("alert").filter({ hasText: "El puerto está ocupado" }).waitFor();
    await c.close();
  });

  test("sin Web Serial: en modo compacto no aparece nada; en modo completo, el aviso", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const c = await contexto(scriptSinWebSerial());
    const errores: string[] = [];
    const p = await abrir(c, errores);
    await p.waitForTimeout(200);
    assert.equal(await p.evaluate(() => "serial" in navigator && Boolean((navigator as Navigator & { serial?: unknown }).serial)), false);
    assert.equal(await p.locator("#root").innerHTML(), "");
    const q = await abrir(c, errores, "completo");
    await q.getByText("Este navegador no puede leer la balanza por cable. Usá Chrome o Edge en una computadora; mientras tanto, el peso se carga a mano.").waitFor();
    assert.deepEqual(errores, []);
    await c.close();
  });

  test("el asistente: conectar, ver lo que llega y cómo habla, y recién al final guardar en esta PC", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const c = await contexto(balanza({ velocidad: 9600 }));
    const errores: string[] = [];
    const p = await c.newPage();
    p.on("pageerror", (e) => errores.push(e.message));
    await p.goto(ORIGEN);
    await p.addScriptTag({ content: bundle });
    await p.evaluate(() => (window as unknown as { __montarAsistente: () => void }).__montarAsistente());
    await p.getByRole("button", { name: "Conectar balanza" }).click();
    await p.getByText("Peso quieto: listo para tomar").waitFor({ timeout: 15_000 });
    await p.getByText(/formato CAS · 9600 baudios · 8 bits sin paridad/).waitFor();
    assert.match((await p.locator('[data-ui="crudo-balanza"]').textContent()) ?? "", /ST,GS,/);
    // Conectar no guarda: hasta el último paso, la PC no queda con nada.
    assert.equal(await p.evaluate(() => localStorage.getItem("gsg-balanza-serie:carniceria-x:v1")), null);
    await p.getByRole("button", { name: "Listo, guardar en esta PC" }).click();
    await p.getByText(/esta computadora ya reconoce la balanza/).waitFor();
    assert.equal(JSON.parse((await p.evaluate(() => localStorage.getItem("gsg-balanza-serie:carniceria-x:v1")))!).protocolo, "cas");
    const html = await p.locator("#root").innerText();
    assert.doesNotMatch(html, /prueba|demo|de ejemplo|ficticio|provisional/i);
    assert.deepEqual(errores, []);
    await c.close();
  });

  test("la búsqueda encuentra una balanza a pedido (Toledo 8217: 9600 7E1, contesta a «W»)", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const c = await contexto(balanza({ protocolo: "a-pedido", velocidad: 9600, bits: "7E1", comando: "W" }));
    const p = await abrir(c, []);
    const config = await p.evaluate(() => (window as unknown as Ventana).__detectar({ continuoMs: 80, aPedidoMs: 120, sondeoMs: 100 }));
    assert.deepEqual(config, { velocidad: 9600, bits: "7E1", modo: "a-pedido", comando: "W", protocolo: "a-pedido" });
    const escritos = await p.evaluate(() => (window as unknown as { __balanzaSimulada: { escritos: string[] } }).__balanzaSimulada.escritos);
    assert.ok(escritos.includes("\u0005"), "probó ENQ antes");
    await c.close();
  });
});
