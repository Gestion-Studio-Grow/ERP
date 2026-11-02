// Abre el editor de stands, agrega piezas por número de la paleta y saca una captura de la pantalla entera.
//   node scripts/qa/mia-stand-captura.mjs <salida.png> [ancho] [números de pieza …]
import { abrir, entrar } from "./mia-base.mjs";

const [salida, ancho = "1280", ...piezas] = process.argv.slice(2);
if (!salida) throw new Error("Falta la ruta de salida.");
const n = await abrir();
const errores = [];
const page = await entrar(n, "admin", errores);
await page.setViewportSize({ width: Number(ancho), height: 900 });
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
const paleta = page.locator("fieldset", { hasText: "Agregar pieza" });
const botones = paleta.locator("button");
const rotulos = (await botones.allInnerTexts()).map((t) => t.trim());
for (const i of piezas) {
  await botones.nth(Number(i)).click();
  await page.waitForTimeout(400);
}
await page.waitForTimeout(800);
// CAPTURA=vista: sólo lo que se ve tras bajar por el panel (para comprobar que el visor sigue a la vista); si no, la página entera.
if (process.env.CAPTURA === "vista") {
  await page.mouse.wheel(0, 1100);
  await page.waitForTimeout(600);
  await page.screenshot({ path: salida });
} else await page.screenshot({ path: salida, fullPage: true });
const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
console.log(`desborde horizontal: ${sobra > 0 ? `${sobra}px (REVISAR)` : "ninguno"}`);
if (sobra > 0) {
  const culpables = await page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && e.getBoundingClientRect().width > 0)
      .slice(0, 8)
      .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 70)} → ${Math.round(e.getBoundingClientRect().right)}px · «${(e.textContent ?? "").trim().slice(0, 30)}»`),
  );
  console.log(`elementos que pasan el borde:\n${culpables.join("\n")}`);
}
console.log(`paleta: ${rotulos.join(" | ")}`);
console.log(`captura → ${salida}`);
if (errores.length) console.log(errores.join("\n"));
await n.close();
