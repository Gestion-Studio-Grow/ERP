// Guarda el HTML de CH normalizado (/, /admin/login, /admin con la dueña) en argv[2].
// Normaliza lo que cambia de build a build sin cambiar lo que ve la clienta: scripts, hojas y
// hashes de /_next, ids de server actions, nonces, ids de React (useId) y la hora.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2];
const HOST = "http://chestetica.localhost:3210";
const EMAIL = process.env.CH_EMAIL;
const CLAVE = process.env.LAB_CLAVE_COMUN;
if (!out || !EMAIL || !CLAVE) throw new Error("faltan out, CH_EMAIL o LAB_CLAVE_COMUN");
mkdirSync(out, { recursive: true });

function normalizar(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/g, "")
    .replace(/<link\b[^>]*>/g, "")
    .replace(/<style\b[\s\S]*?<\/style>/g, "<style/>")
    .replace(/\/_next\/[^"'\s)]+/g, "/_next/X")
    .replace(/\$ACTION_[A-Z_]*[0-9a-f:]*/g, "$ACTION")
    .replace(/name="\$ACTION[^"]*"/g, 'name="$ACTION"')
    .replace(/ nonce="[^"]*"/g, "")
    .replace(/_R_[0-9a-zA-Z_]+_?/g, "_R_")
    .replace(/:r[0-9a-z]+:/g, ":r:")
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, "HH:MM")
    .replace(/(<img[^>]*) style="[^"]*"/g, "$1")
    .replace(/></g, ">\n<");
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const resumen = {};
try {
  const anon = await browser.newContext();
  const p = await anon.newPage();
  for (const [nombre, ruta] of [["inicio", "/"], ["admin-login", "/admin/login"]]) {
    const r = await p.goto(HOST + ruta, { waitUntil: "networkidle", timeout: 180000 });
    writeFileSync(join(out, `${nombre}.html`), normalizar(await p.content()));
    resumen[nombre] = { status: r?.status(), url: p.url() };
  }
  const ctx = await browser.newContext();
  const q = await ctx.newPage();
  await q.goto(HOST + "/admin/login", { waitUntil: "domcontentloaded", timeout: 180000 });
  await q.fill('input[name="email"]', EMAIL);
  await q.fill('input[name="password"]', CLAVE);
  await Promise.all([q.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 180000 }), q.click('button[type="submit"]')]);
  const r = await q.goto(HOST + "/admin", { waitUntil: "networkidle", timeout: 180000 });
  writeFileSync(join(out, "admin-duena.html"), normalizar(await q.content()));
  resumen["admin-duena"] = { status: r?.status(), url: q.url() };
} finally {
  await browser.close();
}
writeFileSync(join(out, "resumen.json"), JSON.stringify(resumen, null, 2));
console.log(JSON.stringify(resumen));
