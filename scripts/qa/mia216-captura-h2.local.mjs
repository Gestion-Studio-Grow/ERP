// MIA-216 · H2: captura de la fila del comprobante pagado en parte en el cashflow del evento (demo local, PGlite).
// Antes: node scripts/proyectos/demo-local.mjs y DATABASE_URL=… npx tsx scripts/qa/mia211-escenario.local.mts.
//   PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/qa/mia216-captura-h2.local.mjs <ruta de la ficha> <carpeta>
import { abrir, entrar, VISTAS } from "./mia-base.mjs";

const [ficha, carpeta = "."] = process.argv.slice(2);
const navegador = await abrir();
const errores = [];
for (const [nombre, vista] of [["escritorio", VISTAS.escritorio], ["telefono", { width: 390, height: 844 }]]) {
  const page = await entrar(navegador, "admin", errores, vista);
  await page.goto(ficha, { waitUntil: "networkidle" });
  const fila = page.locator("tr", { hasText: "0003-00000777" }).first();
  await fila.scrollIntoViewIfNeeded();
  console.log(`${nombre} · ${(await fila.innerText()).replace(/\s+/g, " ")}`);
  const bb = await fila.boundingBox();
  await page.screenshot({ path: `${carpeta}/h2-${nombre}.png`, clip: { x: 0, y: Math.max(0, bb.y - 140), width: vista.width, height: bb.height + 280 } });
  await page.context().close();
}
await navegador.close();
if (errores.length) console.log(errores.join("\n"));
