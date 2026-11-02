// Fotografía cada pieza del armador 3D sola (a la perspectiva y de frente) y las junta en una hoja.
//   node scripts/qa/mia-stand-piezas.mjs <salida.png> [número de pieza en la paleta …]   (sin números: todas)
import { abrir, entrar } from "./mia-base.mjs";

const [salida, ...rotulos] = process.argv.slice(2);
if (!salida) throw new Error("Falta la ruta de salida.");
const n = await abrir();
const errores = [];
const page = await entrar(n, "admin", errores);
await page.goto("/admin/proyectos");
await page.waitForLoadState("networkidle");
const link = await page.locator('a[href^="/admin/proyectos/"][href*="cm"]').first().getAttribute("href");
await page.goto(`${link}?tab=diseno`);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(2000);
await page.getByRole("button", { name: "+ Armar stand en 3D" }).click();
await page.waitForURL(/stand\//);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(3000);

// Con una marca puesta se ven también los rótulos de las piezas.
const campoMarca = page.locator("fieldset", { hasText: "La marca del cliente" }).locator("input").first();
if (await campoMarca.count()) {
  await campoMarca.fill("ADIDAS");
  await page.waitForTimeout(600);
}
const paleta = page.locator("fieldset", { hasText: "Agregar pieza" });
const todos = (await paleta.locator("button").allInnerTexts()).map((t) => t.trim());
// Por número de la paleta (0 = la primera): los acentos en los argumentos de la terminal se rompen.
const lista = rotulos.length ? rotulos.map((i) => todos[Number(i)]).filter(Boolean) : todos;
const lienzo = page.locator("canvas").first();

// Se sacan las dos piezas que trae un stand nuevo, para ver cada una sola.
for (let i = 0; i < 3; i++) {
  const sacar = page.getByRole("button", { name: "Sacar" });
  if (!(await sacar.count())) break;
  await sacar.first().click();
  await page.waitForTimeout(200);
}
const fotos = [];
for (const r of lista) {
  await paleta.getByRole("button", { name: r, exact: true }).click();
  await page.waitForTimeout(700);
  const png = await lienzo.screenshot({ type: "jpeg", quality: 70 });
  fotos.push({ r, datos: png.toString("base64") });
  await page.getByRole("button", { name: "Sacar" }).first().click();
  await page.waitForTimeout(200);
}

const hoja = await n.newPage({ viewport: { width: 1600, height: 900 } });
await hoja.setContent(
  `<body style="margin:0;background:#fff;font:14px sans-serif"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:6px">${fotos
    .map((f) => `<figure style="margin:0"><img style="width:100%;display:block" src="data:image/jpeg;base64,${f.datos}"><figcaption style="padding:2px 4px;font-weight:600">${f.r}</figcaption></figure>`)
    .join("")}</div></body>`,
);
await hoja.screenshot({ path: salida, fullPage: true });
console.log(`${fotos.length} piezas → ${salida}`);
if (errores.length) console.log(errores.join("\n"));
await n.close();
