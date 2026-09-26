// Recorrido del dominio propio: la consola muestra <subdominio>.gsgapp.com.ar en la ficha de un negocio
// creado ANTES del dominio (CH, que está en el mapa de hosts) y en el alta de uno nuevo. 1440 y 390 px.
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3213";
const CLAVE = process.env.LAB_CLAVE_COMUN;
const OUT = new URL(".", import.meta.url).pathname;
if (!CLAVE) throw new Error("falta LAB_CLAVE_COMUN");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const resumen = {};
for (const ancho of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width: ancho, height: 900 } });
  const errores = [];
  page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  await page.goto(`${BASE}/operador/login`);
  const pass = page.locator('input[type="password"]');
  await pass.fill(CLAVE);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/operador(?!\/login)/, { timeout: 20000 });
  // Ficha de CH (creado antes del dominio, está en el mapa de hosts del laboratorio).
  await page.goto(`${BASE}/operador`);
  const idCH = process.env.ID_CH;
  await page.goto(`${BASE}/operador/tenants/${idCH}`);
  const links = await page.locator('a[href*="gsgapp.com.ar"], a[href*=".localhost"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  await page.screenshot({ path: `${OUT}ficha-ch-${ancho}.png`, fullPage: false });
  // Alta: el paso «Marca y link» muestra la dirección que va a tener.
  await page.goto(`${BASE}/operador/alta`);
  const hint = await page.getByText(/Su dirección en internet/).first().textContent().catch(() => null);
  resumen[ancho] = { linksDeLaFicha: [...new Set(links)], pistaDelAlta: hint, erroresDeConsola: errores, anchoDePagina: await page.evaluate(() => document.documentElement.scrollWidth) };
  await page.close();
}
await browser.close();
console.log(JSON.stringify(resumen, null, 2));
