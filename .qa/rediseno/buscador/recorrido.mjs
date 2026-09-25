import { chromium } from "/home/user/erp/node_modules/playwright/index.mjs";
const D = "/home/user/erp/.qa/rediseno/buscador/fotos/";
const [neg, email, ancho, ...qs] = process.argv.slice(2);
const movil = ancho !== "1440";
const base = `http://${neg}.localhost:3210`;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext(movil ? { viewport: { width: Number(ancho), height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errores = [];
p.on("console", (m) => { if (m.type() === "error") errores.push(m.text().slice(0, 200)); });
p.on("pageerror", (e) => errores.push("pageerror " + String(e).slice(0, 200)));
await p.goto(base + "/admin/login");
await p.fill("input[name=email]", email);
await p.fill("input[name=password]", (process.env.LAB_CLAVE_COMUN ?? ""));
await Promise.all([p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 90000 }), p.click("button[type=submit]")]);
await p.waitForLoadState("networkidle").catch(() => {});
const quien = email.split("@")[0];
for (const q0 of qs) {
  const ir = q0.startsWith("ENTER:");
  const q = ir ? q0.slice(6) : q0;
  if (movil) await p.locator('header button[aria-label="Buscar: ¿qué querés hacer?"]:visible, button[aria-label="Buscar: ¿qué querés hacer?"]:visible').first().click();
  else await p.keyboard.press("Control+k");
  await p.waitForTimeout(500);
  const inp = p.locator("dialog[open] input").first();
  await inp.fill(q);
  await p.waitForTimeout(2500);
  const txt = await p.evaluate(() => { const d = document.querySelector("dialog[open]"); return d ? d.innerText.replace(/\s+/g, " ").slice(0, 600) : "SIN DIALOGO"; });
  const scroll = await p.evaluate(() => { const d = document.querySelector("dialog[open]"); return d ? d.scrollWidth > d.clientWidth + 1 : null; });
  const alto = await p.evaluate(() => [...document.querySelectorAll('dialog[open] [role=option]')].map((o) => Math.round(o.getBoundingClientRect().height)));
  console.log(`Q «${q}» => ${txt}\n   scrollHorizontal=${scroll} altosOpciones=${JSON.stringify(alto)}`);
  await p.screenshot({ path: `${D}${neg}_${quien}_${ancho}_${q.replace(/[^\p{L}\p{N}]+/gu, "_")}.png` });
  if (ir) {
    await p.keyboard.press("ArrowDown").catch(() => {});
    const antes = p.url();
    // El primer registro: la última capa. Se hace clic en el primer renglón de Clientes/Productos/Pedidos.
    const op = p.locator('dialog[open] [role=group]').last().locator('[role=option]').first();
    await op.click();
    await p.waitForURL((u) => u.toString() !== antes, { timeout: 30000 }).catch(() => {});
    await p.waitForLoadState("networkidle").catch(() => {});
    console.log(`   ENTER → ${p.url()} · título: ${(await p.locator("h1").first().innerText().catch(() => "?")).slice(0, 80)}`);
    await p.screenshot({ path: `${D}${neg}_${quien}_${ancho}_${q.replace(/[^\p{L}\p{N}]+/gu, "_")}_abierto.png` });
    await p.goto(base + "/admin").catch(() => {});
    await p.waitForLoadState("networkidle").catch(() => {});
  } else {
    await p.keyboard.press("Escape");
    await p.waitForTimeout(300);
  }
}
console.log("ERRORES DE CONSOLA:", errores.length ? errores : "ninguno");
await b.close();
// Falla ante cualquier error de consola (sin filtros).
process.exitCode = errores.length ? 1 : 0;
