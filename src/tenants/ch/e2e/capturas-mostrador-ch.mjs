// Capturas del mostrador de CH (antes/después del mostrador único) en 390, 1024×768 y 1366×768, claro
// y oscuro, con la dueña: abre «Cobrar en el mostrador», suma un producto de reventa, elige Efectivo y
// mide si el total y «Cobrar» se ven sin desplazar. Base LOCAL efímera (entorno-ch.mjs), nunca Neon.
// Uso: node --import tsx src/tenants/ch/e2e/capturas-mostrador-ch.mjs <carpeta> [--nuevo]
//   --nuevo: con «Diseño nuevo» prendido (el mostrador va en el cajón).
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { levantarEntornoCH, CLAVE_DE_PRUEBA } from "./entorno-ch.mjs";
import { prepararMostradorCH } from "./preparar-mostrador-ch.mjs";

const OUT = process.argv[2];
if (!OUT) throw new Error("Uso: capturas-mostrador-ch.mjs <carpeta> [--nuevo]");
const NUEVO = process.argv.includes("--nuevo");
await mkdir(OUT, { recursive: true });
const TAMANIOS = [
  ["cel", 390, 844],
  ["tablet-h", 1024, 768],
  ["term-1366", 1366, 768],
];
const e = await levantarEntornoCH();
const medidas = [];
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" });
try {
  await prepararMostradorCH(e, { nuevo: NUEVO });
  for (const esquema of ["light", "dark"]) {
    for (const [nombre, w, h] of TAMANIOS) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: esquema, locale: "es-AR" });
      await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
      const p = await ctx.newPage();
      await p.goto(`${e.url}/admin/login`);
      await p.fill('input[name="email"]', e.base.a.duenia.email);
      await p.fill('input[name="password"]', CLAVE_DE_PRUEBA);
      await p.locator('button[type="submit"]').first().click();
      await p.waitForURL((u) => !u.pathname.startsWith("/admin/login"));
      await p.goto(`${e.url}/admin/pedidos`);
      await p.waitForLoadState("networkidle").catch(() => {});
      const abrir = p.getByRole("button", { name: "Cobrar en el mostrador" });
      if (await abrir.count()) await abrir.click();
      const raiz = p.locator('dialog[open], main').first();
      const productos = raiz.getByRole("tab", { name: /Productos/ });
      if (await productos.count()) await productos.click();
      const buscar = raiz.locator('#vender-buscar, input[role="combobox"]').last();
      let agregado = false;
      if (await buscar.count()) {
        await buscar.click();
        await buscar.fill("sér");
        agregado = await p.getByRole("option", { name: /Sérum/ }).first().waitFor({ timeout: 5000 }).then(() => true, () => false);
        if (agregado) {
          await buscar.press("Enter");
          await raiz.locator('input[id^="qty-"]:not([disabled])').last().fill("1").catch(() => {});
        }
      }
      const efectivo = raiz.getByRole("radio", { name: "Efectivo" }).first();
      if (await efectivo.count()) await efectivo.click().catch(() => {});
      else await raiz.getByRole("button", { name: "Efectivo" }).first().click().catch(() => {});
      await p.waitForTimeout(300);
      await p.evaluate(() => window.scrollTo(0, 0));
      // El «Cobrar» del formulario del mostrador (la bandeja tiene uno por pedido).
      const form = (await buscar.count()) ? buscar.locator("xpath=ancestor::form[1]") : raiz;
      const cobrar = form.getByRole("button", { name: /^Cobrar/ }).last();
      const caja = (await cobrar.count()) ? await cobrar.boundingBox() : null;
      const sobra = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      medidas.push({ esquema, nombre, w, h, agregado, cobrarVisibleSinScroll: !!caja && caja.y >= 0 && caja.y + caja.height <= h, desbordeHorizontal: sobra });
      await p.screenshot({ path: `${OUT}/${nombre}-${esquema}.png` });
      await ctx.close();
    }
  }
} finally {
  await b.close();
  await e.cerrar();
}
await writeFile(`${OUT}/medidas.json`, JSON.stringify(medidas, null, 1));
console.table(medidas);
