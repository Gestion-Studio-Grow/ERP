// Utilidades del recorrido: reloj (servidor + navegador), contextos por persona, login.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { AQUI, CLAVE_DE_PRUEBA } from "./entorno-dev.mjs";

export const RELOJ = path.join(AQUI, ".reloj");
let desfase = 0;
/** Pone el reloj del servidor y de los navegadores en `fecha` (Date). */
export function ponerReloj(fecha) {
  desfase = fecha.getTime() - Date.now();
  writeFileSync(RELOJ, String(desfase));
  return desfase;
}
export const desfaseActual = () => desfase;

export async function abrirNavegador() {
  return chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" });
}

const SCRIPT_RELOJ = `(() => {
  const m = document.cookie.match(/(?:^|; )__reloj=(-?\\d+)/); const d = m ? Number(m[1]) : 0; if (!d) return;
  const Real = Date;
  function Falso(...a) { if (!new.target) return new Real(Real.now() + d).toString(); return a.length === 0 ? new Real(Real.now() + d) : new Real(...a); }
  Falso.prototype = Real.prototype; Falso.now = () => Real.now() + d; Falso.UTC = Real.UTC; Falso.parse = Real.parse;
  window.Date = Falso;
})();`;

export async function contexto(b, url, ancho) {
  const alto = ancho <= 400 ? 844 : 900;
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires", hasTouch: ancho < 800, isMobile: ancho < 800 });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.addInitScript(SCRIPT_RELOJ);
  await sincronizarReloj(ctx, url);
  return ctx;
}
export async function sincronizarReloj(ctx, url) {
  await ctx.addCookies([{ name: "__reloj", value: String(Math.round(desfase)), url }]);
}

export async function ingresar(p, url, email, { destino } = {}) {
  await p.goto(`${url}/admin/login`, { waitUntil: "domcontentloaded" });
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', CLAVE_DE_PRUEBA);
  await p.locator('button[type="submit"]').first().click();
  await p.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 60000 });
  if (destino) await ir(p, url, destino);
}
export const reintentos404 = [];
export async function ir(p, url, ruta) {
  for (let i = 0; ; i++) {
    const r = await p.goto(`${url}${ruta}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    // `next dev` a veces contesta 404 a una ruta anidada que todavía no compiló: se reintenta y se anota.
    if (r?.status() !== 404 || i >= 4) return;
    reintentos404.push(ruta);
    await p.waitForTimeout(2500);
  }
}
