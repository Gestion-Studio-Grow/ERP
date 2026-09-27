// QA 1b · En la ficha del negocio (consola del operador): la puesta en marcha del súper y el
// interruptor «Trabaja por apps» (sin él, la barra de siempre no tiene la caja con lector ni Ofertas).
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3254";
const OUT = process.argv[3] ?? "./out";
const pasos = [];
const errores = [];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on("console", (m) => { if (m.type() === "error") errores.push(m.text().slice(0, 300)); });
page.on("pageerror", (e) => errores.push(String(e).slice(0, 300)));
const paso = (t) => { pasos.push(t); console.log("·", t); };
try {
  await page.goto(`${BASE}/operador/login`);
  await page.fill('input[name="password"]', process.env.OPERATOR_PASSWORD ?? "");
  await Promise.all([page.waitForURL(/\/operador(?!\/login)/), page.click('button[type="submit"]')]);
  await page.goto(`${BASE}/operador?q=super-la-esquina`);
  await page.click('a[href*="/operador/tenants/"]:has-text("Supermercado La Esquina")');
  await page.waitForURL(/\/operador\/tenants\//);
  const ficha = page.url().split("?")[0];
  await page.goto(`${ficha}?pestana=puesta`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${OUT}/01b-puesta-en-marcha.png`, fullPage: true });
  paso("ficha del súper: puesta en marcha");
  await page.goto(`${ficha}?pestana=plan`);
  // Como en cualquier alta: primero se fija la asignación (suma Campañas y Bancos) para que el
  // Inicio por apps no le saque ninguna app del menú de siempre; después se prende.
  const previa = await page.locator('[id="interruptor-inicio-por-apps-previa"]').textContent();
  if (/Perdería/.test(previa)) {
    paso(`antes de fijar: «${previa.trim()}»`);
    await page.getByRole("button", { name: "Fijar", exact: true }).click();
    await page.waitForFunction(() => !/Perdería/.test(document.getElementById("interruptor-inicio-por-apps-previa")?.textContent ?? "Perdería"), null, { timeout: 20000 });
    paso("asignación fijada: " + (await page.locator('[id="interruptor-inicio-por-apps-previa"]').textContent()).trim());
  }
  const boton = page.getByRole("button", { name: "Prender «Trabaja por apps»" });
  await boton.waitFor({ timeout: 15000 });
  await boton.click();
  await page.getByRole("button", { name: "Apagar «Trabaja por apps»" }).waitFor({ timeout: 20000 });
  await page.screenshot({ path: `${OUT}/01b-por-apps-prendido.png` });
  paso("interruptor «Trabaja por apps» prendido desde la consola");
} catch (e) {
  errores.push("FALLA: " + (e?.message ?? String(e)));
  await page.screenshot({ path: `${OUT}/01b-falla.png` }).catch(() => {});
} finally {
  await browser.close();
}
fs.writeFileSync(`${OUT}/01b-por-apps.json`, JSON.stringify({ pasos, errores }, null, 2));
console.log(JSON.stringify({ pasos, errores }, null, 2));
process.exit(errores.length ? 1 : 0);
