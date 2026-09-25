// Verifica en el laboratorio las correcciones del recorrido (sin filtrar errores de consola):
//   1. ingreso con clave equivocada y después la buena (Shine, A Dos Manos, consola): cero
//      «Encountered a script tag…» ni otro error de consola;
//   2. 404 del panel (/admin/no-existe-qa) y de la consola (/operador/tenants/no-existe-123):
//      castellano y un enlace que vuelve (se lo hace clic);
//   3. CH (opcional, argumento «ch»): /contador con la dueña → 404 con camino a su panel.
// Uso: node verificar.mjs <390|1440> [ch]
import { chromium } from "/home/user/erp/node_modules/playwright/index.mjs";
import fs from "node:fs";

const D = "/home/user/erp/.qa/rediseno/correccion-recorrido/";
const F = D + "fotos/";
fs.mkdirSync(F, { recursive: true });
const ANCHO = Number(process.argv[2] || 390);
const CON_CH = process.argv.includes("ch");
const CLAVE = (process.env.LAB_CLAVE_COMUN ?? "");
const T = 120000;
const salida = `${D}salida-verificar-${ANCHO}${CON_CH ? "-ch" : ""}.txt`;
fs.writeFileSync(salida, `Verificación ${new Date().toISOString()} ancho=${ANCHO}\n`);
const log = (s) => { console.log(s); fs.appendFileSync(salida, s + "\n"); };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctxOpts = ANCHO === 390
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
  : { viewport: { width: 1440, height: 900 } };
const ERRORES = [];
let ok = 0, fallas = 0;

async function paso(nombre, p, fn) {
  try {
    const det = await fn();
    ok++; log(`  OK    ${nombre}${det ? " · " + det : ""}`);
  } catch (e) {
    fallas++; log(`  FALLA ${nombre}: ${String(e?.message ?? e).split("\n")[0].slice(0, 300)}`);
    await p.screenshot({ path: `${F}${ANCHO}_FALLA_${nombre.replace(/\W+/g, "-")}.png`, fullPage: true }).catch(() => {});
  }
}
const afirmar = (c, m) => { if (!c) throw new Error(m); };
async function nuevaPagina(quien) {
  const c = await b.newContext(ctxOpts);
  const p = await c.newPage();
  p.on("console", (m) => { if (m.type() === "error") ERRORES.push(`${quien} ${p.url()} :: ${m.text().slice(0, 240)}`); });
  p.on("pageerror", (e) => ERRORES.push(`${quien} ${p.url()} :: pageerror ${String(e).slice(0, 240)}`));
  return p;
}
const sx = (p) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
async function no404(p, url, enlace, destino, foto) {
  const r = await p.goto(url, { timeout: T, waitUntil: "networkidle" });
  afirmar(r?.status() === 404, `status ${r?.status()}`);
  await p.getByRole("heading", { name: "No encontramos esta página" }).waitFor({ timeout: 10000 });
  const a = p.getByRole("link", { name: enlace });
  const alto = (await a.boundingBox())?.height ?? 0;
  afirmar(alto >= 44, `enlace de ${alto}px`);
  await p.screenshot({ path: `${F}${ANCHO}_${foto}.png`, fullPage: true });
  const desborde = await sx(p);
  afirmar(desborde <= 0, `scroll horizontal ${desborde}px`);
  await a.click();
  await p.waitForURL((u) => u.pathname === destino, { timeout: T });
  return `enlace «${enlace}» ${alto}px → ${destino}`;
}

for (const [neg, email] of [["shinevelas", "dueno@shinevelas.lab"], ["adosmanos", "cajero@adosmanos.lab"]]) {
  const base = `http://${neg}.localhost:3210`;
  const p = await nuevaPagina(neg);
  log(`${neg} (${email})`);
  await paso(`${neg} · clave equivocada avisa sin error de consola`, p, async () => {
    await p.goto(`${base}/admin/login`, { timeout: T, waitUntil: "networkidle" });
    await p.fill("input[name=email]", email);
    await p.fill("input[name=password]", "no-es-la-clave");
    await p.getByRole("button", { name: "Ingresar" }).click();
    await p.waitForLoadState("networkidle");
    await p.getByRole("alert").first().waitFor({ timeout: 15000 });
  });
  await paso(`${neg} · entrar`, p, async () => {
    await p.fill("input[name=email]", email);
    await p.fill("input[name=password]", CLAVE);
    await p.getByRole("button", { name: "Ingresar" }).click();
    await p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: T });
    await p.waitForLoadState("networkidle");
    return new URL(p.url()).pathname;
  });
  await paso(`${neg} · 404 del panel con vuelta`, p, () => no404(p, `${base}/admin/no-existe-qa`, "Volver al inicio del panel", "/admin", `${neg}_404`));
  await p.context().close();
}

{
  const p = await nuevaPagina("consola");
  log("consola del operador");
  await paso("consola · clave equivocada avisa", p, async () => {
    await p.goto("http://localhost:3210/operador/login", { timeout: T, waitUntil: "networkidle" });
    await p.fill("input[name=password]", "no-es-la-clave");
    await p.getByRole("button", { name: "Ingresar a la consola" }).click();
    await p.getByRole("alert").first().waitFor({ timeout: 15000 });
  });
  await paso("consola · entrar", p, async () => {
    await p.fill("input[name=password]", CLAVE);
    await p.getByRole("button", { name: "Ingresar a la consola" }).click();
    await p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: T });
    await p.waitForLoadState("networkidle");
    return new URL(p.url()).pathname;
  });
  await paso("consola · negocio que no existe con vuelta a Negocios", p, () =>
    no404(p, "http://localhost:3210/operador/tenants/no-existe-123", "Volver a Negocios", "/operador", "consola_404"));
  await p.context().close();
}

if (CON_CH) {
  const p = await nuevaPagina("ch");
  log("CH (dueña)");
  await paso("ch · entrar", p, async () => {
    await p.goto("http://chestetica.localhost:3210/admin/login", { timeout: T, waitUntil: "networkidle" });
    await p.fill("input[name=email]", "duena@ch.lab");
    await p.fill("input[name=password]", CLAVE);
    await p.getByRole("button", { name: "Ingresar" }).click();
    await p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: T });
    await p.waitForLoadState("networkidle");
  });
  await paso("ch · /contador sin permiso con vuelta a su panel", p, () =>
    no404(p, "http://chestetica.localhost:3210/contador", "Ir a tu panel", "/admin", "ch_contador_404"));
  await p.context().close();
}

await b.close();
log(`\n${ANCHO}: ${ok}/${ok + fallas} pasos OK · errores de consola ${ERRORES.length}`);
for (const e of ERRORES) log(`  consola: ${e}`);
process.exit(fallas || ERRORES.length ? 1 : 0);
