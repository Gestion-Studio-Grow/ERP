// Compuerta final: recorrido real contra el server del laboratorio.
// Uso: node recorrido.mjs <host> <email> <rutas separadas por coma> <etiqueta>
import { chromium } from '/home/user/erp/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const [host, email, rutasCsv, etiqueta] = process.argv.slice(2);
const BASE = `http://${host}.localhost:3210`;
const OUT = '/home/user/erp/.qa/rediseno/compuerta-final';
const rutas = rutasCsv.split(',');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const informe = [];
for (const vp of [{ w: 390, h: 844, dpr: 2 }, { w: 1440, h: 900, dpr: 1 }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr });
  const page = await ctx.newPage();
  const errores = [];
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errores.push('pageerror: ' + String(e).slice(0, 200)));
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('#login-email', email);
  await page.fill('#login-password', (process.env.LAB_CLAVE_COMUN ?? ''));
  await Promise.all([page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 120000 }).catch(() => {}), page.keyboard.press('Enter')]);
  await page.waitForLoadState('networkidle').catch(() => {});
  for (const ruta of rutas) {
    const e0 = errores.length;
    let status = 0;
    try {
      const r = await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle', timeout: 120000 });
      status = r ? r.status() : 0;
    } catch (e) { status = -1; }
    const m = await page.evaluate(() => {
      const vw = window.innerWidth;
      const botones = [...document.querySelectorAll('a,button,[role=button],input,select')].filter((b) => {
        const r = b.getBoundingClientRect(); const s = getComputedStyle(b);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden';
      });
      const chicos = botones.filter((b) => { const r = b.getBoundingClientRect(); return r.height < 44 && r.width < 44 * 4 && b.tagName !== 'INPUT'; }).length;
      const h1 = document.querySelector('h1')?.textContent?.trim() ?? '';
      const renglon = !!document.querySelector('[data-diseno="renglon"],[data-piel="renglon"],.renglon,[class*="renglon"]');
      const texto = document.querySelector('main')?.innerText?.slice(0, 600) ?? document.body.innerText.slice(0, 600);
      const links=[...new Set([...document.querySelectorAll('a[href^="/admin"]')].map(a=>a.getAttribute('href')))];
      return { links, scrollW: document.documentElement.scrollWidth, vw, alto: document.documentElement.scrollHeight, chicos, total: botones.length, h1, renglon, texto, url: location.pathname };
    });
    const nombre = `${etiqueta}-${vp.w}-${ruta.replace(/[\/?=&]/g, '_')}.png`;
    await page.screenshot({ path: `${OUT}/${nombre}`, fullPage: vp.w === 390 ? false : false });
    informe.push({ vp: vp.w, ruta, status, ...m, errores: errores.slice(e0), foto: nombre });
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/${etiqueta}.json`, JSON.stringify(informe, null, 1));
for (const i of informe) console.log(i.vp, i.ruta, '->', i.url, i.status, 'h1=', i.h1.slice(0, 40), 'hscroll=', i.scrollW > i.vw, 'chicos=', i.chicos + '/' + i.total, 'alto=', i.alto, 'err=', i.errores.length);
