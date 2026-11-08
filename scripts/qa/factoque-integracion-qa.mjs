// ============================================================================
// QA CLIC POR CLIC · Integración Factoque T1 (marca/ARCA/NC sin cupo) + T2 (planes)
// ============================================================================
// Navegador real (390 px) contra una base efímera con RLS (src/test/base-efimera.ts, Postgres
// LOCAL, nunca Neon) y ARCA simulado (stub). Dos arranques de `next start`:
//   1) facturación APAGADA: a) /facturita/terminos y /facturita/privacidad; b) Mi cuenta →
//      «Conectar con ARCA»; c) emitir queda Pendiente y dice adónde ir.
//   2) facturación ENCENDIDA (stub): d) 5/5 usadas, anular: sale y queda 5/5; e) /facturita/planes
//      con Gratis 5 · Plus 40 $9.000 · Pro 159 $15.000; f) operador: «Cambiar plan» a Plus y el
//      negocio vuelve a emitir con tope 40.
// Capturas y resumen en docs/qa/factoque-integracion/ (fuera del git). Necesita `npm run build`.
//
// Uso: node --import tsx scripts/qa/factoque-integracion-qa.mjs      (PORT=3252 por defecto)
//      QA_MODO=dev …  usa `next dev` (sin build): sirve cuando el entorno no llega a las fuentes de
//      Google y `next build` no puede terminar; next/font cae a la fuente de respaldo.
// ============================================================================

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crearBaseEfimera, prismaComoDuenio, CLAVE_DE_PRUEBA } from "../../src/test/base-efimera.ts";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PORT = Number(process.env.PORT ?? 3252);
if (PORT === 3210 || PORT === 3211) throw new Error("Los puertos 3210 y 3211 son de otro equipo: elegí otro PORT.");
const OUT = path.join(RAIZ, "docs/qa/factoque-integracion");
const AUTH_SECRET = "qa-factoque-integracion-auth-secret-0123456789";
const CLAVE_OPERADOR = "qa-clave-operador-factoque";
const VP = { width: 390, height: 844 };
const DEV = process.env.QA_MODO === "dev";
const pasos = [];
const log = (m) => process.stdout.write(`[qa-factoque] ${m}\n`);

function pedir(host, ruta) {
  return new Promise((ok) => {
    const req = http.get({ host: "127.0.0.1", port: PORT, path: ruta, headers: { host: `${host}:${PORT}` } }, (res) => {
      res.resume();
      ok(res.statusCode);
    });
    req.on("error", () => ok(null));
    req.setTimeout(DEV ? 120_000 : 4000, () => {
      req.destroy();
      ok(null);
    });
  });
}

async function levantar(base, arcaEncendida) {
  const env = {
    ...process.env,
    DATABASE_URL: base.urlApp,
    OPERATOR_DATABASE_URL: base.urlDuenio,
    MIGRATE_DATABASE_URL: base.urlDuenio,
    RLS_ENFORCEMENT: "on",
    APP_BASE_DOMAIN: "localhost",
    AUTH_SECRET,
    OPERATOR_SECRET: `${AUTH_SECRET}-operador`,
    OPERATOR_PASSWORD: CLAVE_OPERADOR,
    ARCA_INVOICING_ENABLED: arcaEncendida ? "true" : "false",
    NODE_ENV: DEV ? "development" : "production",
    PORT: String(PORT),
  };
  for (const v of ["FORCE_TENANT_SLUG", "TENANT_HOST_MAP", "DEMO_MODE_ENABLED", "MP_MODO", "ARCA_MODO", "OPERADORES", "OPERADOR_DUENIO"]) delete env[v];
  const salida = createWriteStream(path.join(OUT, `servidor-${arcaEncendida ? "on" : "off"}.txt`));
  const app = spawn(process.execPath, [path.join(RAIZ, "node_modules/next/dist/bin/next"), DEV ? "dev" : "start", "-p", String(PORT)], {
    cwd: RAIZ,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.pipe(salida);
  app.stderr.pipe(salida);
  const hasta = Date.now() + (DEV ? 240_000 : 60_000);
  while (Date.now() < hasta) {
    if ((await pedir(base.b.subdominio + ".localhost", "/admin/login")) === 200) return app;
    await new Promise((r) => setTimeout(r, 500));
  }
  app.kill("SIGTERM");
  throw new Error(`next ${DEV ? "dev" : "start"} no respondió a tiempo`);
}

async function bajar(app) {
  if (!app) return;
  app.kill("SIGTERM");
  await new Promise((r) => app.once("exit", r));
}

function rutaDeChromium() {
  try {
    const p = chromium.executablePath();
    if (existsSync(p)) return p;
  } catch {
    // se busca abajo
  }
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  for (const n of existsSync(dir) ? readdirSync(dir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse() : []) {
    for (const sub of ["chrome-linux64", "chrome-linux"]) {
      const p = path.join(dir, n, sub, "chrome");
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

async function nuevaPagina(ctx) {
  const page = await ctx.newPage();
  const errores = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|Failed to load resource.*404|\[HMR\]|webpack-hmr|_next\/webpack|font|DeprecationWarning/i.test(m.text())) errores.push(`${m.text().slice(0, 900)} @${page.url()}`);
  });
  page.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
  return { page, errores };
}

async function paso(nombre, page, errores, fn) {
  const n = pasos.length + 1;
  let detalle = "";
  let ok = true;
  try {
    detalle = (await fn()) ?? "";
  } catch (e) {
    ok = false;
    detalle = String(e?.message ?? e).slice(0, 400);
  }
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth).catch(() => 0);
  if (ancho > 1) {
    ok = false;
    detalle += ` · scroll horizontal ${ancho}px`;
  }
  if (errores.length) {
    ok = false;
    detalle += ` · consola: ${errores.splice(0).join(" | ")}`;
  }
  const captura = `${String(n).padStart(2, "0")}-${nombre.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
  await page.screenshot({ path: path.join(OUT, captura), fullPage: true }).catch(() => {});
  pasos.push({ n, nombre, ok, detalle, captura });
  log(`${ok ? "✅" : "❌"} ${nombre} — ${detalle}`);
}

const conTexto = (page, texto, timeout = 30_000) => page.getByText(texto, { exact: false }).first().waitFor({ timeout });
const monto = (page) => page.getByTestId("emitir-monto");
const queHiciste = (page) => page.getByTestId("emitir-concepto");
const botonEmitir = (page) => page.getByTestId("emitir-boton");

async function entrar(browser, origin, email) {
  const ctx = await browser.newContext({ viewport: VP });
  const page = await ctx.newPage();
  await page.goto(`${origin}/admin/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', CLAVE_DE_PRUEBA);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 30_000 }), page.click('button[type="submit"]')]);
  await page.close();
  return ctx;
}

async function emitirUna(page, origin, concepto) {
  await page.goto(`${origin}/facturita/app`);
  await conTexto(page, "¿Cuánto cobraste?");
  await monto(page).fill("1.000");
  await queHiciste(page).fill(concepto);
  await botonEmitir(page).click();
  await Promise.race([page.getByTestId("exito").first().waitFor({ timeout: 30_000 }), page.getByTestId("error-titulo").first().waitFor({ timeout: 30_000 })]);
  return page.getByTestId("exito").first();
}

const textoVisible = async (loc) => ((await loc.innerText()) ?? "").replace(/\s+/g, " ").trim();

async function main() {
  mkdirSync(OUT, { recursive: true });
  log("creando la base efímera (Postgres local)…");
  const base = await crearBaseEfimera();
  let app = null;
  let browser = null;
  const duenio = await prismaComoDuenio(base);
  const T = base.b.id;
  const origin = `http://${base.b.subdominio}.localhost:${PORT}`;
  const apex = `http://localhost:${PORT}`;
  const delMes = () => duenio.invoice.count({ where: { tenantId: T, comprobanteAsociadoId: null } });
  try {
    await duenio.tenant.update({
      where: { id: T },
      data: { name: "Yoga Ana", blueprintId: "facturita", arcaCuit: "20222222223", arcaPuntoVenta: 2, arcaHomologacion: true, arcaCondicionIva: "MONOTRIBUTO" },
    });
    browser = await chromium.launch({ executablePath: rutaDeChromium() });

    // ── 1) Facturación APAGADA ────────────────────────────────────────────────
    app = await levantar(base, false);
    {
      const ctx = await browser.newContext({ viewport: VP });
      const { page, errores } = await nuevaPagina(ctx);
      for (const [ruta, titulo] of [
        ["/facturita/terminos", /términos/i],
        ["/facturita/privacidad", /privacidad/i],
      ]) {
        await paso(`a legal ${ruta}`, page, errores, async () => {
          const r = await page.goto(`${apex}${ruta}`);
          if (r?.status() !== 200) throw new Error(`HTTP ${r?.status()}`);
          const h1 = await textoVisible(page.locator("h1").first());
          if (!titulo.test(h1)) throw new Error(`h1 «${h1}»`);
          const cuerpo = await textoVisible(page.locator("body"));
          const marca = /Factoque/.test(cuerpo) ? "nombra Factoque" : "NO nombra Factoque";
          const borrador = /borrador|provisional|a confirmar/i.test(cuerpo) ? " · marca texto provisional" : "";
          return `200 · h1 «${h1}» · ${marca}${borrador}`;
        });
      }
      await ctx.close();
    }
    {
      const ctx = await entrar(browser, origin, base.b.duenia.email);
      const { page, errores } = await nuevaPagina(ctx);
      await paso("b Mi cuenta → Conectar con ARCA", page, errores, async () => {
        await page.goto(`${origin}/facturita/app/cuenta`);
        const sec = page.locator("section[aria-labelledby='conectar-arca']");
        await sec.waitFor({ timeout: 30_000 });
        const txt = await textoVisible(sec);
        const link = sec.getByRole("link").first();
        const href = await link.getAttribute("href");
        await link.click();
        await page.waitForLoadState("networkidle");
        const destino = new URL(page.url()).pathname + new URL(page.url()).search;
        if (destino === "/facturita/app") throw new Error(`«${await link.textContent().catch(() => "")}» (${href}) rebota a /facturita/app: no llega al asistente de ARCA · tarjeta «${txt.slice(0, 120)}»`);
        return `tarjeta: «${txt.slice(0, 160)}» · enlace ${href} → ${destino}`;
      });
      await paso("c emitir con ARCA apagado queda Pendiente", page, errores, async () => {
        const exito = await emitirUna(page, origin, "Clase con ARCA apagado");
        if (!(await exito.count())) throw new Error(`error: ${await textoVisible(page.getByTestId("error-titulo").first())}`);
        const txt = await textoVisible(exito);
        if (!/pendiente|guardada/i.test(txt)) throw new Error(`no dice pendiente: «${txt}»`);
        const links = await exito.locator("a[href]").evaluateAll((els) => els.map((e) => `${(e.textContent ?? "").trim()}→${e.getAttribute("href")}`));
        if (!links.length) throw new Error(`pendiente SIN enlace: «${txt}»`);
        const fila = await duenio.invoice.findFirst({ where: { tenantId: T }, orderBy: { createdAt: "desc" }, select: { status: true } });
        return `«${txt.slice(0, 180)}» · enlaces: ${links.join(" · ")} · base: ${fila?.status}`;
      });
      await ctx.close();
    }
    await bajar(app);
    app = null;

    // ── 2) Facturación ENCENDIDA (stub) ───────────────────────────────────────
    // La pendiente del arranque apagado sigue contando: es 1 de las 5 del mes.
    app = await levantar(base, true);
    {
      const ctx = await entrar(browser, origin, base.b.duenia.email);
      const { page, errores } = await nuevaPagina(ctx);
      await paso("d1 emitir 5 de 5 en Gratis", page, errores, async () => {
        for (let i = (await delMes()) + 1; i <= 5; i++) {
          const exito = await emitirUna(page, origin, `Sesión ${i}`);
          if (!(await exito.count())) throw new Error(`la ${i}.ª falló: ${await textoVisible(page.getByTestId("error-titulo").first())}`);
        }
        await page.goto(`${origin}/facturita/app`);
        await conTexto(page, "Llegaste al tope");
        if (await botonEmitir(page).isEnabled()) throw new Error("con 5/5 deja tocar Emitir");
        const desc = await textoVisible(page.locator("header, [data-page-header]").first()).catch(() => "");
        return `5 en el mes (base: ${await delMes()}) · tope visible, Emitir deshabilitado · «${desc.slice(0, 140)}»`;
      });
      await paso("d2 anular con 5/5: sale y queda 5/5", page, errores, async () => {
        await page.goto(`${origin}/facturita/app/facturas`);
        const anular = page.getByRole("button", { name: /^Anular la factura .* con nota de crédito$/ }).first();
        await anular.waitFor({ timeout: 30_000 });
        await anular.click();
        await page.getByLabel("¿Por qué la anulás?").fill("me equivoqué en el total");
        await page.getByRole("button", { name: "Anular con nota de crédito" }).click();
        await page.waitForFunction(() => !document.body.innerText.includes("Anulando…"), null, { timeout: 30_000 });
        await page.waitForTimeout(800);
        const notas = await duenio.invoice.count({ where: { tenantId: T, comprobanteAsociadoId: { not: null } } });
        if (notas !== 1) throw new Error(`notas de crédito en base: ${notas} (pantalla: ${(await textoVisible(page.locator("main"))).slice(0, 200)})`);
        await page.goto(`${origin}/facturita/app`);
        const desc = await textoVisible(page.locator("main")).catch(() => "");
        const m = desc.match(/usaste (\d+) de (\d+)/);
        if (!m || m[1] !== "5" || m[2] !== "5") throw new Error(`después de anular: «${m?.[0] ?? desc.slice(0, 120)}»`);
        return `nota de crédito creada (1) · facturas que cuentan: ${await delMes()} · pantalla «${m[0]}»`;
      });
      await paso("g portada → Botón de arrepentimiento (sin cuenta)", page, errores, async () => {
        const pub = await browser.newContext({ viewport: VP });
        const p = await pub.newPage();
        await p.goto(`${apex}/facturita`);
        await p.getByRole("navigation", { name: "Legales" }).getByRole("link", { name: "Botón de arrepentimiento" }).click();
        await p.waitForURL(/\/facturita\/arrepentimiento/);
        await p.getByLabel("Tu email").fill("ana@yoga.com");
        await p.getByLabel("Tu CUIT").fill("20-22222222-3");
        await p.getByRole("button", { name: "Me arrepiento" }).click();
        const hecho = p.getByTestId("tramite-hecho");
        await hecho.waitFor({ timeout: 30_000 });
        const numero = await textoVisible(p.getByTestId("tramite-numero"));
        const fila = await duenio.auditLog.findFirst({ where: { tenantId: T, action: "factoque.arrepentimiento" }, select: { channel: true } });
        await pub.close();
        if (!fila) throw new Error(`sin fila en AuditLog · «${numero}»`);
        return `«${numero}» · AuditLog del negocio (canal ${fila.channel}) · el plan no se toca sin sesión`;
      });
      await paso("e /facturita/planes", page, errores, async () => {
        await page.goto(`${origin}/facturita/planes`);
        const txt = await textoVisible(page.locator("main").first().or(page.locator("body")).first());
        const esperado = [/Gratis/, /\b5\b/, /Plus/, /\b40\b/, /9\.000/, /Pro/, /\b159\b/, /15\.000/];
        const faltan = esperado.filter((r) => !r.test(txt)).map(String);
        if (faltan.length) throw new Error(`faltan ${faltan.join(", ")}: «${txt.slice(0, 300)}»`);
        return "Gratis 5 · Plus 40 $9.000 · Pro 159 $15.000 visibles";
      });

      // f) Operador: cambiar plan a Plus.
      const ctxOp = await browser.newContext({ viewport: { width: 1366, height: 900 } });
      const op = await nuevaPagina(ctxOp);
      await paso("f1 operador: Cambiar plan → Plus", op.page, op.errores, async () => {
        const p = op.page;
        await p.goto(`${apex}/operador/login`);
        await p.getByLabel("Clave").fill(CLAVE_OPERADOR);
        await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/operador/login"), { timeout: 30_000 }), p.getByRole("button", { name: "Ingresar a la consola" }).click()]);
        await p.goto(`${apex}/operador/tenants/${T}?pestana=plan`);
        await p.locator("#factoque-plan").waitFor({ timeout: 30_000 });
        const plus = await p.locator("#factoque-plan option").evaluateAll((os) => os.find((o) => /Plus/.test(o.textContent ?? ""))?.value);
        await p.selectOption("#factoque-plan", plus);
        await p.getByRole("button", { name: "Cambiar plan" }).click();
        await p.waitForTimeout(1500);
        await p.reload();
        const fila = await duenio.tenant.findUnique({ where: { id: T }, select: { plan: true } });
        const cuenta = await textoVisible(p.locator("text=facturas por mes").first()).catch(() => "");
        if (!/Plus/i.test(String(fila?.plan)) && !/plus/i.test(cuenta)) throw new Error(`Tenant.plan=${fila?.plan} · ficha «${cuenta}»`);
        return `Tenant.plan=${fila?.plan} · ficha «${cuenta}»`;
      });
      await ctxOp.close();
      await paso("f2 el negocio en Plus: 5 de 40 y vuelve a emitir", page, errores, async () => {
        await page.goto(`${origin}/facturita/app`);
        const desc = await textoVisible(page.locator("main"));
        const m = desc.match(/usaste (\d+) de (\d+)[^.]*/);
        if (!m || m[2] !== "40") throw new Error(`«${m?.[0] ?? desc.slice(0, 160)}»`);
        const exito = await emitirUna(page, origin, "Sesión 6 en Plus");
        if (!(await exito.count())) throw new Error(`la 6.ª falló: ${await textoVisible(page.getByTestId("error-titulo").first())}`);
        await page.goto(`${origin}/facturita/app/cuenta`);
        const cuenta = await textoVisible(page.locator("main"));
        return `«${m[0]}» · 6.ª emitida (base: ${await delMes()}) · Mi cuenta nombra Plus: ${/Plus/.test(cuenta) ? "sí" : "NO"}`;
      });
      await paso("h Mi cuenta → Darme de baja: Plus vuelve a Gratis en el acto", page, errores, async () => {
        await page.goto(`${origin}/facturita/app/cuenta`);
        await page.getByRole("navigation", { name: "Arrepentimiento y baja" }).getByRole("link", { name: "Darme de baja" }).click();
        await page.waitForURL(/\/facturita\/app\/cuenta\/tramite/);
        await page.getByLabel("¿Por qué? (opcional)").fill("cierro el local");
        await page.getByRole("button", { name: "Darme de baja" }).click();
        const hecho = page.getByTestId("tramite-hecho");
        await hecho.waitFor({ timeout: 30_000 });
        const txt = await textoVisible(hecho);
        const fila = await duenio.tenant.findUnique({ where: { id: T }, select: { plan: true } });
        if (fila?.plan !== null) throw new Error(`Tenant.plan=${fila?.plan} · «${txt}»`);
        const audit = await duenio.auditLog.count({ where: { tenantId: T, action: "factoque.baja" } });
        const aviso = await hecho.getByRole("link").first().getAttribute("href");
        await page.goto(`${origin}/facturita/app`);
        const desc = await textoVisible(page.locator("main"));
        const m = desc.match(/usaste (\d+) de (\d+)[^.]*/);
        if (!m || m[2] !== "5") throw new Error(`después de la baja: «${m?.[0] ?? desc.slice(0, 120)}»`);
        return `«${txt.slice(0, 170)}» · Tenant.plan=null · factoque.baja=${audit} · aviso ${String(aviso).slice(0, 30)}… · emitir: «${m[0]}»`;
      });
      await ctx.close();
    }
  } finally {
    await browser?.close().catch(() => {});
    await bajar(app).catch(() => {});
    await base.borrar();
  }
  const ok = pasos.filter((p) => p.ok).length;
  const md = [`# QA Factoque integración — ${new Date().toISOString()}`, "", `${ok}/${pasos.length} pasos OK`, "", ...pasos.map((p) => `- ${p.ok ? "✅" : "❌"} **${p.nombre}** — ${p.detalle} (\`${p.captura}\`)`)].join("\n");
  writeFileSync(path.join(OUT, "RESUMEN.md"), md + "\n");
  log(`${ok}/${pasos.length} pasos OK · ${path.join(OUT, "RESUMEN.md")}`);
  process.exit(ok === pasos.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
