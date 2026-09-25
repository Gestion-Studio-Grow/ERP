// Fotos de las 8 pantallas a 390 (dpr 2) y 1440; mide primer renglón, teclas < 44 px (390) y scroll horizontal a 360.
// Uso: node fotos.mjs <sufijo> [negocio:email ...] [--rutas=a,b]
import { chromium } from "/home/user/erp/node_modules/playwright/index.mjs";
const D = "/home/user/erp/.qa/rediseno/ultimas-pantallas/fotos/";
const args = process.argv.slice(2);
const suf = args[0];
const rutasArg = args.find((a) => a.startsWith("--rutas="));
const RUTAS = rutasArg ? rutasArg.slice(8).split(",") : ["apariencia","auditoria","despiece","devoluciones-proveedor","facturacion/bancos/configuracion","localizacion","lotes","reportes/margen"];
const quienes = args.slice(1).filter((a) => !a.startsWith("--"));
const negocios = quienes.length ? quienes : ["magra:dueno@magra.lab", "chestetica:duena@ch.lab"];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
let fallas = 0;
for (const q of negocios) {
  const [neg, email] = q.split(":");
  const base = `http://${neg}.localhost:3210`;
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 300)); });
  p.on("pageerror", (e) => errs.push("pageerror " + String(e).slice(0, 300)));
  await p.goto(base + "/admin/login", { timeout: 120000 });
  await p.fill("input[name=email]", email); await p.fill("input[name=password]", (process.env.LAB_CLAVE_COMUN ?? ""));
  await Promise.all([p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 120000 }), p.click("button[type=submit]")]);
  for (const r of RUTAS) {
    const nom = `${neg}_${r.replace(/\//g, "-")}`;
    for (const [w, h] of [[390, 844], [1440, 900], [360, 780]]) {
      await p.setViewportSize({ width: w, height: h });
      errs.length = 0;
      const resp = await p.goto(`${base}/admin/${r}`, { timeout: 120000, waitUntil: "networkidle" }).catch((e) => ({ status: () => "ERR " + e.message.slice(0, 80) }));
      await p.waitForTimeout(400);
      const m = await p.evaluate(() => {
        const main = document.querySelector("main") || document.body;
        const h1 = document.querySelector("h1")?.innerText?.slice(0, 60);
        const primero = [...main.querySelectorAll("[data-ui=renglon], table tbody tr, form, li, section")].map((e) => e.getBoundingClientRect()).find((r) => r.height > 0);
        const chicos = [...main.querySelectorAll("a, button, input, select, textarea, [role=button]")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 44 && getComputedStyle(e).visibility !== "hidden" && !(e.type === "hidden"); }).map((e) => (e.innerText || e.getAttribute("aria-label") || e.name || e.tagName).trim().slice(0, 30) + ":" + Math.round(e.getBoundingClientRect().height));
        return { h1, primer: primero ? Math.round(primero.top + scrollY) : null, chicos, sx: document.documentElement.scrollWidth - innerWidth, diseno: document.querySelector("[data-diseno]")?.getAttribute("data-diseno") ?? null };
      });
      if (w !== 360) await p.screenshot({ path: `${D}${nom}_${w}_${suf}.png`, fullPage: true });
      console.log(`${nom} ${w} status=${resp?.status?.()} diseno=${m.diseno} h1=${JSON.stringify(m.h1)} primer=${m.primer} sx=${m.sx}` + (w === 390 ? ` chicos(${m.chicos.length})=${m.chicos.slice(0, 8).join("|")}` : "") + (errs.length ? ` ERRORES=${errs.join(" || ")}` : ""));
      if (errs.length) fallas++;
    }
  }
  await ctx.close();
}
await b.close();
console.log("pantallas con errores de consola:", fallas);
process.exit(fallas ? 1 : 0);
