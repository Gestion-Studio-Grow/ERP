// Medición de la portada de Shine (misma vara antes y después).
// Uso: node medir.mjs <puerto> <etiqueta> <carpetaCapturas> [host=shinevelas]
//   · 390 px: celular (DPR 2.625, CPU 4× más lenta por CDP) · 1440 px: PC (DPR 1, CPU sin freno).
//   · LCP (PerformanceObserver con buffer), tareas largas y TBT desde la navegación hasta los 12 s,
//     errores de consola y de página, scroll horizontal, bytes de JS (encodedBodySize, sin caché)
//     separados en "antes del load" y "después", fps de la escena (data-fps) y el momento en que
//     la escena avisa «listo» (data-estado).
//   · Capturas: portada con la vela encendida y, si hay escena, apagada (clic en la vela).
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const [puerto, etiqueta, carpeta, host = "shinevelas"] = process.argv.slice(2);
mkdirSync(carpeta, { recursive: true });
const URL_ = `http://${host}.localhost:${puerto}/tienda`;

const navegador = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--host-resolver-rules=MAP *.localhost 127.0.0.1"],
});

const VISTAS = [
  { nombre: "390", width: 390, height: 844, dpr: 2.625, movil: true, cpu: 4 },
  { nombre: "1440", width: 1440, height: 900, dpr: 1, movil: false, cpu: 1 },
  // Sólo fps: celular medio (DPR 2, CPU 4× más lenta), la vela prendida 12 s.
  { nombre: "fps390", width: 390, height: 844, dpr: 2, movil: true, cpu: 4, soloFps: true },
];

const resultados = {};
for (const v of VISTAS) {
  const ctx = await navegador.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: v.dpr,
    isMobile: v.movil,
    hasTouch: v.movil,
  });
  const page = await ctx.newPage();
  // Red a nivel de contexto: incluye lo que pide el worker (no aparece en el resource timing de la página).
  const red = [];
  let t0 = 0;
  let tLoadNodo = Infinity;
  ctx.on("requestfinished", async (req) => {
    const cuando = Date.now() - t0;
    try {
      const tam = await req.sizes();
      red.push({ url: req.url(), cuando, bytes: tam.responseBodySize, tipo: req.resourceType() });
    } catch {}
  });
  page.on("load", () => (tLoadNodo = Date.now() - t0));
  const errores = [];
  page.on("console", (m) => {
    if (m.type() === "error") errores.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  if (v.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: v.cpu });
  await page.addInitScript(() => {
    const w = window;
    w.__lcp = 0;
    w.__largas = [];
    w.__listo = null;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__lcp = Math.max(w.__lcp, e.startTime);
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__largas.push([Math.round(e.startTime), Math.round(e.duration)]);
    }).observe({ type: "longtask", buffered: true });
    const mirar = () => {
      const el = document.querySelector("[data-escena-vela]");
      if (el && el.getAttribute("data-estado") === "listo" && w.__listo === null) w.__listo = performance.now();
    };
    new MutationObserver(mirar).observe(document, { subtree: true, attributes: true, childList: true });
  });
  t0 = Date.now();
  await page.goto(URL_, { waitUntil: "load" });
  const tLoad = await page.evaluate(() => performance.getEntriesByType("navigation")[0].loadEventEnd);
  await page.waitForTimeout(12000);
  const m = await page.evaluate((tLoad) => {
    const w = window;
    const js = performance.getEntriesByType("resource").filter((r) => r.initiatorType === "script" || /\.js(\?|$)/.test(r.name));
    const suma = (arr) => arr.reduce((s, r) => s + (r.encodedBodySize || 0), 0);
    const antes = js.filter((r) => r.startTime <= tLoad);
    const despues = js.filter((r) => r.startTime > tLoad);
    const tbt = w.__largas.filter(([s]) => s < 12000).reduce((acc, [, d]) => acc + Math.max(0, d - 50), 0);
    const el = document.querySelector("[data-escena-vela]");
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null;
    return {
      lcp: Math.round(w.__lcp),
      fcp: fcp && Math.round(fcp),
      load: Math.round(tLoad),
      tbt,
      largas: w.__largas.length,
      largaMax: w.__largas.reduce((m, [, d]) => Math.max(m, d), 0),
      scrollHorizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      jsAntesDelLoad: suma(antes),
      jsDespues: suma(despues),
      jsArchivos: js.length,
      jsDiferidos: despues.map((r) => [r.name.split("/").pop(), r.encodedBodySize]),
      escena: el ? el.getAttribute("data-estado") : null,
      escenaListaMs: w.__listo && Math.round(w.__listo),
      fps: el ? el.getAttribute("data-fps") : null,
      calidad: el ? el.getAttribute("data-calidad") : null,
    };
  }, tLoad);
  const js = red.filter((x) => /\.js(\?|$)/.test(x.url) || /worker/.test(x.url));
  m.redJsAntesDelLoad = js.filter((x) => x.cuando <= tLoadNodo).reduce((a, x) => a + x.bytes, 0);
  m.redJsDespues = js.filter((x) => x.cuando > tLoadNodo).reduce((a, x) => a + x.bytes, 0);
  m.redJsDiferidos = js.filter((x) => x.cuando > tLoadNodo).map((x) => [x.url.split("/").pop(), x.bytes]);
  if (v.soloFps) {
    m.fpsSeguidos = [];
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(2100);
      m.fpsSeguidos.push(await page.locator("[data-escena-vela]").getAttribute("data-fps").catch(() => null));
    }
    m.pasoFinal = await page.locator("[data-escena-vela]").getAttribute("data-calidad").catch(() => null);
    m.errores = errores;
    resultados[v.nombre] = m;
    await ctx.close();
    continue;
  }
  await page.screenshot({ path: `${carpeta}/${etiqueta}-${v.nombre}-encendida.png` });
  // Apagar: clic sobre la vela (el lienzo) — si hay escena.
  const lienzo = page.locator("[data-escena-vela] canvas");
  if ((await lienzo.count()) && m.escena === "listo") {
    const caja = await lienzo.boundingBox();
    const boton = page.locator("[data-escena-vela-boton]");
    const antesTxt = await boton.textContent();
    // El punto de la vela lo dice la escena (data-vela-x/y, fracción del lienzo).
    const fx = Number((await page.locator("[data-escena-vela]").getAttribute("data-vela-x")) ?? 0.5);
    const fy = Number((await page.locator("[data-escena-vela]").getAttribute("data-vela-y")) ?? 0.55);
    const cx = caja.x + caja.width * fx;
    const cy = caja.y + caja.height * fy;
    const clip = { x: Math.max(0, cx - 230), y: Math.max(caja.y, cy - 300), width: Math.min(460, v.width), height: Math.min(caja.height, 480) };
    await page.screenshot({ path: `${carpeta}/${etiqueta}-${v.nombre}-primer-plano.png`, clip });
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(1300);
    await page.screenshot({ path: `${carpeta}/${etiqueta}-${v.nombre}-humo.png` });
    await page.screenshot({ path: `${carpeta}/${etiqueta}-${v.nombre}-humo-primer-plano.png`, clip });
    await page.waitForTimeout(4500);
    await page.screenshot({ path: `${carpeta}/${etiqueta}-${v.nombre}-apagada.png` });
    m.boton = { antes: antesTxt, despues: await boton.textContent() };
    // Volver a encender con el botón (teclado): Enter.
    await boton.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
    m.boton.reencendida = await boton.textContent();
    // Un aroma: la cera cambia de color.
    const chip = page.locator("[data-aroma]").nth(3);
    if (await chip.count()) {
      await chip.click();
      await page.waitForTimeout(1500);
      m.aroma = await chip.getAttribute("data-aroma");
      await page.screenshot({ path: `${carpeta}/${etiqueta}-${v.nombre}-aroma.png` });
    }
    m.fpsFinal = await page.locator("[data-escena-vela]").getAttribute("data-fps");
  }
  m.errores = errores;
  resultados[v.nombre] = m;
  await ctx.close();
}
await navegador.close();
writeFileSync(`${carpeta}/${etiqueta}-medicion.json`, JSON.stringify(resultados, null, 1));
console.log(JSON.stringify(resultados, null, 1));
