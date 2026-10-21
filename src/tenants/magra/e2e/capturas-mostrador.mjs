// Capturas del mostrador (Pedidos → venta de mostrador) en celulares, tablets y terminales, en claro y
// oscuro, con un ticket cargado (un corte por kilo y un producto por unidad, efectivo). Sobre la app de
// producción y Postgres LOCAL (entorno.mjs). No afirma nada: deja las imágenes y mide si el total y
// «Cobrar» se ven sin desplazar y si hay desplazamiento horizontal.
// Uso: npm run build && node --import tsx src/tenants/magra/e2e/capturas-mostrador.mjs <carpeta> [ruta]
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { levantarEntorno, DUENIO } from "./entorno.mjs";

const OUT = process.argv[2];
const RUTA = process.argv[3] ?? "/admin/pedidos";
await mkdir(OUT, { recursive: true });
export const TAMANIOS = [
  ["pos-5in", 360, 640],
  ["cel", 390, 844],
  ["pos-8in", 600, 960],
  ["tablet-v", 768, 1024],
  ["tablet-820", 820, 1180],
  ["tablet-h", 1024, 768],
  ["term-1280", 1280, 800],
  ["term-1366", 1366, 768],
  ["pc-1920", 1920, 1080],
];
const e = await levantarEntorno();
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" });
const medidas = [];
for (const esquema of ["light", "dark"]) {
  for (const [nombre, w, h] of TAMANIOS) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: esquema, locale: "es-AR", hasTouch: w < 800 });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const p = await ctx.newPage();
    await p.goto(`${e.url}/admin/login`);
    await p.fill('input[name="email"]', DUENIO.email);
    await p.fill('input[name="password"]', DUENIO.clave);
    await p.locator('button[type="submit"]').first().click();
    await p.waitForURL((u) => !u.pathname.startsWith("/admin/login"));
    await p.goto(`${e.url}${RUTA}`);
    await p.waitForLoadState("networkidle").catch(() => {});
    const abrir = p.getByRole("button", { name: "Cobrar en el mostrador" });
    if (await abrir.count()) await abrir.click();
    const buscar = () => p.locator('#vender-buscar, input[role="combobox"][id^="prod-"]').last();
    await buscar().click();
    await buscar().fill("vac");
    await p.getByRole("option", { name: /Vac/ }).first().waitFor();
    await buscar().press("Enter");
    await p.locator('input[id^="qty-"]:not([disabled])').last().fill("1,24");
    await p.keyboard.press("Enter");
    await buscar().click();
    await buscar().fill("hamb");
    await p.getByRole("option", { name: /Hamb/ }).first().waitFor();
    await buscar().press("Enter");
    await p.locator('input[id^="qty-"]:not([disabled])').last().fill("2");
    const efectivo = p.getByRole("radio", { name: "Efectivo" }).first();
    if (await efectivo.count()) await efectivo.click();
    else await p.getByRole("button", { name: "Efectivo" }).first().click();
    await p.waitForTimeout(300);
    await p.evaluate(() => window.scrollTo(0, 0));
    const form = p.locator('form[data-vender="mostrador"]');
    const cobrar = ((await form.count()) ? form : p).getByRole("button", { name: /^Cobrar/ }).first();
    const caja = await cobrar.boundingBox();
    const sobra = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    medidas.push({ esquema, nombre, w, h, cobrarVisibleSinScroll: !!caja && caja.y >= 0 && caja.y + caja.height <= h, desbordeHorizontal: sobra });
    await p.screenshot({ path: `${OUT}/${nombre}-${esquema}.png` });
    await ctx.close();
  }
}
await b.close();
await e.cerrar();
await writeFile(`${OUT}/medidas.json`, JSON.stringify(medidas, null, 1));
console.table(medidas);
