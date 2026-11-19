// MIA-194 · punto 5 (hallazgo T11 de MIA-193): «Vence el» de Cuentas (administracion/_cuentas.tsx:381) sin anillo de foco.
// Se reproduce volviendo con Shift+Tab: Chromium deja el foco en una subparte del campo de fecha y el campo no cuenta
// como :focus-visible, así que la regla general de globals.css no lo pinta. La prueba carga el bloque de foco REAL de
// globals.css en un Chromium sin red y recorre el formulario con el teclado en los dos sentidos.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";

const css = readFileSync(fileURLToPath(new URL("./globals.css", import.meta.url)), "utf8");
// El bloque «Foco visible en color de marca»: desde su comentario hasta la llave que cierra la regla.
const inicio = css.indexOf("/* Foco visible en color de marca");
const bloqueFoco = css.slice(inicio, css.indexOf("}", inicio) + 1).replace(/var\(--focus-ring\)/g, "rgb(0, 113, 227)");

const FORMULARIO = `<!doctype html><style>${bloqueFoco}</style>
<form>
  <label>Concepto<input name="concepto"></label>
  <label>Vence el<input name="venceEl" type="date"></label>
  <label>Monto<input name="monto" inputmode="decimal"></label>
</form>`;

/** Igual que en deslizar-tactil.test.ts: el Chromium de Playwright o, si no está, el instalado en /opt/pw-browsers. */
function rutaDeChromium(): string | null {
  try {
    const p = chromium.executablePath();
    if (existsSync(p)) return p;
  } catch {
    // sin navegador registrado: se busca abajo
  }
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  if (!existsSync(dir)) return null;
  for (const n of readdirSync(dir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
    for (const sub of ["chrome-linux64", "chrome-linux"]) {
      const p = join(dir, n, sub, "chrome");
      if (existsSync(p)) return p;
    }
  }
  return null;
}

let navegador: Browser | undefined;
const chrome = rutaDeChromium();
before(async () => {
  if (chrome) navegador = await chromium.launch({ executablePath: chrome });
});
after(async () => {
  await navegador?.close();
});

const anillo = (e: Element, sel: string) => ({ activo: e === document.activeElement, outline: getComputedStyle(e).outlineStyle, sel });

test("el bloque de foco de globals.css está donde la prueba lo busca", () => {
  assert.ok(inicio >= 0 && bloqueFoco.includes("outline: 2px solid"), "no encontré el bloque de foco en globals.css");
});

test("«Vence el» muestra el anillo entrando con Tab, con Shift+Tab y con clic", async (t) => {
  if (!navegador) return t.skip("no hay un Chromium instalado");
  const p = await navegador.newPage();
  try {
    await p.setContent(FORMULARIO);
    const vence = p.locator("input[name=venceEl]");

    await p.locator("input[name=concepto]").click();
    await p.keyboard.press("Tab");
    assert.deepEqual(await vence.evaluate(anillo, "tab"), { activo: true, outline: "solid", sel: "tab" });

    await p.locator("input[name=monto]").click();
    await p.keyboard.press("Shift+Tab");
    assert.deepEqual(await vence.evaluate(anillo, "shift+tab"), { activo: true, outline: "solid", sel: "shift+tab" });

    await vence.click({ position: { x: 8, y: 8 } });
    assert.deepEqual(await vence.evaluate(anillo, "clic"), { activo: true, outline: "solid", sel: "clic" });
  } finally {
    await p.close();
  }
});
