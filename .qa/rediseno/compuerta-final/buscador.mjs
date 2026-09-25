// Compuerta final: ¿el buscador encuentra registros? Ctrl+K en 1440 y la lupa en 390.
import { chromium } from '/home/user/erp/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const [host, email, terminosCsv, etiqueta] = process.argv.slice(2);
const BASE = `http://${host}.localhost:3210`;
const OUT = '/home/user/erp/.qa/rediseno/compuerta-final';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const res = [];
for (const vp of [{ w: 1440, h: 900, dpr: 1 }, { w: 390, h: 844, dpr: 2 }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr });
  const page = await ctx.newPage();
  const errores = [];
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text().slice(0, 200)); });
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('#login-email', email);
  await page.fill('#login-password', (process.env.LAB_CLAVE_COMUN ?? ''));
  await Promise.all([page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 120000 }).catch(() => {}), page.keyboard.press('Enter')]);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.goto(`${BASE}/admin/clientes`, { waitUntil: 'networkidle' });
  for (const t of terminosCsv.split(',')) {
    if (vp.w === 1440) { await page.keyboard.press('Control+k'); }
    else {
      const lupa = page.getByRole('button', { name: /buscar|qué querés/i }).first();
      await lupa.click({ timeout: 10000 }).catch((e) => errores.push('sin lupa: ' + e.message.slice(0, 80)));
    }
    await page.waitForTimeout(800);
    const input = page.locator('[role=dialog] input, [role=combobox]').first();
    await page.keyboard.type(t, { delay: 60 });
    await page.waitForTimeout(2500);
    const opciones = await page.locator('[role=option]').allInnerTexts().catch(() => []);
    const dialogo = await page.evaluate(() => { const i = document.activeElement; let n = i; for (let k = 0; k < 6 && n && n.parentElement; k++) n = n.parentElement; return (n?.innerText ?? '') + ' ||focus=' + (i?.tagName ?? '') + ':' + (i?.value ?? ''); });
    await page.screenshot({ path: `${OUT}/${etiqueta}-buscar-${vp.w}-${t}.png` });
    res.push({ vp: vp.w, t, opciones: opciones.map((o) => o.replace(/\s+/g, ' ').slice(0, 80)), dialogo: dialogo.replace(/\s+/g, ' ').slice(0, 300) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  res.push({ vp: vp.w, errores });
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/${etiqueta}-buscador.json`, JSON.stringify(res, null, 1));
for (const r of res) console.log(JSON.stringify(r).slice(0, 400));
