// TBT y tareas largas de la portada de Shine a 390 px (DPR 2,625, CPU 4×), N corridas.
// Uso: node tbt.mjs <puerto> <n> <salida.json>
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const [puerto, n, salida] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--host-resolver-rules=MAP *.localhost 127.0.0.1"] });
const corridas = [];
for (let i = 0; i < Number(n); i++) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await p.addInitScript(() => {
    window.__largas = [];
    window.__lcp = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__largas.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: "longtask", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = Math.max(window.__lcp, e.startTime); }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  await p.goto(`http://shinevelas.localhost:${puerto}/tienda`, { waitUntil: "load" });
  await p.waitForTimeout(12000);
  const r = await p.evaluate(() => ({ largas: window.__largas, lcp: Math.round(window.__lcp), tbt: window.__largas.reduce((a, [, d]) => a + Math.max(0, d - 50), 0) }));
  corridas.push(r);
  await ctx.close();
}
await b.close();
writeFileSync(salida, JSON.stringify(corridas));
const tbts = corridas.map((c) => c.tbt).sort((a, b) => a - b);
const lcps = corridas.map((c) => c.lcp).sort((a, b) => a - b);
console.log("TBT", tbts.join(" "), "mediana", tbts[Math.floor(tbts.length / 2)], "| LCP", lcps.join(" "), "mediana", lcps[Math.floor(lcps.length / 2)]);
for (const c of corridas) console.log("  ", JSON.stringify(c.largas));
