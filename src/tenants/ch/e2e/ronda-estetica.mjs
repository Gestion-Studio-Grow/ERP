// Recorrido de ronda del vertical estética (CH): 38 pantallas a 390 y 1440, base LOCAL efímera, nunca Neon.
// Mide desborde, toques < 44 px, controles sin nombre, imágenes sin alt, letra < 12 px y errores de consola.
// Uso: node --import tsx src/tenants/ch/e2e/ronda-estetica.mjs <carpeta fuera del repo>   (capturas + medidas.json)
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { levantarEntornoCH, CLAVE_DE_PRUEBA } = await import("./entorno-ch-dev.mjs");

const OUT = process.argv[2];
await mkdir(OUT, { recursive: true });
const PUBLICAS = ["/", "/servicios", "/reserva"];
const ADMIN = [
  "/admin", "/admin/turnos", "/admin/turnos/lista", "/admin/turnos/manana", "/admin/clientes", "/admin/catalogo",
  "/admin/vouchers", "/admin/recordatorios", "/admin/caja", "/admin/vender", "/admin/reportes", "/admin/resenas",
  "/admin/promociones", "/admin/ajustes",
];
const TAM = [["cel", 390, 844], ["desk", 1440, 900]];

const auditar = () => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
  };
  const nombre = (el) =>
    (el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || el.getAttribute("placeholder") || el.getAttribute("alt") || "").trim().replace(/\s+/g, " ").slice(0, 50);
  const inter = [...document.querySelectorAll('a[href], button, [role="button"], [role="tab"], select, summary, input:not([type="hidden"])')].filter(visible);
  const chicos = [];
  const sinNombre = [];
  for (const el of inter) {
    const r = el.getBoundingClientRect();
    const esTexto = el.tagName === "A" && getComputedStyle(el).display === "inline";
    if (!esTexto && (r.height < 44 || r.width < 44) && !(el.tagName === "INPUT" && ["checkbox", "radio"].includes(el.type) && el.closest("label")))
      chicos.push(`${el.tagName.toLowerCase()}「${nombre(el)}」${Math.round(r.width)}x${Math.round(r.height)}`);
    let n = nombre(el);
    if (el.tagName === "INPUT" || el.tagName === "SELECT") {
      const lab = (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest("label");
      n = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || (lab && lab.innerText) || "";
    }
    if (!n && !el.querySelector("img[alt]:not([alt=''])") && !el.getAttribute("aria-labelledby"))
      sinNombre.push(`${el.tagName.toLowerCase()}#${el.id || ""}[${el.getAttribute("name") || el.className.toString().slice(0, 30)}]`);
  }
  const imgSinAlt = [...document.querySelectorAll("img:not([alt])")].filter(visible).length;
  const letraChica = [...document.querySelectorAll("body *")].filter(
    (el) => visible(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2) && parseFloat(getComputedStyle(el).fontSize) < 12,
  );
  return {
    desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    h1: document.querySelectorAll("h1").length,
    lang: document.documentElement.lang,
    titulo: document.title,
    chicos: { n: chicos.length, ej: [...new Set(chicos)].slice(0, 8) },
    sinNombre: { n: sinNombre.length, ej: [...new Set(sinNombre)].slice(0, 8) },
    imgSinAlt,
    letraChica: { n: letraChica.length, ej: [...new Set(letraChica.map((e) => `${nombre(e).slice(0, 30)}@${getComputedStyle(e).fontSize}`))].slice(0, 6) },
  };
};

const e = await levantarEntornoCH();
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const filas = [];
try {
  for (const [tam, w, h] of TAM) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const p = await ctx.newPage();
    let errores = [];
    p.on("pageerror", (x) => errores.push(x.message.slice(0, 160)));
    p.on("console", (m) => { if (m.type() === "error" && !/fonts\.|ERR_FAILED|favicon/.test(m.text())) errores.push(m.text().slice(0, 160)); });
    const visitar = async (ruta, etiqueta = ruta) => {
      errores = [];
      const t0 = Date.now();
      const r = await p.goto(e.url + ruta, { waitUntil: "load" }).catch((x) => ({ status: () => `ERR ${x.message.slice(0, 80)}` }));
      await p.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      const ms = Date.now() - t0;
      const a = await p.evaluate(auditar).catch((x) => ({ error: String(x).slice(0, 120) }));
      const archivo = `${tam}${etiqueta.replace(/\//g, "_") || "_inicio"}.png`;
      await p.screenshot({ path: `${OUT}/${archivo}`, fullPage: true }).catch(() => {});
      filas.push({ tam, ruta: etiqueta, estado: r?.status?.(), final: new URL(p.url()).pathname, ms, errores, ...a });
    };
    for (const ruta of PUBLICAS) await visitar(ruta);
    // El modal de reserva de la vidriera.
    await p.goto(e.url + "/", { waitUntil: "load" });
    const reservar = p.getByRole("button", { name: /reserv/i }).first();
    if (await reservar.count()) {
      await reservar.click().catch(() => {});
      await p.waitForTimeout(800);
      const a = await p.evaluate(auditar).catch((x) => ({ error: String(x) }));
      await p.screenshot({ path: `${OUT}/${tam}_modal-reserva.png` });
      filas.push({ tam, ruta: "modal-reserva", errores, ...a });
    }
    await p.goto(`${e.url}/admin/login`);
    filas.push({ tam, ruta: "/admin/login", errores, ...(await p.evaluate(auditar)) });
    await p.screenshot({ path: `${OUT}/${tam}_admin_login.png` });
    await p.fill('input[name="email"]', e.base.a.duenia.email);
    await p.fill('input[name="password"]', CLAVE_DE_PRUEBA);
    await p.locator('button[type="submit"]').first().click();
    await p.waitForURL((u) => !u.pathname.startsWith("/admin/login"));
    for (const ruta of ADMIN) await visitar(ruta);
    await ctx.close();
  }
} finally {
  await b.close();
  await e.cerrar();
}
await writeFile(`${OUT}/medidas.json`, JSON.stringify(filas, null, 1));
for (const f of filas)
  console.log(
    `${f.tam} ${f.ruta} → ${f.estado ?? ""} ${f.final ?? ""} ${f.ms ?? ""}ms desb=${f.desborde} h1=${f.h1} chicos=${f.chicos?.n} sinNombre=${f.sinNombre?.n} imgSinAlt=${f.imgSinAlt} letra<12=${f.letraChica?.n} err=${f.errores?.length}`,
  );
