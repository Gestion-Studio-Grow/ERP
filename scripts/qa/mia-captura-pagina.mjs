// Captura una pantalla de la demo para revisarla a ojo, y mide si desborda en horizontal.
//   node scripts/qa/mia-captura-pagina.mjs <rol|publica> <ruta> <salida.png> [ancho] [clic en el primer enlace que contenga este texto]
import { abrir, BASE, entrar } from "./mia-base.mjs";

const [rol, ruta, salida, ancho = "1280", clic] = process.argv.slice(2);
if (!rol || !ruta || !salida) throw new Error("Uso: <rol|publica> <ruta> <salida.png> [ancho] [texto del enlace a abrir]");
const n = await abrir();
const errores = [];
const page = rol === "publica" ? await (await n.newContext({ baseURL: BASE })).newPage() : await entrar(n, rol, errores);
await page.setViewportSize({ width: Number(ancho), height: 900 });
await page.goto(ruta);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(2000);
if (clic) {
  await page.locator("a", { hasText: clic }).first().click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
}
const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
await page.screenshot({ path: salida, fullPage: true });
console.log(`desborde horizontal: ${sobra > 4 ? `${sobra}px (REVISAR)` : "ninguno"} · ${page.url().replace(BASE, "")} → ${salida}`);
if (errores.length) console.log(errores.join("\n"));
await n.close();
