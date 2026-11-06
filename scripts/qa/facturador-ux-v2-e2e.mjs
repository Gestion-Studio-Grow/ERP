// ============================================================================
// QA DE PUNTA A PUNTA · Facturador UX v2 (docs/facturacion/ux-v2-diseno.md)
// ============================================================================
// Navegador real (390 px y, en las pantallas clave, 1366 px) contra una base efímera con RLS
// (src/test/base-efimera.ts) y ARCA simulado (stub, nada sale a la red). Parte del arnés
// scripts/qa/facturador-guiado-e2e.mjs.
//   · Negocio A: estética (vertical «servicios», como beauty-spa), responsable inscripto, con
//     servicios sembrados. Entra por el login, mira la Puesta a punto (Factura A pendiente), choca con
//     la Factura A sin régimen («Hacer Factura B»), Soporte carga el régimen por la consola del
//     operador y la Puesta a punto lo refleja; B a consumidor final tocando un chip; A a un RI; el
//     resultado (CAE, WhatsApp wa.me con el texto, PDF: con CAE simulado no se ofrece; con un CAE de
//     14 números el PDF responde 200 application/pdf).
//   · Negocio B: Factoque (monotributista): Factura C y el tope de 5 por mes (el 6.º).
// En cada pantalla falla ante errores de consola, scroll horizontal, toques < 44 px (24 px a 1366,
// densidad del kit, igual que el arnés base), vocabulario interno visible y CALLEJONES SIN SALIDA
// (pantalla o estado de error sin ninguna acción para seguir).
// Capturas y resumen en docs/qa/facturador-ux-v2/ (fuera del git). Necesita `npm run build`.
//
// Uso: node --import tsx scripts/qa/facturador-ux-v2-e2e.mjs      (PORT=3242 por defecto)
// ============================================================================

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crearBaseEfimera, prismaComoDuenio, CLAVE_DE_PRUEBA } from "../../src/test/base-efimera.ts";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PORT = Number(process.env.PORT ?? 3242);
if (PORT === 3210 || PORT === 3211) throw new Error("Los puertos 3210 y 3211 son de otro equipo: elegí otro PORT.");
const OUT = path.join(RAIZ, "docs/qa/facturador-ux-v2");
const AUTH_SECRET = "qa-facturador-ux-v2-auth-secret-0123456789";
const CLAVE_OPERADOR = "qa-clave-operador-ux-v2";
const V390 = { nombre: "390", width: 390, height: 844 };
const V1366 = { nombre: "1366", width: 1366, height: 900 };
const CUIT_A = "20111111112";
const CUIT_RI = "30111111118"; // verificador válido, inventado
const SERVICIOS = [
  { name: "Limpieza facial profunda", price: 24200, durationMin: 60 },
  { name: "Depilación definitiva", price: 18150, durationMin: 45 },
  { name: "Masaje descontracturante", price: 30250, durationMin: 60 },
];
// Vocabulario interno que no debe ver el usuario («Factoque» es la marca del producto: vale).
const VOCABULARIO_INTERNO = /homologaci[oó]n|\btenants?\b|WSFE|Soporte GSG|\bRG \d+/i;
const pasos = [];
const callejones = [];
const log = (m) => process.stdout.write(`[qa-ux-v2] ${m}\n`);

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
    OPERATOR_PASSWORD: CLAVE_OPERADOR,
    ARCA_INVOICING_ENABLED: "true",
    NODE_ENV: "production",
    PORT: String(PORT),
  };
  for (const v of ["FORCE_TENANT_SLUG", "TENANT_HOST_MAP", "DEMO_MODE_ENABLED", "MP_MODO", "ARCA_MODO", "OPERADORES", "OPERADOR_DUENIO"]) delete env[v];
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

async function nuevaPagina(ctx) {
  const page = await ctx.newPage();
  const errores = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|Failed to load resource.*404/.test(m.text())) errores.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
  return { page, errores };
}

/** Consola, scroll de costado, toques, vocabulario interno y callejón sin salida. */
async function controlar(page, errores, { vocabulario = true } = {}) {
  const fallas = [...errores];
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (ancho > 1) {
    // Quién se sale: los elementos más profundos que pasan el borde derecho.
    const culpables = await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && ![...el.children].some((h) => h.getBoundingClientRect().right > window.innerWidth + 1))
        .slice(0, 3)
        .map((el) => `${el.tagName.toLowerCase()}«${(el.textContent ?? "").trim().slice(0, 40)}»`),
    );
    fallas.push(`scroll horizontal de ${ancho} px (${culpables.join(", ")})`);
  }
  const minimo = (page.viewportSize()?.width ?? 0) < 640 ? 44 : 24;
  const r = await page.evaluate(
    ({ minimo }) => {
      const raiz = document.querySelector("main") ?? document.body;
      const visibles = [...raiz.querySelectorAll("button, a[href], summary, [role=button]")].filter(
        (el) => el.offsetParent !== null && el.getBoundingClientRect().height > 0,
      );
      // Un enlace dentro de un párrafo es texto (WCAG 2.5.8, excepción «inline»): no es un toque.
      const chicos = visibles
        .filter((el) => !(el.tagName === "A" && el.closest("p")))
        .map((el) => ({ t: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30), h: el.getBoundingClientRect().height }))
        .filter((x) => x.h < minimo);
      // Callejón: un estado de error/atención del facturador sin ninguna acción en su bloque.
      const error = document.querySelector('[data-testid="error-titulo"]');
      let errorSinAccion = null;
      if (error && error.offsetParent !== null) {
        const bloque = error.parentElement?.parentElement ?? error.parentElement;
        const acciones = bloque ? [...bloque.querySelectorAll("button, a[href]")].filter((el) => el.offsetParent !== null && !el.disabled) : [];
        if (acciones.length === 0) errorSinAccion = (error.textContent ?? "").trim();
      }
      const accionables = visibles.filter((el) => !el.disabled).length;
      return { chicos, errorSinAccion, accionables, texto: document.body.innerText };
    },
    { minimo },
  );
  if (r.chicos.length) fallas.push(`toques < ${minimo} px: ${r.chicos.map((c) => `${c.t || "(sin texto)"}(${Math.round(c.h)})`).join(", ")}`);
  if (vocabulario) {
    const m = r.texto.match(VOCABULARIO_INTERNO);
    if (m) {
      const i = r.texto.indexOf(m[0]);
      fallas.push(`vocabulario interno visible: «…${r.texto.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, " ")}…»`);
    }
  }
  if (r.errorSinAccion) fallas.push(`CALLEJÓN: «${r.errorSinAccion}» sin acción para seguir`);
  if (r.accionables === 0) fallas.push("CALLEJÓN: pantalla sin ninguna acción");
  return fallas;
}

async function paso(vp, nombre, page, errores, fn, opciones) {
  let fallas = [];
  let nota = "";
  try {
    nota = (await fn()) ?? "";
    fallas = await controlar(page, errores, opciones);
  } catch (e) {
    fallas.push(`se cortó: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`);
  }
  const captura = `${vp}-${nombre.replace(/[^\w]+/g, "-").replace(/-+$/, "")}.png`;
  await page.screenshot({ path: path.join(OUT, captura), fullPage: true }).catch(() => {});
  errores.length = 0;
  for (const f of fallas.filter((x) => x.startsWith("CALLEJÓN"))) callejones.push(`${vp} ${nombre}: ${f}`);
  pasos.push({ vp, paso: nombre, ok: fallas.length === 0, nota, fallas, captura });
  log(`${fallas.length ? "MAL" : "OK "} ${vp} ${nombre}${nota ? ` · ${nota}` : ""}${fallas.length ? ` · ${fallas.join(" · ")}` : ""}`);
}

const conTexto = (page, texto, timeout = 30_000) => page.getByText(texto, { exact: false }).first().waitFor({ timeout });
const monto = (page) => page.getByTestId("emitir-monto");
const queHiciste = (page) => page.getByTestId("emitir-concepto");
const botonEmitir = (page) => page.getByTestId("emitir-boton");
const exito = (page, timeout = 30_000) => page.getByTestId("exito").first().waitFor({ timeout });

async function letraEs(page, letra) {
  const loc = page.getByTestId("emitir-letra");
  for (let i = 0; i < 20; i++) {
    if ((await loc.getAttribute("data-letra")) === letra) return;
    await page.waitForTimeout(150);
  }
  throw new Error(`la previa dice Factura ${await loc.getAttribute("data-letra")}, no ${letra}`);
}

async function compradorConCuit(page) {
  await page.getByRole("button", { name: "Poner DNI o CUIT" }).click();
  await page.getByLabel("CUIT", { exact: true }).check();
  await page.getByLabel("Número").fill(CUIT_RI);
  await page.getByLabel("Nombre o razón social").fill("Distribuidora Sur SA");
  await page.getByLabel("¿Cómo está inscripto?").selectOption("RESPONSABLE_INSCRIPTO");
  await page.getByLabel("Domicilio").fill("Av. Siempreviva 742, CABA");
}

/** El resultado: número con la letra, CAE visible, WhatsApp wa.me con el texto armado. Devuelve el id. */
async function resultado(page, letra) {
  await exito(page);
  const numero = page.getByTestId("exito-numero").first();
  const texto = (await numero.textContent()) ?? "";
  if (!new RegExp(`Factura ${letra} \\d{4,5}-\\d{8}`).test(texto)) throw new Error(`el número dice «${texto}»`);
  const cae = ((await page.getByTestId("exito-cae").first().textContent()) ?? "").trim();
  if (!/^CAE \S+/.test(cae)) throw new Error(`CAE: «${cae}»`);
  const wa = (await page.getByTestId("exito-whatsapp").first().getAttribute("href")) ?? "";
  const textoWa = decodeURIComponent(wa.replace(/^https:\/\/wa\.me\/\d*\?text=/, ""));
  if (!/^https:\/\/wa\.me\/\d*\?text=/.test(wa) || !textoWa.includes(`Factura ${letra}`)) throw new Error(`WhatsApp: ${wa.slice(0, 120)}`);
  const detalle = await page.getByTestId("exito-detalle").first().getAttribute("href").catch(() => null);
  return { cae, textoWa, id: detalle?.split("/").filter(Boolean).pop() ?? null };
}

// ── Negocio A: estética, responsable inscripto ─────────────────────────────────────────
async function entrarPorLogin(browser, origin, email, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const { page, errores } = await nuevaPagina(ctx);
  await paso(vp.nombre, "1 entrar al panel", page, errores, async () => {
    await page.goto(`${origin}/admin/login`);
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', CLAVE_DE_PRUEBA);
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 30_000 }), page.click('button[type="submit"]')]);
    await page.goto(`${origin}/admin/facturacion`);
    await page.getByRole("link", { name: "Puesta a punto" }).first().waitFor();
    return `login → ${new URL(page.url()).pathname}; pestaña «Puesta a punto» a la vista`;
  });
  return { ctx, page, errores };
}

async function puestaPendiente({ page, errores }, origin, vp) {
  await paso(vp, "2a puesta a punto con Factura A pendiente", page, errores, async () => {
    await page.goto(`${origin}/admin/facturacion?vista=arca`);
    const estado = page.getByTestId("puesta-estado");
    await estado.waitFor();
    if ((await estado.getAttribute("data-listo")) !== "no") throw new Error("dice listo sin régimen A");
    const fa = await page.getByTestId("puesta-paso-factura-a").getAttribute("data-estado");
    if (fa !== "falta") throw new Error(`Factura A: ${fa}`);
    const titulo = (await estado.locator("p").first().textContent())?.trim();
    await page.getByTestId("puesta-paso-factura-a").getByRole("link", { name: "Avisar a mi contador" }).waitFor();
    return `«${titulo}» · Factura A: Falta, con «Avisar a mi contador»`;
  });
}

async function sinRegimenA({ page, errores }, origin, vp) {
  await paso(vp, "6 Factura A sin régimen → Hacer Factura B", page, errores, async () => {
    await page.goto(`${origin}/admin/facturacion?vista=emitir`);
    await monto(page).fill("60.500");
    await queHiciste(page).fill("Pack de 5 sesiones");
    await compradorConCuit(page);
    await page.getByTestId("error-titulo").waitFor();
    const titulo = (await page.getByTestId("error-titulo").textContent())?.trim();
    await conTexto(page, "Para hacer Factura A falta saber qué te asignó ARCA");
    if (await botonEmitir(page).isEnabled()) throw new Error("deja emitir la A");
    await page.getByRole("link", { name: "Avisar a mi contador" }).first().waitFor();
    await page.getByRole("button", { name: "Hacer Factura B" }).click();
    await letraEs(page, "B");
    await botonEmitir(page).click();
    await resultado(page, "B");
    return `«${titulo}»; «Hacer Factura B» → sale Factura B`;
  });
}

async function operadorCargaRegimen(browser, origin, tenantId) {
  const ctx = await browser.newContext({ viewport: { width: V390.width, height: V390.height } });
  const { page, errores } = await nuevaPagina(ctx);
  // Consola interna de nuestro equipo: su vocabulario no se audita (no la ve el cliente).
  await paso("390", "2b soporte carga la Factura A (consola)", page, errores, async () => {
    await page.goto(`${origin}/operador/login`);
    await page.getByLabel("Clave").fill(CLAVE_OPERADOR);
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/operador/login"), { timeout: 30_000 }), page.getByRole("button", { name: "Ingresar a la consola" }).click()]);
    await page.goto(`${origin}/operador/tenants/${tenantId}?pestana=fiscal`);
    await page.getByLabel("Qué Factura A le asignó ARCA").selectOption("A");
    await page.locator("form", { has: page.locator("#regimen-factura-a") }).getByRole("button", { name: "Guardar" }).click();
    await conTexto(page, "Guardado: A común");
    return "régimen «A común» guardado desde la ficha del negocio";
  }, { vocabulario: false });
  await ctx.close();
}

async function puestaCompleta({ page, errores }, origin, vp) {
  await paso(vp, "2c puesta a punto después de completar", page, errores, async () => {
    await page.goto(`${origin}/admin/facturacion?vista=arca`);
    const estado = page.getByTestId("puesta-estado");
    await estado.waitFor();
    const fa = await page.getByTestId("puesta-paso-factura-a").getAttribute("data-estado");
    if (fa !== "listo") throw new Error(`Factura A sigue en ${fa}`);
    const titulo = (await estado.locator("p").first().textContent())?.trim();
    if ((await estado.getAttribute("data-listo")) === "si") return `«${titulo}»`;
    // Con ARCA simulado la conexión queda siempre «Modo de prueba» (esDePrueba: stub ≠ real): lo
    // único que puede faltar es eso, y la cabecera tiene que llevar ahí.
    const pend = await page.locator('[data-testid^="puesta-paso-"]').evaluateAll((els) =>
      els.filter((e) => ["falta", "prueba"].includes(e.getAttribute("data-estado") ?? "")).map((e) => `${e.dataset.testid}:${e.getAttribute("data-estado")}`),
    );
    if (pend.length !== 1 || !pend[0].startsWith("puesta-paso-conexion:")) throw new Error(`pendientes: ${pend.join(", ")}`);
    const cta = (await estado.getByRole("link").first().textContent())?.trim();
    await estado.getByRole("link").first().click();
    await page.waitForURL(/#paso-conexion$/);
    return `PARCIAL: Factura A → Listo; queda «${titulo}» (${pend[0]}: sin certificado de ARCA real no llega a «Listo para facturar»); «${cta}» lleva al paso`;
  });
}

async function emitirBconChip({ page, errores }, origin, vp) {
  let r = null;
  await paso(vp, "3 B a consumidor final con un chip", page, errores, async () => {
    await page.goto(`${origin}/admin/facturacion?vista=emitir`);
    await conTexto(page, "¿Cuánto cobraste?");
    const chip = page.getByRole("group", { name: "Elegí uno" }).getByRole("button", { name: SERVICIOS[0].name });
    await chip.click();
    if ((await queHiciste(page).inputValue()) !== SERVICIOS[0].name) throw new Error("el chip no completó «¿Qué hiciste?»");
    const m = await monto(page).inputValue();
    if (!m.replace(/\D/g, "").startsWith("24200")) throw new Error(`el chip no puso el precio: «${m}»`);
    await letraEs(page, "B");
    await botonEmitir(page).click();
    r = await resultado(page, "B");
    return `chip «${SERVICIOS[0].name}» → monto ${m} → Factura B · ${r.cae}`;
  });
  return r;
}

async function emitirAaRI({ page, errores }, origin, vp) {
  await paso(vp, "4 A a un responsable inscripto", page, errores, async () => {
    await page.goto(`${origin}/admin/facturacion?vista=emitir`);
    await monto(page).fill("121.000");
    await page.getByRole("group", { name: "Elegí uno" }).getByRole("button", { name: SERVICIOS[2].name }).click();
    await compradorConCuit(page);
    await letraEs(page, "A");
    await botonEmitir(page).click();
    const r = await resultado(page, "A");
    return `Factura A · ${r.cae}`;
  });
}

async function postEmision({ page, errores }, origin, vp, r, duenio, tenantId) {
  await paso(vp, "8 post-emisión: CAE, WhatsApp y PDF", page, errores, async () => {
    if (!r?.id) throw new Error("sin id del comprobante (falta «Ver el comprobante»)");
    // En modo simulado el CAE es «STUB…»: la pantalla dice por qué no hay PDF en vez de ofrecer un 409.
    if (/STUB/i.test(r.cae)) {
      await conTexto(page, "El PDF sale cuando la factura tiene el CAE real de ARCA");
      if (await page.getByTestId("exito-pdf").count()) throw new Error("ofrece un PDF que no sale");
    }
    const ruta = `/admin/facturacion/comprobante/${r.id}/pdf`;
    // Desde el navegador (misma sesión): *.localhost no resuelve fuera de Chromium.
    const bajar = () =>
      page.evaluate(async (ruta) => {
        const res = await fetch(ruta);
        const buf = new Uint8Array(await res.arrayBuffer());
        return { status: res.status, tipo: res.headers.get("content-type") ?? "", inicio: new TextDecoder().decode(buf.slice(0, 120)), largo: buf.length };
      }, ruta);
    const antes = await bajar();
    // Con un CAE de 14 números (lo que devuelve ARCA real) el mismo comprobante se descarga.
    // El trigger de inmutabilidad (bien) no deja tocar un CAE: sólo en esta base efímera se apaga
    // un instante, como dueño, para simular la respuesta de ARCA real.
    await duenio.$transaction([
      duenio.$executeRawUnsafe('ALTER TABLE "Invoice" DISABLE TRIGGER "Invoice_comprobante_autorizado_inmutable"'),
      duenio.invoice.update({ where: { id: r.id }, data: { cae: "75123456789012" } }),
      duenio.$executeRawUnsafe('ALTER TABLE "Invoice" ENABLE TRIGGER "Invoice_comprobante_autorizado_inmutable"'),
    ]);
    // Sin razón social ni domicilio cargados, el PDF responde 409 en texto plano: es lo que vería quien
    // toca «PDF» en el resultado del panel (que no pide los datos que faltan, a diferencia de Factoque).
    const sinDatos = await bajar();
    await duenio.tenant.update({
      where: { id: tenantId },
      data: { arcaRazonSocial: "Luz Estética SRL", arcaDomicilioFiscal: "Mitre 123, Rosario", arcaInicioActividades: "20200301", arcaIibb: "Exento" },
    });
    const res = await bajar();
    const tipo = res.tipo;
    if (res.status !== 200 || !tipo.includes("pdf") || !res.inicio.startsWith("%PDF")) {
      throw new Error(`PDF con CAE de 14 números: ${res.status} ${tipo} ${res.inicio.replace(/\s+/g, " ")}`);
    }
    // Los 409 de arriba los pidió el arnés a propósito: no son errores de la pantalla.
    errores.splice(0, errores.length, ...errores.filter((e) => !/status of 409/.test(e)));
    // Y la pantalla del comprobante lo ofrece con un toque.
    await page.goto(`${origin}/admin/facturacion/comprobante/${r.id}`);
    const descarga = page.getByRole("link", { name: /PDF/ }).first();
    await descarga.waitFor({ timeout: 15_000 });
    return `${r.cae}; wa.me «${r.textoWa.slice(0, 70).replace(/\n/g, " ")}…»; PDF con STUB: ${antes.status}; CAE de 14 sin razón social: ${sinDatos.status} ${sinDatos.tipo.split(";")[0]}; con los datos: 200 ${tipo} (${res.largo} B)`;
  });
}

// ── Negocio B: Factoque, monotributista ───────────────────────────────────────────────
async function factoqueC(browser, origin, email, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  await loginSimple(ctx, origin, email);
  const { page, errores } = await nuevaPagina(ctx);
  await paso(vp.nombre, "5 C desde Factoque (monotributo)", page, errores, async () => {
    await page.goto(`${origin}/facturita/app`);
    await conTexto(page, "¿Cuánto cobraste?");
    await monto(page).fill("8.000");
    await queHiciste(page).fill(`Clase de yoga ${vp.nombre}`);
    await letraEs(page, "C");
    await botonEmitir(page).click();
    const r = await resultado(page, "C");
    return `Factura C · ${r.cae}`;
  });
  return { ctx, page, errores };
}

async function topeMensual({ page, errores }, origin, vp, duenio, tenantId) {
  await paso(vp, "7 tope mensual: el 6.º", page, errores, async () => {
    const delMes = async () =>
      duenio.invoice.count({ where: { tenantId, createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } });
    let intento = 0;
    let dondeAparece = "";
    for (; intento < 7; intento++) {
      await page.goto(`${origin}/facturita/app`);
      await conTexto(page, "¿Cuánto cobraste?");
      if (await page.getByText("Llegaste al tope", { exact: false }).count()) {
        dondeAparece = "al abrir";
        break;
      }
      await monto(page).fill("1.000");
      await queHiciste(page).fill(`Sesión ${intento}`);
      await botonEmitir(page).click();
      await Promise.race([page.getByTestId("exito").first().waitFor({ timeout: 30_000 }), page.getByTestId("error-titulo").first().waitFor({ timeout: 30_000 })]);
      if (await page.getByTestId("error-titulo").count()) {
        dondeAparece = "al emitir";
        break;
      }
    }
    const n = await delMes();
    if (n !== 5) throw new Error(`quedaron ${n} comprobantes en el mes, no 5`);
    if (dondeAparece === "al abrir") {
      // El 6.º no llega a intentarse: la pantalla lo dice arriba y el botón dice por qué no emite.
      if (await botonEmitir(page).isEnabled()) throw new Error("con el tope lleno deja tocar Emitir");
      await conTexto(page, "Con el tope del mes no se puede emitir");
      await conTexto(page, "Las que ya emitiste siguen valiendo");
      const planes = await page.getByRole("link", { name: /planes/i }).evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => `${(e.textContent ?? "").trim()}→${e.getAttribute("href")}`));
      if (!planes.length) throw new Error("sin enlace a los planes");
      return `6.º: «Llegaste al tope de facturas gratis de este mes» al abrir (5 en el mes), Emitir deshabilitado con el motivo; acciones: ${planes.join(" · ")}`;
    }
    const titulo = (await page.getByTestId("error-titulo").first().textContent())?.trim() ?? "";
    if (!/tope/i.test(titulo)) throw new Error(`el error dice «${titulo}»`);
    const acciones = await page
      .getByTestId("error-titulo")
      .first()
      .locator("xpath=../..")
      .locator("a[href], button")
      .evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => `${(e.textContent ?? "").trim()}→${e.getAttribute("href") ?? "botón"}`));
    if (!acciones.some((a) => /plan/i.test(a))) throw new Error(`sin «Ver planes»: ${acciones.join(" | ")}`);
    return `«${titulo}» ${dondeAparece} (5 en el mes); acciones: ${acciones.join(" · ")}`;
  });
}

async function loginSimple(ctx, origin, email) {
  const page = await ctx.newPage();
  await page.goto(`${origin}/admin/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', CLAVE_DE_PRUEBA);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 30_000 }), page.click('button[type="submit"]')]);
  await page.close();
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
        name: "Estética Luz",
        blueprintId: "servicios",
        arcaCuit: CUIT_A,
        arcaPuntoVenta: 4,
        arcaHomologacion: true,
        arcaCondicionIva: "RESPONSABLE_INSCRIPTO",
        modules: [...new Set([...(a.modules ?? []), "arca"])],
      },
    });
    for (const s of SERVICIOS) await duenio.service.create({ data: { tenantId: base.a.id, ...s } });
    await duenio.tenant.update({
      where: { id: base.b.id },
      data: { name: "Yoga Ana", blueprintId: "facturita", arcaCuit: "20222222223", arcaPuntoVenta: 2, arcaHomologacion: true, arcaCondicionIva: "MONOTRIBUTO" },
    });

    app = await levantar(base);
    browser = await chromium.launch({ executablePath: rutaDeChromium() });
    const origenA = `http://${base.a.subdominio}.localhost:${PORT}`;
    const origenB = `http://${base.b.subdominio}.localhost:${PORT}`;
    const origenOp = `http://localhost:${PORT}`;

    const a390 = await entrarPorLogin(browser, origenA, base.a.duenia.email, V390);
    await puestaPendiente(a390, origenA, "390");
    await sinRegimenA(a390, origenA, "390");
    await operadorCargaRegimen(browser, origenOp, base.a.id);
    await puestaCompleta(a390, origenA, "390");
    const rB = await emitirBconChip(a390, origenA, "390");
    await postEmision(a390, origenA, "390", rB, duenio, base.a.id);
    await emitirAaRI(a390, origenA, "390");
    await a390.ctx.close();

    const a1366 = await entrarPorLogin(browser, origenA, base.a.duenia.email, V1366);
    await puestaCompleta(a1366, origenA, "1366");
    const rB2 = await emitirBconChip(a1366, origenA, "1366");
    await postEmision(a1366, origenA, "1366", rB2, duenio, base.a.id);
    await a1366.ctx.close();

    const b1366 = await factoqueC(browser, origenB, base.b.duenia.email, V1366);
    await b1366.ctx.close();
    const b390 = await factoqueC(browser, origenB, base.b.duenia.email, V390);
    await topeMensual(b390, origenB, "390", duenio, base.b.id);
    await b390.ctx.close();
  } finally {
    await browser?.close().catch(() => {});
    app?.kill("SIGTERM");
    await base.borrar();
  }
  const malos = pasos.filter((p) => !p.ok);
  const resumen = [
    `QA · Facturador UX v2 · ${new Date().toISOString()}`,
    `Pasos: ${pasos.length} · bien: ${pasos.length - malos.length} · mal: ${malos.length}`,
    ...pasos.map((p) => `${p.ok ? "OK " : "MAL"} ${p.vp.padEnd(4)} ${p.paso}${p.nota ? ` · ${p.nota}` : ""}${p.ok ? "" : ` · ${p.fallas.join(" · ")}`} [${p.captura}]`),
    `Callejones: ${callejones.length ? callejones.join(" | ") : "ninguno"}`,
  ].join("\n");
  writeFileSync(path.join(OUT, "resumen.txt"), resumen + "\n");
  log(`resumen en ${path.join(OUT, "resumen.txt")}`);
  process.exitCode = malos.length || pasos.length < 13 ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
