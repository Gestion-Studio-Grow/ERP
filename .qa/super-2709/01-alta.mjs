// QA 1 · Alta de «Supermercado La Esquina» desde la consola del operador (conexión app_rls, RLS on).
// Uso: node 01-alta.mjs <baseURL> <outDir>. Falla ante errores de consola del navegador.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3254";
const OUT = process.argv[3] ?? "./out";
fs.mkdirSync(OUT, { recursive: true });
const slug = "super-la-esquina";
const pasos = [];
const errores = [];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") errores.push(m.text().slice(0, 300)); });
page.on("pageerror", (e) => errores.push(String(e).slice(0, 300)));
const foto = async (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: false });
const paso = (t) => { pasos.push(t); console.log("·", t); };
try {
  await page.goto(`${BASE}/operador/login`);
  await page.fill('input[name="password"]', process.env.OPERATOR_PASSWORD ?? "");
  await Promise.all([page.waitForURL(/\/operador(?!\/login)/), page.click('button[type="submit"]')]);
  paso("login de la consola");
  await page.goto(`${BASE}/operador/alta`);
  await page.fill("#w-name", "Supermercado La Esquina");
  await page.fill("#w-slug", slug);
  await page.fill("#w-email", `duenio@${slug}.test`);
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.selectOption("#w-bp", "supermercado");
  await page.waitForSelector("text=/Nace como/");
  await foto("01-alta-rubro");
  paso("rubro supermercado elegido: " + (await page.locator("text=/Nace como/").first().textContent()).trim());
  for (let i = 0; i < 4; i++) {
    if (await page.locator("#w-sub").count()) await page.fill("#w-sub", "super");
    const sig = page.getByRole("button", { name: "Siguiente" });
    if (!(await sig.count())) break;
    await sig.click();
  }
  await foto("02-alta-revisar");
  await page.getByRole("button", { name: "Dar de alta el negocio" }).click();
  await page.waitForSelector("text=/No se pudo dar de alta|dado de alta|Contraseña|contraseña/i", { timeout: 90000 });
  // La pantalla muestra la contraseña temporal del dueño una sola vez: NO se guarda captura ni
  // texto de esta pantalla (sería un secreto en la evidencia). Se lee y se deja fuera del repo.
  const cuerpo = await page.textContent("body");
  if (/No se pudo dar de alta/i.test(cuerpo)) throw new Error("el alta falló");
  if (!/Negocio dado de alta/.test(cuerpo)) throw new Error("el alta no terminó");
  const m = cuerpo.match(/canal seguro\.(.+?)Copiar/);
  if (process.env.CLAVE_FUERA_DEL_REPO && m) fs.writeFileSync(process.env.CLAVE_FUERA_DEL_REPO, m[1].trim());
  paso("alta hecha: «Negocio dado de alta», contraseña temporal mostrada una vez");
} catch (e) {
  errores.push("FALLA: " + (e?.message ?? String(e)));
  await foto("99-falla").catch(() => {});
} finally {
  await browser.close();
}
fs.writeFileSync(`${OUT}/01-alta.json`, JSON.stringify({ slug, pasos, errores }, null, 2));
console.log(JSON.stringify({ pasos, errores }, null, 2));
process.exit(errores.length ? 1 : 0);
