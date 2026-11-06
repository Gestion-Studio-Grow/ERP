// ============================================================================
// QA DE PUNTA A PUNTA · Facturador en UNA pantalla (monto · qué · comprador plegado) en las tres pantallas
// ============================================================================
// En un navegador real, a 1366 y 390 px, contra una base efímera con RLS (src/test/base-efimera.ts)
// y ARCA simulado (stub, nada sale a la red):
//   · Panel de un negocio inscripto (A): Factura B a consumidor final en una pantalla (monto → qué →
//     Emitir) con la previa de una línea; Factura A a un responsable inscripto (CUIT, condición,
//     domicilio); un total que exige identificar al comprador despliega el comprador y dice «Corregir».
//   · Consola del contador (estudio B, cliente A): «Emitir» desde la cartera, la factura con el
//     teclado (Ctrl+Enter) y la nota de crédito desde los comprobantes del cliente.
//   · Factoque (B pasa a plan Factoque, monotributista): Factura C a consumidor final y la nota de
//     crédito desde «Mis facturas».
//   · Sesión B (EmitirComprobante): servicios con las fechas del mes (F1), el resultado arriba con
//     letra, número, CAE, PDF y WhatsApp (F2), el PDF que pide los datos que le faltan (F3), el tope
//     del mes explicado (F4), la A sin régimen cargado, y en el contador el lote y el cambio de receptor.
// En cada pantalla falla ante errores de consola, scroll horizontal o toques de menos de 44 px.
// Capturas y resumen en .qa/facturador-guiado/. Necesita el build hecho (`npm run build`).
//
// Uso: node --import tsx scripts/qa/facturador-guiado-e2e.mjs      (PORT=3241 por defecto)
// ============================================================================

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crearBaseEfimera, prismaComoDuenio, CLAVE_DE_PRUEBA } from "../../src/test/base-efimera.ts";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PORT = Number(process.env.PORT ?? 3241);
if (PORT === 3210 || PORT === 3211) throw new Error("Los puertos 3210 y 3211 son de otro equipo: elegí otro PORT.");
const OUT = path.join(RAIZ, ".qa/facturador-guiado");
const AUTH_SECRET = "qa-facturador-auth-secret-0123456789abcdef";
const VIEWPORTS = [
  { nombre: "1366", width: 1366, height: 900 },
  { nombre: "390", width: 390, height: 844 },
];
const CUIT_A = "20111111112";
const CUIT_RI = "30111111118"; // verificador válido, inventado
const pasos = [];
const log = (m) => process.stdout.write(`[qa-facturador] ${m}\n`);

function pedir(host, ruta) {
  return new Promise((ok) => {
    const req = http.get({ host: "127.0.0.1", port: PORT, path: ruta, headers: { host: `${host}:${PORT}` } }, (res) => {
      res.resume();
      ok(res.statusCode);
    });
    req.on("error", () => ok(null));
    req.setTimeout(4000, () => {
      req.destroy();
      ok(null);
    });
  });
}

async function levantar(base) {
  const env = {
    ...process.env,
    DATABASE_URL: base.urlApp,
    OPERATOR_DATABASE_URL: base.urlDuenio,
    MIGRATE_DATABASE_URL: base.urlDuenio,
    RLS_ENFORCEMENT: "on",
    APP_BASE_DOMAIN: "localhost",
    AUTH_SECRET,
    OPERATOR_SECRET: `${AUTH_SECRET}-operador`,
    ARCA_INVOICING_ENABLED: "true",
    NODE_ENV: "production",
    PORT: String(PORT),
  };
  for (const v of ["FORCE_TENANT_SLUG", "TENANT_HOST_MAP", "DEMO_MODE_ENABLED", "MP_MODO", "ARCA_MODO"]) delete env[v];
  const salida = createWriteStream(path.join(OUT, "servidor.txt"));
  const app = spawn(process.execPath, [path.join(RAIZ, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT)], {
    cwd: RAIZ,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.pipe(salida);
  app.stderr.pipe(salida);
  const hasta = Date.now() + 60_000;
  while (Date.now() < hasta) {
    if ((await pedir(base.a.subdominio + ".localhost", "/admin/login")) === 200) return app;
    await new Promise((r) => setTimeout(r, 500));
  }
  app.kill("SIGTERM");
  throw new Error(`next start no respondió en 60 s (ver ${path.join(OUT, "servidor.txt")})`);
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

async function entrar(browser, origin, email, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  await page.goto(`${origin}/admin/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', CLAVE_DE_PRUEBA);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 30_000 }), page.click('button[type="submit"]')]);
  await page.close();
  return ctx;
}

async function nuevaPagina(ctx) {
  const page = await ctx.newPage();
  const errores = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|Failed to load resource.*404/.test(m.text())) errores.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
  return { page, errores };
}

/** Lo que se mira en cada paso: consola, scroll de costado y toques del facturador. */
async function controlar(page, errores) {
  const fallas = [...errores];
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (ancho > 1) fallas.push(`scroll horizontal de ${ancho} px`);
  // Celular: 44 px (piso táctil de la casa). Escritorio: la densidad del kit deja botones y chips de
  // 32–36 px (el kit escala --spacing en la PC; no es de esta pantalla): se exige WCAG 2.2 AA (2.5.8), 24 px.
  const minimo = (page.viewportSize()?.width ?? 0) < 640 ? 44 : 24;
  const chicos = await page.evaluate((minimo) =>
    [...document.querySelectorAll('section[aria-labelledby] button, section[aria-labelledby] a')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({ t: (el.textContent ?? "").trim().slice(0, 30), h: el.getBoundingClientRect().height }))
      .filter((x) => x.h > 0 && x.h < minimo),
    minimo,
  );
  if (chicos.length) fallas.push(`toques < ${minimo} px: ${chicos.map((c) => `${c.t}(${Math.round(c.h)})`).join(", ")}`);
  return fallas;
}

async function paso(ctxInfo, nombre, page, errores, fn) {
  let fallas = [];
  let nota = "";
  try {
    nota = (await fn()) ?? "";
    fallas = await controlar(page, errores);
  } catch (e) {
    fallas.push(`se cortó: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`);
  }
  const captura = `${ctxInfo.vp}-${nombre.replace(/[^\w]+/g, "-")}.png`;
  await page.screenshot({ path: path.join(OUT, captura), fullPage: true }).catch(() => {});
  errores.length = 0;
  pasos.push({ vp: ctxInfo.vp, paso: nombre, ok: fallas.length === 0, nota, fallas, captura });
  log(`${fallas.length ? "MAL" : "OK "} ${ctxInfo.vp} ${nombre}${nota ? ` · ${nota}` : ""}${fallas.length ? ` · ${fallas.join(" · ")}` : ""}`);
}

const conTexto = (page, texto, timeout = 30_000) => page.getByText(texto, { exact: false }).first().waitFor({ timeout });

// Selectores estables de la pantalla única (data-testid de EmitirComprobante.tsx).
const monto = (page) => page.getByTestId("emitir-monto");
const queHiciste = (page) => page.getByTestId("emitir-concepto");
const botonEmitir = (page) => page.getByTestId("emitir-boton");
const exito = (page, timeout = 30_000) => page.getByTestId("exito").first().waitFor({ timeout });

async function letraEs(page, letra) {
  const l = await page.getByTestId("emitir-letra").getAttribute("data-letra");
  if (l !== letra) throw new Error(`la previa dice Factura ${l}, no ${letra}`);
}

async function abrirMasDetalles(page) {
  const d = page.locator("details", { has: page.getByText("Más detalles", { exact: true }) });
  if (!(await d.evaluate((el) => el.open))) await page.getByText("Más detalles", { exact: true }).click();
}

async function compradorConCuit(page, abrir = true) {
  if (abrir) await page.getByRole("button", { name: "Poner DNI o CUIT" }).click();
  await page.getByLabel("CUIT", { exact: true }).check();
  await page.getByLabel("Número").fill(CUIT_RI);
  await page.getByLabel("Nombre o razón social").fill("Distribuidora Sur SA");
  await page.getByLabel("¿Cómo está inscripto?").selectOption("RESPONSABLE_INSCRIPTO");
  await page.getByLabel("Domicilio").fill("Av. Siempreviva 742, CABA");
}

// ── Panel de un negocio inscripto ─────────────────────────────────────────────────────────
async function recorrerPanel(ctx, origin, vp) {
  const { page, errores } = await nuevaPagina(ctx);
  const c = { vp };
  await page.goto(`${origin}/admin/facturacion?vista=emitir`);

  await paso(c, "panel · B a consumidor final", page, errores, async () => {
    await conTexto(page, "¿Cuánto cobraste?");
    await monto(page).fill("12.100");
    await queHiciste(page).fill("Torta de chocolate");
    await letraEs(page, "B");
    await conTexto(page, "IVA $2.100");
    await botonEmitir(page).click();
    await exito(page);
    await conTexto(page, "Modo de prueba");
    await resultadoArriba(page, "B", "/admin/facturacion/comprobante/");
    return "una pantalla: monto → qué → Emitir; arriba: número grande, CAE chico y WhatsApp; el PDF, dicho";
  });

  await paso(c, "panel · A a responsable inscripto", page, errores, async () => {
    await page.getByRole("button", { name: "Facturar otra" }).click();
    await monto(page).fill("121.000");
    await queHiciste(page).fill("Cajas de alfajores");
    await compradorConCuit(page);
    await letraEs(page, "A");
    await botonEmitir(page).click();
    await exito(page);
    return "comprador desplegado con CUIT → la letra la pone el sistema (A)";
  });

  await paso(c, "panel · servicios con las fechas del mes", page, errores, async () => {
    await page.getByRole("button", { name: "Facturar otra" }).click();
    await abrirMasDetalles(page);
    await page.getByLabel("Servicios", { exact: true }).check();
    const desde = await page.getByLabel("Desde").inputValue();
    if (!/^\d{4}-\d{2}-01$/.test(desde)) throw new Error(`«Desde» arranca en «${desde}», no el 1.º del mes`);
    if (!(await page.getByLabel("Te lo pagan hasta el").inputValue())) throw new Error("vencimiento vacío");
    await conTexto(page, "Falta el detalle");
    await monto(page).fill("30.250");
    await queHiciste(page).fill("Clases de pastelería de noviembre");
    await botonEmitir(page).click();
    await exito(page);
    return "F1: mes en curso y vencimiento precargados en «Más detalles»; el faltante, dicho al lado del botón";
  });

  await paso(c, "panel · error con la acción que lo resuelve", page, errores, async () => {
    await page.getByRole("button", { name: "Facturar otra" }).click();
    await monto(page).fill("99.000.000");
    await queHiciste(page).fill("Equipo completo");
    await page.getByTestId("error-titulo").waitFor();
    await conTexto(page, "exige identificar al comprador");
    if (await page.getByText(/\bRG \d/).count()) throw new Error("muestra «RG …»");
    await page.getByLabel("Número").waitFor();
    await page.getByRole("button", { name: "Corregir", exact: true }).click();
    return "el umbral despliega el comprador solo, en criollo y sin «RG …»";
  });
  await page.close();
}

// ── Consola del contador (estudio B, cliente A) ───────────────────────────────────────────
async function recorrerContador(ctx, origin, vp, clienteId) {
  const { page, errores } = await nuevaPagina(ctx);
  const c = { vp };
  await paso(c, "contador · emitir con el teclado", page, errores, async () => {
    await page.goto(`${origin}/contador/cliente/${clienteId}/comprobantes`);
    await page.getByRole("link", { name: "Emitir un comprobante" }).click();
    await conTexto(page, "¿Cuánto cobraste?");
    await monto(page).fill("50.000");
    await queHiciste(page).fill("Honorarios de octubre");
    await page.keyboard.press("Control+Enter");
    await exito(page);
    const n = await page.locator('aside[aria-label="En esta sesión"] .text-xl').textContent();
    if (n?.trim() !== "1") throw new Error(`el contador de la sesión dice ${n}`);
    return "Ctrl+Enter emite; la sesión cuenta 1";
  });
  await paso(c, "contador · la misma, a otro comprador", page, errores, async () => {
    await page.getByRole("button", { name: "La misma, a otro comprador" }).click();
    await compradorConCuit(page, false);
    if ((await queHiciste(page).inputValue()) !== "Honorarios de octubre") throw new Error("no conservó el detalle");
    await letraEs(page, "A");
    await botonEmitir(page).click();
    await exito(page);
    return "cambio de receptor: queda lo vendido, sale A";
  });
  await paso(c, "contador · lote de varias", page, errores, async () => {
    await page.getByLabel("Varias de una vez", { exact: true }).check();
    await page.getByLabel("Las facturas").fill("Torta grande; 18.000\nDocena de medialunas\t6000\nSin total");
    await conTexto(page, "Una línea tiene algo para corregir");
    if ((await page.getByTestId("lote-fila").count()) !== 3) throw new Error("la revisión no muestra las 3 filas");
    await page.getByRole("button", { name: /^Emitir las 2 correctas/ }).click();
    await conTexto(page, "Listo: salieron las 2 que estaban bien", 60_000);
    const n = await page.locator('aside[aria-label="En esta sesión"] .text-xl').textContent();
    if (n?.trim() !== "4") throw new Error(`la sesión cuenta ${n}, no 4`);
    return "2 de 3 líneas salen; la que tiene error se señala";
  });
  await paso(c, "contador · nota de crédito", page, errores, async () => {
    await page.goto(`${origin}/contador/cliente/${clienteId}/comprobantes`);
    await page.getByRole("button", { name: /^Anular la factura/ }).first().click();
    await page.getByLabel("Por qué se anula").fill("Se facturó de más");
    await page.getByRole("button", { name: "Emitir la nota de crédito" }).click();
    await conTexto(page, "nota de crédito", 30_000);
    return "desde los comprobantes del cliente";
  });
  await page.close();
}

// ── Factoque ──────────────────────────────────────────────────────────────────────────────
async function recorrerFactoque(ctx, origin, vp) {
  const { page, errores } = await nuevaPagina(ctx);
  const c = { vp };
  await paso(c, "factoque · C a consumidor final", page, errores, async () => {
    await page.goto(`${origin}/facturita/app`);
    await conTexto(page, "¿Cuánto cobraste?");
    await monto(page).fill("8.000");
    await queHiciste(page).fill(`Clase de cerámica ${vp}`);
    await letraEs(page, "C");
    await botonEmitir(page).click();
    await exito(page);
    if (vp === "1366") {
      // F3: la cuenta no tiene razón social ni domicilio: el PDF los pide en el resultado.
      await conTexto(page, "Para descargar el PDF, completá tus datos");
      await page.getByLabel("Razón social o nombre y apellido").fill("Ana Pérez");
      await page.getByLabel("Domicilio comercial").fill("Mitre 123, Rosario");
      await page.getByLabel("Inicio de actividades").fill("2020-03-01");
      await page.getByLabel("Exento", { exact: true }).check();
      await page.getByRole("button", { name: "Guardar", exact: true }).click();
      // Con los datos guardados, el pedido desaparece del resultado (la página se refresca).
      await page.getByText("Para descargar el PDF, completá tus datos").waitFor({ state: "detached", timeout: 15_000 });
    }
    await resultadoArriba(page, "C", "/facturita/app/facturas/");
    return vp === "1366" ? "F3: pide razón social y domicilio en el resultado y los guarda; F2 arriba" : "F2: resultado arriba con letra, número, CAE y WhatsApp";
  });
  await paso(c, "factoque · servicios", page, errores, async () => {
    await page.getByRole("button", { name: "Facturar otra" }).click();
    await abrirMasDetalles(page);
    await page.getByLabel("Servicios", { exact: true }).check();
    await monto(page).fill("9.500");
    await queHiciste(page).fill("Taller de octubre");
    await botonEmitir(page).click();
    await exito(page);
    return "F1: sin tocar las fechas, sale";
  });
  await paso(c, "factoque · nota de crédito", page, errores, async () => {
    await page.goto(`${origin}/facturita/app/facturas`);
    await page.getByRole("button", { name: /^Anular la factura/ }).first().click();
    await page.getByLabel("¿Por qué la anulás?").fill("Me equivoqué en el total");
    await page.getByRole("button", { name: "Anular con nota de crédito" }).click();
    await conTexto(page, "nota de crédito", 30_000);
    return "desde «Mis facturas»";
  });
  if (vp === "390") {
    await paso(c, "factoque · tope del mes", page, errores, async () => {
      for (let i = 0; i < 6; i++) {
        await page.goto(`${origin}/facturita/app`);
        if (await page.getByText("Llegaste al tope de facturas gratis de este mes").count()) break;
        await monto(page).fill("1.000");
        await queHiciste(page).fill(`Venta ${i}`);
        await botonEmitir(page).click();
        await exito(page);
      }
      await conTexto(page, "Llegaste al tope de facturas gratis de este mes", 5_000);
      await conTexto(page, "Las que ya emitiste siguen valiendo");
      await page.getByRole("link", { name: "Ver los planes" }).first().waitFor();
      return "F4: título, qué pasa y «Ver los planes»";
    });
  }
  await page.close();
}

// ── Inscripto sin la clase de Factura A cargada (hallazgo de decidir-comprobante.ts) ──
async function recorrerSinRegimenA(ctx, origin, vp) {
  const { page, errores } = await nuevaPagina(ctx);
  await paso({ vp }, "factoque · Factura A sin régimen cargado", page, errores, async () => {
    await page.goto(`${origin}/facturita/app`);
    await monto(page).fill("10.000");
    await queHiciste(page).fill("Cajas");
    await compradorConCuit(page);
    await conTexto(page, "Para hacer Factura A falta saber qué te asignó ARCA");
    if (await botonEmitir(page).isEnabled()) throw new Error("deja emitir la A");
    await page.getByRole("link", { name: "Avisar a mi contador" }).waitFor();
    await page.getByRole("button", { name: "Hacer Factura B" }).click();
    await letraEs(page, "B");
    return "avisa antes de emitir; ofrece Factura B y avisar al contador";
  });
  await page.close();
}

/** F2: el resultado arriba con letra y número, CAE, PDF que descarga y WhatsApp con el texto. */
async function resultadoArriba(page, letra, prefijoPdf) {
  const numero = page.getByTestId("exito-numero").first();
  await numero.waitFor({ timeout: 15_000 });
  const texto = (await numero.textContent()) ?? "";
  if (!new RegExp(`Factura ${letra} \\d{4,5}-\\d{8}`).test(texto)) throw new Error(`el número grande dice «${texto}»`);
  await page.getByTestId("exito-cae").first().waitFor();
  const caja = await numero.boundingBox();
  if (!caja || caja.y > 900) throw new Error(`el resultado no está arriba (y=${caja?.y})`);
  const wa = await page.getByTestId("exito-whatsapp").getAttribute("href");
  if (!wa?.startsWith("https://wa.me/?text=") || !decodeURIComponent(wa).includes(`Factura ${letra}`)) throw new Error(`WhatsApp: ${wa}`);
  // ARCA simulado: CAE «STUB…», el PDF no sale (comprobante-pdf.ts) y la pantalla lo dice en vez de
  // ofrecer una descarga que termina en 409.
  await conTexto(page, "El PDF sale cuando la factura tiene el CAE real de ARCA");
  if (await page.getByTestId("exito-pdf").count()) throw new Error("ofrece un PDF que no sale");
  void prefijoPdf;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  log("creando la base efímera…");
  const base = await crearBaseEfimera();
  let app = null;
  let browser = null;
  try {
    const duenio = await prismaComoDuenio(base);
    const a = await duenio.tenant.findUniqueOrThrow({ where: { id: base.a.id }, select: { modules: true } });
    await duenio.tenant.update({
      where: { id: base.a.id },
      data: {
        arcaCuit: CUIT_A,
        arcaPuntoVenta: 4,
        arcaHomologacion: true,
        arcaCondicionIva: "RESPONSABLE_INSCRIPTO",
        modules: [...new Set([...(a.modules ?? []), "arca"])],
      },
    });
    // Lo que carga Soporte GSG: la Factura A común que le asignó ARCA.
    await duenio.auditLog.create({
      data: {
        tenantId: base.a.id,
        actor: "operator:qa",
        action: "fiscal.regimen_factura_a",
        entity: "RegimenFacturaA",
        entityId: base.a.id,
        channel: "admin",
        changes: { regimen: "A", origen: "ficha" },
      },
    });
    await duenio.tenant.update({ where: { id: base.b.id }, data: { modules: ["cartera", "clients", "reports"] } });
    await duenio.carteraCliente.create({ data: { tenantId: base.b.id, clienteTenantId: base.a.id, alias: "Pastelería de Ana", estado: "activa" } });

    app = await levantar(base);
    browser = await chromium.launch({ executablePath: rutaDeChromium() });
    const origenA = `http://${base.a.subdominio}.localhost:${PORT}`;
    const origenB = `http://${base.b.subdominio}.localhost:${PORT}`;
    for (const vp of VIEWPORTS) {
      const ctxA = await entrar(browser, origenA, base.a.duenia.email, vp);
      await recorrerPanel(ctxA, origenA, vp.nombre).catch((e) => log(`panel cortado: ${e}`));
      await ctxA.close();
      const ctxB = await entrar(browser, origenB, base.b.duenia.email, vp);
      await recorrerContador(ctxB, origenB, vp.nombre, base.a.id).catch((e) => log(`contador cortado: ${e}`));
      await ctxB.close();
    }
    // B pasa a ser un negocio de Factoque (monotributista).
    await duenio.tenant.update({
      where: { id: base.b.id },
      data: { blueprintId: "facturita", arcaCuit: "20222222223", arcaPuntoVenta: 2, arcaHomologacion: true, arcaCondicionIva: "MONOTRIBUTO" },
    });
    // Primero inscripto y SIN la clase de Factura A cargada (hallazgo de decidir-comprobante.ts).
    await duenio.tenant.update({ where: { id: base.b.id }, data: { arcaCondicionIva: "RESPONSABLE_INSCRIPTO" } });
    for (const vp of VIEWPORTS) {
      const ctxB = await entrar(browser, origenB, base.b.duenia.email, vp);
      await recorrerSinRegimenA(ctxB, origenB, vp.nombre).catch((e) => log(`sin régimen cortado: ${e}`));
      await ctxB.close();
    }
    await duenio.tenant.update({ where: { id: base.b.id }, data: { arcaCondicionIva: "MONOTRIBUTO" } });
    for (const vp of VIEWPORTS) {
      const ctxB = await entrar(browser, origenB, base.b.duenia.email, vp);
      await recorrerFactoque(ctxB, origenB, vp.nombre).catch((e) => log(`factoque cortado: ${e}`));
      await ctxB.close();
    }
  } finally {
    await browser?.close().catch(() => {});
    app?.kill("SIGTERM");
    await base.borrar();
  }
  const malos = pasos.filter((p) => !p.ok);
  const resumen = [
    `QA · Facturador guiado · ${new Date().toISOString()}`,
    `Pasos: ${pasos.length} · bien: ${pasos.length - malos.length} · mal: ${malos.length}`,
    ...pasos.map((p) => `${p.ok ? "OK " : "MAL"} ${p.vp.padEnd(4)} ${p.paso}${p.nota ? ` · ${p.nota}` : ""}${p.ok ? "" : ` · ${p.fallas.join(" · ")}`}`),
  ].join("\n");
  writeFileSync(path.join(OUT, "resumen.txt"), resumen + "\n");
  log(`resumen en ${path.join(OUT, "resumen.txt")}`);
  process.exitCode = malos.length || pasos.length < 25 ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
