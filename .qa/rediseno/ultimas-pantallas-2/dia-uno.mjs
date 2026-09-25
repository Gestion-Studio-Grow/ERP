// Día uno: encabezado con el nombre del negocio, «Para arrancar» con facturación, título de Pedidos a 360.
// Uso: node dia-uno.mjs <sufijo>
import { chromium } from "/home/user/erp/node_modules/playwright/index.mjs";
const D = "/home/user/erp/.qa/rediseno/ultimas-pantallas-2/fotos/";
const suf = process.argv[2] ?? "despues";
const CASOS = [
  ["qa-kiosco-lab", "dueno@qa-kiosco.lab", "inicio", [[390, 844], [360, 780], [1440, 900]]],
  ["magra", "dueno@magra.lab", "pedidos", [[360, 780], [390, 844], [1440, 900]]],
  ["chestetica", "duena@ch.lab", "inicio", [[390, 844]]],
];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
let fallas = 0;
for (const [neg, email, ruta, anchos] of CASOS) {
  const base = `http://${neg}.localhost:3210`;
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 300)); });
  p.on("pageerror", (e) => errs.push("pageerror " + String(e).slice(0, 300)));
  await p.goto(base + "/admin/login", { timeout: 120000 });
  await p.fill("input[name=email]", email); await p.fill("input[name=password]", (process.env.LAB_CLAVE_COMUN ?? ""));
  await Promise.all([p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 120000 }), p.click("button[type=submit]")]);
  for (const [w, h] of anchos) {
    await p.setViewportSize({ width: w, height: h });
    errs.length = 0;
    const resp = await p.goto(`${base}/admin/${ruta === "inicio" ? "" : ruta}`, { timeout: 120000, waitUntil: "networkidle" });
    await p.waitForTimeout(500);
    const m = await p.evaluate(() => {
      const h1 = document.querySelector("main h1");
      const r = h1?.getBoundingClientRect();
      const lh = h1 ? parseFloat(getComputedStyle(h1).lineHeight) : 0;
      const arr = [...document.querySelectorAll("[data-inicio=para-arrancar] li")].map((li) => li.innerText.replace(/\s+/g, " ").slice(0, 110));
      const marca = [...document.querySelectorAll("header, aside, nav")].map((e) => e.innerText).join(" ").match(/Mi negocio|QA Kiosco[^\n]*/)?.[0] ?? null;
      const primer = [...document.querySelectorAll("main [data-ui=renglon], main table tbody tr")].map((e) => e.getBoundingClientRect()).find((x) => x.height > 0);
      return { h1: h1?.innerText, lineasH1: r && lh ? Math.round(r.height / lh) : null, arr, marca, primer: primer ? Math.round(primer.top + scrollY) : null, sx: document.documentElement.scrollWidth - innerWidth, diseno: document.querySelector("[data-diseno]")?.getAttribute("data-diseno") ?? null };
    });
    await p.screenshot({ path: `${D}${neg}_${ruta}_${w}_${suf}.png`, fullPage: w !== 1440 });
    console.log(`${neg} ${ruta} ${w} status=${resp?.status()} diseno=${m.diseno} h1=${JSON.stringify(m.h1)} lineasH1=${m.lineasH1} marca=${JSON.stringify(m.marca)} primer=${m.primer} sx=${m.sx}` + (m.arr.length ? `\n  para-arrancar: ${m.arr.join(" | ")}` : "") + (errs.length ? ` ERRORES=${errs.join(" || ")}` : ""));
    if (errs.length) fallas++;
  }
  await ctx.close();
}
await b.close();
console.log("pantallas con errores de consola:", fallas);
process.exit(fallas ? 1 : 0);
