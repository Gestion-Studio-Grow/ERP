// Sondeo inicial: qué hay en cada pantalla (texto, botones, enlaces) para armar el recorrido.
import { chromium } from "/home/user/erp/node_modules/playwright/index.mjs";
import fs from "node:fs";
const D = "/home/user/erp/.qa/rediseno/shine-adosmanos/sondeo/";
const [neg, email, ...rutas] = process.argv.slice(2);
const base = `http://${neg}.localhost:3210`;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errs = [];
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
p.on("pageerror", (e) => errs.push("pageerror " + String(e).slice(0, 200)));
if (email !== "-") {
  await p.goto(base + "/admin/login", { timeout: 120000 });
  await p.fill("input[name=email]", email); await p.fill("input[name=password]", (process.env.LAB_CLAVE_COMUN ?? ""));
  await Promise.all([p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 120000 }), p.click("button[type=submit]")]);
}
for (const r of rutas) {
  errs.length = 0;
  const resp = await p.goto(base + r, { timeout: 120000, waitUntil: "networkidle" }).catch((e) => null);
  await p.waitForTimeout(500);
  const info = await p.evaluate(() => {
    const m = document.querySelector("main") || document.body;
    const ctl = [...m.querySelectorAll("a,button,input,select,textarea")].filter(e=>e.getBoundingClientRect().width>0).map(e => `${e.tagName}${e.name?"["+e.name+"]":""}${e.type&&e.tagName==="INPUT"?"("+e.type+")":""}${e.getAttribute("href")?"->"+e.getAttribute("href"):""}:${(e.innerText||e.getAttribute("aria-label")||e.placeholder||"").trim().replace(/\s+/g," ").slice(0,50)}`);
    return { url: location.href, diseno: document.querySelector("[data-diseno]")?.getAttribute("data-diseno"), txt: m.innerText.replace(/\s+/g, " ").slice(0, 1500), ctl: ctl.slice(0, 80) };
  });
  const f = r.replace(/[\/?=&]/g, "_");
  await p.screenshot({ path: `${D}${neg}${f}.png` });
  console.log(`=== ${r} status=${resp?.status()} url=${info.url} diseno=${info.diseno}\nTXT: ${info.txt}\nCTL: ${info.ctl.join(" | ")}\nERR: ${errs.join(" || ")}`);
}
await b.close();
