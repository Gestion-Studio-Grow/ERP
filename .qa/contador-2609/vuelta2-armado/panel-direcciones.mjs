// Entra como la contadora del estudio del laboratorio y lista qué dirección muestra /contador para
// cada cliente de la cartera (verificación del mapa de hosts del laboratorio). Sin secretos en la salida.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const HOST = "http://estudio.localhost:3210";
const CLAVE = process.env.LAB_CLAVE_COMUN;
if (!CLAVE) throw new Error("falta LAB_CLAVE_COMUN");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const q = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errores = [];
  q.on("console", (m) => { if (m.type() === "error") errores.push(m.text().slice(0, 200)); });
  await q.goto(HOST + "/admin/login", { waitUntil: "domcontentloaded", timeout: 180000 });
  await q.fill('input[name="email"]', "contador@estudio.lab");
  await q.fill('input[name="password"]', CLAVE);
  await Promise.all([q.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 180000 }), q.click('button[type="submit"]')]);
  const r = await q.goto(HOST + "/contador", { waitUntil: "networkidle", timeout: 180000 });
  const links = await q.$$eval("a[href]", (as) => as.map((a) => ({ href: a.getAttribute("href"), texto: (a.textContent || "").trim().slice(0, 60) })).filter((l) => /localhost|https?:/.test(l.href || "")));
  const sinDireccion = (await q.content()).split("Sin dirección propia todavía").length - 1;
  const res = { status: r?.status(), url: q.url(), links, sinDireccion, erroresDeConsola: errores };
  writeFileSync(process.argv[2], JSON.stringify(res, null, 2));
  await q.screenshot({ path: process.argv[2].replace(/\.json$/, ".png"), fullPage: true });
  console.log(JSON.stringify({ status: res.status, url: res.url, links: links.length, sinDireccion, errores: errores.length }));
} finally { await browser.close(); }
