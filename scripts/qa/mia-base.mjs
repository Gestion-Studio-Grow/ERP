// Piezas del recorrido de MIA contra la demo local: entrar con un rol y leer una pantalla en pocas líneas.
import { createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

export const BASE = process.env.MIA_URL ?? "http://mia-producciones.localhost:3218";
const CLAVE = process.env.MIA_DEMO_PASSWORD ?? "mia-demo-2026";

/** Con `PW_CHROMIUM` (p. ej. /opt/pw-browsers/chromium en la nube), usa ese navegador en vez del que trae Playwright. */
export async function abrir() {
  const navegador = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  return navegador;
}

/** Una sesión por rol, con los errores del navegador y del servidor a la vista. */
export async function entrar(navegador, rol, errores = []) {
  const sesion = path.join(tmpdir(), `mia-demo-sesion-${rol}.json`);
  const contexto = await navegador.newContext({ baseURL: BASE, acceptDownloads: true, viewport: { width: 1280, height: 900 }, ...(existsSync(sesion) ? { storageState: sesion } : {}) });
  const page = await contexto.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => /Transition was skipped/.test(e.message) || errores.push(`[${rol}] error de página: ${e.message.slice(0, 160)}`));
  page.on("response", (r) => {
    if (r.status() >= 500 && r.url().startsWith(BASE)) errores.push(`[${rol}] ${r.status()} ${r.url().replace(BASE, "").slice(0, 100)}`);
  });
  page.on("dialog", (d) => d.accept());
  await page.goto("/admin/proyectos/inicio");
  if (!page.url().includes("/login")) {
    if (page.url().includes("cambiar-password")) await cambiarClave(page, rol);
    return page;
  }
  // La clave cambiada en esta demo y, si la demo se reinició (base nueva), la de la siembra.
  for (const clave of [...new Set([leerClaves()[rol], CLAVE].filter(Boolean))]) {
    await page.goto("/admin/login");
    // Por id: el renglón de ingreso del negocio no tiene placeholder (los dos formularios comparten #login-email y #login-password).
    await page.locator("#login-email").fill(`${rol}@mia-producciones.demo`);
    await page.locator("#login-password").fill(clave);
    await page.keyboard.press("Enter");
    await page.waitForURL((u) => !u.pathname.endsWith("/login") || u.search.includes("error")).catch(() => {});
    if (!enElIngreso(page)) break;
  }
  if (enElIngreso(page)) throw new Error(`No se pudo entrar como ${rol}: reiniciá la demo.`);
  if (page.url().includes("segundo-paso")) await segundoPaso(page, rol);
  if (page.url().includes("cambiar-password")) await cambiarClave(page, rol);
  await contexto.storageState({ path: sesion });
  return page;
}

/** Todavía en la hoja de ingreso (el segundo paso vive en /admin/login/segundo-paso y ya es otra cosa). */
const enElIngreso = (page) => new URL(page.url()).pathname === "/admin/login";

// La siembra deja la clave como provisoria (cambio obligatorio al primer ingreso): se cambia una vez y se recuerda.
const CLAVES = path.join(tmpdir(), "mia-demo-claves.json");
const leerClaves = () => (existsSync(CLAVES) ? JSON.parse(readFileSync(CLAVES, "utf8")) : {});

async function cambiarClave(page, rol) {
  const actual = leerClaves()[rol] ?? CLAVE;
  const nueva = `${CLAVE}-qa-${Date.now().toString(36)}`;
  await page.locator("#cp-current").fill(actual);
  await page.locator("#cp-new").fill(nueva);
  await page.locator("#cp-confirm").fill(nueva);
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => !u.pathname.includes("cambiar-password"));
  writeFileSync(CLAVES, JSON.stringify({ ...leerClaves(), [rol]: nueva }));
}

// Hace de app del teléfono, independiente del código del producto. Los secretos duran lo que dura la demo: se siembra de nuevo en cada arranque.
const SECRETOS = path.join(tmpdir(), "mia-demo-secretos.json");

function codigo(secreto, salto = 0) {
  const B = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secreto) bits += B.indexOf(c).toString(2).padStart(5, "0");
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + salto));
  const h = createHmac("sha1", Buffer.from(bits.match(/.{8}/g).map((x) => parseInt(x, 2)))).update(c).digest();
  return String((h.readUInt32BE(h[19] & 15) & 0x7fffffff) % 1e6).padStart(6, "0");
}

async function segundoPaso(page, rol) {
  const guardados = existsSync(SECRETOS) ? JSON.parse(readFileSync(SECRETOS, "utf8")) : {};
  const nuevo = await page.locator("[data-secreto]").textContent({ timeout: 1500 }).catch(() => null);
  const secreto = nuevo?.replace(/\s/g, "") ?? guardados[rol];
  if (!secreto) throw new Error(`Sin secreto de doble factor para ${rol}: reiniciá la demo.`);
  writeFileSync(SECRETOS, JSON.stringify({ ...guardados, [rol]: secreto }));
  // Un código no se acepta dos veces: siempre el de la ventana que recién empieza.
  if (!nuevo) await page.waitForTimeout(30000 - (Date.now() % 30000) + 300);
  await page.locator("#codigo").fill(codigo(secreto));
  await page.keyboard.press("Enter");
  const listo = page.getByRole("link", { name: /Ya los guardé|^Entrar$/ });
  await Promise.race([listo.first().waitFor(), page.waitForURL((u) => !u.pathname.includes("segundo-paso"))]);
  if (page.url().includes("segundo-paso")) await listo.first().click();
  await page.waitForURL((u) => !u.pathname.includes("segundo-paso"));
}

export async function texto(page, zona = "main", largo = 1500) {
  return (await page.locator(zona).first().innerText()).replace(/\s*\n+\s*/g, " | ").slice(0, largo);
}

/** Lo que hay en pantalla, resumido: títulos, avisos, campos, botones y enlaces propios. */
export async function resumen(page, zona = "main") {
  return page.evaluate((z) => {
    const raiz = document.querySelector(z) ?? document.body;
    const v = (e) => e.offsetParent !== null || e.tagName === "OPTION";
    const t = (e) => (e.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 50);
    const de = (s) => [...raiz.querySelectorAll(s)].filter(v);
    const u = (a) => [...new Set(a.filter(Boolean))];
    return {
      url: location.pathname + location.search,
      titulos: u(de("h1,h2,h3").map(t)),
      avisos: u(de('[role=alert],[role=status]').map(t)),
      campos: de("input:not([type=hidden]),select,textarea").map((e) => {
        const l = e.getAttribute("aria-label") ?? e.closest("label")?.innerText?.split("\n")[0] ?? e.placeholder ?? e.name;
        return `${e.tagName === "SELECT" ? "sel" : e.type}:${(l ?? "").trim().slice(0, 34)}${e.tagName === "SELECT" ? `[${[...e.options].slice(0, 7).map((o) => o.text.slice(0, 16)).join("|")}]` : ""}`;
      }),
      botones: u(de("button").map((e) => e.getAttribute("aria-label") ?? t(e))),
      enlaces: u(de("a[href^='/']").map((a) => `${t(a)}→${a.getAttribute("href").slice(0, 60)}`)).slice(0, 25),
    };
  }, zona);
}
