// S2 — humo en la app local apuntada al BRANCH. Uso: node .m1/s2-humo.mjs <etiqueta> <puerto> [vender]
import fs from "node:fs";
import { chromium } from "playwright";
const [et, puerto, vender] = process.argv.slice(2);
const BASE = `http://sandboxsuper.localhost:${puerto}`;
const clave = fs.readFileSync(".m1/s2/clave-ensayo.txt", "utf8").trim();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const p = await ctx.newPage(); p.setDefaultTimeout(20000);
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
const main = async (n = 500) => { await p.waitForLoadState("networkidle").catch(() => {}); return (await p.locator("main").last().innerText()).replace(/\s+/g, " ").slice(0, n); };
await p.goto(`${BASE}/admin/login`, { timeout: 60000 });
await p.fill('input[name="email"]', "ensayo-s2@local"); await p.fill('input[name="password"]', clave);
await p.locator('button[type="submit"]').first().click();
await p.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 45000 });
console.log(`[${et}] ingresó:`, p.url());
for (const [r, n] of [["/admin/facturacion?vista=cobrar-con-link", 420], ["/admin/pedidos", 200]]) {
  await p.goto(`${BASE}${r}`); console.log(`[${et}] ${r}:`, await main(n));
}
const hayLink = await p.getByText("Link de pago").count();
console.log(`[${et}] botón Link de pago en pedidos:`, hayLink);
if (vender) {
  const nav = (await p.locator("nav, aside").first().innerText()).replace(/\s+/g, " ");
  console.log("menú:", nav.slice(0, 260));
  for (const [r, n] of [["/admin/lotes", 300], ["/admin/despiece", 300], ["/admin/caja", 220]]) { await p.goto(`${BASE}${r}`); console.log(`[${et}] ${r}:`, await main(n)); }
  await p.goto(`${BASE}/admin/vender`); await p.waitForLoadState("networkidle");
  const buscar = p.getByPlaceholder(/Buscá el producto/).first(); await buscar.fill("Aceite de maíz"); await p.waitForTimeout(800);
  await buscar.press("ArrowDown"); await buscar.press("Enter"); await p.waitForTimeout(400);
  await p.getByPlaceholder("Cantidad").first().fill("1");
  await p.getByRole("radio", { name: /^Efectivo$/ }).first().click({ timeout: 3000 }).catch(() => p.getByRole("button", { name: /^Efectivo$/ }).first().click());
  await p.getByRole("button", { name: /^Cobrar/ }).first().click(); await p.waitForTimeout(4000);
  console.log(`[${et}] venta:`, await main(260));
  await p.goto(`${BASE}/admin/caja`); console.log(`[${et}] caja tras venta:`, await main(420));
  await p.goto(`${BASE}/admin/caja/cierre`); console.log(`[${et}] cierre:`, await main(300));
}
console.log(`[${et}] errores de página:`, errores.length ? errores.slice(0, 3) : "ninguno");
await b.close();
