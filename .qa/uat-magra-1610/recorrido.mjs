// Recorrido UAT MAGRA 16/10 contra el laboratorio local (:3224, base erp_lab_uatmagra).
// Uso: CLAVE_LAB=... node .qa/uat-magra-1610/recorrido.mjs   (desde la worktree)
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = (n) => `http://${n}.localhost:3224`;
const OUT = new URL("./", import.meta.url).pathname;
const CLAVE = process.env.CLAVE_LAB;
const res = [];
const ok = (paso, cond, det = "") => { res.push({ paso, ok: !!cond, det }); console.log(`${cond ? "OK " : "MAL"} ${paso} ${det}`); };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function pagina(ancho) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: ancho < 600 ? 844 : 900 }, locale: "es-AR" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  return { ctx, page, errores };
}
async function entrar(page, negocio) {
  await page.goto(`${BASE(negocio)}/admin/login`);
  await page.fill('input[name="email"]', "gsg@gsg.lab");
  await page.fill('input[name="password"]', CLAVE);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 60000 });
}

try {
  // ── A. Tienda a 390 px ──
  {
    const { ctx, page, errores } = await pagina(390);
    await page.goto(`${BASE("magra")}/tienda`, { timeout: 120000 });
    const mas = page.locator(".mf-grid button[aria-label^='Agregar']").first();
    await mas.waitFor({ timeout: 60000 });
    const nombre = (await mas.getAttribute("aria-label")).replace("Agregar ", "");
    await mas.click();
    const q = await page.locator(".mf-grid .mf-pcard.on .mf-q").first().innerText();
    ok("A1 grilla con unidad y coma", /^\d+(,\d+)? (kg|u)$/.test(q.trim()), `«${q.trim()}» (${nombre})`);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(400);
    const b = await page.locator(".mf-minibar").boundingBox();
    const w = await page.locator(".mf-rail-wa").boundingBox();
    ok("A2 la mini-barra no tapa «Pedir por WhatsApp»", b && w && w.y + w.height <= b.y, `botón termina ${Math.round(w.y + w.height)} · barra empieza ${Math.round(b.y)} · alto barra ${Math.round(b.height)}`);
    await page.screenshot({ path: `${OUT}a-tienda-390-final.png` });
    const est = await page.locator("#pedido").getByText("Total estimado", { exact: true }).count();
    const nota = await page.locator("#pedido .mf-nota-peso").count();
    ok("A3 total estimado + aclaración (si el corte es por kilo)", q.includes("kg") ? est === 1 && nota === 1 : est === 0, `estimado=${est} nota=${nota}`);
    // Teléfono inválido → mensaje claro, sin pedido.
    await page.fill('input[name="customerName"]', "Clienta UAT");
    await page.fill('input[name="customerPhone"]', "hola");
    await page.selectOption('select[name="fulfillment"]', "PICKUP");
    await page.locator(".mf-rail-submit").click();
    const err = page.getByText("Revisá tu WhatsApp: escribí el número con la característica");
    await err.waitFor({ timeout: 30000 }).catch(() => {});
    ok("A4 teléfono «hola» rechazado con texto claro", (await err.count()) === 1);
    await page.screenshot({ path: `${OUT}a-tienda-390-telefono.png` });
    ok("A5 sin errores de consola en la tienda", errores.length === 0, errores.join(" | ").slice(0, 300));
    await ctx.close();
  }
  // ── B. Tienda a 1440 px ──
  {
    const { ctx, page, errores } = await pagina(1440);
    await page.goto(`${BASE("magra")}/tienda`);
    await page.locator(".mf-grid button[aria-label^='Agregar']").first().click();
    await page.locator("#pedido").scrollIntoViewIfNeeded();
    ok("B1 1440: sin mini-barra", !(await page.locator(".mf-minibar").isVisible()));
    await page.screenshot({ path: `${OUT}b-tienda-1440.png` });
    ok("B2 sin errores de consola", errores.length === 0, errores.join(" | ").slice(0, 300));
    await ctx.close();
  }
  // ── C. Bandeja de MAGRA: pedido nuevo de la tienda con la bandeja abierta ──
  for (const ancho of [1440, 390]) {
    const { ctx, page, errores } = await pagina(ancho);
    await entrar(page, "magra");
    await page.goto(`${BASE("magra")}/admin/pedidos`);
    await page.getByRole("button", { name: /Sonido del aviso/ }).waitFor({ timeout: 60000 });
    ok(`C1 ${ancho}: la bandeja de MAGRA tiene el aviso`, true);
    // Una clienta pide desde la tienda (otra pestaña, sin sesión).
    const t = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const tp = await t.newPage();
    await tp.goto(`${BASE("magra")}/tienda`);
    await tp.locator(".mf-grid button[aria-label^='Agregar']").first().click();
    await tp.fill('input[name="customerName"]', `Clienta UAT ${ancho}`);
    await tp.fill('input[name="customerPhone"]', "11 2345 6789");
    await tp.selectOption('select[name="fulfillment"]', "PICKUP");
    await tp.locator(".mf-rail-submit").click();
    await tp.waitForURL(/\/tienda\/gracias/, { timeout: 60000 });
    const codigo = new URL(tp.url()).searchParams.get("pedido");
    ok(`C2 ${ancho}: pedido web tomado`, !!codigo, `#${codigo}`);
    await t.close();
    const t0 = Date.now();
    const aviso = page.getByRole("status").getByText(`Entró un pedido nuevo de la tienda: #${codigo}`);
    await aviso.waitFor({ timeout: 75000 }).catch(() => {});
    ok(`C3 ${ancho}: la bandeja abierta avisa el pedido nuevo`, (await aviso.count()) === 1, `en ${Math.round((Date.now() - t0) / 1000)} s`);
    await page.screenshot({ path: `${OUT}c-bandeja-${ancho}-aviso.png` });
    ok(`C4 ${ancho}: sin errores de consola`, errores.length === 0, errores.join(" | ").slice(0, 300));
    await ctx.close();
  }
  // ── D. Vender: peso implausible y teclado grande ──
  for (const ancho of [390, 1440]) {
    const { ctx, page, errores } = await pagina(ancho);
    await entrar(page, "magra");
    await page.goto(`${BASE("magra")}/admin/vender`);
    // Diseño nuevo: «Buscá un corte…» (#vender-buscar); vista de siempre: el combo del renglón.
    const buscar = page.locator('#vender-buscar, input[role="combobox"][id^="prod-"]').first();
    await buscar.waitFor({ timeout: 60000 });
    await buscar.click();
    await buscar.fill("vac");
    await page.getByRole("option", { name: /Vac/ }).first().click();
    const qty = page.locator('input[id^="qty-"]:not([disabled])').first();
    await qty.waitFor();
    await qty.fill("1500");
    const preg = page.getByRole("alert").filter({ hasText: "¿Son 1.500 kg de verdad?" });
    await preg.waitFor({ timeout: 20000 }).catch(() => {});
    ok(`D1 ${ancho}: «1500» pregunta antes de cobrar`, (await preg.count()) === 1);
    const frenado = page.getByRole("button", { name: /^Confirmá el peso de/ }).first();
    ok(`D2 ${ancho}: el cobro queda frenado y dice qué falta`, (await frenado.count()) > 0 && (await frenado.isDisabled()));
    await page.screenshot({ path: `${OUT}d-vender-${ancho}-1500.png` });
    await page.getByRole("button", { name: "No, es 1,5 kg" }).click();
    ok(`D3 ${ancho}: corregir deja 1,5`, (await qty.inputValue()) === "1,5");
    await page.getByRole("button", { name: "Teclado grande" }).first().click();
    const tecl = page.locator('[data-ui="teclado"]').first();
    await tecl.waitFor();
    await tecl.getByRole("button", { name: "borrar", exact: false }).first().click({ delay: 700 }).catch(() => {});
    for (const d of ["1", "2", "8", "0"]) await tecl.getByRole("button", { name: d, exact: true }).click();
    ok(`D4 ${ancho}: el teclado grande carga 1,28`, (await qty.inputValue()) === "1,28", `valor «${await qty.inputValue()}»`);
    await page.screenshot({ path: `${OUT}d-vender-${ancho}-teclado.png`, fullPage: ancho < 600 });
    ok(`D5 ${ancho}: sin errores de consola`, errores.length === 0, errores.join(" | ").slice(0, 300));
    await ctx.close();
  }
  // ── E. CH: la bandeja queda como estaba (sin aviso) ──
  {
    const { ctx, page, errores } = await pagina(1440);
    await entrar(page, "chestetica");
    await page.goto(`${BASE("chestetica")}/admin/pedidos`);
    await page.waitForLoadState("networkidle");
    ok("E1 CH: su bandeja no monta el aviso", (await page.locator('[data-ui="aviso-pedidos-nuevos"]').count()) === 0);
    await page.screenshot({ path: `${OUT}e-ch-bandeja-1440.png` });
    ok("E2 CH: sin errores de consola", errores.length === 0, errores.join(" | ").slice(0, 300));
    await ctx.close();
  }
} catch (e) {
  ok("recorrido sin cortarse", false, String(e).slice(0, 400));
} finally {
  await browser.close();
  const pasa = res.filter((r) => r.ok).length;
  writeFileSync(`${OUT}resultado.txt`, `${pasa}/${res.length} pasos OK (${new Date().toISOString()})\n` + res.map((r) => `${r.ok ? "OK " : "MAL"} ${r.paso} ${r.det}`).join("\n") + "\n");
  console.log(`${pasa}/${res.length}`);
}
